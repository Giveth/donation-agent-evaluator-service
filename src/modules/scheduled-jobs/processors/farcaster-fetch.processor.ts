import { Injectable, Logger } from '@nestjs/common';
import { FarcasterService } from '../../social-media/services/farcaster.service';
import { SocialPostStorageService } from '../../social-media-storage/services/social-post-storage.service';
import { ProjectSocialAccountService } from '../../social-media-storage/services/project-social-account.service';
import { ScheduledJob } from '../../social-media-storage/entities/scheduled-job.entity';

/**
 * Processor specifically for Farcaster fetching jobs.
 *
 * This processor handles the fetching of Farcaster casts for projects with incremental
 * fetching capabilities to avoid re-processing old casts. It integrates with the
 * FarcasterService for data fetching and SocialPostStorageService for persistence.
 *
 * Key features:
 * - Incremental fetching based on latest cast timestamp
 * - Automatic detection of duplicates to stop unnecessary processing
 * - Comprehensive error handling and logging
 * - Updates project social account metadata
 * - Uses FREE Farcaster APIs (FName Registry + Warpcast)
 *
 * The processor follows the architecture defined in scraper-db-architecture.md
 * and is designed to work with the JobProcessorService for scheduled execution.
 */
@Injectable()
export class FarcasterFetchProcessor {
  private readonly logger = new Logger(FarcasterFetchProcessor.name);

  constructor(
    private readonly farcasterService: FarcasterService,
    private readonly socialPostStorageService: SocialPostStorageService,
    private readonly projectSocialAccountService: ProjectSocialAccountService,
  ) {}

  /**
   * Processes a Farcaster fetch job for a specific project.
   *
   * This method:
   * 1. Gets the project's latest Farcaster post timestamp for incremental fetching
   * 2. Calls FarcasterService.getRecentCastsIncremental() to fetch only new casts
   * 3. Stores new casts in database using SocialPostStorageService
   * 4. Updates project account metadata with fetch timestamps
   * 5. Handles errors and provides detailed logging
   *
   * @param job - The scheduled job containing projectId and metadata
   * @throws Error if critical failures occur that should trigger retries
   */
  async processFarcasterFetch(job: ScheduledJob): Promise<void> {
    const { projectId } = job;
    const startTime = Date.now();

    this.logger.log(
      `Starting Farcaster fetch for project ${projectId} (Job ID: ${job.id})`,
    );

    try {
      // Step 1: Get project's social media account information
      let projectAccount =
        await this.projectSocialAccountService.getProjectAccount(projectId);

      if (!projectAccount) {
        // Create a new project account if it doesn't exist
        this.logger.warn(
          `No project account found for ${projectId}, creating new one...`,
        );
        projectAccount =
          await this.projectSocialAccountService.upsertProjectAccount(
            projectId,
            {
              metadata: {
                createdBy: 'FarcasterFetchProcessor',
                createdAt: new Date().toISOString(),
              },
            },
          );
      }

      // Validate Farcaster username exists
      if (!projectAccount.farcasterUrl) {
        const errorMsg = `No Farcaster username found for project ${projectId}`;
        this.logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      // Step 2: Get the latest Farcaster post timestamp for incremental fetching
      const latestTimestamp = projectAccount.latestFarcasterPostTimestamp;

      this.logger.debug(
        `Fetching casts for ${projectAccount.farcasterUrl} ` +
          `(Project: ${projectId}, Since: ${latestTimestamp?.toISOString() ?? 'beginning'})`,
      );

      // Step 3: Fetch recent casts using incremental fetching
      const casts = await this.farcasterService.getRecentCastsIncremental(
        projectAccount.farcasterUrl,
        latestTimestamp ?? undefined,
      );

      if (casts.length === 0) {
        this.logger.log(
          `No new casts found for ${projectAccount.farcasterUrl} (Project: ${projectId})`,
        );

        // Update last fetch timestamp even if no new casts
        await this.projectSocialAccountService.upsertProjectAccount(projectId, {
          lastFarcasterFetch: new Date(),
          metadata: {
            ...projectAccount.metadata,
            lastFetchResult: {
              timestamp: new Date().toISOString(),
              castsFound: 0,
              success: true,
              processingTimeMs: Date.now() - startTime,
            },
          },
        });

        return;
      }

      // Step 4: Store new casts in database
      this.logger.log(
        `Found ${casts.length} new casts for ${projectAccount.farcasterUrl}, storing...`,
      );

      const storageResult =
        await this.socialPostStorageService.storeSocialPostsIncremental(
          projectId,
          casts,
        );

      // Step 5: Update project account with fetch results
      const now = new Date();
      const updateData = {
        lastFarcasterFetch: now,
        metadata: {
          ...projectAccount.metadata,
          lastFetchResult: {
            timestamp: now.toISOString(),
            castsFound: casts.length,
            castsStored: storageResult.stored,
            duplicatesFound: storageResult.duplicatesFound,
            stoppedAtTimestamp: storageResult.stoppedAtTimestamp?.toISOString(),
            success: true,
            processingTimeMs: Date.now() - startTime,
          },
        },
      };

      await this.projectSocialAccountService.upsertProjectAccount(
        projectId,
        updateData,
      );

      // Log success with detailed metrics
      const processingTime = Date.now() - startTime;
      this.logger.log(
        `Successfully processed Farcaster fetch for ${projectAccount.farcasterUrl} ` +
          `(Project: ${projectId}): ${storageResult.stored} casts stored, ` +
          `${storageResult.duplicatesFound ? 'stopped at duplicate' : 'no duplicates'}, ` +
          `processing time: ${processingTime}ms`,
      );

      // Add job metadata for monitoring
      if (job.metadata) {
        job.metadata.processingResult = {
          castsFound: casts.length,
          castsStored: storageResult.stored,
          duplicatesFound: storageResult.duplicatesFound,
          processingTimeMs: processingTime,
          farcasterUrl: projectAccount.farcasterUrl,
        };
      }
    } catch (error) {
      // Handle errors with detailed logging
      const processingTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `Failed to process Farcaster fetch for project ${projectId}: ${errorMessage}`,
        errorStack,
      );

      // Try to update project account with error information
      try {
        const projectAccount =
          await this.projectSocialAccountService.getProjectAccount(projectId);
        if (projectAccount) {
          await this.projectSocialAccountService.upsertProjectAccount(
            projectId,
            {
              metadata: {
                ...projectAccount.metadata,
                lastFetchResult: {
                  timestamp: new Date().toISOString(),
                  success: false,
                  error: errorMessage,
                  processingTimeMs: processingTime,
                },
              },
            },
          );
        }
      } catch (updateError) {
        this.logger.error(
          `Failed to update project account with error info: ${updateError}`,
        );
      }

      // Add error details to job metadata
      if (job.metadata) {
        job.metadata.processingError = {
          message: errorMessage,
          stack: errorStack,
          processingTimeMs: processingTime,
          timestamp: new Date().toISOString(),
        };
      }

      // Re-throw to trigger retry logic in JobProcessorService
      throw error;
    }
  }

