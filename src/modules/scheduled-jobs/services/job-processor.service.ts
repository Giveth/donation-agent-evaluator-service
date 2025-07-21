import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  ScheduledJob,
  JobType,
  JobStatus,
} from '../../social-media-storage/entities/scheduled-job.entity';
import { TwitterService } from '../../social-media/services/twitter.service';
import { FarcasterService } from '../../social-media/services/farcaster.service';
import { SocialPostStorageService } from '../../social-media-storage/services/social-post-storage.service';
import { ProjectSocialAccountService } from '../../social-media-storage/services/project-social-account.service';
import { TwitterFetchProcessor } from '../processors/twitter-fetch.processor';
import { FarcasterFetchProcessor } from '../processors/farcaster-fetch.processor';
import { ProjectSyncProcessor } from '../processors/project-sync.processor';

/**
 * Service responsible for processing scheduled jobs from the database.
 *
 * This service runs every 10 minutes and processes pending jobs created by the JobSchedulerService.
 * It handles different job types (Twitter fetch, Farcaster fetch) with appropriate rate limiting
 * and error handling strategies.
 *
 * Features:
 * - Processes up to 50 jobs per 10-minute cycle
 * - Implements rate limiting (4-8s for Twitter, 2-3s for Farcaster)
 * - Comprehensive error handling and retry logic
 * - Job status tracking and updates
 * - Detailed logging for monitoring
 *
 * Environment Configuration:
 * - JOB_BATCH_SIZE: Maximum jobs to process per cycle (default: 50)
 * - TWITTER_MIN_DELAY_MS: Minimum delay between Twitter requests (default: 4000)
 * - TWITTER_MAX_DELAY_MS: Maximum delay between Twitter requests (default: 8000)
 * - FARCASTER_MIN_DELAY_MS: Minimum delay between Farcaster requests (default: 2000)
 * - FARCASTER_MAX_DELAY_MS: Maximum delay between Farcaster requests (default: 3000)
 * - JOB_MAX_RETRIES: Maximum retry attempts for failed jobs (default: 3)
 */
@Injectable()
export class JobProcessorService {
  // Configuration constants
  private readonly batchSize: number;
  private readonly twitterMinDelay: number;
  private readonly twitterMaxDelay: number;
  private readonly farcasterMinDelay: number;
  private readonly farcasterMaxDelay: number;
  private readonly maxRetries: number;

  constructor(
    private readonly logger: Logger,
    @InjectRepository(ScheduledJob)
    private readonly scheduledJobRepository: Repository<ScheduledJob>,
    private readonly twitterService: TwitterService,
    private readonly farcasterService: FarcasterService,
    private readonly socialPostStorageService: SocialPostStorageService,
    private readonly projectSocialAccountService: ProjectSocialAccountService,
    private readonly configService: ConfigService,
    private readonly twitterFetchProcessor: TwitterFetchProcessor,
    private readonly farcasterFetchProcessor: FarcasterFetchProcessor,
    private readonly projectSyncProcessor: ProjectSyncProcessor,
  ) {
    // Initialize configuration with defaults
    this.batchSize = parseInt(
      this.configService.get('JOB_BATCH_SIZE', '50'),
      10,
    );
    this.twitterMinDelay = parseInt(
      this.configService.get('TWITTER_MIN_DELAY_MS', '4000'),
      10,
    );
    this.twitterMaxDelay = parseInt(
      this.configService.get('TWITTER_MAX_DELAY_MS', '8000'),
      10,
    );
    this.farcasterMinDelay = parseInt(
      this.configService.get('FARCASTER_MIN_DELAY_MS', '2000'),
      10,
    );
    this.farcasterMaxDelay = parseInt(
      this.configService.get('FARCASTER_MAX_DELAY_MS', '3000'),
      10,
    );
    this.maxRetries = parseInt(
      this.configService.get('JOB_MAX_RETRIES', '3'),
      10,
    );

    this.logger.log('JobProcessorService initialized with configuration:', {
      batchSize: this.batchSize,
      twitterDelayRange: `${this.twitterMinDelay}-${this.twitterMaxDelay}ms`,
      farcasterDelayRange: `${this.farcasterMinDelay}-${this.farcasterMaxDelay}ms`,
      maxRetries: this.maxRetries,
    });
  }

