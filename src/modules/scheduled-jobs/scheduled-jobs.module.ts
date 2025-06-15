import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SocialMediaStorageModule } from '../social-media-storage/social-media-storage.module';
import { SocialMediaModule } from '../social-media/social-media.module';
import { ScheduledJob } from '../social-media-storage/entities/scheduled-job.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScheduledJob]),
    SocialMediaStorageModule,
    SocialMediaModule,
  ],
  providers: [],
  exports: [],
})
export class ScheduledJobsModule {}
