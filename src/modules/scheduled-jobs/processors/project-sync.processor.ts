import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import { ImpactGraphService } from '../../data-fetching/services/impact-graph.service';
import { ProjectSocialAccountService } from '../../social-media-storage/services/project-social-account.service';
import { ScheduledJob } from '../../social-media-storage/entities/scheduled-job.entity';
import {
  ProjectDetailsDto,
  extractSocialMediaHandles,
} from '../../data-fetching/dto/project-details.dto';

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
  @Cron('0 */6 * * *', {
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
        sortBy: 'creationDate',
        sortDirection: 'DESC',
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
        sortBy: 'creationDate',
        sortDirection: 'DESC',
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
   * and updates the local database with complete project metadata.
   */
  private async syncAllProjectsFromCauses(
    correlationId: string,
  ): Promise<SyncResult> {
    const startTime = Date.now();
    let totalProjectsProcessed = 0;
    let totalCausesProcessed = 0;
    let totalErrors = 0;
    const projectsProcessed = new Set<string>();

    // Use transaction for atomic operations
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      this.logger.log(
        'Starting comprehensive project synchronization from all causes',
        { correlationId },
      );

      // Fetch all causes with projects in batches
      let offset = 0;
      const batchSize = 50; // Process causes in batches to manage memory
      let hasMore = true;

      while (hasMore) {
        this.logger.debug(
          `Fetching causes batch: offset=${offset}, limit=${batchSize}`,
          { correlationId, offset, batchSize },
        );

        const { causes } = await this.retryOperation(
          () =>
            this.impactGraphService.getAllCausesWithProjects(batchSize, offset),
          3,
          correlationId,
        );

        if (causes.length === 0) {
          hasMore = false;
          break;
        }

        // Process each cause and its projects
        for (const { cause, projects } of causes) {
          try {
            this.logger.debug(
              `Processing cause "${cause.title}" (ID: ${cause.id}) with ${projects.length} projects`,
              {
                correlationId,
                causeId: cause.id,
                projectCount: projects.length,
              },
            );

            // Process each project in the cause
            for (const project of projects) {
              try {
                // Skip if we've already processed this project (deduplicate across causes)
                if (projectsProcessed.has(project.id.toString())) {
                  this.logger.debug(
                    `Skipping duplicate project: ${project.title} (ID: ${project.id})`,
                    { correlationId, projectId: project.id },
                  );
                  continue;
                }

                await this.syncSingleProject(
                  project,
                  queryRunner,
                  correlationId,
                );
                projectsProcessed.add(project.id.toString());
                totalProjectsProcessed++;

                // Add small delay to avoid overwhelming the database
                if (totalProjectsProcessed % 10 === 0) {
                  await new Promise(resolve => setTimeout(resolve, 100));
                }
              } catch (error) {
                totalErrors++;
                this.logger.warn(
                  `Failed to sync project: ${project.title} (ID: ${project.id})`,
                  {
                    error:
                      error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined,
                    correlationId,
                    projectId: project.id,
                  },
                );
                // Continue with other projects
              }
            }

            totalCausesProcessed++;
          } catch (error) {
            totalErrors++;
            this.logger.warn(
              `Failed to process cause: ${cause.title} (ID: ${cause.id})`,
              {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                correlationId,
                causeId: cause.id,
              },
            );
            // Continue with other causes
          }
        }

        // Move to next batch
        offset += batchSize;
        hasMore = causes.length === batchSize;

        // Log progress
        this.logger.log(
          `Batch completed. Processed ${totalCausesProcessed} causes, ` +
            `${totalProjectsProcessed} unique projects so far...`,
          {
            correlationId,
            causesProcessed: totalCausesProcessed,
            projectsProcessed: totalProjectsProcessed,
            errors: totalErrors,
          },
        );
      }

      // Commit transaction
      await queryRunner.commitTransaction();

      const processingTime = Date.now() - startTime;
      this.logger.log(
        `Project synchronization completed successfully. ` +
          `Total: ${totalCausesProcessed} causes, ${totalProjectsProcessed} unique projects, ` +
          `${totalErrors} errors, processing time: ${processingTime}ms`,
        {
          correlationId,
          causesProcessed: totalCausesProcessed,
          projectsProcessed: totalProjectsProcessed,
          errors: totalErrors,
          processingTimeMs: processingTime,
        },
      );

      return {
        success: true,
        projectsProcessed: totalProjectsProcessed,
        causesProcessed: totalCausesProcessed,
        processingTimeMs: processingTime,
        errors: totalErrors,
        correlationId,
      };
    } catch (error) {
      // Rollback transaction on error
      await queryRunner.rollbackTransaction();

      const processingTime = Date.now() - startTime;
      this.logger.error(
        `Project synchronization failed after processing ${totalProjectsProcessed} projects ` +
          `in ${processingTime}ms`,
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          correlationId,
          projectsProcessed: totalProjectsProcessed,
          causesProcessed: totalCausesProcessed,
          errors: totalErrors,
        },
      );
      throw error;
    } finally {
      // Release query runner
      await queryRunner.release();
    }
  }

  /**
   * Synchronizes a single project's data to the local database
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
      // Extract social media handles from various sources
      const socialMediaHandles = extractSocialMediaHandles(project);

      // Prepare project data for upsert
      const projectData = {
        // Basic project information
        title: project.title,
        slug: project.slug,
        description: project.description,

        // Quality and ranking information
        qualityScore: project.qualityScore,
        givPowerRank: project.projectPower?.powerRank,

        // Project status and verification
        projectStatus: project.status?.name ?? 'UNKNOWN',
        verified: project.verified ?? false,

        // Update information
        lastUpdateDate: project.lastUpdateDate,
        lastUpdateContent: project.lastUpdateContent,

        // Financial and engagement metrics
        totalDonations: project.totalDonations,
        totalReactions: project.totalReactions,

        // Social media handles
        twitterHandle: socialMediaHandles.twitter,
        farcasterUsername: socialMediaHandles.farcaster,

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
          verified: project.verified,
          giveBacks: project.giveBacks,
          isGivbackEligible: project.isGivbackEligible,
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
          `with Twitter: ${socialMediaHandles.twitter ?? 'none'}, ` +
          `Farcaster: ${socialMediaHandles.farcaster ?? 'none'}`,
        {
          correlationId,
          projectId: project.id,
          twitterHandle: socialMediaHandles.twitter,
          farcasterUsername: socialMediaHandles.farcaster,
        },
      );
    } catch (error) {
      this.logger.error(
        `Failed to sync project data for ${project.title} (ID: ${project.id})`,
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          correlationId,
          projectId: project.id,
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
        sortBy: 'creationDate',
        sortDirection: 'DESC',
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
    projectsWithTwitter: number;
    projectsWithFarcaster: number;
  }> {
    try {
      const projects =
        await this.projectSocialAccountService.getProjectsForScheduling();

      return {
        totalProjects: projects.length,
        projectsWithTwitter: projects.filter(p => p.twitterHandle).length,
        projectsWithFarcaster: projects.filter(p => p.farcasterUsername).length,
        // TODO: Add lastSyncTime from metadata if needed
      };
    } catch (error) {
      this.logger.error('Failed to get sync statistics', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      return {
        totalProjects: 0,
        projectsWithTwitter: 0,
        projectsWithFarcaster: 0,
      };
    }
  }

  /**
   * Synchronize projects from filtered causes using the ALL_PROJECTS_WITH_FILTERS_QUERY
   * This method fetches causes with filtering options and saves only the projects to local database
   * @param filterOptions - Optional filter parameters for causes
   * @returns Sync result with statistics
   */
  async syncProjectsFromFilteredCauses(
    filterOptions: {
      limit?: number;
      offset?: number;
      searchTerm?: string;
      chainId?: number;
      sortBy?: string;
      sortDirection?: string;
      listingStatus?: string;
    } = {},
  ): Promise<SyncResult> {
    const correlationId = uuidv4();
    const startTime = Date.now();
    let totalProjectsProcessed = 0;
    let totalCausesProcessed = 0;
    let totalErrors = 0;
    const projectsProcessed = new Set<string>();

    this.logger.log('Starting project synchronization from filtered causes', {
      correlationId,
      filterOptions,
    });

    // Use transaction for atomic operations
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Fetch causes with projects in batches using filters
      let offset = filterOptions.offset ?? 0;
      const batchSize = filterOptions.limit ?? 50;
      let hasMore = true;

      while (hasMore) {
        this.logger.debug(
          `Fetching filtered causes batch: offset=${offset}, limit=${batchSize}`,
          { correlationId, offset, batchSize, filterOptions },
        );

        const { causes } = await this.retryOperation(
          () =>
            this.impactGraphService.getCausesWithProjectsForEvaluation(
              batchSize,
              offset,
              filterOptions.searchTerm,
              filterOptions.chainId,
              filterOptions.sortBy,
              filterOptions.sortDirection,
              filterOptions.listingStatus,
            ),
          3,
          correlationId,
        );

        if (causes.length === 0) {
          hasMore = false;
          break;
        }

        // Process each cause and its projects
        for (const { cause, projects } of causes) {
          try {
            this.logger.debug(
              `Processing cause "${cause.title}" (ID: ${cause.id}) with ${projects.length} projects`,
              {
                correlationId,
                causeId: cause.id,
                projectCount: projects.length,
                causeTitle: cause.title,
              },
            );

            // Process each project in the cause
            for (const project of projects) {
              try {
                // Skip if we've already processed this project (deduplicate across causes)
                if (projectsProcessed.has(project.id.toString())) {
                  this.logger.debug(
                    `Skipping duplicate project: ${project.title} (ID: ${project.id})`,
                    { correlationId, projectId: project.id },
                  );
                  continue;
                }

                await this.syncSingleProject(
                  project,
                  queryRunner,
                  correlationId,
                );
                projectsProcessed.add(project.id.toString());
                totalProjectsProcessed++;

                // Add small delay to avoid overwhelming the database
                if (totalProjectsProcessed % 10 === 0) {
                  await new Promise(resolve => setTimeout(resolve, 100));
                }
              } catch (error) {
                totalErrors++;
                this.logger.warn(
                  `Failed to sync project: ${project.title} (ID: ${project.id})`,
                  {
                    error:
                      error instanceof Error ? error.message : String(error),
                    stack: error instanceof Error ? error.stack : undefined,
                    correlationId,
                    projectId: project.id,
                  },
                );
                // Continue with other projects
              }
            }

            totalCausesProcessed++;
          } catch (error) {
            totalErrors++;
            this.logger.warn(
              `Failed to process cause: ${cause.title} (ID: ${cause.id})`,
              {
                error: error instanceof Error ? error.message : String(error),
                stack: error instanceof Error ? error.stack : undefined,
                correlationId,
                causeId: cause.id,
              },
            );
            // Continue with other causes
          }
        }

        // Move to next batch (only if we're not using a specific limit)
        if (!filterOptions.limit) {
          offset += batchSize;
          hasMore = causes.length === batchSize;
        } else {
          hasMore = false; // If specific limit was provided, don't continue
        }

        // Log progress
        this.logger.log(
          `Filtered batch completed. Processed ${totalCausesProcessed} causes, ` +
            `${totalProjectsProcessed} unique projects so far...`,
          {
            correlationId,
            causesProcessed: totalCausesProcessed,
            projectsProcessed: totalProjectsProcessed,
            errors: totalErrors,
            filterOptions,
          },
        );
      }

      // Commit transaction
      await queryRunner.commitTransaction();

      const processingTime = Date.now() - startTime;
      this.logger.log(
        `Filtered project synchronization completed successfully. ` +
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

      return {
        success: true,
        projectsProcessed: totalProjectsProcessed,
        causesProcessed: totalCausesProcessed,
        processingTimeMs: processingTime,
        errors: totalErrors,
        correlationId,
      };
    } catch (error) {
      // Rollback transaction on error
      await queryRunner.rollbackTransaction();

      const processingTime = Date.now() - startTime;
      this.logger.error(
        `Filtered project synchronization failed after processing ${totalProjectsProcessed} projects ` +
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
    } finally {
      // Release query runner
      await queryRunner.release();
    }
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
      sortBy?: string;
      sortDirection?: string;
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
          filterOptions.sortBy,
          filterOptions.sortDirection,
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
