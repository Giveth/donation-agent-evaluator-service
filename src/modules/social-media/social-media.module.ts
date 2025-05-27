import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TwitterService, FarcasterService } from './services';

@Module({
  imports: [
    HttpModule, // For making HTTP requests to external APIs (Apify, Searchcaster, Warpcast)
  ],
  providers: [TwitterService, FarcasterService],
  exports: [TwitterService, FarcasterService],
})
export class SocialMediaModule {}
