import { Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { StoredSocialPost } from '../entities/stored-social-post.entity';
import { ProjectSocialAccount } from '../entities/project-social-account.entity';
import {
  SocialPostDto,
  SocialMediaPlatform,
} from '../../social-media/dto/social-post.dto';

@Injectable()
export class SocialPostStorageService {
  constructor(
    private readonly logger: Logger,
    @InjectRepository(StoredSocialPost)
    private readonly storedSocialPostRepository: Repository<StoredSocialPost>,
    @InjectRepository(ProjectSocialAccount)
    private readonly projectAccountRepository: Repository<ProjectSocialAccount>,
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
    } catch (error) {
      this.logger.error(
        `Failed to cleanup social posts for project ${projectId}:`,
        error,
      );
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
}
