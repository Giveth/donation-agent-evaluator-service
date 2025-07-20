import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryRunner } from 'typeorm';
import { ProjectSocialAccount } from '../entities/project-social-account.entity';
import { SocialMediaPlatform } from '../../social-media/dto/social-post.dto';

export interface ProjectAccountData {
  // Basic project information
  title?: string;
  slug?: string;
  description?: string;
  projectStatus?: string;

  // Project metrics
  qualityScore?: number;
  givPowerRank?: number;
  totalDonations?: number;

  // Project update information
  lastUpdateDate?: Date;
  lastUpdateContent?: string;
  lastUpdateTitle?: string;

  // Social media URLs
  xUrl?: string;
  farcasterUrl?: string;
  lastXFetch?: Date;
  lastFarcasterFetch?: Date;
  latestXPostTimestamp?: Date;
  latestFarcasterPostTimestamp?: Date;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class ProjectSocialAccountService {
  private readonly logger = new Logger(ProjectSocialAccountService.name);

  constructor(
    @InjectRepository(ProjectSocialAccount)
    private readonly projectAccountRepository: Repository<ProjectSocialAccount>,
  ) {}

  async upsertProjectAccount(
    projectId: string,
    data: ProjectAccountData,
  ): Promise<ProjectSocialAccount> {
    try {
      let projectAccount = await this.projectAccountRepository.findOne({
        where: { projectId },
      });

      if (projectAccount) {
        this.updateProjectAccountFields(projectAccount, data);
        await this.projectAccountRepository.save(projectAccount);
        this.logger.debug(`Updated project account for project ${projectId}`);
      } else {
        // Create new account
        projectAccount = this.projectAccountRepository.create({
          projectId,
          ...this.createProjectAccountData(data),
        });
        await this.projectAccountRepository.save(projectAccount);
        this.logger.log(`Created new project account for project ${projectId}`);
      }

      return projectAccount;
    } catch (error) {
      this.logger.error(
        `Failed to upsert project account for project ${projectId}:`,
        error,
      );
      throw error;
    }
  }

  async upsertProjectAccountWithTransaction(
    projectId: string,
    data: ProjectAccountData,
    queryRunner: QueryRunner,
  ): Promise<ProjectSocialAccount> {
    try {
      const repository =
        queryRunner.manager.getRepository(ProjectSocialAccount);

      let projectAccount = await repository.findOne({
        where: { projectId },
      });

      if (projectAccount) {
        this.updateProjectAccountFields(projectAccount, data);
        await repository.save(projectAccount);
        this.logger.debug(
          `Updated project account for project ${projectId} (transaction)`,
        );
      } else {
        // Create new account
        projectAccount = repository.create({
          projectId,
          ...this.createProjectAccountData(data),
        });
        await repository.save(projectAccount);
        this.logger.log(
          `Created new project account for project ${projectId} (transaction)`,
        );
      }

      return projectAccount;
    } catch (error) {
      this.logger.error(
        `Failed to upsert project account for project ${projectId} (transaction):`,
        error,
      );
      throw error;
    }
  }

  async getProjectAccount(
    projectId: string,
  ): Promise<ProjectSocialAccount | null> {
    try {
      return await this.projectAccountRepository.findOne({
        where: { projectId },
      });
    } catch (error) {
      this.logger.error(
        `Failed to get project account for project ${projectId}:`,
        error,
      );
      throw error;
    }
  }

  async getProjectsForScheduling(): Promise<ProjectSocialAccount[]> {
    try {
      return await this.projectAccountRepository
        .createQueryBuilder('account')
        .where("(account.xUrl IS NOT NULL AND account.xUrl != '')")
        .orWhere(
          "(account.farcasterUrl IS NOT NULL AND account.farcasterUrl != '')",
        )
        .getMany();
    } catch (error) {
      this.logger.error('Failed to get projects for scheduling:', error);
      throw error;
    }
  }

  async getProjectsWithXUrls(): Promise<ProjectSocialAccount[]> {
    try {
      return await this.projectAccountRepository
        .createQueryBuilder('account')
        .where("account.xUrl IS NOT NULL AND account.xUrl != ''")
        .getMany();
    } catch (error) {
      this.logger.error('Failed to get projects with X URLs:', error);
      throw error;
    }
  }

  async updateLastFetchTimestamp(
    projectId: string,
    platform: SocialMediaPlatform,
  ): Promise<void> {
    try {
      const projectAccount = await this.projectAccountRepository.findOne({
        where: { projectId },
      });

      if (!projectAccount) {
        this.logger.warn(
          `No project account found for project ${projectId} when updating last fetch timestamp`,
        );
        return;
      }

      const now = new Date();
      if (platform === SocialMediaPlatform.TWITTER) {
        projectAccount.lastXFetch = now;
      } else {
        projectAccount.lastFarcasterFetch = now;
      }

      await this.projectAccountRepository.save(projectAccount);
      this.logger.debug(
        `Updated last ${platform} fetch timestamp for project ${projectId}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to update last fetch timestamp for project ${projectId}:`,
        error,
      );
      throw error;
    }
  }

  async getStaleProjects(
    platform: SocialMediaPlatform,
    maxAgeMinutes: number = 60,
  ): Promise<ProjectSocialAccount[]> {
    try {
      const cutoffTime = new Date();
      cutoffTime.setMinutes(cutoffTime.getMinutes() - maxAgeMinutes);

      const queryBuilder =
        this.projectAccountRepository.createQueryBuilder('account');

      if (platform === SocialMediaPlatform.TWITTER) {
        queryBuilder
          .where("account.xUrl IS NOT NULL AND account.xUrl != ''")
          .andWhere(
            '(account.lastXFetch IS NULL OR account.lastXFetch < :cutoffTime)',
            { cutoffTime },
          );
      } else {
        queryBuilder
          .where(
            "account.farcasterUrl IS NOT NULL AND account.farcasterUrl != ''",
          )
          .andWhere(
            '(account.lastFarcasterFetch IS NULL OR account.lastFarcasterFetch < :cutoffTime)',
            { cutoffTime },
          );
      }

      return await queryBuilder.getMany();
    } catch (error) {
      this.logger.error(`Failed to get stale projects for ${platform}:`, error);
      throw error;
    }
  }

  async getProjectCount(): Promise<number> {
    try {
      return await this.projectAccountRepository.count();
    } catch (error) {
      this.logger.error('Failed to get project count:', error);
      throw error;
    }
  }

  async getProjectCountWithSocialMedia(): Promise<{
    x: number;
    farcaster: number;
    total: number;
  }> {
    try {
      const [xCount, farcasterCount, totalCount] = await Promise.all([
        this.projectAccountRepository
          .createQueryBuilder('account')
          .where("account.xUrl IS NOT NULL AND account.xUrl != ''")
          .getCount(),
        this.projectAccountRepository
          .createQueryBuilder('account')
          .where(
            "account.farcasterUrl IS NOT NULL AND account.farcasterUrl != ''",
          )
          .getCount(),
        this.projectAccountRepository.count(),
      ]);

      return {
        x: xCount,
        farcaster: farcasterCount,
        total: totalCount,
      };
    } catch (error) {
      this.logger.error(
        'Failed to get project count with social media:',
        error,
      );
      throw error;
    }
  }

  /**
   * Get projects with Farcaster URLs for efficient fetching statistics.
   * This method is optimized for the FarcasterFetchProcessor statistics.
   *
   * @returns Promise<ProjectSocialAccount[]> - Projects with Farcaster URLs
   */
  async getFarcasterProjects(): Promise<ProjectSocialAccount[]> {
    try {
      return await this.projectAccountRepository
        .createQueryBuilder('account')
        .where(
          "account.farcasterUrl IS NOT NULL AND account.farcasterUrl != ''",
        )
        .getMany();
    } catch (error) {
      this.logger.error('Failed to get Farcaster projects:', error);
      throw error;
    }
  }

  /**
   * Get projects with Farcaster URLs that were recently fetched.
   * This method pushes all filtering logic to the database level for optimal performance.
   *
   * @param since - Only include projects fetched after this date
   * @param projectId - Optional specific project ID to filter by
   * @returns Promise<ProjectSocialAccount[]> - Recently fetched Farcaster projects
   */
  async getRecentlyFetchedFarcasterProjects(
    since: Date,
    projectId?: string,
  ): Promise<ProjectSocialAccount[]> {
    try {
      const queryBuilder = this.projectAccountRepository
        .createQueryBuilder('account')
        .where(
          "account.farcasterUrl IS NOT NULL AND account.farcasterUrl != ''",
        )
        .andWhere('account.lastFarcasterFetch IS NOT NULL')
        .andWhere('account.lastFarcasterFetch > :since', { since });

      // Apply project filter if specified
      if (projectId) {
        queryBuilder.andWhere('account.projectId = :projectId', { projectId });
      }

      return await queryBuilder.getMany();
    } catch (error) {
      this.logger.error(
        'Failed to get recently fetched Farcaster projects:',
        error,
      );
      throw error;
    }
  }

  /**
   * Get Farcaster fetch statistics using efficient database queries.
   * This method provides the data needed for FarcasterFetchProcessor.getFetchStatistics()
   * without loading all project data into memory.
   *
   * @param projectId - Optional specific project ID to get stats for
   * @returns Promise<object> - Statistics about Farcaster fetching
   */
  async getFarcasterFetchStatistics(projectId?: string): Promise<{
    totalProjects: number;
    projectsWithFarcaster: number;
    recentFetches: number;
    lastFetchTime?: Date;
  }> {
    try {
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      // Build base queries
      let totalQuery =
        this.projectAccountRepository.createQueryBuilder('account');
      let farcasterQuery = this.projectAccountRepository
        .createQueryBuilder('account')
        .where(
          "account.farcasterUrl IS NOT NULL AND account.farcasterUrl != ''",
        );
      let recentFetchesQuery = this.projectAccountRepository
        .createQueryBuilder('account')
        .where(
          "account.farcasterUrl IS NOT NULL AND account.farcasterUrl != ''",
        )
        .andWhere('account.lastFarcasterFetch >= :oneDayAgo', { oneDayAgo });

      // Apply project filter if specified
      if (projectId) {
        totalQuery = totalQuery.where('account.projectId = :projectId', {
          projectId,
        });
        farcasterQuery = farcasterQuery.andWhere(
          'account.projectId = :projectId',
          { projectId },
        );
        recentFetchesQuery = recentFetchesQuery.andWhere(
          'account.projectId = :projectId',
          { projectId },
        );
      }

      // Execute counts in parallel
      const [totalProjects, projectsWithFarcaster, recentFetches] =
        await Promise.all([
          totalQuery.getCount(),
          farcasterQuery.getCount(),
          recentFetchesQuery.getCount(),
        ]);

      // Get the most recent fetch time
      const lastFetchResult = await this.projectAccountRepository
        .createQueryBuilder('account')
        .where(
          "account.farcasterUrl IS NOT NULL AND account.farcasterUrl != ''",
        )
        .andWhere('account.lastFarcasterFetch IS NOT NULL')
        .orderBy('account.lastFarcasterFetch', 'DESC')
        .limit(1)
        .getOne();

      return {
        totalProjects,
        projectsWithFarcaster,
        recentFetches,
        lastFetchTime: lastFetchResult?.lastFarcasterFetch,
      };
    } catch (error) {
      this.logger.error('Failed to get Farcaster fetch statistics:', error);
      throw error;
    }
  }

  /**
   * Helper method to update project account fields
   */
  private updateProjectAccountFields(
    projectAccount: ProjectSocialAccount,
    data: ProjectAccountData,
  ): void {
    // Basic project information
    if (data.title !== undefined) {
      projectAccount.title = data.title;
    }
    if (data.slug !== undefined) {
      projectAccount.slug = data.slug;
    }
    if (data.description !== undefined) {
      projectAccount.description = data.description;
    }
    if (data.projectStatus !== undefined) {
      projectAccount.projectStatus = data.projectStatus;
    }
    // verified field removed

    // Project metrics
    if (data.qualityScore !== undefined) {
      projectAccount.qualityScore = data.qualityScore;
    }
    if (data.givPowerRank !== undefined) {
      projectAccount.givPowerRank = data.givPowerRank;
    }
    if (data.totalDonations !== undefined) {
      projectAccount.totalDonations = data.totalDonations;
    }
    // totalReactions field removed

    // Project update information
    if (data.lastUpdateDate !== undefined) {
      projectAccount.lastUpdateDate = data.lastUpdateDate;
    }
    if (data.lastUpdateContent !== undefined) {
      projectAccount.lastUpdateContent = data.lastUpdateContent;
    }
    if (data.lastUpdateTitle !== undefined) {
      projectAccount.lastUpdateTitle = data.lastUpdateTitle;
    }

    // Social media URLs
    if (data.xUrl !== undefined) {
      projectAccount.xUrl = data.xUrl;
    }
    if (data.farcasterUrl !== undefined) {
      projectAccount.farcasterUrl = data.farcasterUrl;
    }
    if (data.lastXFetch !== undefined) {
      projectAccount.lastXFetch = data.lastXFetch;
    }
    if (data.lastFarcasterFetch !== undefined) {
      projectAccount.lastFarcasterFetch = data.lastFarcasterFetch;
    }
    if (data.latestXPostTimestamp !== undefined) {
      projectAccount.latestXPostTimestamp = data.latestXPostTimestamp;
    }
    if (data.latestFarcasterPostTimestamp !== undefined) {
      projectAccount.latestFarcasterPostTimestamp =
        data.latestFarcasterPostTimestamp;
    }
    if (data.metadata) {
      projectAccount.metadata = {
        ...projectAccount.metadata,
        ...data.metadata,
      };
    }
  }

  /**
   * Helper method to create project account data for new entities
   */
  private createProjectAccountData(
    data: ProjectAccountData,
  ): Partial<ProjectSocialAccount> {
    return {
      title: data.title ?? '',
      slug: data.slug ?? '',
      description: data.description,
      projectStatus: data.projectStatus ?? 'UNKNOWN',
      qualityScore: data.qualityScore,
      givPowerRank: data.givPowerRank,
      totalDonations: data.totalDonations ?? 0,
      lastUpdateDate: data.lastUpdateDate,
      lastUpdateContent: data.lastUpdateContent,
      lastUpdateTitle: data.lastUpdateTitle,
      xUrl: data.xUrl,
      farcasterUrl: data.farcasterUrl,
      lastXFetch: data.lastXFetch,
      lastFarcasterFetch: data.lastFarcasterFetch,
      latestXPostTimestamp: data.latestXPostTimestamp,
      latestFarcasterPostTimestamp: data.latestFarcasterPostTimestamp,
      metadata: data.metadata,
    };
  }
}
