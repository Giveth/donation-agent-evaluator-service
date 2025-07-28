import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { StoredSocialPost } from '../entities/stored-social-post.entity';
import { ProjectSocialAccount } from '../entities/project-social-account.entity';
import { ScheduledJob } from '../entities/scheduled-job.entity';
import {
  SocialPostDto,
  SocialMediaPlatform,
} from '../../social-media/dto/social-post.dto';

@Injectable()
export class SocialPostStorageService {
  private readonly logger = new Logger(SocialPostStorageService.name);

  constructor(
    @InjectRepository(StoredSocialPost)
    private readonly storedSocialPostRepository: Repository<StoredSocialPost>,
    @InjectRepository(ProjectSocialAccount)
    private readonly projectAccountRepository: Repository<ProjectSocialAccount>,
    @InjectRepository(ScheduledJob)
    private readonly scheduledJobRepository: Repository<ScheduledJob>,
    private readonly dataSource: DataSource,
    private readonly configService: ConfigService,
  ) {}

  async storeSocialPosts(
    projectId: string,
    socialPosts: SocialPostDto[],
  ): Promise<void> {
    if (socialPosts.length === 0) {
      this.logger.debug(`No social posts to store for project ${projectId}`);
      return;
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get or create project social account
      let projectAccount = await queryRunner.manager.findOne(
        ProjectSocialAccount,
        {
          where: { projectId },
        },
      );

      if (!projectAccount) {
        projectAccount = queryRunner.manager.create(ProjectSocialAccount, {
          projectId,
        });
        await queryRunner.manager.save(projectAccount);
      }

      // Filter out duplicates by checking existing post IDs
      const existingPostIds = await queryRunner.manager
        .createQueryBuilder(StoredSocialPost, 'post')
        .select('post.postId')
        .where('post.projectAccountId = :projectAccountId', {
          projectAccountId: projectAccount.id,
        })
        .andWhere('post.postId IN (:...postIds)', {
          postIds: socialPosts.map(p => p.id).filter(Boolean),
        })
        .getMany();

      const existingIds = new Set(existingPostIds.map(p => p.postId));
      const newPosts = socialPosts.filter(
        post => post.id && !existingIds.has(post.id),
      );

      if (newPosts.length === 0) {
        this.logger.debug(
          `No new social posts to store for project ${projectId} (all ${socialPosts.length} posts already exist)`,
        );
        await queryRunner.commitTransaction();
        return;
      }

      // Store new social posts
      const storedPosts = newPosts.map(post =>
        queryRunner.manager.create(StoredSocialPost, {
          postId: post.id ?? `${Date.now()}-${Math.random()}`,
          content: post.text,
          url: post.url,
          postTimestamp: post.createdAt,
          fetchedAt: new Date(),
          projectAccountId: projectAccount.id,
          metadata: {
            platform: post.platform,
          },
        }),
      );

      await queryRunner.manager.save(StoredSocialPost, storedPosts);

      // Update project account's latest post timestamp based on platform
      const latestPost = socialPosts.reduce((latest, current) =>
        current.createdAt > latest.createdAt ? current : latest,
      );

      const { platform } = latestPost;
      if (platform === SocialMediaPlatform.TWITTER) {
        if (
          !projectAccount.latestXPostTimestamp ||
          latestPost.createdAt > projectAccount.latestXPostTimestamp
        ) {
          projectAccount.latestXPostTimestamp = latestPost.createdAt;
          projectAccount.lastXFetch = new Date();
        }
      } else {
        if (
          !projectAccount.latestFarcasterPostTimestamp ||
          latestPost.createdAt > projectAccount.latestFarcasterPostTimestamp
        ) {
          projectAccount.latestFarcasterPostTimestamp = latestPost.createdAt;
          projectAccount.lastFarcasterFetch = new Date();
        }
      }

      await queryRunner.manager.save(projectAccount);
      await queryRunner.commitTransaction();

      this.logger.log(
        `Stored ${storedPosts.length} new social posts for project ${projectId}`,
      );

      // Clean up old posts after successful storage
      await this.cleanupOldSocialPosts(projectId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to store social posts for project ${projectId}:`,
        error,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async getRecentSocialPosts(
    projectId: string,
    limit: number = 10,
    platform?: SocialMediaPlatform,
  ): Promise<SocialPostDto[]> {
    const projectAccount = await this.projectAccountRepository.findOne({
      where: { projectId },
    });

    if (!projectAccount) {
      this.logger.debug(`No project account found for project ${projectId}`);
      return [];
    }

    const maxAgeDays = parseInt(
      this.configService.get('SOCIAL_POST_MAX_AGE_DAYS', '90'),
      10,
    );
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

    const queryBuilder = this.storedSocialPostRepository
      .createQueryBuilder('post')
      .where('post.projectAccountId = :projectAccountId', {
        projectAccountId: projectAccount.id,
      })
      .andWhere('post.postTimestamp >= :cutoffDate', { cutoffDate });

    // Filter by platform if specified
    if (platform) {
      queryBuilder.andWhere("post.metadata->>'platform' = :platform", {
        platform,
      });
    }

    const posts = await queryBuilder
      .orderBy('post.postTimestamp', 'DESC')
      .limit(limit)
      .getMany();

    return posts.map(post => ({
      id: post.postId,
      text: post.content,
      createdAt: post.postTimestamp,
      platform: post.metadata?.platform as SocialMediaPlatform,
      url: post.url,
    }));
  }

  private async cleanupOldSocialPosts(projectId: string): Promise<void> {
    try {
      const projectAccount = await this.projectAccountRepository.findOne({
        where: { projectId },
      });

      if (!projectAccount) {
        return;
      }

      const maxCount = parseInt(
        this.configService.get('SOCIAL_POST_MAX_COUNT', '15'),
        10,
      );
      const maxAgeDays = parseInt(
        this.configService.get('SOCIAL_POST_MAX_AGE_DAYS', '90'),
        10,
      );

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

      // Delete posts older than the cutoff date
      await this.storedSocialPostRepository
        .createQueryBuilder()
        .delete()
        .where('projectAccountId = :projectAccountId', {
          projectAccountId: projectAccount.id,
        })
        .andWhere('postTimestamp < :cutoffDate', { cutoffDate })
        .execute();

      // Keep only the most recent posts within the age limit
      const recentPosts = await this.storedSocialPostRepository
        .createQueryBuilder('post')
        .where('post.projectAccountId = :projectAccountId', {
          projectAccountId: projectAccount.id,
        })
        .andWhere('post.postTimestamp >= :cutoffDate', { cutoffDate })
        .orderBy('post.postTimestamp', 'DESC')
        .getMany();

      if (recentPosts.length > maxCount) {
        const postsToDelete = recentPosts.slice(maxCount);
        const idsToDelete = postsToDelete.map(p => p.id);

        await this.storedSocialPostRepository
          .createQueryBuilder()
          .delete()
          .whereInIds(idsToDelete)
          .execute();

        this.logger.debug(
          `Cleaned up ${postsToDelete.length} excess social posts for project ${projectId}`,
        );
      }

      // FIX: Reset platform timestamps if no posts remain for that platform
      await this.resetTimestampsForEmptyPlatforms(projectAccount);
    } catch (error) {
      this.logger.error(
        `Failed to cleanup social posts for project ${projectId}:`,
        error,
      );
    }
  }

  /**
   * Reset latest post timestamps for platforms that have no remaining posts.
   * This prevents data inconsistency where timestamps exist but no posts are stored.
   * Uses database-level locking to prevent race conditions with concurrent fetch operations.
   */
  private async resetTimestampsForEmptyPlatforms(
    projectAccount: ProjectSocialAccount,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Lock the project account row to prevent race conditions with fetch operations
      const lockedAccount = await queryRunner.manager
        .createQueryBuilder(ProjectSocialAccount, 'account')
        .setLock('pessimistic_write')
        .where('account.id = :id', { id: projectAccount.id })
        .getOne();

      if (!lockedAccount) {
        this.logger.warn(
          `Project account ${projectAccount.id} not found during timestamp reset`,
        );
        await queryRunner.rollbackTransaction();
        return;
      }

      let needsUpdate = false;

      // Check if Twitter posts exist (include corrupted metadata check)
      const twitterCount = await queryRunner.manager
        .createQueryBuilder(StoredSocialPost, 'post')
        .where('post.projectAccountId = :projectAccountId', {
          projectAccountId: lockedAccount.id,
        })
        .andWhere(
          "(post.metadata->>'platform' = :platform OR (post.metadata->>'platform' IS NULL AND post.url LIKE '%twitter.com%') OR (post.metadata->>'platform' IS NULL AND post.url LIKE '%x.com%'))",
          { platform: SocialMediaPlatform.TWITTER },
        )
        .getCount();

      // Reset Twitter timestamp if no posts exist but timestamp is set
      if (twitterCount === 0 && lockedAccount.latestXPostTimestamp) {
        this.logger.debug(
          `Resetting Twitter timestamp for project ${lockedAccount.projectId} - no posts remaining (locked)`,
        );
        lockedAccount.latestXPostTimestamp = null;
        needsUpdate = true;
      }

      // Check if Farcaster posts exist (include corrupted metadata check)
      const farcasterCount = await queryRunner.manager
        .createQueryBuilder(StoredSocialPost, 'post')
        .where('post.projectAccountId = :projectAccountId', {
          projectAccountId: lockedAccount.id,
        })
        .andWhere(
          "(post.metadata->>'platform' = :platform OR (post.metadata->>'platform' IS NULL AND post.url LIKE '%farcaster.xyz%') OR (post.metadata->>'platform' IS NULL AND post.url LIKE '%warpcast.com%'))",
          { platform: SocialMediaPlatform.FARCASTER },
        )
        .getCount();

      // Reset Farcaster timestamp if no posts exist but timestamp is set
      if (farcasterCount === 0 && lockedAccount.latestFarcasterPostTimestamp) {
        this.logger.log(
          `Resetting Farcaster timestamp for project ${lockedAccount.projectId} - no posts remaining (locked)`,
        );
        lockedAccount.latestFarcasterPostTimestamp = null;
        needsUpdate = true;
      }

      // Save changes if any updates were made
      if (needsUpdate) {
        await queryRunner.manager.save(ProjectSocialAccount, lockedAccount);
        this.logger.debug(
          `Reset timestamps for project ${lockedAccount.projectId} after cleanup (transactional)`,
        );
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to reset timestamps for project ${projectAccount.projectId} (transactional):`,
        error,
      );

      // Don't re-throw to avoid breaking the cleanup process
      // Log the error but continue with other cleanup operations
    } finally {
      await queryRunner.release();
    }
  }

