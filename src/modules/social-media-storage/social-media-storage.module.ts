import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectSocialAccount } from './entities/project-social-account.entity';
import { StoredSocialPost } from './entities/stored-social-post.entity';
import { ScheduledJob } from './entities/scheduled-job.entity';
import { SocialPostStorageService } from './services/social-post-storage.service';
import { ProjectSocialAccountService } from './services/project-social-account.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProjectSocialAccount,
      StoredSocialPost,
      ScheduledJob,
    ]),
  ],
  providers: [SocialPostStorageService, ProjectSocialAccountService],
  exports: [SocialPostStorageService, ProjectSocialAccountService],
})
export class SocialMediaStorageModule {}
