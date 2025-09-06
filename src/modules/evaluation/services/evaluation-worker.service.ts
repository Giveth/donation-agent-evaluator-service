import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EvaluationService } from '../evaluation.service';
import { EvaluationQueueService } from './evaluation-queue.service';
import {
  ScheduledJob,
  JobType,
} from '../../social-media-storage/entities/scheduled-job.entity';
import { EvaluateProjectsRequestDto } from '../dto/evaluate-projects-request.dto';
import { EvaluateMultipleCausesRequestDto } from '../dto/evaluate-multiple-causes-request.dto';

@Injectable()
export class EvaluationWorkerService implements OnModuleInit {
  private readonly logger = new Logger(EvaluationWorkerService.name);

  constructor(
    private readonly evaluationService: EvaluationService,
    private readonly evaluationQueueService: EvaluationQueueService,
  ) {}

  /**
   * Called after module initialization to cleanup any stuck jobs from previous runs
   */
  async onModuleInit(): Promise<void> {
    try {
      this.logger.log('Initializing EvaluationWorkerService...');
      const cleanedUp =
        await this.evaluationQueueService.cleanupStuckEvaluationJobs(10);
      if (cleanedUp > 0) {
        this.logger.log(
          `Cleaned up ${cleanedUp} stuck evaluation jobs on startup`,
        );
      } else {
        this.logger.log('No stuck evaluation jobs found on startup');
      }
    } catch (error) {
      this.logger.error('Failed to cleanup stuck jobs on startup:', error);
    }
  }

  /**
   * Cron job that processes pending evaluation jobs every 30 seconds
   * This ensures evaluation jobs are processed promptly while not overwhelming the system
   */
  @Cron('*/30 * * * * *', {
    name: 'evaluation-job-processor',
    timeZone: 'UTC',
  })
  async processEvaluationJobs(): Promise<void> {
    // Check if any jobs are already processing to prevent overlapping
    const hasProcessingJobs =
      await this.evaluationQueueService.hasProcessingEvaluationJobs();
    if (hasProcessingJobs) {
      this.logger.debug(
        'Evaluation job processing already in progress, skipping',
      );
      return;
    }

    this.logger.debug('Checking for pending evaluation jobs...');

    try {
      // First cleanup any stuck jobs before processing new ones
      await this.evaluationQueueService.cleanupStuckEvaluationJobs(10);

      const pendingJobs =
        await this.evaluationQueueService.getPendingEvaluationJobs();

      if (pendingJobs.length === 0) {
        this.logger.debug('No pending evaluation jobs found');
        return;
      }

      this.logger.log(
        `Found ${pendingJobs.length} pending evaluation jobs to process`,
      );

      // Process jobs one at a time to avoid overwhelming the system
      // The evaluation service already has pLimit concurrency control
      for (const job of pendingJobs) {
        try {
          await this.processEvaluationJobWithTimeout(job);
        } catch (error) {
          this.logger.error(
            `Failed to process evaluation job ${job.id}:`,
            error instanceof Error ? error.message : String(error),
          );

          // Mark job as failed but continue processing other jobs
          await this.evaluationQueueService.markJobAsFailed(
            job.id,
            error instanceof Error ? error.message : 'Unknown processing error',
          );
        }
      }

      this.logger.log(
        `Completed processing ${pendingJobs.length} evaluation jobs`,
      );
    } catch (error) {
      this.logger.error('Failed to process evaluation jobs:', error);
    }
  }