  /**
   * Main cron job that processes scheduled jobs every 10 minutes.
   *
   * This method:
   * 1. Queries pending jobs from the database (up to batch size limit)
   * 2. Processes each job based on its type with appropriate rate limiting
   * 3. Updates job status and handles retries for failed jobs
   * 4. Logs comprehensive statistics for monitoring
   */
  @Cron('*/10 * * * *', {
    name: 'process-scheduled-jobs',
    timeZone: 'UTC',
  })
  async processScheduledJobs(): Promise<void> {
    this.logger.log('Starting scheduled job processing cycle...');

    const startTime = Date.now();
    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;
    let retryCount = 0;

    try {
      // Fetch pending jobs that are due for processing
      const pendingJobs = await this.fetchPendingJobs();

      if (pendingJobs.length === 0) {
        this.logger.log('No pending jobs found for processing');
        return;
      }

      this.logger.log(`Found ${pendingJobs.length} pending jobs to process`);

      // Process each job with appropriate rate limiting
      for (const job of pendingJobs) {
        try {
          processedCount++;

          // Update job status to processing
          await this.updateJobStatus(job.id, JobStatus.PROCESSING, undefined, {
            ...job.metadata,
            processingStartedAt: new Date().toISOString(),
          });

          // Process the job based on its type
          const success = await this.processJobByType(job);

          if (success) {
            // Mark job as completed
            await this.updateJobStatus(job.id, JobStatus.COMPLETED, undefined, {
              ...job.metadata,
              completedAt: new Date().toISOString(),
              processingDuration:
                Date.now() -
                new Date(
                  (job.metadata?.processingStartedAt as string | undefined) ??
                    new Date().toISOString(),
                ).getTime(),
            });
            successCount++;
            this.logger.debug(
              `Successfully processed ${job.jobType} job for project ${job.projectId}`,
            );
          } else {
            // Handle job failure
            const shouldRetry = this.shouldRetryJob(job);

            if (shouldRetry) {
              // Increment attempts and reschedule
              const nextRetryAt = this.calculateNextRetryTime(job.attempts + 1);
              await this.updateJobStatus(
                job.id,
                JobStatus.PENDING,
                undefined,
                {
                  ...job.metadata,
                  lastFailedAt: new Date().toISOString(),
                  nextRetryAt: nextRetryAt.toISOString(),
                },
                job.attempts + 1,
                nextRetryAt,
              );

              retryCount++;
              this.logger.warn(
                `Job ${job.id} failed, scheduled for retry #${job.attempts + 1} at ${nextRetryAt.toISOString()}`,
              );
            } else {
              // Mark job as permanently failed
              await this.updateJobStatus(
                job.id,
                JobStatus.FAILED,
                'Maximum retry attempts exceeded',
                {
                  ...job.metadata,
                  failedAt: new Date().toISOString(),
                  maxRetriesExceeded: true,
                },
              );
              failedCount++;
              this.logger.error(
                `Job ${job.id} permanently failed after ${job.attempts} attempts`,
              );
            }
          }

          // Apply rate limiting between job processing
          await this.applyRateLimiting(job.jobType);
        } catch (error) {
          this.logger.error(`Error processing job ${job.id}:`, error);

          // Update job with error information
          await this.updateJobStatus(
            job.id,
            JobStatus.FAILED,
            error instanceof Error ? error.message : String(error),
            {
              ...job.metadata,
              errorDetails: {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                timestamp: new Date().toISOString(),
              },
            },
          );
          failedCount++;
        }
      }

      // Log processing statistics
      const processingTime = Date.now() - startTime;
      this.logger.log('Scheduled job processing cycle completed:', {
        totalProcessed: processedCount,
        successful: successCount,
        failed: failedCount,
        retried: retryCount,
        processingTimeMs: processingTime,
        averageTimePerJob:
          processedCount > 0 ? Math.round(processingTime / processedCount) : 0,
      });
    } catch (error) {
      this.logger.error(
        'Failed to complete scheduled job processing cycle:',
        error,
      );
      // Don't throw - we want the cron job to continue running
    }
  }

