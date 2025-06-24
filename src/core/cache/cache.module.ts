import { Module } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Module({
  imports: [
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        isGlobal: true,
        ttl: parseInt(configService.get('CACHE_TTL_DEFAULT', '3600'), 10), // Default 1 hour TTL in seconds
      }),
    }),
  ],
  exports: [NestCacheModule],
})
export class CacheModule {}
