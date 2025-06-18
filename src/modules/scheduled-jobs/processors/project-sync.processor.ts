import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ImpactGraphService } from '../../data-fetching/services/impact-graph.service';
import { ProjectSocialAccountService } from '../../social-media-storage/services/project-social-account.service';
import { ScheduledJob } from '../../social-media-storage/entities/scheduled-job.entity';
import {
  ProjectDetailsDto,
  extractSocialMediaHandles,
} from '../../data-fetching/dto/project-details.dto';

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
 * - Scheduled to run every 6 hours as per Task 6.9 requirements
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
  ) {}

  /**
   * Scheduled cron job that runs every 6 hours to sync project data
   * This implements the main requirement from Task 6.9
   */
  @Cron('0 */6 * * *', {
    name: 'project-sync-scheduled',
    timeZone: 'UTC',
  })
  async scheduledProjectSync(): Promise<void> {
    this.logger.log(
      'Starting scheduled project synchronization (every 6 hours)',
    );

    try {
      await this.syncAllProjectsFromCauses();
      this.logger.log(
        'Scheduled project synchronization completed successfully',
      );
    } catch (error) {
      this.logger.error('Scheduled project synchronization failed', error);
      // Don't throw - let the system continue running
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

    this.logger.log(`Starting project sync job (Job ID: ${job.id})`);

    try {
      await this.syncAllProjectsFromCauses();

      const processingTime = Date.now() - startTime;
      this.logger.log(
        `Successfully completed project sync job (Job ID: ${job.id}), ` +
          `processing time: ${processingTime}ms`,
      );

      // Update job metadata for monitoring
      if (job.metadata) {
        job.metadata.processingResult = {
          processingTimeMs: processingTime,
          success: true,
          completedAt: new Date().toISOString(),
        };
      }
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(
        `Project sync job failed (Job ID: ${job.id}), ` +
          `processing time: ${processingTime}ms`,
        error,
      );

      // Update job metadata with error info
      if (job.metadata) {
        job.metadata.processingResult = {
          processingTimeMs: processingTime,
          success: false,
          error: error.message,
          completedAt: new Date().toISOString(),
        };
      }

      throw error; // Re-throw for retry logic in JobProcessorService
    }
  }

  /**
   * Main synchronization method that fetches all projects from all causes
   * and updates the local database with complete project metadata.
   */
  private async syncAllProjectsFromCauses(): Promise<void> {
    const startTime = Date.now();
    let totalProjectsProcessed = 0;
    let totalCausesProcessed = 0;
    let totalErrors = 0;
    const projectsProcessed = new Set<string>();

    try {
      this.logger.log(
        'Starting comprehensive project synchronization from all causes',
      );

      // Fetch all causes with projects in batches
      let offset = 0;
      const batchSize = 50; // Process causes in batches to manage memory
      let hasMore = true;

      while (hasMore) {
        this.logger.debug(
          `Fetching causes batch: offset=${offset}, limit=${batchSize}`,
        );

        const { causes } =
          await this.impactGraphService.getAllCausesWithProjects(
            batchSize,
            offset,
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
            );

            // Process each project in the cause
            for (const project of projects) {
              try {
                // Skip if we've already processed this project (deduplicate across causes)
                if (projectsProcessed.has(project.id.toString())) {
                  this.logger.debug(
                    `Skipping duplicate project: ${project.title} (ID: ${project.id})`,
                  );
                  continue;
                }

                await this.syncSingleProject(project);
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
                  error,
                );
                // Continue with other projects
              }
            }

            totalCausesProcessed++;
          } catch (error) {
            totalErrors++;
            this.logger.warn(
              `Failed to process cause: ${cause.title} (ID: ${cause.id})`,
              error,
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
        );
      }

      const processingTime = Date.now() - startTime;
      this.logger.log(
        `Project synchronization completed successfully. ` +
          `Total: ${totalCausesProcessed} causes, ${totalProjectsProcessed} unique projects, ` +
          `${totalErrors} errors, processing time: ${processingTime}ms`,
      );
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(
        `Project synchronization failed after processing ${totalProjectsProcessed} projects ` +
          `in ${processingTime}ms`,
        error,
      );
      throw error;
    }
  }

  /**
   * Synchronizes a single project's data to the local database
   * @param project - Project data from GraphQL
   */
  private async syncSingleProject(project: ProjectDetailsDto): Promise<void> {
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

      // Upsert project account with all the data
      await this.projectSocialAccountService.upsertProjectAccount(
        project.id.toString(),
        projectData,
      );

      this.logger.debug(
        `Successfully synced project: ${project.title} (ID: ${project.id}) ` +
          `with Twitter: ${socialMediaHandles.twitter ?? 'none'}, ` +
          `Farcaster: ${socialMediaHandles.farcaster ?? 'none'}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to sync project data for ${project.title} (ID: ${project.id})`,
        error,
      );
      throw error;
    }
  }

  /**
   * Manual trigger for project synchronization
   * Can be called by admin endpoints or for testing
   */
  async manualSync(): Promise<{
    success: boolean;
    projectsProcessed: number;
    processingTimeMs: number;
    errors: number;
  }> {
    const startTime = Date.now();

    this.logger.log('Manual project synchronization triggered');

    try {
      await this.syncAllProjectsFromCauses();

      const processingTime = Date.now() - startTime;
      this.logger.log(
        `Manual project synchronization completed in ${processingTime}ms`,
      );

      return {
        success: true,
        projectsProcessed: 0, // TODO: Return actual count if needed
        processingTimeMs: processingTime,
        errors: 0,
      };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      this.logger.error(
        `Manual project synchronization failed in ${processingTime}ms`,
        error,
      );

      return {
        success: false,
        projectsProcessed: 0,
        processingTimeMs: processingTime,
        errors: 1,
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
      this.logger.error('Failed to get sync statistics', error);
      return {
        totalProjects: 0,
        projectsWithTwitter: 0,
        projectsWithFarcaster: 0,
      };
    }
  }
}