  /**
   * Fetches pending jobs from the database that are due for processing.
   *
   * @returns Array of pending ScheduledJob entities
   */
  private async fetchPendingJobs(): Promise<ScheduledJob[]> {
    try {
      const jobs = await this.scheduledJobRepository
        .createQueryBuilder('job')
        .where('job.status = :status', { status: JobStatus.PENDING })
        .andWhere('job.scheduledFor <= :now', { now: new Date() })
        .orderBy('job.scheduledFor', 'ASC')
        .limit(this.batchSize)
        .getMany();

      this.logger.debug(`Fetched ${jobs.length} pending jobs from database`);
      return jobs;
    } catch (error) {
      this.logger.error('Failed to fetch pending jobs:', error);
      return [];
    }
  }

  /**
   * Processes a job based on its type.
   *
   * @param job - The scheduled job to process
   * @returns Promise<boolean> - True if successful, false if failed
   */
  private async processJobByType(job: ScheduledJob): Promise<boolean> {
    this.logger.debug(
      `Processing ${job.jobType} job for project ${job.projectId}`,
    );

    switch (job.jobType) {
      case JobType.TWEET_FETCH:
        return this.processTwitterFetchJob(job);

      case JobType.FARCASTER_FETCH:
        return this.processFarcasterFetchJob(job);

      case JobType.PROJECT_SYNC:
        return this.processProjectSyncJob(job);

      default:
        this.logger.error(
          `Unknown job type: ${String(job.jobType)} for job ${job.id}`,
        );
        return false;
    }
  }

