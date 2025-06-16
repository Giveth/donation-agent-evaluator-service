import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProjectSocialAccount } from '../entities/project-social-account.entity';
import { SocialMediaPlatform } from '../../social-media/dto/social-post.dto';

export interface ProjectAccountData {
  twitterHandle?: string;
  farcasterUsername?: string;
  lastTwitterFetch?: Date;
  lastFarcasterFetch?: Date;
  latestTwitterPostTimestamp?: Date;
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
        // Update existing account - only update fields that are provided
        if (data.twitterHandle !== undefined) {
          projectAccount.twitterHandle = data.twitterHandle;
        }
        if (data.farcasterUsername !== undefined) {
          projectAccount.farcasterUsername = data.farcasterUsername;
        }
        if (data.lastTwitterFetch !== undefined) {
          projectAccount.lastTwitterFetch = data.lastTwitterFetch;
        }
        if (data.lastFarcasterFetch !== undefined) {
          projectAccount.lastFarcasterFetch = data.lastFarcasterFetch;
        }
        if (data.latestTwitterPostTimestamp !== undefined) {
          projectAccount.latestTwitterPostTimestamp =
            data.latestTwitterPostTimestamp;
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
        await this.projectAccountRepository.save(projectAccount);
        this.logger.debug(`Updated project account for project ${projectId}`);
      } else {
        // Create new account
        projectAccount = this.projectAccountRepository.create({
          projectId,
          twitterHandle: data.twitterHandle,
          farcasterUsername: data.farcasterUsername,
          lastTwitterFetch: data.lastTwitterFetch,
          lastFarcasterFetch: data.lastFarcasterFetch,
          latestTwitterPostTimestamp: data.latestTwitterPostTimestamp,
          latestFarcasterPostTimestamp: data.latestFarcasterPostTimestamp,
          metadata: data.metadata,
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
        .where(
          "(account.twitterHandle IS NOT NULL AND account.twitterHandle != '')",
        )
        .orWhere(
          "(account.farcasterUsername IS NOT NULL AND account.farcasterUsername != '')",
        )
        .getMany();
    } catch (error) {
      this.logger.error('Failed to get projects for scheduling:', error);
      throw error;
    }
  }

  async getProjectsWithTwitterHandles(): Promise<ProjectSocialAccount[]> {
    try {
      return await this.projectAccountRepository
        .createQueryBuilder('account')
        .where(
          "account.twitterHandle IS NOT NULL AND account.twitterHandle != ''",
        )
        .getMany();
    } catch (error) {
      this.logger.error('Failed to get projects with Twitter handles:', error);
      throw error;
    }
  }

  async getProjectsWithFarcasterUsernames(): Promise<ProjectSocialAccount[]> {
    try {
      return await this.projectAccountRepository
        .createQueryBuilder('account')
        .where(
          "account.farcasterUsername IS NOT NULL AND account.farcasterUsername != ''",
        )
        .getMany();
    } catch (error) {
      this.logger.error(
        'Failed to get projects with Farcaster usernames:',
        error,
      );
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
        projectAccount.lastTwitterFetch = now;
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
          .where(
            "account.twitterHandle IS NOT NULL AND account.twitterHandle != ''",
          )
          .andWhere(
            '(account.lastTwitterFetch IS NULL OR account.lastTwitterFetch < :cutoffTime)',
            { cutoffTime },
          );
      } else {
        queryBuilder
          .where(
            "account.farcasterUsername IS NOT NULL AND account.farcasterUsername != ''",
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
    twitter: number;
    farcaster: number;
    total: number;
  }> {
    try {
      const [twitterCount, farcasterCount, totalCount] = await Promise.all([
        this.projectAccountRepository
          .createQueryBuilder('account')
          .where(
            "account.twitterHandle IS NOT NULL AND account.twitterHandle != ''",
          )
          .getCount(),
        this.projectAccountRepository
          .createQueryBuilder('account')
          .where(
            "account.farcasterUsername IS NOT NULL AND account.farcasterUsername != ''",
          )
          .getCount(),
        this.projectAccountRepository.count(),
      ]);

      return {
        twitter: twitterCount,
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
}
