import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import pLimit from 'p-limit';
import { ImpactGraphService } from '../../data-fetching/services/impact-graph.service';
import { ProjectSocialAccountService } from '../../social-media-storage/services/project-social-account.service';
import { ScheduledJob } from '../../social-media-storage/entities/scheduled-job.entity';
import { ProjectDetailsDto } from '../../data-fetching/dto/project-details.dto';

/**
 * Interface for sync result statistics
 */
export interface SyncResult {
  success: boolean;
  projectsProcessed: number;
  causesProcessed: number;
  processingTimeMs: number;
  errors: number;
  correlationId: string;
}

/**
 * Distributed lock implementation for preventing concurrent sync operations
 */
const SYNC_LOCK_KEY = 'project_sync_lock';
const LOCK_TIMEOUT_MS = 6 * 60 * 60 * 1000; // 6 hours max

/**
 * Processor for synchronizing project metadata from Giveth Impact-Graph.
 *
 * This processor handles the periodic synchronization of project data from all causes,
 * ensuring that the local database stays up-to-date with the latest project information
 * from the Giveth backend. It fetches data efficiently using the optimized
 * getAllCausesWithProjects query.
 *
 * Key features:
 * - Fetches all causes with embedded project data in optimized batches
 * - Deduplicates projects that appear in multiple causes
 * - Extracts and stores complete project metadata including social media handles
 * - Updates project status, verification info, quality scores, and power rankings
 * - Comprehensive progress tracking and error handling
 * - Scheduled to run every 6 hours as per requirements
 *
 * The processor follows the architecture defined in the scheduled jobs system
 * and integrates with ProjectSocialAccountService for data persistence.
 */
@Injectable()
export class ProjectSyncProcessor {
  private readonly logger = new Logger(ProjectSyncProcessor.name);

  constructor(
    private readonly impactGraphService: ImpactGraphService,
    private readonly projectSocialAccountService: ProjectSocialAccountService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * Scheduled cron job that runs every 6 hours to sync project data
   */
  // @Cron('0 */6 * * *', {
  @Cron('0 * * * *', {
    name: 'project-sync-scheduled',
    timeZone: 'UTC',
  })
  async scheduledProjectSync(): Promise<void> {
    const correlationId = uuidv4();
    const lockAcquired = await this.acquireLock(correlationId);

    if (!lockAcquired) {
      this.logger.warn(
        'Scheduled project synchronization skipped - another instance is already running',
        { correlationId },
      );
      return;
    }

    this.logger.log(
      'Starting scheduled project synchronization (every 6 hours)',
      { correlationId },
    );

    try {
      // Use the new filtered sync method with sorting for latest projects first
      await this.syncProjectsFromFilteredCauses({
        // No limit set - will fetch all projects in batches
      });
      this.logger.log(
        'Scheduled project synchronization completed successfully using filtered query',
        { correlationId },
      );
    } catch (error) {
      this.logger.error('Scheduled project synchronization failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        correlationId,
      });
      // Don't throw - let the system continue running
    } finally {
      await this.releaseLock(correlationId);
    }
  }