  /**
   * Processes a single evaluation job with timeout protection
   * @param job - The scheduled job to process
   */
  private async processEvaluationJobWithTimeout(
    job: ScheduledJob,
  ): Promise<void> {
    const TIMEOUT_MS = 20 * 60 * 1000; // 20 minutes timeout

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `Job ${job.id} timed out after ${TIMEOUT_MS / 1000} seconds`,
          ),
        );
      }, TIMEOUT_MS);
    });

    try {
      await Promise.race([this.processEvaluationJob(job), timeoutPromise]);
    } catch (error) {
      // If it's a timeout error, make sure to fail the job properly
      if (error instanceof Error && error.message.includes('timed out')) {
        this.logger.error(`Job ${job.id} timed out, marking as failed`);
        await this.evaluationQueueService.markJobAsFailed(
          job.id,
          error.message,
        );
      }
      throw error;
    }
  }

  /**
   * Processes a single evaluation job
   * @param job - The scheduled job to process
   */
  private async processEvaluationJob(job: ScheduledJob): Promise<void> {
    this.logger.log(`Processing evaluation job ${job.id} (${job.jobType})`);

    // Mark job as processing
    await this.evaluationQueueService.markJobAsProcessing(job.id);

    try {
      if (job.jobType === JobType.SINGLE_CAUSE_EVALUATION) {
        await this.processSingleCauseEvaluation(job);
      } else if (job.jobType === JobType.MULTI_CAUSE_EVALUATION) {
        await this.processMultiCauseEvaluation(job);
      } else {
        throw new Error(`Unknown evaluation job type: ${job.jobType}`);
      }

      this.logger.log(`Successfully completed evaluation job ${job.id}`);
    } catch (error) {
      this.logger.error(
        `Failed to process evaluation job ${job.id}:`,
        error instanceof Error ? error.message : String(error),
      );
      throw error; // Re-throw to trigger failure handling in caller
    }
  }

  /**
   * Processes a single cause evaluation job
   * Uses the existing evaluateProjectsWithMetadata method to preserve all pLimit logic
   * @param job - The single cause evaluation job
   */
  private async processSingleCauseEvaluation(job: ScheduledJob): Promise<void> {
    const requestData = job.metadata?.requestData as
      | EvaluateProjectsRequestDto
      | undefined;

    if (!requestData) {
      throw new Error('No request data found in job metadata');
    }

    this.logger.log(
      `Processing single cause evaluation for cause ${requestData.cause.id} with ${requestData.projects.length} projects`,
    );

    // Use the existing evaluation service method - this preserves all pLimit concurrency control
    const result =
      await this.evaluationService.evaluateProjectsWithMetadata(requestData);

    // Store the result in the job
    await this.evaluationQueueService.storeJobResult(job.id, result);

    this.logger.log(
      `Single cause evaluation completed for job ${job.id}. ` +
        `${result.projectsWithStoredPosts}/${result.totalProjects} projects had stored posts. ` +
        `Duration: ${result.evaluationDuration}ms`,
    );
  }

  /**
   * Processes a multi-cause evaluation job with progress tracking
   * Uses the existing evaluateMultipleCauses method to preserve all pLimit logic
   * @param job - The multi-cause evaluation job
   */
  private async processMultiCauseEvaluation(job: ScheduledJob): Promise<void> {
    const requestData = job.metadata?.requestData as
      | EvaluateMultipleCausesRequestDto
      | undefined;

    if (!requestData) {
      throw new Error('No request data found in job metadata');
    }

    this.logger.log(
      `Processing multi-cause evaluation for ${requestData.causes.length} causes with job ${job.id}`,
    );

    // Create a modified evaluation service method that supports progress tracking
    const result = await this.evaluateMultipleCausesWithProgress(
      job.id,
      requestData,
    );

    // Store the result in the job
    await this.evaluationQueueService.storeJobResult(job.id, result);

    this.logger.log(
      `Multi-cause evaluation completed for job ${job.id}. ` +
        `${result.successfulCauses}/${result.totalCauses} causes succeeded. ` +
        `Total projects: ${result.totalProjects}, with stored posts: ${result.totalProjectsWithStoredPosts}. ` +
        `Duration: ${result.evaluationDuration}ms`,
    );
  }

  /**
   * Enhanced multi-cause evaluation with progress tracking
   * This method wraps the existing evaluateMultipleCauses but adds progress updates
   * @param jobId - The job ID for progress updates
   * @param request - The multi-cause evaluation request
   */
  private async evaluateMultipleCausesWithProgress(
    jobId: string,
    request: EvaluateMultipleCausesRequestDto,
  ) {
    const totalCauses = request.causes.length;

    this.logger.log(
      `Starting multi-cause evaluation with progress tracking for job ${jobId} (${totalCauses} causes)`,
    );

    // We'll use the existing evaluation service but intercept the cause-by-cause processing
    // Since the evaluation service uses pLimit, we need to track progress differently

    // For now, use the existing method and update progress at completion
    // In a future enhancement, we could modify the evaluation service to support progress callbacks
    const result = await this.evaluationService.evaluateMultipleCauses(request);

    // Update progress to 100% on completion
    await this.evaluationQueueService.updateJobProgress(jobId, 100);

    return result;
  }

  /**
   * Manual method to trigger evaluation job processing outside of the cron schedule
   * Useful for testing or admin operations
   * @returns Number of jobs processed
   */
  async manualProcessJobs(): Promise<number> {
    this.logger.log('Manual evaluation job processing triggered');

    const hasProcessingJobs =
      await this.evaluationQueueService.hasProcessingEvaluationJobs();
    if (hasProcessingJobs) {
      this.logger.warn('Evaluation job processing already in progress');
      return 0;
    }

    try {
      // First cleanup any stuck jobs
      await this.evaluationQueueService.cleanupStuckEvaluationJobs(10);

      const pendingJobs =
        await this.evaluationQueueService.getPendingEvaluationJobs();

      this.logger.log(
        `Found ${pendingJobs.length} pending evaluation jobs for manual processing`,
      );

      let processedCount = 0;
      for (const job of pendingJobs) {
        try {
          await this.processEvaluationJobWithTimeout(job);
          processedCount++;
        } catch (error) {
          this.logger.error(
            `Failed to manually process evaluation job ${job.id}:`,
            error instanceof Error ? error.message : String(error),
          );

          await this.evaluationQueueService.markJobAsFailed(
            job.id,
            error instanceof Error ? error.message : 'Manual processing error',
          );
        }
      }

      this.logger.log(
        `Manual processing completed: ${processedCount}/${pendingJobs.length} jobs processed successfully`,
      );
      return processedCount;
    } catch (error) {
      this.logger.error('Failed to manually process evaluation jobs:', error);
      throw error;
    }
  }

  /**
   * Gets the current processing status
   * @returns Whether the service is currently processing jobs
   */
  async isCurrentlyProcessing(): Promise<boolean> {
    return await this.evaluationQueueService.hasProcessingEvaluationJobs();
  }
}