  /**
   * Gets statistics about Farcaster fetching performance for monitoring.
   * Uses efficient database queries instead of in-memory filtering for better performance.
   *
   * @param projectId - Optional project ID to get stats for specific project
   * @returns Object containing fetch statistics
   */
  async getFetchStatistics(projectId?: string): Promise<{
    totalProjects: number;
    projectsWithFarcaster: number;
    recentFetches: number;
    averageProcessingTime: number;
    lastFetchTime?: Date;
  }> {
    try {
      // Use efficient database queries for basic statistics
      const basicStats =
        await this.projectSocialAccountService.getFarcasterFetchStatistics(
          projectId,
        );

      // For average processing time, we still need to get some project metadata
      // but only for projects that have recent fetches, making this much more efficient
      let averageProcessingTime = 0;

      if (basicStats.recentFetches > 0) {
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

        // Get only projects with recent fetches to calculate processing time
        // All filtering is now done at the database level for optimal performance
        const recentlyFetchedProjects =
          await this.projectSocialAccountService.getRecentlyFetchedFarcasterProjects(
            oneDayAgo,
            projectId,
          );

        let totalProcessingTime = 0;
        let validProcessingTimes = 0;

        for (const project of recentlyFetchedProjects) {
          if (project.metadata) {
            const lastResult = project.metadata.lastFetchResult as
              | { processingTimeMs?: number }
              | undefined;
            if (lastResult?.processingTimeMs) {
              totalProcessingTime += lastResult.processingTimeMs;
              validProcessingTimes++;
            }
          }
        }

        averageProcessingTime =
          validProcessingTimes > 0
            ? Math.round(totalProcessingTime / validProcessingTimes)
            : 0;
      }

      return {
        totalProjects: basicStats.totalProjects,
        projectsWithFarcaster: basicStats.projectsWithFarcaster,
        recentFetches: basicStats.recentFetches,
        averageProcessingTime,
        lastFetchTime: basicStats.lastFetchTime,
      };
    } catch (error) {
      this.logger.error('Failed to get fetch statistics:', error);
      throw error;
    }
  }
}