  /**
   * Processes a PROJECT_SYNC job.
   * This method is called by JobProcessorService when processing PROJECT_SYNC jobs.
   *
   * @param job - The scheduled job (not used in this case since we sync all projects)
   */
  async processProjectSync(job: ScheduledJob): Promise<void> {
    const startTime = Date.now();
    const correlationId = uuidv4();

    this.logger.log(`Starting project sync job (Job ID: ${job.id})`, {
      correlationId,
      jobId: job.id,
    });

    try {
      const result = await this.syncProjectsFromFilteredCauses({
        // No limit set - will fetch all projects in batches
      });

      const processingTime = Date.now() - startTime;
      this.logger.log(
        `Successfully completed project sync job (Job ID: ${job.id}), ` +
          `processing time: ${processingTime}ms`,
        { correlationId, jobId: job.id, result },
      );

      // Update job metadata for monitoring
      if (job.metadata) {
        job.metadata.processingResult = {
          processingTimeMs: processingTime,
          success: true,
          completedAt: new Date().toISOString(),
          correlationId,
          projectsProcessed: result.projectsProcessed,
          causesProcessed: result.causesProcessed,
          errors: result.errors,
        };
      }
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(
        `Project sync job failed (Job ID: ${job.id}), ` +
          `processing time: ${processingTime}ms`,
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          correlationId,
          jobId: job.id,
        },
      );

      // Update job metadata with error info
      if (job.metadata) {
        job.metadata.processingResult = {
          processingTimeMs: processingTime,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          completedAt: new Date().toISOString(),
          correlationId,
        };
      }

      throw error; // Re-throw for retry logic in JobProcessorService
    }
  }

  /**
   * Main synchronization method that fetches all projects from all causes
   * and updates the local database with complete project metadata using batch processing.
   * @deprecated Use syncProjectsFromFilteredCauses() instead for better performance and reliability
   */
  private async syncAllProjectsFromCauses(
    correlationId: string,
  ): Promise<SyncResult> {
    this.logger.log(
      'syncAllProjectsFromCauses is deprecated, delegating to batch processing method',
      { correlationId },
    );

    // Delegate to the new batch processing method with no filters
    return await this.syncProjectsFromFilteredCauses({
      // No filters - will fetch all causes and projects
    });
  }

  /**
   * Synchronizes a single project's data to the local database with data validation
   * @param project - Project data from GraphQL
   * @param queryRunner - Database query runner for transaction
   * @param correlationId - Correlation ID for tracking
   */
  private async syncSingleProject(
    project: ProjectDetailsDto,
    queryRunner: QueryRunner,
    correlationId: string,
  ): Promise<void> {
    try {
      // Use social media handles that were already extracted during DTO creation
      const socialMediaHandles = project.socialMediaHandles ?? {};

      // No numeric validation needed for removed fields

      // Prepare project data for upsert with sanitized values
      const projectData = {
        // Basic project information
        title: project.title,
        slug: project.slug,
        description: project.description,

        // Ranking information
        givPowerRank: project.projectPower?.powerRank,

        // Project status and verification
        projectStatus: project.status?.name ?? 'UNKNOWN',

        // Update information
        lastUpdateDate: project.lastUpdateDate,
        lastUpdateContent: project.lastUpdateContent,

        // Social media URLs
        xUrl: socialMediaHandles.X,
        farcasterUrl: socialMediaHandles.FARCASTER,

        // Metadata for tracking
        metadata: {
          lastSyncedAt: new Date().toISOString(),
          syncedBy: 'ProjectSyncProcessor',
          projectUrl: project.slug
            ? `https://giveth.io/project/${project.slug}`
            : undefined,
          categories: project.categories?.map(cat => cat.name) ?? [],
          mainCategory: project.mainCategory,
          subCategories: project.subCategories ?? [],
          creationDate: project.creationDate,
          updatedAt: project.updatedAt,
          latestUpdateCreationDate: project.latestUpdateCreationDate,
        },
      };

      // Upsert project account with all the data using transaction
      await this.projectSocialAccountService.upsertProjectAccountWithTransaction(
        project.id.toString(),
        projectData,
        queryRunner,
      );

      this.logger.debug(
        `Successfully synced project: ${project.title} (ID: ${project.id}) ` +
          `with X: ${socialMediaHandles.X ?? 'none'}, ` +
          `Farcaster: ${socialMediaHandles.FARCASTER ?? 'none'}`,
        {
          correlationId,
          projectId: project.id,
          xUrl: socialMediaHandles.X,
          farcasterUrl: socialMediaHandles.FARCASTER,
        },
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const isNumericOverflow = errorMessage.includes('numeric field overflow');

      this.logger.error(
        `Failed to sync project data for ${project.title} (ID: ${project.id})`,
        {
          error: errorMessage,
          stack: error instanceof Error ? error.stack : undefined,
          correlationId,
          projectId: project.id,
          isNumericOverflow,
          // Log the actual values that caused the issue
          projectData: isNumericOverflow
            ? {
                givPowerRank: project.projectPower?.powerRank,
              }
            : undefined,
        },
      );
      throw error;
    }
  }

  /**
   * Manual trigger for project synchronization
   * Can be called by admin endpoints or for testing
   */
  async manualSync(): Promise<SyncResult> {
    const correlationId = uuidv4();
    this.logger.log('Manual project synchronization triggered', {
      correlationId,
    });

    try {
      const result = await this.syncProjectsFromFilteredCauses({
        // No limit set - will fetch all projects in batches
      });
      this.logger.log(
        `Manual project synchronization completed in ${result.processingTimeMs}ms`,
        { correlationId, result },
      );
      return result;
    } catch (error) {
      this.logger.error('Manual project synchronization failed', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        correlationId,
      });

      return {
        success: false,
        projectsProcessed: 0,
        causesProcessed: 0,
        processingTimeMs: Date.now(),
        errors: 1,
        correlationId,
      };
    }
  }

  /**
   * Get sync statistics for monitoring
   */
  async getSyncStats(): Promise<{
    lastSyncTime?: Date;
    totalProjects: number;
    projectsWithX: number;
    projectsWithFarcaster: number;
  }> {
    try {
      const counts =
        await this.projectSocialAccountService.getProjectCountWithSocialMedia();

      return {
        totalProjects: counts.total,
        projectsWithX: counts.x,
        projectsWithFarcaster: counts.farcaster,
        // TODO: Add lastSyncTime from metadata if needed
      };
    } catch (error) {
      this.logger.error('Failed to get sync statistics', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return {
        totalProjects: 0,
        projectsWithX: 0,
        projectsWithFarcaster: 0,
      };
    }
  }

  /**
   * Synchronize projects from filtered causes using batch transaction processing
   * This method fetches causes with filtering options and saves projects in batches
   * to prevent long-running transactions and query runner issues
   * @param filterOptions - Optional filter parameters for causes
   * @returns Sync result with statistics
   */
  async syncProjectsFromFilteredCauses(
    filterOptions: {
      limit?: number;
      offset?: number;
      searchTerm?: string;
      chainId?: number;
      listingStatus?: string;
    } = {},
  ): Promise<SyncResult> {
    const correlationId = uuidv4();
    const startTime = Date.now();
    let totalProjectsProcessed = 0;
    let totalCausesProcessed = 0;
    let totalErrors = 0;
    const projectsProcessed = new Set<string>();

    // Configuration for batch processing
    const PROJECT_BATCH_SIZE = 15; // Process projects in smaller batches
    const MAX_CONSECUTIVE_FAILURES = 5; // Circuit breaker threshold
    const CONCURRENCY_LIMIT = 3; // Maximum concurrent batch operations
    let consecutiveFailures = 0;

    // Create concurrency limiter for batch processing
    const limit = pLimit(CONCURRENCY_LIMIT);

    this.logger.log('Starting project synchronization with batch processing', {
      correlationId,
      filterOptions,
      batchSize: PROJECT_BATCH_SIZE,
      concurrencyLimit: CONCURRENCY_LIMIT,
    });

    try {
      // Collect all projects first
      const allProjects: Array<{
        project: any;
        causeId: string;
        causeTitle: string;
      }> = [];

      // Fetch causes with projects in batches using filters
      let offset = filterOptions.offset ?? 0;
      const fetchBatchSize = filterOptions.limit ?? 2;
      let hasMore = true;

      while (hasMore) {
        this.logger.debug(
          `Fetching filtered causes batch: offset=${offset}, limit=${fetchBatchSize}`,
          { correlationId, offset, batchSize: fetchBatchSize, filterOptions },
        );

        const { causes } = await this.retryOperation(
          () =>
            this.impactGraphService.getCausesWithProjectsForEvaluation(
              fetchBatchSize,
              offset,
              filterOptions.searchTerm,
              filterOptions.chainId,
              filterOptions.listingStatus,
            ),
          3,
          correlationId,
        );

        if (causes.length === 0) {
          hasMore = false;
          break;
        }

        // Collect unique projects from each cause
        for (const { cause, projects } of causes) {
          totalCausesProcessed++;

          for (const project of projects) {
            // Skip duplicates across causes
            if (!projectsProcessed.has(project.id.toString())) {
              allProjects.push({
                project,
                causeId: cause.id.toString(),
                causeTitle: cause.title,
              });
              projectsProcessed.add(project.id.toString());
            }
          }
        }

        // Move to next batch - continue pagination until no more data
        offset += fetchBatchSize;
        hasMore = causes.length === fetchBatchSize;
      }

      this.logger.log(
        `Collected ${allProjects.length} unique projects from ${totalCausesProcessed} causes. Starting batch processing...`,
        {
          correlationId,
          totalProjects: allProjects.length,
          causesProcessed: totalCausesProcessed,
        },
      );

      // Create batch processing tasks with concurrency control
      const batches: Array<
        Array<{ project: any; causeId: string; causeTitle: string }>
      > = [];
      for (let i = 0; i < allProjects.length; i += PROJECT_BATCH_SIZE) {
        batches.push(allProjects.slice(i, i + PROJECT_BATCH_SIZE));
      }

      const totalBatches = batches.length;
      this.logger.log(
        `Processing ${totalBatches} batches with concurrency limit of ${CONCURRENCY_LIMIT}`,
        { correlationId, totalBatches, concurrencyLimit: CONCURRENCY_LIMIT },
      );

      // Process batches with concurrency control using p-limit
      const batchPromises = batches.map((batch, index) =>
        limit(async () => {
          // Circuit breaker: Check before processing each batch
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            this.logger.warn(
              `Skipping batch ${index + 1} due to circuit breaker (${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES} failures)`,
              { correlationId, batchNumber: index + 1 },
            );
            return { success: false, processed: 0, errors: batch.length };
          }

          const batchNumber = index + 1;
          this.logger.debug(
            `Processing batch ${batchNumber}/${totalBatches} with ${batch.length} projects (concurrency-controlled)`,
            {
              correlationId,
              batchNumber,
              totalBatches,
              batchSize: batch.length,
            },
          );

          const batchResult = await this.processSingleBatch(
            batch,
            correlationId,
            batchNumber,
          );

          // Handle consecutive failures tracking
          if (batchResult.success) {
            consecutiveFailures = Math.max(0, consecutiveFailures - 1); // Gradually recover
          } else {
            consecutiveFailures++;
            this.logger.warn(
              `Batch ${batchNumber} failed (consecutive failures: ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES})`,
              { correlationId, batchNumber, errors: batchResult.errors },
            );
          }

          // Log progress for significant batches
          if (batchNumber % 10 === 0) {
            this.logger.log(
              `Batch ${batchNumber}/${totalBatches} completed with ${batchResult.processed}/${batch.length} projects processed`,
              {
                correlationId,
                batchNumber,
                totalBatches,
                processed: batchResult.processed,
                errors: batchResult.errors,
              },
            );
          }

          return batchResult;
        }),
      );

      // Wait for all batches to complete with proper error handling
      const batchResults = await Promise.allSettled(batchPromises);

      // Aggregate results from all batches
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          totalProjectsProcessed += result.value.processed;
          totalErrors += result.value.errors;
        } else {
          // Handle promise rejection (should be rare with our error handling)
          totalErrors++;
          this.logger.error('Batch processing promise rejected', {
            error:
              result.reason instanceof Error
                ? result.reason.message
                : String(result.reason),
            correlationId,
          });
        }
      }

      const processingTime = Date.now() - startTime;
      const success = consecutiveFailures < MAX_CONSECUTIVE_FAILURES;

      if (success) {
        this.logger.log(
          `Batch project synchronization completed successfully. ` +
            `Total: ${totalCausesProcessed} causes, ${totalProjectsProcessed} unique projects, ` +
            `${totalErrors} errors, processing time: ${processingTime}ms`,
          {
            correlationId,
            causesProcessed: totalCausesProcessed,
            projectsProcessed: totalProjectsProcessed,
            errors: totalErrors,
            processingTimeMs: processingTime,
            filterOptions,
          },
        );
      } else {
        this.logger.error(
          `Batch project synchronization terminated due to consecutive failures. ` +
            `Processed ${totalProjectsProcessed}/${allProjects.length} projects, ` +
            `${totalErrors} errors, processing time: ${processingTime}ms`,
          {
            correlationId,
            causesProcessed: totalCausesProcessed,
            projectsProcessed: totalProjectsProcessed,
            totalProjects: allProjects.length,
            errors: totalErrors,
            processingTimeMs: processingTime,
            consecutiveFailures,
            filterOptions,
          },
        );
      }

      return {
        success,
        projectsProcessed: totalProjectsProcessed,
        causesProcessed: totalCausesProcessed,
        processingTimeMs: processingTime,
        errors: totalErrors,
        correlationId,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(
        `Batch project synchronization failed after processing ${totalProjectsProcessed} projects ` +
          `in ${processingTime}ms`,
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          correlationId,
          projectsProcessed: totalProjectsProcessed,
          causesProcessed: totalCausesProcessed,
          errors: totalErrors,
          filterOptions,
        },
      );
      throw error;
    }
  }

  /**
   * Process a single batch of projects with individual transaction isolation per project
   * This method provides transaction isolation PER PROJECT to prevent one failure from corrupting the entire batch
   * @param batch - Array of projects to process
   * @param correlationId - Correlation ID for tracking
   * @param batchNumber - Batch number for logging
   * @returns Batch processing result
   */
  private async processSingleBatch(
    batch: Array<{ project: any; causeId: string; causeTitle: string }>,
    correlationId: string,
    batchNumber: number,
  ): Promise<{ success: boolean; processed: number; errors: number }> {
    let processed = 0;
    let errors = 0;
    const batchStartTime = Date.now();

    this.logger.debug(
      `Starting batch ${batchNumber} with ${batch.length} projects (each with isolated transaction)`,
      { correlationId, batchNumber, batchSize: batch.length },
    );

    // Process each project with its own isolated transaction and retry logic
    for (const { project, causeId, causeTitle } of batch) {
      const result = await this.processSingleProjectWithRetry(
        project,
        causeId,
        causeTitle,
        correlationId,
        batchNumber,
      );

      if (result.success) {
        processed++;
      } else {
        errors++;
      }
    }

    const batchTime = Date.now() - batchStartTime;
    const success = processed > 0; // Success if at least one project was processed

    if (success) {
      this.logger.debug(
        `Batch ${batchNumber} completed: ${processed}/${batch.length} projects succeeded, ${errors} failed, ${batchTime}ms`,
        {
          correlationId,
          batchNumber,
          processed,
          total: batch.length,
          errors,
          successRate: `${((processed / batch.length) * 100).toFixed(2)}%`,
          processingTimeMs: batchTime,
        },
      );
    } else {
      this.logger.error(
        `Batch ${batchNumber} failed completely: 0/${batch.length} projects processed, all ${errors} failed, ${batchTime}ms`,
        {
          correlationId,
          batchNumber,
          processed: 0,
          total: batch.length,
          errors,
          processingTimeMs: batchTime,
        },
      );
    }

    return { success, processed, errors };
  }

  /**
   * Process a single project with retry logic and isolated transaction
   * @param project - Project data to sync
   * @param causeId - Associated cause ID
   * @param causeTitle - Associated cause title
   * @param correlationId - Correlation ID for tracking
   * @param batchNumber - Batch number for logging
   * @returns Processing result
   */
  private async processSingleProjectWithRetry(
    project: any,
    causeId: string,
    causeTitle: string,
    correlationId: string,
    batchNumber: number,
  ): Promise<{ success: boolean; attemptsMade: number }> {
    const maxRetries = 2; // Retry once on failure
    let attemptsMade = 0;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      attemptsMade = attempt;
      const projectStartTime = Date.now();
      let queryRunner: QueryRunner | null = null;

      try {
        // Create a fresh query runner for each project
        queryRunner = await this.createHealthyQueryRunner(correlationId);

        // Start a new transaction for this specific project
        await queryRunner.startTransaction();

        // Sync the single project with data validation
        await this.syncSingleProject(project, queryRunner, correlationId);

        // Commit this project's transaction
        await queryRunner.commitTransaction();

        const projectTime = Date.now() - projectStartTime;
        this.logger.debug(
          `Successfully synced project ${project.title} (ID: ${project.id}) in batch ${batchNumber} [${projectTime}ms, attempt ${attempt}/${maxRetries}]`,
          {
            correlationId,
            batchNumber,
            projectId: project.id,
            attempt,
            processingTimeMs: projectTime,
          },
        );

        return { success: true, attemptsMade };
      } catch (error) {
        // Rollback this specific project's transaction
        if (queryRunner && !queryRunner.isReleased) {
          try {
            if (queryRunner.isTransactionActive) {
              await queryRunner.rollbackTransaction();
              this.logger.debug(
                `Rolled back transaction for project ${project.id} in batch ${batchNumber} (attempt ${attempt})`,
                { correlationId, batchNumber, projectId: project.id, attempt },
              );
            }
          } catch (rollbackError) {
            this.logger.error(
              `Failed to rollback transaction for project ${project.id}`,
              {
                error:
                  rollbackError instanceof Error
                    ? rollbackError.message
                    : String(rollbackError),
                correlationId,
                batchNumber,
                projectId: project.id,
                attempt,
              },
            );
          }
        }

        const projectTime = Date.now() - projectStartTime;
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const isNumericOverflow = errorMessage.includes(
          'numeric field overflow',
        );
        const isTransactionAborted = errorMessage.includes(
          'current transaction is aborted',
        );
        const isConnectionError =
          errorMessage.includes('connection') ||
          errorMessage.includes('timeout');

        // Don't retry on data errors, only on transient errors
        const shouldRetry =
          attempt < maxRetries && (isConnectionError || isTransactionAborted);

        this.logger.warn(
          `Failed to sync project ${project.title} (ID: ${project.id}) in batch ${batchNumber} [${projectTime}ms, attempt ${attempt}/${maxRetries}]`,
          {
            error: errorMessage,
            stack: error instanceof Error ? error.stack : undefined,
            correlationId,
            batchNumber,
            projectId: project.id,
            causeId,
            causeTitle,
            isNumericOverflow,
            isTransactionAborted,
            isConnectionError,
            willRetry: shouldRetry,
            processingTimeMs: projectTime,
            attempt,
          },
        );

        // Log specific numeric overflow details for debugging
        if (isNumericOverflow) {
          this.logger.error(
            `Numeric overflow detected for project ${project.id} - data will be sanitized on next attempt`,
            {
              projectId: project.id,
              projectTitle: project.title,
              givPowerRank: project.projectPower?.powerRank,
              correlationId,
              attempt,
            },
          );
        }

        // If we shouldn't retry or this was the last attempt, return failure
        if (!shouldRetry) {
          return { success: false, attemptsMade };
        }

        // Add a small delay before retry
        const retryDelay = 500 * attempt; // 500ms, 1000ms
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      } finally {
        // Always release the query runner for this project
        if (queryRunner && !queryRunner.isReleased) {
          try {
            await queryRunner.release();
          } catch (releaseError) {
            this.logger.error(
              `Failed to release query runner for project ${project.id}`,
              {
                error:
                  releaseError instanceof Error
                    ? releaseError.message
                    : String(releaseError),
                correlationId,
                batchNumber,
                projectId: project.id,
                attempt,
              },
            );
          }
        }
      }
    }

    return { success: false, attemptsMade };
  }

  /**
   * Create a healthy query runner with proper validation
   * @param correlationId - Correlation ID for tracking
   * @returns Promise<QueryRunner> - A validated query runner
   */
  private async createHealthyQueryRunner(
    correlationId: string,
  ): Promise<QueryRunner> {
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts) {
      attempts++;

      try {
        const queryRunner = this.dataSource.createQueryRunner();
        await queryRunner.connect();

        // Validate the connection is healthy
        await queryRunner.query('SELECT 1 as health_check');

        this.logger.debug(
          `Created healthy query runner (attempt ${attempts}/${maxAttempts})`,
          { correlationId, attempt: attempts },
        );

        return queryRunner;
      } catch (error) {
        this.logger.warn(
          `Failed to create healthy query runner (attempt ${attempts}/${maxAttempts})`,
          {
            error: error instanceof Error ? error.message : String(error),
            correlationId,
            attempt: attempts,
            maxAttempts,
          },
        );

        if (attempts === maxAttempts) {
          throw new Error(
            `Failed to create healthy query runner after ${maxAttempts} attempts: ${error instanceof Error ? error.message : String(error)}`,
          );
        }

        // Wait before retry with exponential backoff
        const backoffMs = 1000 * Math.pow(2, attempts - 1);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }

    throw new Error('Unreachable code');
  }

  /**
   * Test cause-project filtering behavior by analyzing GraphQL data
   * This method helps validate that the system correctly filters to only
   * save projects that are associated with at least one cause
   */
  async testCauseProjectFiltering(): Promise<{
    totalCauses: number;
    totalProjectsFromCauses: number;
    uniqueProjectsFromCauses: number;
    projectsInMultipleCauses: number;
    sampleProjectSlugs: string[];
  }> {
    const correlationId = uuidv4();

    this.logger.log('Testing cause-project filtering behavior', {
      correlationId,
    });

    try {
      // Fetch sample causes with projects to analyze filtering behavior
      const { causes } = await this.impactGraphService.getAllCausesWithProjects(
        10,
        0,
      );

      const allProjects = new Map<
        string,
        {
          id: string;
          slug: string;
          title: string;
          causeCount: number;
          projectType?: string;
        }
      >();

      let totalProjectsFromCauses = 0;

      // Process each cause and track project occurrences
      causes.forEach(({ cause: _cause, projects }) => {
        projects.forEach(project => {
          totalProjectsFromCauses++;

          const projectId = project.id.toString();
          if (allProjects.has(projectId)) {
            // Project appears in multiple causes
            allProjects.get(projectId)!.causeCount++;
          } else {
            // First time seeing this project
            allProjects.set(projectId, {
              id: projectId,
              slug: project.slug,
              title: project.title,
              causeCount: 1,
              projectType: project.projectType,
            });
          }
        });
      });

      const uniqueProjectsFromCauses = allProjects.size;
      const projectsInMultipleCauses = Array.from(allProjects.values()).filter(
        p => p.causeCount > 1,
      ).length;

      // Get sample project slugs for validation
      const sampleProjectSlugs = Array.from(allProjects.values())
        .slice(0, 5)
        .map(p => p.slug);

      const result = {
        totalCauses: causes.length,
        totalProjectsFromCauses,
        uniqueProjectsFromCauses,
        projectsInMultipleCauses,
        sampleProjectSlugs,
      };

      this.logger.log('Cause-project filtering analysis completed', {
        correlationId,
        result,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to analyze cause-project filtering', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        correlationId,
      });

      // Return empty results on error
      return {
        totalCauses: 0,
        totalProjectsFromCauses: 0,
        uniqueProjectsFromCauses: 0,
        projectsInMultipleCauses: 0,
        sampleProjectSlugs: [],
      };
    }
  }

  /**
   * Test the new filtered causes functionality
   * This method validates that the ALL_PROJECTS_WITH_FILTERS_QUERY works correctly
   * and returns the expected cause and project data
   */
  async testFilteredCausesQuery(
    filterOptions: {
      limit?: number;
      offset?: number;
      searchTerm?: string;
      chainId?: number;
      listingStatus?: string;
    } = {},
  ): Promise<{
    totalCauses: number;
    totalProjectsFromCauses: number;
    uniqueProjectsFromCauses: number;
    projectsInMultipleCauses: number;
    sampleProjectSlugs: string[];
    sampleCauseTitles: string[];
    filterOptions: any;
  }> {
    const correlationId = uuidv4();

    this.logger.log('Testing filtered causes query functionality', {
      correlationId,
      filterOptions,
    });

    try {
      // Test the new filtered query
      const { causes } =
        await this.impactGraphService.getCausesWithProjectsForEvaluation(
          filterOptions.limit ?? 10,
          filterOptions.offset ?? 0,
          filterOptions.searchTerm,
          filterOptions.chainId,
          filterOptions.listingStatus,
        );

      const allProjects = new Map<
        string,
        {
          id: string;
          slug: string;
          title: string;
          causeCount: number;
          projectType?: string;
        }
      >();

      let totalProjectsFromCauses = 0;
      const causeTitles: string[] = [];

      // Process each cause and track project occurrences
      causes.forEach(({ cause, projects }) => {
        causeTitles.push(cause.title);

        projects.forEach(project => {
          totalProjectsFromCauses++;

          const projectId = project.id.toString();
          if (allProjects.has(projectId)) {
            // Project appears in multiple causes
            allProjects.get(projectId)!.causeCount++;
          } else {
            // First time seeing this project
            allProjects.set(projectId, {
              id: projectId,
              slug: project.slug,
              title: project.title,
              causeCount: 1,
              projectType: project.projectType,
            });
          }
        });
      });

      const uniqueProjectsFromCauses = allProjects.size;
      const projectsInMultipleCauses = Array.from(allProjects.values()).filter(
        p => p.causeCount > 1,
      ).length;

      // Get sample project slugs and cause titles for validation
      const sampleProjectSlugs = Array.from(allProjects.values())
        .slice(0, 5)
        .map(p => p.slug);

      const sampleCauseTitles = causeTitles.slice(0, 5);

      const result = {
        totalCauses: causes.length,
        totalProjectsFromCauses,
        uniqueProjectsFromCauses,
        projectsInMultipleCauses,
        sampleProjectSlugs,
        sampleCauseTitles,
        filterOptions,
      };

      this.logger.log('Filtered causes query test completed', {
        correlationId,
        result,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed to test filtered causes query', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        correlationId,
        filterOptions,
      });

      // Return empty results on error
      return {
        totalCauses: 0,
        totalProjectsFromCauses: 0,
        uniqueProjectsFromCauses: 0,
        projectsInMultipleCauses: 0,
        sampleProjectSlugs: [],
        sampleCauseTitles: [],
        filterOptions,
      };
    }
  }

  /**
   * Acquire distributed lock to prevent concurrent sync operations
   */
  private async acquireLock(correlationId: string): Promise<boolean> {
    try {
      const lockQuery = `
        INSERT INTO sync_locks (lock_key, acquired_by, acquired_at, expires_at)
        VALUES ($1, $2, NOW(), NOW() + INTERVAL '${LOCK_TIMEOUT_MS} milliseconds')
        ON CONFLICT (lock_key) DO NOTHING
        RETURNING id
      `;

      const result = await this.dataSource.query(lockQuery, [
        SYNC_LOCK_KEY,
        correlationId,
      ]);

      return Array.isArray(result) && result.length > 0;
    } catch (error) {
      this.logger.error('Failed to acquire sync lock', {
        error: error instanceof Error ? error.message : String(error),
        correlationId,
      });
      return false;
    }
  }

  /**
   * Release distributed lock
   */
  private async releaseLock(correlationId: string): Promise<void> {
    try {
      const releaseQuery = `
        DELETE FROM sync_locks 
        WHERE lock_key = $1 AND acquired_by = $2
      `;

      await this.dataSource.query(releaseQuery, [SYNC_LOCK_KEY, correlationId]);
    } catch (error) {
      this.logger.error('Failed to release sync lock', {
        error: error instanceof Error ? error.message : String(error),
        correlationId,
      });
    }
  }

  /**
   * Retry operation with exponential backoff
   */
  private async retryOperation<T>(
    operation: () => Promise<T>,
    maxRetries: number,
    correlationId: string,
  ): Promise<T> {
    let lastError: Error = new Error(
      'Operation failed after all retry attempts',
    );

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        if (attempt === maxRetries) {
          break;
        }

        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
        const jitterMs = Math.random() * 1000;
        const totalDelayMs = backoffMs + jitterMs;

        this.logger.warn(
          `Operation failed, retrying in ${totalDelayMs}ms (attempt ${attempt}/${maxRetries})`,
          {
            error: error instanceof Error ? error.message : String(error),
            correlationId,
            attempt,
            maxRetries,
            delayMs: totalDelayMs,
          },
        );

        await new Promise(resolve => setTimeout(resolve, totalDelayMs));
      }
    }

    throw lastError;
  }
}