  /**
   * Processes a Twitter fetch job using the dedicated TwitterFetchProcessor.
   *
   * @param job - The Twitter fetch job to process
   * @returns Promise<boolean> - True if successful, false if failed
   */
  private async processTwitterFetchJob(job: ScheduledJob): Promise<boolean> {
    try {
      // Use the dedicated TwitterFetchProcessor for comprehensive Twitter fetch handling
      await this.twitterFetchProcessor.processTwitterFetch(job);
      return true;
    } catch (error) {
      this.logger.error(
        `TwitterFetchProcessor failed for project ${job.projectId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Processes a Farcaster fetch job using the dedicated FarcasterFetchProcessor.
   *
   * @param job - The Farcaster fetch job to process
   * @returns Promise<boolean> - True if successful, false if failed
   */
  private async processFarcasterFetchJob(job: ScheduledJob): Promise<boolean> {
    try {
      // Use the dedicated FarcasterFetchProcessor for comprehensive Farcaster fetch handling
      await this.farcasterFetchProcessor.processFarcasterFetch(job);
      return true;
    } catch (error) {
      this.logger.error(
        `FarcasterFetchProcessor failed for project ${job.projectId}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Processes a project sync job using the dedicated ProjectSyncProcessor.
   *
   * @param job - The project sync job to process
   * @returns Promise<boolean> - True if successful, false if failed
   */
  private async processProjectSyncJob(job: ScheduledJob): Promise<boolean> {
    try {
      // Use the dedicated ProjectSyncProcessor for comprehensive project sync handling
      await this.projectSyncProcessor.processProjectSync(job);
      return true;
    } catch (error) {
      this.logger.error(
        `ProjectSyncProcessor failed for job ${job.id}:`,
        error,
      );
      return false;
    }
  }

  /**
   * Updates the status of a scheduled job in the database.
   *
   * @param jobId - The ID of the job to update
   * @param status - The new status for the job
   * @param error - Optional error message
   * @param metadata - Optional metadata to update
   * @param attempts - Optional attempt count to update
   * @param scheduledFor - Optional new scheduled time for retries
   */
  private async updateJobStatus(
    jobId: string,
    status: JobStatus,
    error?: string,
    metadata?: Record<string, unknown>,
    attempts?: number,
    scheduledFor?: Date,
  ): Promise<void> {
    try {
      // Create update data with proper typing for TypeORM
      const updateData: {
        status: JobStatus;
        error?: string;
        processedAt?: Date;
        metadata?: Record<string, unknown>;
        attempts?: number;
        scheduledFor?: Date;
      } = {
        status,
      };

      // Only include defined values to avoid TypeORM issues
      if (error !== undefined) {
        updateData.error = error;
      }

      if (status === JobStatus.COMPLETED) {
        updateData.processedAt = new Date();
      }

      if (metadata !== undefined) {
        updateData.metadata = metadata;
      }

      if (attempts !== undefined) {
        updateData.attempts = attempts;
      }

      if (scheduledFor !== undefined) {
        updateData.scheduledFor = scheduledFor;
      }

      // Use QueryBuilder to handle JSONB metadata field properly
      const queryBuilder = this.scheduledJobRepository
        .createQueryBuilder()
        .update(ScheduledJob)
        .set({
          status: updateData.status,
          ...(updateData.error !== undefined && { error: updateData.error }),
          ...(updateData.processedAt !== undefined && {
            processedAt: updateData.processedAt,
          }),
          ...(updateData.attempts !== undefined && {
            attempts: updateData.attempts,
          }),
          ...(updateData.scheduledFor !== undefined && {
            scheduledFor: updateData.scheduledFor,
          }),
        })
        .where('id = :id', { id: jobId });

      // Handle metadata separately if it exists
      if (updateData.metadata !== undefined) {
        queryBuilder.set({ metadata: updateData.metadata as any });
      }

      await queryBuilder.execute();
    } catch (updateError) {
      this.logger.error(
        `Failed to update job status for job ${jobId}:`,
        updateError,
      );
      // Don't throw - this shouldn't stop job processing
    }
  }

  /**
   * Determines if a failed job should be retried based on its attempt count.
   *
   * @param job - The failed job to evaluate
   * @returns boolean - True if the job should be retried
   */
  private shouldRetryJob(job: ScheduledJob): boolean {
    return job.attempts < this.maxRetries;
  }

  /**
   * Calculates the next retry time using exponential backoff.
   *
   * Strategy aligns with scraper-db-architecture.md:
   * - Attempt 1: 1 minute delay
   * - Attempt 2: 2 minute delay
   * - Attempt 3: 4 minute delay
   *
   * @param attemptNumber - The current attempt number (1-based)
   * @returns Date - The next retry time
   */
  private calculateNextRetryTime(attemptNumber: number): Date {
    // Exponential backoff: 1 minute, 2 minutes, 4 minutes (as per architecture doc)
    const baseDelayMinutes = 1;
    const delayMinutes = baseDelayMinutes * Math.pow(2, attemptNumber - 1);

    const nextRetryTime = new Date();
    nextRetryTime.setMinutes(nextRetryTime.getMinutes() + delayMinutes);

    return nextRetryTime;
  }

  /**
   * Applies rate limiting delays between job processing based on job type.
   *
   * @param jobType - The type of job being processed
   */
  private async applyRateLimiting(jobType: JobType): Promise<void> {
    let minDelay: number;
    let maxDelay: number;

    switch (jobType) {
      case JobType.TWEET_FETCH:
        minDelay = this.twitterMinDelay;
        maxDelay = this.twitterMaxDelay;
        break;

      case JobType.FARCASTER_FETCH:
        minDelay = this.farcasterMinDelay;
        maxDelay = this.farcasterMaxDelay;
        break;

      default:
        // Default to minimal delay for unknown job types
        minDelay = 1000;
        maxDelay = 2000;
        break;
    }

    // Calculate random delay within the specified range
    const delay =
      Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

    this.logger.debug(
      `Applying rate limiting: ${delay}ms delay for ${jobType}`,
    );

    // Wait for the calculated delay
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Manual method to trigger job processing outside of the cron schedule.
   * Useful for testing or admin operations.
   *
   * @returns Promise<object> - Processing statistics
   */
  async manualProcessJobs(): Promise<{
    processed: number;
    successful: number;
    failed: number;
    retried: number;
  }> {
    this.logger.log('Manual job processing triggered');

    const startTime = Date.now();
    let processedCount = 0;
    let successCount = 0;
    let failedCount = 0;
    let retryCount = 0;

    try {
      // Fetch pending jobs that are due for processing
      const pendingJobs = await this.fetchPendingJobs();

      if (pendingJobs.length === 0) {
        this.logger.log('No pending jobs found for manual processing');
        return {
          processed: 0,
          successful: 0,
          failed: 0,
          retried: 0,
        };
      }

      this.logger.log(`Manually processing ${pendingJobs.length} pending jobs`);

      // Process each job with appropriate rate limiting (same logic as cron job)
      for (const job of pendingJobs) {
        try {
          processedCount++;

          // Update job status to processing
          await this.updateJobStatus(job.id, JobStatus.PROCESSING, undefined, {
            ...job.metadata,
            processingStartedAt: new Date().toISOString(),
            manualProcessing: true,
          });

          // Process the job based on its type
          const success = await this.processJobByType(job);

          if (success) {
            // Mark job as completed
            await this.updateJobStatus(job.id, JobStatus.COMPLETED, undefined, {
              ...job.metadata,
              completedAt: new Date().toISOString(),
              processingDuration:
                Date.now() -
                new Date(
                  (job.metadata?.processingStartedAt as string | undefined) ??
                    new Date().toISOString(),
                ).getTime(),
              manualProcessing: true,
            });
            successCount++;
            this.logger.debug(
              `Successfully processed ${job.jobType} job for project ${job.projectId} (manual)`,
            );
          } else {
            // Handle job failure
            const shouldRetry = this.shouldRetryJob(job);

            if (shouldRetry) {
              // Increment attempts and reschedule
              const nextRetryAt = this.calculateNextRetryTime(job.attempts + 1);
              await this.updateJobStatus(
                job.id,
                JobStatus.PENDING,
                undefined,
                {
                  ...job.metadata,
                  lastFailedAt: new Date().toISOString(),
                  nextRetryAt: nextRetryAt.toISOString(),
                  manualProcessing: true,
                },
                job.attempts + 1,
                nextRetryAt,
              );

              retryCount++;
              this.logger.warn(
                `Job ${job.id} failed during manual processing, scheduled for retry #${job.attempts + 1} at ${nextRetryAt.toISOString()}`,
              );
            } else {
              // Mark job as permanently failed
              await this.updateJobStatus(
                job.id,
                JobStatus.FAILED,
                'Maximum retry attempts exceeded',
                {
                  ...job.metadata,
                  failedAt: new Date().toISOString(),
                  maxRetriesExceeded: true,
                  manualProcessing: true,
                },
              );
              failedCount++;
              this.logger.error(
                `Job ${job.id} permanently failed after ${job.attempts} attempts (manual)`,
              );
            }
          }

          // Apply rate limiting between job processing
          await this.applyRateLimiting(job.jobType);
        } catch (error) {
          this.logger.error(
            `Error during manual processing of job ${job.id}:`,
            error,
          );

          // Update job with error information
          await this.updateJobStatus(
            job.id,
            JobStatus.FAILED,
            error instanceof Error ? error.message : String(error),
            {
              ...job.metadata,
              errorDetails: {
                message: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                timestamp: new Date().toISOString(),
              },
              manualProcessing: true,
            },
          );
          failedCount++;
        }
      }

      // Log processing statistics
      const processingTime = Date.now() - startTime;
      const stats = {
        processed: processedCount,
        successful: successCount,
        failed: failedCount,
        retried: retryCount,
      };

      this.logger.log('Manual job processing completed:', {
        ...stats,
        processingTimeMs: processingTime,
        averageTimePerJob:
          processedCount > 0 ? Math.round(processingTime / processedCount) : 0,
      });

      return stats;
    } catch (error) {
      this.logger.error('Failed to complete manual job processing:', error);
      throw error;
    }
  }

  /**
   * Gets statistics about job processing performance.
   * Useful for monitoring and admin operations.
   *
   * @returns Promise<object> - Job processing statistics
   */
  async getProcessingStatistics(): Promise<{
    pendingJobs: number;
    processingJobs: number;
    recentlyCompleted: number;
    recentlyFailed: number;
    averageProcessingTime: number;
  }> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      const [pendingJobs, processingJobs, recentlyCompleted, recentlyFailed] =
        await Promise.all([
          this.scheduledJobRepository.count({
            where: { status: JobStatus.PENDING },
          }),
          this.scheduledJobRepository.count({
            where: { status: JobStatus.PROCESSING },
          }),
          this.scheduledJobRepository
            .createQueryBuilder('job')
            .where('job.status = :status', { status: JobStatus.COMPLETED })
            .andWhere('job.processedAt >= :oneHourAgo', { oneHourAgo })
            .getCount(),
          this.scheduledJobRepository
            .createQueryBuilder('job')
            .where('job.status = :status', { status: JobStatus.FAILED })
            .andWhere('job.processedAt >= :oneHourAgo', { oneHourAgo })
            .getCount(),
        ]);

      return {
        pendingJobs,
        processingJobs,
        recentlyCompleted,
        recentlyFailed,
        averageProcessingTime: 0, // Would need to calculate from metadata
      };
    } catch (error) {
      this.logger.error('Failed to get processing statistics:', error);
      throw error;
    }
  }
}
