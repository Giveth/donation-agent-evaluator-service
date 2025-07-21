import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoggerModule } from '../../core/logger/logger.module';
import { SocialMediaStorageModule } from '../social-media-storage/social-media-storage.module';
import { SocialMediaModule } from '../social-media/social-media.module';
import { DataFetchingModule } from '../data-fetching/data-fetching.module';
import { ScheduledJob } from '../social-media-storage/entities/scheduled-job.entity';
import { JobSchedulerService } from './services/job-scheduler.service';
import { JobProcessorService } from './services/job-processor.service';
import { TwitterFetchProcessor } from './processors/twitter-fetch.processor';
import { FarcasterFetchProcessor } from './processors/farcaster-fetch.processor';
import { ProjectSyncProcessor } from './processors/project-sync.processor';
import { AdminController } from './controllers/admin.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScheduledJob]),
    LoggerModule,
    SocialMediaStorageModule,
    SocialMediaModule,
    DataFetchingModule,
  ],
  controllers: [AdminController],
  providers: [
    JobSchedulerService,
    JobProcessorService,
    TwitterFetchProcessor,
    FarcasterFetchProcessor,
    ProjectSyncProcessor,
  ],
  exports: [
    JobSchedulerService,
    JobProcessorService,
    TwitterFetchProcessor,
    FarcasterFetchProcessor,
    ProjectSyncProcessor,
  ],
})
export class ScheduledJobsModule {}
