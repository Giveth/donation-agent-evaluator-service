import { Module, Global } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    NestCacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        ttl: parseInt(configService.get('CACHE_TTL_DEFAULT', '3600'), 10), // Default 1 hour TTL in seconds
      }),
    }),
  ],
  exports: [NestCacheModule],
})
export class CacheModule {}
