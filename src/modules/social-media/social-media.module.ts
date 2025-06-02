import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '../../core/config/config.module';
import { CacheModule } from '../../core/cache/cache.module';
import { TwitterService, FarcasterService } from './services';

@Module({
  imports: [
    HttpModule, // For making HTTP requests to external APIs (Apify, Searchcaster, Warpcast)
    ConfigModule,
    CacheModule,
  ],
  providers: [TwitterService, FarcasterService],
  exports: [TwitterService, FarcasterService],
})
export class SocialMediaModule {}
