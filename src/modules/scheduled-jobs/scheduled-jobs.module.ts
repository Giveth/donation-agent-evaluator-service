import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SocialMediaStorageModule } from '../social-media-storage/social-media-storage.module';
import { SocialMediaModule } from '../social-media/social-media.module';
import { ScheduledJob } from '../social-media-storage/entities/scheduled-job.entity';
import { JobSchedulerService } from './services/job-scheduler.service';
import { JobProcessorService } from './services/job-processor.service';
import { TwitterFetchProcessor } from './processors/twitter-fetch.processor';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScheduledJob]),
    SocialMediaStorageModule,
    SocialMediaModule,
  ],
  providers: [JobSchedulerService, JobProcessorService, TwitterFetchProcessor],
  exports: [JobSchedulerService, JobProcessorService, TwitterFetchProcessor],
})
export class ScheduledJobsModule {}
