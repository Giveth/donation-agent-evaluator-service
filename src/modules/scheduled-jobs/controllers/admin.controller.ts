import {
  Controller,
  Post,
  Get,
  Param,
  HttpStatus,
  HttpException,
  Logger,
} from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { JobSchedulerService } from '../services/job-scheduler.service';
import { JobProcessorService } from '../services/job-processor.service';
import { ProjectSyncProcessor } from '../processors/project-sync.processor';
import { TwitterFetchProcessor } from '../processors/twitter-fetch.processor';
import { FarcasterFetchProcessor } from '../processors/farcaster-fetch.processor';
import { ProjectSocialAccountService } from '../../social-media-storage/services/project-social-account.service';
import { SocialPostStorageService } from '../../social-media-storage/services/social-post-storage.service';
import {
  JobType,
  JobStatus,
  ScheduledJob,
} from '../../social-media-storage/entities/scheduled-job.entity';
import { SocialMediaPlatform } from '../../social-media/dto/social-post.dto';

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
      if (projectAccount.twitterHandle) {
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
      if (projectAccount.farcasterUsername) {
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
        projectsWithTwitter: number;
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
}
