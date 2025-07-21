import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { LoggerModule } from '../../core/logger/logger.module';
import { ImpactGraphService } from './services/impact-graph.service';
import { DataFetchingService } from './services/data-fetching.service';
import { SocialMediaStorageModule } from '../social-media-storage/social-media-storage.module';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000, // 30 second timeout
      maxRedirects: 5,
    }),
    LoggerModule,
    SocialMediaStorageModule, // Import for ProjectSocialAccountService
  ],
  providers: [ImpactGraphService, DataFetchingService],
  exports: [ImpactGraphService, DataFetchingService],
})
export class DataFetchingModule {}
