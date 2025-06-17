import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CauseCache } from '../entities/cause-cache.entity';

export interface CauseData {
  id: number;
  title: string;
  description: string;
  projectIds: number[];
  cacheDurationHours?: number;
}

@Injectable()
export class CauseCacheService {
  private readonly logger = new Logger(CauseCacheService.name);

  constructor(
    @InjectRepository(CauseCache)
    private readonly causeCacheRepository: Repository<CauseCache>,
  ) {}

  async getCause(causeId: number): Promise<CauseCache | null> {
    try {
      const cause = await this.causeCacheRepository.findOne({
        where: { id: causeId },
      });

      if (cause && !this.isCacheValid(cause)) {
        this.logger.debug(
          `Cache expired for cause ${causeId}, removing from cache`,
        );
        await this.causeCacheRepository.delete(causeId);
        return null;
      }

      return cause;
    } catch (error) {
      this.logger.error(`Failed to get cause ${causeId} from cache:`, error);
      throw error;
    }
  }

  async setCause(causeData: CauseData): Promise<CauseCache> {
    try {
      const cacheDurationHours = causeData.cacheDurationHours ?? 12; // Default 12 hours as per PRD
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + cacheDurationHours);

      const causeCache = this.causeCacheRepository.create({
        id: causeData.id,
        title: causeData.title,
        description: causeData.description,
        projectIds: causeData.projectIds,
        expiresAt,
      });

      await this.causeCacheRepository.save(causeCache);

      this.logger.log(
        `Cached cause ${causeData.id} with ${causeData.projectIds.length} projects, expires at ${expiresAt.toISOString()}`,
      );

      return causeCache;
    } catch (error) {
      this.logger.error(`Failed to cache cause ${causeData.id}:`, error);
      throw error;
    }
  }

  private isCacheValid(cause: CauseCache): boolean {
    const now = new Date();
    const isValid = cause.expiresAt > now;

    this.logger.debug(
      `Cache validity check for cause ${cause.id}: ${isValid ? 'valid' : 'expired'} (expires: ${cause.expiresAt.toISOString()}, now: ${now.toISOString()})`,
    );

    return isValid;
  }

  async clearExpiredCaches(): Promise<number> {
    try {
      const now = new Date();
      const result = await this.causeCacheRepository
        .createQueryBuilder()
        .delete()
        .where('expires_at <= :now', { now })
        .execute();

      const deletedCount = result.affected ?? 0;
      if (deletedCount > 0) {
        this.logger.log(`Cleared ${deletedCount} expired cause caches`);
      }

      return deletedCount;
    } catch (error) {
      this.logger.error('Failed to clear expired caches:', error);
      throw error;
    }
  }

  async getCacheStats(): Promise<{
    totalCaches: number;
    validCaches: number;
    expiredCaches: number;
  }> {
    try {
      const [totalCaches, expiredCaches] = await Promise.all([
        this.causeCacheRepository.count(),
        this.causeCacheRepository
          .createQueryBuilder()
          .where('expires_at <= :now', { now: new Date() })
          .getCount(),
      ]);

      return {
        totalCaches,
        validCaches: totalCaches - expiredCaches,
        expiredCaches,
      };
    } catch (error) {
      this.logger.error('Failed to get cache stats:', error);
      throw error;
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async handleScheduledCacheCleanup(): Promise<void> {
    this.logger.log('Running scheduled job to clear expired cause caches...');
    try {
      const deletedCount = await this.clearExpiredCaches();
      this.logger.log(
        `Scheduled cache cleanup finished. Cleared ${deletedCount} entries.`,
      );
    } catch (error) {
      this.logger.error('Failed to run scheduled cache cleanup:', error);
    }
  }
}
