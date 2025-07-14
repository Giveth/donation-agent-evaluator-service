import { Injectable, Logger } from '@nestjs/common';
import { TwitterService } from '../../social-media/services/twitter.service';
import { SocialPostStorageService } from '../../social-media-storage/services/social-post-storage.service';
import { ProjectSocialAccountService } from '../../social-media-storage/services/project-social-account.service';
import { ScheduledJob } from '../../social-media-storage/entities/scheduled-job.entity';

/**
 * Processor specifically for Twitter fetching jobs.
 *
 * This processor handles the fetching of Twitter posts for projects with incremental
 * fetching capabilities to avoid re-scraping old tweets. It integrates with the
 * TwitterService for data fetching and SocialPostStorageService for persistence.
 *
 * Key features:
 * - Incremental fetching based on latest tweet timestamp
 * - Automatic detection of duplicates to stop unnecessary scraping
 * - Comprehensive error handling and logging
 * - Updates project social account metadata
 *
 * The processor follows the architecture defined in scraper-db-architecture.md
 * and is designed to work with the JobProcessorService for scheduled execution.
 */
@Injectable()
export class TwitterFetchProcessor {
  private readonly logger = new Logger(TwitterFetchProcessor.name);

  constructor(
    private readonly twitterService: TwitterService,
    private readonly socialPostStorageService: SocialPostStorageService,
    private readonly projectSocialAccountService: ProjectSocialAccountService,
  ) {}

  /**
   * Processes a Twitter fetch job for a specific project.
   *
   * This method:
   * 1. Gets the project's latest Twitter post timestamp for incremental fetching
   * 2. Calls TwitterService.getRecentTweetsIncremental() to fetch only new tweets
   * 3. Stores new tweets in database using SocialPostStorageService
   * 4. Updates project account metadata with fetch timestamps
   * 5. Handles errors and provides detailed logging
   *
   * @param job - The scheduled job containing projectId and metadata
   * @throws Error if critical failures occur that should trigger retries
   */
  async processTwitterFetch(job: ScheduledJob): Promise<void> {
    const { projectId } = job;
    const startTime = Date.now();

    this.logger.log(
      `Starting Twitter fetch for project ${projectId} (Job ID: ${job.id})`,
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
                createdBy: 'TwitterFetchProcessor',
                createdAt: new Date().toISOString(),
              },
            },
          );
      }

      // Validate Twitter handle exists
      if (!projectAccount.xUrl) {
        const errorMsg = `No Twitter handle found for project ${projectId}`;
        this.logger.error(errorMsg);
        throw new Error(errorMsg);
      }

      // Step 2: Get the latest Twitter post timestamp for incremental fetching
      const latestTimestamp = projectAccount.latestXPostTimestamp;

      this.logger.debug(
        `Fetching tweets for @${projectAccount.xUrl} ` +
          `(Project: ${projectId}, Since: ${latestTimestamp?.toISOString() ?? 'beginning'})`,
      );

      // Step 3: Fetch recent tweets using incremental fetching
      const tweets = await this.twitterService.getRecentTweetsIncremental(
        projectAccount.xUrl,
        latestTimestamp ?? undefined,
      );

      if (tweets.length === 0) {
        this.logger.log(
          `No new tweets found for @${projectAccount.xUrl} (Project: ${projectId})`,
        );

        // Update last fetch timestamp even if no new tweets
        await this.projectSocialAccountService.upsertProjectAccount(projectId, {
          lastXFetch: new Date(),
          metadata: {
            ...projectAccount.metadata,
            lastFetchResult: {
              timestamp: new Date().toISOString(),
              tweetsFound: 0,
              success: true,
              processingTimeMs: Date.now() - startTime,
            },
          },
        });

        return;
      }

      // Step 4: Store new tweets in database
      this.logger.log(
        `Found ${tweets.length} new tweets for @${projectAccount.xUrl}, storing...`,
      );

      const storageResult =
        await this.socialPostStorageService.storeSocialPostsIncremental(
          projectId,
          tweets,
        );

      // Step 5: Update project account with fetch results
      const now = new Date();
      const updateData = {
        lastXFetch: now,
        metadata: {
          ...projectAccount.metadata,
          lastFetchResult: {
            timestamp: now.toISOString(),
            tweetsFound: tweets.length,
            tweetsStored: storageResult.stored,
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
        `Successfully processed Twitter fetch for @${projectAccount.xUrl} ` +
          `(Project: ${projectId}): ${storageResult.stored} tweets stored, ` +
          `${storageResult.duplicatesFound ? 'stopped at duplicate' : 'no duplicates'}, ` +
          `processing time: ${processingTime}ms`,
      );

      // Add job metadata for monitoring
      if (job.metadata) {
        job.metadata.processingResult = {
          tweetsFound: tweets.length,
          tweetsStored: storageResult.stored,
          duplicatesFound: storageResult.duplicatesFound,
          processingTimeMs: processingTime,
          xUrl: projectAccount.xUrl,
        };
      }
    } catch (error) {
      // Handle errors with detailed logging
      const processingTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      this.logger.error(
        `Failed to process Twitter fetch for project ${projectId}: ${errorMessage}`,
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
   * Gets statistics about Twitter fetching performance for monitoring.
   *
   * @param _projectId - Optional project ID to get stats for specific project
   * @returns Object containing fetch statistics
   */
  async getFetchStatistics(_projectId?: string): Promise<{
    totalProjects: number;
    projectsWithTwitter: number;
    recentFetches: number;
    averageProcessingTime: number;
    lastFetchTime?: Date;
  }> {
    try {
      // Get all projects with Twitter handles
      const projectsWithTwitter =
        await this.projectSocialAccountService.getProjectsForScheduling();
      const twitterProjects = projectsWithTwitter.filter(p => p.xUrl);

      // Calculate statistics from metadata
      let recentFetches = 0;
      let totalProcessingTime = 0;
      let lastFetchTime: Date | undefined;

      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      for (const project of twitterProjects) {
        if (project.lastXFetch && project.lastXFetch > oneDayAgo) {
          recentFetches++;
        }

        // Extract processing time from metadata if available
        const lastResult = (project.metadata as any)?.lastFetchResult;
        if (lastResult?.processingTimeMs) {
          totalProcessingTime += lastResult.processingTimeMs;
        }

        // Track most recent fetch
        if (
          project.lastXFetch &&
          (!lastFetchTime || project.lastXFetch > lastFetchTime)
        ) {
          lastFetchTime = project.lastXFetch;
        }
      }

      const averageProcessingTime =
        recentFetches > 0 ? Math.round(totalProcessingTime / recentFetches) : 0;

      return {
        totalProjects: projectsWithTwitter.length,
        projectsWithTwitter: twitterProjects.length,
        recentFetches,
        averageProcessingTime,
        lastFetchTime,
      };
    } catch (error) {
      this.logger.error('Failed to get fetch statistics:', error);
      throw error;
    }
  }
}
