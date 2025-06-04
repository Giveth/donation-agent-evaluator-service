import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { StoredSocialPost } from '../entities/stored-social-post.entity';
import { ProjectSocialAccount } from '../entities/project-social-account.entity';
import { SocialPostDto } from '../../social-media/dto/social-post.dto';

@Injectable()
export class SocialPostStorageService {
  private readonly logger = new Logger(SocialPostStorageService.name);

  constructor(
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
      if (platform === 'twitter') {
        if (
          !projectAccount.latestTwitterPostTimestamp ||
          latestPost.createdAt > projectAccount.latestTwitterPostTimestamp
        ) {
          projectAccount.latestTwitterPostTimestamp = latestPost.createdAt;
          projectAccount.lastTwitterFetch = new Date();
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
    platform?: 'twitter' | 'farcaster',
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
      platform: post.metadata?.platform as 'twitter' | 'farcaster',
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
    platform: 'twitter' | 'farcaster',
  ): Promise<Date | null> {
    const projectAccount = await this.projectAccountRepository.findOne({
      where: { projectId },
      select: ['latestTwitterPostTimestamp', 'latestFarcasterPostTimestamp'],
    });

    if (!projectAccount) {
      return null;
    }

    return platform === 'twitter'
      ? (projectAccount.latestTwitterPostTimestamp ?? null)
      : (projectAccount.latestFarcasterPostTimestamp ?? null);
  }
}
