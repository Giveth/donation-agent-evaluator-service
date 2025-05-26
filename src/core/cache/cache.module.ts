import { Module } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';

@Module({
  imports: [
    NestCacheModule.register({
      isGlobal: true,
      ttl: 3600, // 1 hour default TTL in seconds
    }),
  ],
  exports: [NestCacheModule],
})
export class CacheModule {}