  async getProjectLastFetchTimestamp(
    projectId: string,
    platform: SocialMediaPlatform,
  ): Promise<Date | null> {
    const projectAccount = await this.projectAccountRepository.findOne({
      where: { projectId },
      select: ['latestXPostTimestamp', 'latestFarcasterPostTimestamp'],
    });

    if (!projectAccount) {
      return null;
    }

    return platform === SocialMediaPlatform.TWITTER
      ? (projectAccount.latestXPostTimestamp ?? null)
      : (projectAccount.latestFarcasterPostTimestamp ?? null);
  }

  /**
   * Enhanced storage method that checks for duplicates by both ID and timestamp.
   * This method stops processing if it encounters a post with a timestamp that already exists.
   *
   * @param projectId - The project ID to store posts for
   * @param socialPosts - Array of social posts to store
   * @returns Promise<{ stored: number; duplicatesFound: boolean; stoppedAtTimestamp?: Date }>
   */
  async storeSocialPostsIncremental(
    projectId: string,
    socialPosts: SocialPostDto[],
  ): Promise<{
    stored: number;
    duplicatesFound: boolean;
    stoppedAtTimestamp?: Date;
  }> {
    if (socialPosts.length === 0) {
      this.logger.debug(`No social posts to store for project ${projectId}`);
      return { stored: 0, duplicatesFound: false };
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Get or create project social account
      let projectAccount = await queryRunner.manager.findOne(
        ProjectSocialAccount,
        {
          where: { projectId },
        },
      );

      if (!projectAccount) {
        projectAccount = queryRunner.manager.create(ProjectSocialAccount, {
          projectId,
        });
        await queryRunner.manager.save(projectAccount);
      }

      // Sort posts by timestamp (newest first) to process them in chronological order
      const sortedPosts = [...socialPosts].sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );

      const postsToStore: SocialPostDto[] = [];
      let duplicatesFound = false;
      let stoppedAtTimestamp: Date | undefined;

      // Check each post for duplicates by timestamp
      for (const post of sortedPosts) {
        if (isNaN(post.createdAt.getTime())) {
          this.logger.debug(`Skipping post ${post.id} - invalid timestamp`);
          continue;
        }

        // Check if a post with this timestamp already exists for this project and platform
        const existingPost = await queryRunner.manager.findOne(
          StoredSocialPost,
          {
            where: {
              projectAccountId: projectAccount.id,
              postTimestamp: post.createdAt,
              metadata: { platform: post.platform },
            },
          },
        );

        if (existingPost) {
          this.logger.log(
            `Found duplicate timestamp for project ${projectId} at ${post.createdAt.toISOString()} - stopping incremental storage`,
          );
          duplicatesFound = true;
          stoppedAtTimestamp = post.createdAt;
          break;
        }

        // Also check by post ID for additional safety
        if (post.id) {
          const existingById = await queryRunner.manager.findOne(
            StoredSocialPost,
            {
              where: {
                projectAccountId: projectAccount.id,
                postId: post.id,
              },
            },
          );

          if (existingById) {
            this.logger.debug(`Post ${post.id} already exists by ID, skipping`);
            continue;
          }
        }

        postsToStore.push(post);
      }

      if (postsToStore.length === 0) {
        this.logger.debug(
          `No new social posts to store for project ${projectId}`,
        );
        await queryRunner.commitTransaction();
        return { stored: 0, duplicatesFound, stoppedAtTimestamp };
      }

      // Store new social posts
      const storedPosts = postsToStore.map(post =>
        queryRunner.manager.create(StoredSocialPost, {
          postId: post.id ?? `${Date.now()}-${Math.random()}`,
          content: post.text,
          url: post.url,
          postTimestamp: post.createdAt,
          fetchedAt: new Date(),
          projectAccountId: projectAccount.id,
          metadata: {
            platform: post.platform,
          },
        }),
      );

      await queryRunner.manager.save(StoredSocialPost, storedPosts);

      // Update project account's latest post timestamp based on platform
      const latestPost = postsToStore.reduce((latest, current) =>
        current.createdAt > latest.createdAt ? current : latest,
      );

      const { platform } = latestPost;
      if (platform === SocialMediaPlatform.TWITTER) {
        if (
          !projectAccount.latestXPostTimestamp ||
          latestPost.createdAt > projectAccount.latestXPostTimestamp
        ) {
          projectAccount.latestXPostTimestamp = latestPost.createdAt;
          projectAccount.lastXFetch = new Date();
        }
      } else {
        if (
          !projectAccount.latestFarcasterPostTimestamp ||
          latestPost.createdAt > projectAccount.latestFarcasterPostTimestamp
        ) {
          projectAccount.latestFarcasterPostTimestamp = latestPost.createdAt;
          projectAccount.lastFarcasterFetch = new Date();
        }
      }

      await queryRunner.manager.save(projectAccount);
      await queryRunner.commitTransaction();

      this.logger.log(
        `Stored ${storedPosts.length} new social posts for project ${projectId}${
          duplicatesFound
            ? ` (stopped at duplicate timestamp: ${stoppedAtTimestamp?.toISOString()})`
            : ''
        }`,
      );

      // Clean up old posts after successful storage
      await this.cleanupOldSocialPosts(projectId);

      return {
        stored: storedPosts.length,
        duplicatesFound,
        stoppedAtTimestamp,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Failed to store social posts for project ${projectId}:`,
        error,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get the latest post timestamp for a project and platform to use for incremental fetching
   *
   * @param projectId - The project ID
   * @param platform - The social media platform
   * @returns Promise<Date | null> - The latest post timestamp or null if no posts exist
   */
  async getLatestPostTimestamp(
    projectId: string,
    platform: SocialMediaPlatform,
  ): Promise<Date | null> {
    const projectAccount = await this.projectAccountRepository.findOne({
      where: { projectId },
    });

    if (!projectAccount) {
      return null;
    }

    // Get the latest post timestamp from the database
    const latestPost = await this.storedSocialPostRepository
      .createQueryBuilder('post')
      .where('post.projectAccountId = :projectAccountId', {
        projectAccountId: projectAccount.id,
      })
      .andWhere("post.metadata->>'platform' = :platform", { platform })
      .orderBy('post.postTimestamp', 'DESC')
      .limit(1)
      .getOne();

    return latestPost?.postTimestamp ?? null;
  }

  /**
   * Get accounts data for incremental batch processing
   *
   * @param platform - The platform to get accounts for
   * @returns Promise<Array<{ projectId: string; handle: string; sinceTimestamp?: Date }>>
   */
  async getAccountsForIncrementalFetch(
    platform: SocialMediaPlatform,
  ): Promise<
    Array<{ projectId: string; handle: string; sinceTimestamp?: Date }>
  > {
    try {
      const accounts = await this.projectAccountRepository
        .createQueryBuilder('account')
        .where(
          platform === SocialMediaPlatform.TWITTER
            ? "account.xUrl IS NOT NULL AND account.xUrl != ''"
            : "account.farcasterUrl IS NOT NULL AND account.farcasterUrl != ''",
        )
        .getMany();

      const result: Array<{
        projectId: string;
        handle: string;
        sinceTimestamp?: Date;
      }> = [];

      for (const account of accounts) {
        const handle =
          platform === SocialMediaPlatform.TWITTER
            ? account.xUrl
            : account.farcasterUrl;

        if (!handle) continue;

        // Get the latest post timestamp for this account
        const sinceTimestamp = await this.getLatestPostTimestamp(
          account.projectId,
          platform,
        );

        result.push({
          projectId: account.projectId,
          handle,
          sinceTimestamp: sinceTimestamp ?? undefined,
        });
      }

      return result;
    } catch (error) {
      this.logger.error(`Failed to get accounts for incremental fetch:`, error);
      throw error;
    }
  }

  /**
   * Get post count by platform for statistics
   *
   * @param platform - The social media platform
   * @returns Promise<number> - Count of posts for the platform
   */
  async getPostCountByPlatform(platform: SocialMediaPlatform): Promise<number> {
    try {
      return await this.storedSocialPostRepository
        .createQueryBuilder('post')
        .where("post.metadata->>'platform' = :platform", { platform })
        .getCount();
    } catch (error) {
      this.logger.error(
        `Failed to get post count for platform ${platform}:`,
        error,
      );
      return 0;
    }
  }

  /**
   * Get recent post counts for statistics
   *
   * @returns Promise<object> - Counts of posts in different time periods
   */
  async getRecentPostCounts(): Promise<{
    last24Hours: number;
    last7Days: number;
  }> {
    try {
      const now = new Date();
      const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [count24h, count7d] = await Promise.all([
        this.storedSocialPostRepository
          .createQueryBuilder('post')
          .where('post.fetchedAt >= :since', { since: last24Hours })
          .getCount(),
        this.storedSocialPostRepository
          .createQueryBuilder('post')
          .where('post.fetchedAt >= :since', { since: last7Days })
          .getCount(),
      ]);

      return {
        last24Hours: count24h,
        last7Days: count7d,
      };
    } catch (error) {
      this.logger.error('Failed to get recent post counts:', error);
      return {
        last24Hours: 0,
        last7Days: 0,
      };
    }
  }

  /**
   * Get social posts for multiple projects with project information
   *
   * @param projectIds - Array of project IDs to retrieve posts for
   * @param platform - Optional platform filter
   * @param limit - Maximum posts per project per platform
   * @returns Promise<object> - Projects with their social posts grouped by platform
   */
  async getSocialPostsForMultipleProjects(
    projectIds: string[],
    platform?: SocialMediaPlatform,
    limit: number = 10,
  ): Promise<{
    totalProjects: number;
    projectsWithPosts: number;
    projects: Array<{
      projectId: string;
      projectInfo: {
        title: string;
        slug: string;
        xUrl?: string;
        farcasterUrl?: string;
      };
      posts: {
        twitter: SocialPostDto[];
        farcaster: SocialPostDto[];
      };
      postCounts: {
        twitter: number;
        farcaster: number;
      };
    }>;
  }> {
    try {
      if (projectIds.length === 0) {
        return {
          totalProjects: 0,
          projectsWithPosts: 0,
          projects: [],
        };
      }

      // Get project accounts for the requested project IDs
      const projectAccounts = await this.projectAccountRepository
        .createQueryBuilder('account')
        .where('account.projectId IN (:...projectIds)', { projectIds })
        .getMany();

      const foundProjectIds = new Set(
        projectAccounts.map(account => account.projectId),
      );
      const missingProjectIds = projectIds.filter(
        id => !foundProjectIds.has(id),
      );

      if (missingProjectIds.length > 0) {
        this.logger.debug(
          `Projects not found in database: ${missingProjectIds.join(', ')}`,
        );
      }

      const maxAgeDays = parseInt(
        this.configService.get('SOCIAL_POST_MAX_AGE_DAYS', '90'),
        10,
      );
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);

      const projects: Array<{
        projectId: string;
        projectInfo: {
          title: string;
          slug: string;
          xUrl?: string;
          farcasterUrl?: string;
        };
        posts: {
          twitter: SocialPostDto[];
          farcaster: SocialPostDto[];
        };
        postCounts: {
          twitter: number;
          farcaster: number;
        };
      }> = [];
      let projectsWithPosts = 0;

      for (const account of projectAccounts) {
        const projectResult = {
          projectId: account.projectId,
          projectInfo: {
            title: account.title,
            slug: account.slug,
            xUrl: account.xUrl,
            farcasterUrl: account.farcasterUrl,
          },
          posts: {
            twitter: [] as SocialPostDto[],
            farcaster: [] as SocialPostDto[],
          },
          postCounts: {
            twitter: 0,
            farcaster: 0,
          },
        };

        // Determine which platforms to fetch
        const platformsToFetch = platform
          ? [platform]
          : [SocialMediaPlatform.TWITTER, SocialMediaPlatform.FARCASTER];

        for (const platformToFetch of platformsToFetch) {
          const queryBuilder = this.storedSocialPostRepository
            .createQueryBuilder('post')
            .where('post.projectAccountId = :projectAccountId', {
              projectAccountId: account.id,
            })
            .andWhere('post.postTimestamp >= :cutoffDate', { cutoffDate })
            .andWhere("post.metadata->>'platform' = :platform", {
              platform: platformToFetch,
            })
            .orderBy('post.postTimestamp', 'DESC')
            .limit(limit);

          const posts = await queryBuilder.getMany();

          const socialPosts = posts.map(post => ({
            id: post.postId,
            text: post.content,
            createdAt: post.postTimestamp,
            platform: post.metadata?.platform as SocialMediaPlatform,
            url: post.url,
          }));

          if (platformToFetch === SocialMediaPlatform.TWITTER) {
            projectResult.posts.twitter = socialPosts;
            projectResult.postCounts.twitter = socialPosts.length;
          } else {
            projectResult.posts.farcaster = socialPosts;
            projectResult.postCounts.farcaster = socialPosts.length;
          }
        }

        // Check if project has any posts
        const hasPosts =
          projectResult.postCounts.twitter > 0 ||
          projectResult.postCounts.farcaster > 0;
        if (hasPosts) {
          projectsWithPosts++;
        }

        projects.push(projectResult);
      }

      this.logger.log(
        `Retrieved social posts for ${projects.length} projects (${projectsWithPosts} with posts)`,
      );

      return {
        totalProjects: projects.length,
        projectsWithPosts,
        projects,
      };
    } catch (error) {
      this.logger.error(
        'Failed to get social posts for multiple projects:',
        error,
      );
      throw error;
    }
  }

  /**
   * Detect and fix projects with data inconsistency (timestamps without posts).
   * This addresses the corruption where latestFarcasterPostTimestamp or latestXPostTimestamp
   * exists but no corresponding posts are stored in the database.
   *
   * Uses batch processing to handle large datasets efficiently and distributed locking
   * to prevent concurrent executions.
   *
   * @param batchSize - Number of projects to process per batch (default: 100)
   * @param maxRetries - Maximum retry attempts for failed batches (default: 3)
   * @returns Promise<{ fixed: Array<{ projectId: string; platform: string; timestamp: Date }> }>
   */
  async detectAndFixCorruptedProjects(
    batchSize: number = 100,
    maxRetries: number = 3,
  ): Promise<{
    fixed: Array<{ projectId: string; platform: string; timestamp: Date }>;
    stats: {
      totalProjects: number;
      batchesProcessed: number;
      errors: number;
    };
  }> {
    const lockKey = 'corruption_detection_lock';
    const lockTimeout = 30 * 60 * 1000; // 30 minutes

    // Simple distributed lock using database
    const lockResult = await this.acquireDistributedLock(lockKey, lockTimeout);
    if (!lockResult.acquired) {
      throw new Error(
        `Corruption detection already running. Started at: ${lockResult.existingLockTime?.toISOString() ?? 'unknown'}`,
      );
    }

    this.logger.log(
      'Starting detection of corrupted social media timestamps (batched)...',
    );
    const fixed: Array<{
      projectId: string;
      platform: string;
      timestamp: Date;
    }> = [];
    let batchesProcessed = 0;
    let totalErrors = 0;

    try {
      // Count total projects first for progress tracking
      const totalProjects = await this.projectAccountRepository
        .createQueryBuilder('account')
        .where(
          'account.latestXPostTimestamp IS NOT NULL OR account.latestFarcasterPostTimestamp IS NOT NULL',
        )
        .getCount();

      this.logger.log(
        `Found ${totalProjects} projects with social media timestamps. Processing in batches of ${batchSize}`,
      );

      let offset = 0;
      const totalBatches = Math.ceil(totalProjects / batchSize);

      // Process in batches to avoid memory issues
      while (offset < totalProjects) {
        const currentBatch = Math.floor(offset / batchSize) + 1;
        this.logger.log(
          `Processing batch ${currentBatch}/${totalBatches} (projects ${offset + 1} to ${Math.min(offset + batchSize, totalProjects)})`,
        );

        let retryCount = 0;
        let batchSuccess = false;

        while (retryCount <= maxRetries && !batchSuccess) {
          try {
            const batchProjects = await this.projectAccountRepository
              .createQueryBuilder('account')
              .where(
                'account.latestXPostTimestamp IS NOT NULL OR account.latestFarcasterPostTimestamp IS NOT NULL',
              )
              .orderBy('account.id', 'ASC') // Consistent ordering for batching
              .skip(offset)
              .take(batchSize)
              .getMany();

            const batchFixed =
              await this.processBatchForCorruption(batchProjects);
            fixed.push(...batchFixed);
            batchSuccess = true;
            batchesProcessed++;

            this.logger.log(
              `Batch ${currentBatch} completed. Fixed ${batchFixed.length} corrupted timestamp(s)`,
            );
          } catch (error) {
            retryCount++;
            totalErrors++;

            if (retryCount > maxRetries) {
              this.logger.error(
                `Batch ${currentBatch} failed after ${maxRetries} retries:`,
                error,
              );
              // Continue with next batch instead of failing entire operation
            } else {
              this.logger.warn(
                `Batch ${currentBatch} failed (attempt ${retryCount}/${maxRetries}), retrying...`,
                error,
              );
              // Exponential backoff delay
              await new Promise(resolve =>
                setTimeout(resolve, Math.pow(2, retryCount) * 1000),
              );
            }
          }
        }

        offset += batchSize;
      }

      const uniqueProjectsFixed = new Set(fixed.map(f => f.projectId)).size;
      this.logger.log(
        `Corruption detection complete. Fixed ${fixed.length} corrupted timestamp(s) across ${uniqueProjectsFixed} project(s). Processed ${batchesProcessed}/${totalBatches} batches successfully.`,
      );

      return {
        fixed,
        stats: {
          totalProjects,
          batchesProcessed,
          errors: totalErrors,
        },
      };
    } catch (error) {
      this.logger.error('Failed to detect and fix corrupted projects:', error);
      throw error;
    } finally {
      // Always release the distributed lock
      await this.releaseDistributedLock(lockKey);
    }
  }

  /**
   * Process a batch of projects for corruption detection and fixing.
   * Uses transactions to ensure data consistency within each batch.
   */
  private async processBatchForCorruption(
    projects: ProjectSocialAccount[],
  ): Promise<Array<{ projectId: string; platform: string; timestamp: Date }>> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    const fixed: Array<{
      projectId: string;
      platform: string;
      timestamp: Date;
    }> = [];

    try {
      for (const project of projects) {
        let needsUpdate = false;

        // Check Twitter corruption (include corrupted metadata)
        if (project.latestXPostTimestamp) {
          const twitterPostCount = await queryRunner.manager
            .createQueryBuilder(StoredSocialPost, 'post')
            .where('post.projectAccountId = :projectAccountId', {
              projectAccountId: project.id,
            })
            .andWhere(
              "(post.metadata->>'platform' = :platform OR (post.metadata->>'platform' IS NULL AND post.url LIKE '%twitter.com%') OR (post.metadata->>'platform' IS NULL AND post.url LIKE '%x.com%'))",
              { platform: SocialMediaPlatform.TWITTER },
            )
            .getCount();

          if (twitterPostCount === 0) {
            this.logger.warn(
              `CORRUPTION DETECTED: Project ${project.projectId} has Twitter timestamp ${project.latestXPostTimestamp.toISOString()} but no Twitter posts`,
            );
            fixed.push({
              projectId: project.projectId,
              platform: SocialMediaPlatform.TWITTER,
              timestamp: project.latestXPostTimestamp,
            });
            project.latestXPostTimestamp = null;
            needsUpdate = true;
          }
        }

        // Check Farcaster corruption (include corrupted metadata)
        if (project.latestFarcasterPostTimestamp) {
          const farcasterPostCount = await queryRunner.manager
            .createQueryBuilder(StoredSocialPost, 'post')
            .where('post.projectAccountId = :projectAccountId', {
              projectAccountId: project.id,
            })
            .andWhere(
              "(post.metadata->>'platform' = :platform OR (post.metadata->>'platform' IS NULL AND post.url LIKE '%farcaster.xyz%') OR (post.metadata->>'platform' IS NULL AND post.url LIKE '%warpcast.com%'))",
              { platform: SocialMediaPlatform.FARCASTER },
            )
            .getCount();

          if (farcasterPostCount === 0) {
            this.logger.warn(
              `CORRUPTION DETECTED: Project ${project.projectId} has Farcaster timestamp ${project.latestFarcasterPostTimestamp.toISOString()} but no Farcaster posts`,
            );
            fixed.push({
              projectId: project.projectId,
              platform: SocialMediaPlatform.FARCASTER,
              timestamp: project.latestFarcasterPostTimestamp,
            });
            project.latestFarcasterPostTimestamp = null;
            needsUpdate = true;
          }
        }

        // Save fixes within transaction
        if (needsUpdate) {
          await queryRunner.manager.save(ProjectSocialAccount, project);
          this.logger.debug(
            `Fixed corruption for project ${project.projectId} (batch)`,
          );
        }
      }

      await queryRunner.commitTransaction();
      return fixed;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error('Failed to process batch for corruption:', error);
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Simple distributed lock implementation using TypeORM and ScheduledJob entity
   */
  private async acquireDistributedLock(
    lockKey: string,
    timeoutMs: number,
  ): Promise<{ acquired: boolean; existingLockTime?: Date }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + timeoutMs);
      const lockJobType = `LOCK_${lockKey}` as any; // Cast to bypass enum restriction

      // Try to insert lock record using QueryBuilder with conflict handling
      const insertResult = await queryRunner.manager
        .createQueryBuilder()
        .insert()
        .into('scheduled_jobs')
        .values({
          projectId: 'SYSTEM_LOCK',
          jobType: lockJobType,
          scheduledFor: now,
          status: 'PROCESSING' as any, // Processing indicates lock is active
          metadata: { lockKey, expiresAt },
          createdAt: now,
          updatedAt: now,
        })
        .orIgnore() // PostgreSQL: ON CONFLICT DO NOTHING
        .execute();

      // Check if insert was successful (affected rows > 0)
      if (insertResult.identifiers.length > 0) {
        return { acquired: true };
      }

      // Lock exists, check if expired
      const existingLock = await queryRunner.manager
        .createQueryBuilder()
        .select(['job.createdAt', 'job.metadata'])
        .from('scheduled_jobs', 'job')
        .where('job.jobType = :jobType', { jobType: lockJobType })
        .getRawOne();

      if (existingLock) {
        const lockTime = new Date(existingLock.job_created_at);
        const metadata = existingLock.job_metadata as { expiresAt?: string };

        if (metadata.expiresAt && new Date(metadata.expiresAt) < now) {
          // Lock expired, try to acquire it
          const updateResult = await queryRunner.manager
            .createQueryBuilder()
            .update('scheduled_jobs')
            .set({
              metadata: { lockKey, expiresAt },
              updatedAt: now,
            })
            .where('jobType = :jobType', { jobType: lockJobType })
            .andWhere("metadata->>'expiresAt' < :now", {
              now: now.toISOString(),
            })
            .execute();

          if (updateResult.affected && updateResult.affected > 0) {
            return { acquired: true };
          }
        }

        return { acquired: false, existingLockTime: lockTime };
      }

      return { acquired: false };
    } catch (error) {
      this.logger.error('Failed to acquire distributed lock:', error);
      return { acquired: false };
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Release distributed lock using TypeORM
   */
  private async releaseDistributedLock(lockKey: string): Promise<void> {
    try {
      const lockJobType = `LOCK_${lockKey}` as any; // Cast to bypass enum restriction
      await this.dataSource.manager
        .createQueryBuilder()
        .delete()
        .from('scheduled_jobs')
        .where('jobType = :jobType', { jobType: lockJobType })
        .execute();
    } catch (error) {
      this.logger.error('Failed to release distributed lock:', error);
    }
  }
}
