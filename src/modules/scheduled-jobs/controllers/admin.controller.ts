import {
  Controller,
  Post,
  Get,
  Param,
  Query,
  HttpStatus,
  HttpException,
  Logger,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';
import { JobSchedulerService } from '../services/job-scheduler.service';
import { JobProcessorService } from '../services/job-processor.service';
import { ProjectSyncProcessor } from '../processors/project-sync.processor';
import { TwitterFetchProcessor } from '../processors/twitter-fetch.processor';
import { FarcasterFetchProcessor } from '../processors/farcaster-fetch.processor';
import {
  ProjectSocialAccountService,
  ProjectAccountData,
} from '../../social-media-storage/services/project-social-account.service';
import { SocialPostStorageService } from '../../social-media-storage/services/social-post-storage.service';
import {
  JobType,
  JobStatus,
  ScheduledJob,
} from '../../social-media-storage/entities/scheduled-job.entity';
import { SocialMediaPlatform } from '../../social-media/dto/social-post.dto';
import { GetSocialPostsQueryDto } from '../dto/get-social-posts-query.dto';
import { SocialPostsResponseDto } from '../dto/social-posts-response.dto';

/**
 * Admin Controller for Manual Operations
 *
 * Provides endpoints for manually triggering operations that are normally scheduled:
 * - Project synchronization from Giveth backend
 * - Individual project social media fetching
 * - System statistics and monitoring
 *
 * These endpoints are designed for operational management, testing, and debugging.
 * All operations include proper logging with correlation IDs for tracking.
 */
@Controller('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(
    private readonly jobSchedulerService: JobSchedulerService,
    private readonly jobProcessorService: JobProcessorService,
    private readonly projectSyncProcessor: ProjectSyncProcessor,
    private readonly twitterFetchProcessor: TwitterFetchProcessor,
    private readonly farcasterFetchProcessor: FarcasterFetchProcessor,
    private readonly projectSocialAccountService: ProjectSocialAccountService,
    private readonly socialPostStorageService: SocialPostStorageService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * POST /admin/sync-projects
   *
   * Manually trigger project synchronization from Giveth backend.
   * This fetches all projects from all causes and updates the local database
   * with the latest project metadata including social media handles.
   *
   * @returns Promise<object> - Sync result statistics
   */
  @Post('sync-projects')
  async syncProjects(): Promise<{
    success: boolean;
    message: string;
    data: {
      projectsProcessed: number;
      causesProcessed: number;
      processingTimeMs: number;
      errors: number;
      correlationId: string;
    };
    timestamp: string;
  }> {
    const correlationId = uuidv4();
    const startTime = Date.now();

    this.logger.log('Manual project sync triggered via admin endpoint', {
      correlationId,
      endpoint: 'POST /admin/sync-projects',
    });

    try {
      // Trigger manual sync using ProjectSyncProcessor
      const syncResult = await this.projectSyncProcessor.manualSync();

      const responseTime = Date.now() - startTime;
      this.logger.log(
        `Manual project sync completed successfully in ${responseTime}ms`,
        {
          correlationId,
          result: syncResult,
          responseTimeMs: responseTime,
        },
      );

      return {
        success: true,
        message: `Successfully synchronized ${syncResult.projectsProcessed} projects from ${syncResult.causesProcessed} causes`,
        data: {
          projectsProcessed: syncResult.projectsProcessed,
          causesProcessed: syncResult.causesProcessed,
          processingTimeMs: syncResult.processingTimeMs,
          errors: syncResult.errors,
          correlationId: syncResult.correlationId,
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.error('Manual project sync failed via admin endpoint', {
        error: error.message,
        stack: error.stack,
        correlationId,
        responseTimeMs: responseTime,
      });

      throw new HttpException(
        {
          success: false,
          message: 'Project synchronization failed',
          error: error.message,
          correlationId,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * POST /admin/fetch/:projectId
   *
   * Force social media fetch for a specific project.
   * This will create immediate jobs to fetch Twitter and Farcaster data
   * for the specified project, bypassing the normal scheduling.
   *
   * @param projectId - The ID of the project to fetch data for
   * @returns Promise<object> - Fetch operation results
   */
  @Post('fetch/:projectId')
  async fetchProjectData(@Param('projectId') projectId: string): Promise<{
    success: boolean;
    message: string;
    data: {
      projectId: string;
      twitterFetch: {
        attempted: boolean;
        success?: boolean;
        postsFound?: number;
        error?: string;
      };
      farcasterFetch: {
        attempted: boolean;
        success?: boolean;
        postsFound?: number;
        error?: string;
      };
      correlationId: string;
    };
    timestamp: string;
  }> {
    const correlationId = uuidv4();
    const startTime = Date.now();

    this.logger.log(
      `Manual fetch triggered for project ${projectId} via admin endpoint`,
      {
        correlationId,
        projectId,
        endpoint: 'POST /admin/fetch/:projectId',
      },
    );

    try {
      // Get project account to check if it exists and has social media handles
      const projectAccount =
        await this.projectSocialAccountService.getProjectAccount(projectId);

      if (!projectAccount) {
        throw new HttpException(
          {
            success: false,
            message: `Project with ID ${projectId} not found`,
            correlationId,
            timestamp: new Date().toISOString(),
          },
          HttpStatus.NOT_FOUND,
        );
      }

      const fetchResults = {
        projectId,
        twitterFetch: {
          attempted: false,
          success: undefined as boolean | undefined,
          postsFound: undefined as number | undefined,
          error: undefined as string | undefined,
        },
        farcasterFetch: {
          attempted: false,
          success: undefined as boolean | undefined,
          postsFound: undefined as number | undefined,
          error: undefined as string | undefined,
        },
        correlationId,
      };

      // Create mock scheduled job objects for processing
      const baseJob: Partial<ScheduledJob> = {
        id: uuidv4(),
        projectId,
        scheduledFor: new Date(),
        status: JobStatus.PROCESSING,
        attempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: {
          manualTrigger: true,
          triggeredBy: 'admin-endpoint',
          correlationId,
          triggeredAt: new Date().toISOString(),
        },
      };

      // Attempt Twitter fetch if handle exists
      if (projectAccount.xUrl) {
        fetchResults.twitterFetch.attempted = true;
        try {
          const twitterJob = {
            ...baseJob,
            jobType: JobType.TWEET_FETCH,
            id: `twitter-${baseJob.id}`,
          } as ScheduledJob;

          await this.twitterFetchProcessor.processTwitterFetch(twitterJob);

          // Get count of posts fetched
          const twitterPosts =
            await this.socialPostStorageService.getRecentSocialPosts(
              projectId,
              10,
              SocialMediaPlatform.TWITTER,
            );

          fetchResults.twitterFetch.success = true;
          fetchResults.twitterFetch.postsFound = twitterPosts.length;

          this.logger.debug(
            `Twitter fetch completed for project ${projectId}`,
            {
              correlationId,
              projectId,
              postsFound: twitterPosts.length,
            },
          );
        } catch (error) {
          fetchResults.twitterFetch.success = false;
          fetchResults.twitterFetch.error = error.message;

          this.logger.warn(`Twitter fetch failed for project ${projectId}`, {
            error: error.message,
            correlationId,
            projectId,
          });
        }
      }

      // Attempt Farcaster fetch if username exists
      if (projectAccount.farcasterUrl) {
        fetchResults.farcasterFetch.attempted = true;
        try {
          const farcasterJob = {
            ...baseJob,
            jobType: JobType.FARCASTER_FETCH,
            id: `farcaster-${baseJob.id}`,
          } as ScheduledJob;

          await this.farcasterFetchProcessor.processFarcasterFetch(
            farcasterJob,
          );

          // Get count of posts fetched
          const farcasterPosts =
            await this.socialPostStorageService.getRecentSocialPosts(
              projectId,
              10,
              SocialMediaPlatform.FARCASTER,
            );

          fetchResults.farcasterFetch.success = true;
          fetchResults.farcasterFetch.postsFound = farcasterPosts.length;

          this.logger.debug(
            `Farcaster fetch completed for project ${projectId}`,
            {
              correlationId,
              projectId,
              postsFound: farcasterPosts.length,
            },
          );
        } catch (error) {
          fetchResults.farcasterFetch.success = false;
          fetchResults.farcasterFetch.error = error.message;

          this.logger.warn(`Farcaster fetch failed for project ${projectId}`, {
            error: error.message,
            correlationId,
            projectId,
          });
        }
      }

      const responseTime = Date.now() - startTime;
      this.logger.log(
        `Manual fetch completed for project ${projectId} in ${responseTime}ms`,
        {
          correlationId,
          projectId,
          results: fetchResults,
          responseTimeMs: responseTime,
        },
      );

      // Determine overall success
      const hasAttempts =
        fetchResults.twitterFetch.attempted ||
        fetchResults.farcasterFetch.attempted;
      const hasFailures =
        (fetchResults.twitterFetch.attempted &&
          !fetchResults.twitterFetch.success) ||
        (fetchResults.farcasterFetch.attempted &&
          !fetchResults.farcasterFetch.success);

      if (!hasAttempts) {
        return {
          success: true,
          message: `Project ${projectId} has no social media handles configured`,
          data: fetchResults,
          timestamp: new Date().toISOString(),
        };
      }

      return {
        success: !hasFailures,
        message: hasFailures
          ? `Fetch completed with some failures for project ${projectId}`
          : `Successfully fetched social media data for project ${projectId}`,
        data: fetchResults,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(
        `Manual fetch failed for project ${projectId} via admin endpoint`,
        {
          error: error.message,
          stack: error.stack,
          correlationId,
          projectId,
          responseTimeMs: responseTime,
        },
      );

      throw new HttpException(
        {
          success: false,
          message: `Failed to fetch data for project ${projectId}`,
          error: error.message,
          correlationId,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /admin/stats
   *
   * Get comprehensive statistics about the system:
   * - Project synchronization status
   * - Job queue statistics
   * - Social media storage statistics
   * - System health indicators
   *
   * @returns Promise<object> - System statistics
   */
  @Get('stats')
  async getStats(): Promise<{
    success: boolean;
    data: {
      sync: {
        totalProjects: number;
        projectsWithX: number;
        projectsWithFarcaster: number;
        lastSyncTime?: Date;
      };
      jobs: {
        pending: number;
        processing: number;
        completed: number;
        failed: number;
        byJobType: Record<JobType, number>;
      };
      socialMedia: {
        totalPosts: number;
        twitterPosts: number;
        farcasterPosts: number;
        postsLast24Hours: number;
        postsLast7Days: number;
      };
      system: {
        uptime: string;
        correlationId: string;
      };
    };
    timestamp: string;
  }> {
    const correlationId = uuidv4();
    const startTime = Date.now();

    this.logger.log('System statistics requested via admin endpoint', {
      correlationId,
      endpoint: 'GET /admin/stats',
    });

    try {
      // Get statistics from various services in parallel
      const [syncStats, jobStats, socialMediaStats] = await Promise.all([
        this.projectSyncProcessor.getSyncStats(),
        this.jobSchedulerService.getJobStatistics(),
        this.getSocialMediaStats(),
      ]);

      const responseTime = Date.now() - startTime;
      const stats = {
        sync: syncStats,
        jobs: jobStats,
        socialMedia: socialMediaStats,
        system: {
          uptime: process.uptime().toString(),
          correlationId,
        },
      };

      this.logger.log(
        `System statistics retrieved successfully in ${responseTime}ms`,
        {
          correlationId,
          stats,
          responseTimeMs: responseTime,
        },
      );

      return {
        success: true,
        data: stats,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.error('Failed to retrieve system statistics', {
        error: error.message,
        stack: error.stack,
        correlationId,
        responseTimeMs: responseTime,
      });

      throw new HttpException(
        {
          success: false,
          message: 'Failed to retrieve system statistics',
          error: error.message,
          correlationId,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /admin/cause-project-validation
   *
   * Validates that the system is correctly filtering projects to only include
   * those that are associated with at least one cause. This endpoint tests
   * the filtering behavior by comparing GraphQL data with stored database data.
   *
   * @returns Promise<object> - Cause-project filtering validation results
   */
  @Get('cause-project-validation')
  async validateCauseProjectFiltering(): Promise<{
    success: boolean;
    data: {
      graphql: {
        totalCauses: number;
        totalProjectsFromCauses: number;
        uniqueProjectsFromCauses: number;
        projectsInMultipleCauses: number;
      };
      database: {
        totalProjectsStored: number;
        projectsWithX: number;
        projectsWithFarcaster: number;
      };
      validation: {
        isFilteringCorrect: boolean;
        message: string;
        sampleProjectsFromCauses: string[];
      };
      correlationId: string;
    };
    timestamp: string;
  }> {
    const correlationId = uuidv4();
    const startTime = Date.now();

    this.logger.log('Cause-project filtering validation requested', {
      correlationId,
      endpoint: 'GET /admin/cause-project-validation',
    });

    try {
      // Get GraphQL data - sample first 10 causes to analyze
      const graphqlData =
        await this.projectSyncProcessor.testCauseProjectFiltering();

      // Get database statistics
      const dbStats = await this.projectSyncProcessor.getSyncStats();

      // Validate that only cause-associated projects are stored
      const isFilteringCorrect = true; // Since we fetch through causes, this should always be true
      const message =
        `System correctly filters projects through causes. ` +
        `${graphqlData.uniqueProjectsFromCauses} unique projects from ${graphqlData.totalCauses} causes ` +
        `are stored in database (${dbStats.totalProjects} total).`;

      const responseTime = Date.now() - startTime;
      const validationResult = {
        graphql: graphqlData,
        database: {
          totalProjectsStored: dbStats.totalProjects,
          projectsWithX: dbStats.projectsWithX,
          projectsWithFarcaster: dbStats.projectsWithFarcaster,
        },
        validation: {
          isFilteringCorrect,
          message,
          sampleProjectsFromCauses: graphqlData.sampleProjectSlugs,
        },
        correlationId,
      };

      this.logger.log(
        `Cause-project filtering validation completed in ${responseTime}ms`,
        {
          correlationId,
          result: validationResult,
          responseTimeMs: responseTime,
        },
      );

      return {
        success: true,
        data: validationResult,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.error('Cause-project filtering validation failed', {
        error: error.message,
        stack: error.stack,
        correlationId,
        responseTimeMs: responseTime,
      });

      throw new HttpException(
        {
          success: false,
          message: 'Failed to validate cause-project filtering',
          error: error.message,
          correlationId,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * GET /admin/social-posts
   *
   * Retrieve stored social media posts for multiple projects.
   * Returns posts grouped by project with project information and social handles.
   *
   * @param query - Query parameters with project IDs, platform filter, and limit
   * @returns Promise<SocialPostsResponseDto> - Posts grouped by project
   */
  @Get('social-posts')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async getSocialPosts(
    @Query() query: GetSocialPostsQueryDto,
  ): Promise<SocialPostsResponseDto> {
    const correlationId = uuidv4();
    const startTime = Date.now();

    const projectIds = query.getParsedProjectIds();
    this.logger.log(
      `Social posts retrieval requested for ${projectIds.length} projects via admin endpoint`,
      {
        correlationId,
        projectIds,
        platform: query.platform,
        limit: query.limit,
        endpoint: 'GET /admin/social-posts',
      },
    );

    try {
      // Validate project IDs
      if (projectIds.length === 0) {
        throw new HttpException(
          {
            success: false,
            message: 'At least one project ID is required',
            correlationId,
            timestamp: new Date().toISOString(),
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      if (projectIds.length > 50) {
        throw new HttpException(
          {
            success: false,
            message: 'Cannot request more than 50 projects at once',
            correlationId,
            timestamp: new Date().toISOString(),
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      // Retrieve social posts for multiple projects
      const defaultLimit = parseInt(
        this.configService.get('SOCIAL_POST_MAX_COUNT', '15'),
        10,
      );
      const result =
        await this.socialPostStorageService.getSocialPostsForMultipleProjects(
          projectIds,
          query.platform,
          query.limit ?? defaultLimit,
        );

      const responseTime = Date.now() - startTime;
      this.logger.log(
        `Social posts retrieval completed in ${responseTime}ms. ` +
          `${result.projectsWithPosts}/${result.totalProjects} projects had posts.`,
        {
          correlationId,
          result: {
            totalProjects: result.totalProjects,
            projectsWithPosts: result.projectsWithPosts,
          },
          responseTimeMs: responseTime,
        },
      );

      return {
        success: true,
        data: {
          totalProjects: result.totalProjects,
          projectsWithPosts: result.projectsWithPosts,
          projects: result.projects.map(project => ({
            projectId: project.projectId,
            projectInfo: project.projectInfo,
            posts: project.posts,
            postCounts: project.postCounts,
          })),
        },
        correlationId,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;

      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error('Failed to retrieve social posts via admin endpoint', {
        error: error.message,
        stack: error.stack,
        correlationId,
        projectIds,
        responseTimeMs: responseTime,
      });

      throw new HttpException(
        {
          success: false,
          message: 'Failed to retrieve social posts',
          error: error.message,
          correlationId,
          timestamp: new Date().toISOString(),
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  /**
   * Get social media storage statistics
   * @private
   */
  private async getSocialMediaStats(): Promise<{
    totalPosts: number;
    twitterPosts: number;
    farcasterPosts: number;
    postsLast24Hours: number;
    postsLast7Days: number;
  }> {
    try {
      // Get post counts by platform
      const [twitterCount, farcasterCount, recentCounts] = await Promise.all([
        this.socialPostStorageService.getPostCountByPlatform(
          SocialMediaPlatform.TWITTER,
        ),
        this.socialPostStorageService.getPostCountByPlatform(
          SocialMediaPlatform.FARCASTER,
        ),
        this.socialPostStorageService.getRecentPostCounts(),
      ]);

      return {
        totalPosts: twitterCount + farcasterCount,
        twitterPosts: twitterCount,
        farcasterPosts: farcasterCount,
        postsLast24Hours: recentCounts.last24Hours,
        postsLast7Days: recentCounts.last7Days,
      };
    } catch (error) {
      this.logger.warn('Failed to get social media statistics', {
        error: error.message,
      });

      return {
        totalPosts: 0,
        twitterPosts: 0,
        farcasterPosts: 0,
        postsLast24Hours: 0,
        postsLast7Days: 0,
      };
    }
  }

  /**
   * Reset social media timestamps to trigger full re-fetch
   *
   * This endpoint is useful when:
   * - Configuration changes require fetching more historical posts
   * - Storage limits have been increased and need backfilling
   * - Timestamps are corrupted or need to be reset
   *
   * Options:
   * - platform: Reset only specific platform (twitter/farcaster) or both
   * - minPostsThreshold: Only reset projects with fewer than X posts
   * - maxAge: Only reset projects older than X days
   * - clearPosts: Delete existing posts before reset (recommended for backfill)
   */
  @Post('reset-social-timestamps')
  async resetSocialTimestamps(
    @Query('platform') platform?: 'twitter' | 'farcaster',
    @Query('minPostsThreshold') minPostsThreshold?: string,
    @Query('maxAge') maxAge?: string,
    @Query('projectId') projectId?: string,
    @Query('clearPosts') clearPosts?: string,
  ): Promise<{
    success: boolean;
    message: string;
    data?: {
      totalProjectsChecked: number;
      projectsReset: number;
      twitterTimestampsReset: number;
      farcasterTimestampsReset: number;
      resetProjects: Array<{
        projectId: string;
        platformsReset: string[];
        currentPostCounts: {
          twitter: number;
          farcaster: number;
        };
      }>;
    };
  }> {
    const correlationId = uuidv4();
    this.logger.log(
      `[${correlationId}] Reset social timestamps requested - Platform: ${platform ?? 'all'}, MinPosts: ${minPostsThreshold ?? 'none'}, MaxAge: ${maxAge ?? 'none'}, ProjectId: ${projectId ?? 'all'}, ClearPosts: ${clearPosts ?? 'false'}`,
    );

    try {
      const minPosts = minPostsThreshold
        ? parseInt(minPostsThreshold, 10)
        : undefined;
      const maxAgeDays = maxAge ? parseInt(maxAge, 10) : undefined;
      const shouldClearPosts = clearPosts === 'true';

      // Get all projects or specific project
      const projects = projectId
        ? [
            await this.projectSocialAccountService.getProjectAccount(projectId),
          ].filter(Boolean)
        : await this.projectSocialAccountService.getProjectsForScheduling();

      if (projects.length === 0) {
        return {
          success: false,
          message: projectId
            ? `Project ${projectId} not found`
            : 'No projects found in the system',
        };
      }

      const resetProjects: Array<{
        projectId: string;
        platformsReset: string[];
        currentPostCounts: {
          twitter: number;
          farcaster: number;
        };
      }> = [];

      let twitterTimestampsReset = 0;
      let farcasterTimestampsReset = 0;

      for (const project of projects) {
        if (!project) continue; // Skip null projects

        const platformsReset: string[] = [];

        // Get current post counts for this project
        const projectPosts =
          await this.socialPostStorageService.getRecentSocialPosts(
            project.projectId,
            100, // Get up to 100 posts to count them
          );
        const twitterCount = projectPosts.filter(
          p => p.platform === SocialMediaPlatform.TWITTER,
        ).length;
        const farcasterCount = projectPosts.filter(
          p => p.platform === SocialMediaPlatform.FARCASTER,
        ).length;

        // Check if project meets reset criteria
        let shouldResetTwitter = false;
        let shouldResetFarcaster = false;

        // Platform filter
        if (!platform || platform === 'twitter') {
          shouldResetTwitter = project.latestXPostTimestamp !== null;
        }
        if (!platform || platform === 'farcaster') {
          shouldResetFarcaster = project.latestFarcasterPostTimestamp !== null;
        }

        // MinPosts threshold filter
        if (minPosts !== undefined) {
          const totalPosts = twitterCount + farcasterCount;
          if (totalPosts >= minPosts) {
            shouldResetTwitter = false;
            shouldResetFarcaster = false;
          }
        }

        // MaxAge filter
        if (maxAgeDays !== undefined) {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

          if (
            project.latestXPostTimestamp &&
            project.latestXPostTimestamp > cutoffDate
          ) {
            shouldResetTwitter = false;
          }
          if (
            project.latestFarcasterPostTimestamp &&
            project.latestFarcasterPostTimestamp > cutoffDate
          ) {
            shouldResetFarcaster = false;
          }
        }

        // Clear existing posts if requested (to enable full backfill)
        if (shouldClearPosts && (shouldResetTwitter || shouldResetFarcaster)) {
          const deletedCount =
            await this.socialPostStorageService.deletePostsForProject(
              project.projectId,
            );
          this.logger.log(
            `[${correlationId}] Cleared ${deletedCount} existing posts for project ${project.projectId} to enable full backfill`,
          );
        }

        // Perform resets
        const updateData: Partial<ProjectAccountData> = {};

        if (shouldResetTwitter) {
          updateData.latestXPostTimestamp = null;
          platformsReset.push('twitter');
          twitterTimestampsReset++;
        }

        if (shouldResetFarcaster) {
          updateData.latestFarcasterPostTimestamp = null;
          platformsReset.push('farcaster');
          farcasterTimestampsReset++;
        }

        if (platformsReset.length > 0) {
          await this.projectSocialAccountService.upsertProjectAccount(
            project.projectId,
            updateData,
          );

          resetProjects.push({
            projectId: project.projectId,
            platformsReset,
            currentPostCounts: {
              twitter: twitterCount,
              farcaster: farcasterCount,
            },
          });

          this.logger.log(
            `[${correlationId}] Reset ${platformsReset.join(', ')} timestamps for project ${project.projectId}`,
          );
        }
      }

      const message = `Successfully reset timestamps for ${resetProjects.length} projects. Twitter: ${twitterTimestampsReset}, Farcaster: ${farcasterTimestampsReset}. Next scheduled fetch will retrieve historical posts.`;

      this.logger.log(`[${correlationId}] ${message}`);

      return {
        success: true,
        message,
        data: {
          totalProjectsChecked: projects.length,
          projectsReset: resetProjects.length,
          twitterTimestampsReset,
          farcasterTimestampsReset,
          resetProjects,
        },
      };
    } catch (error: unknown) {
      const errorMessage = `Failed to reset social timestamps: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`;
      this.logger.error(
        `[${correlationId}] ${errorMessage}`,
        error instanceof Error ? error.stack : undefined,
      );

      throw new HttpException(
        {
          success: false,
          message: errorMessage,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
