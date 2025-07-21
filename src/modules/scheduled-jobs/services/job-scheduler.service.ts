import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ScheduledJob,
  JobType,
  JobStatus,
} from '../../social-media-storage/entities/scheduled-job.entity';
import { ProjectSocialAccountService } from '../../social-media-storage/services/project-social-account.service';

/**
 * Service responsible for creating scheduled jobs for social media data fetching.
 * Runs hourly cron jobs to schedule Twitter and Farcaster fetch jobs for all projects
 * with social media handles, distributing the load across 60 minutes to manage rate limits.
 */
@Injectable()
export class JobSchedulerService {
  private readonly logger = new Logger(JobSchedulerService.name);

  constructor(
    @InjectRepository(ScheduledJob)
    private readonly scheduledJobRepository: Repository<ScheduledJob>,
    private readonly projectSocialAccountService: ProjectSocialAccountService,
  ) {}

  /**
   * Hourly cron job that creates scheduled jobs for all projects with social media handles.
   * Runs every hour at minute 0 (top of the hour).
   *
   * The job scheduling strategy:
   * - Distributes jobs across 60 minutes to manage rate limits
   * - Adds random jitter (0-30 seconds) to prevent thundering herd
   * - Creates separate jobs for Twitter and Farcaster platforms
   * - Follows architecture recommendation of ~50 projects per 10-minute window
   */
  @Cron('0 * * * *', {
    name: 'hourly-social-media-job-scheduler',
    timeZone: 'UTC',
  })
  async scheduleHourlySocialMediaJobs(): Promise<void> {
    this.logger.log('Starting hourly social media job scheduling...');

    try {
      // Schedule Twitter fetch jobs
      await this.scheduleTwitterJobs();

      // Schedule Farcaster fetch jobs
      await this.scheduleFarcasterJobs();

      this.logger.log('Completed hourly social media job scheduling');
    } catch (error) {
      this.logger.error(
        'Failed to complete hourly social media job scheduling:',
        error,
      );
      // Don't throw - we want the cron job to continue running
    }
  }

  /**
   * Creates scheduled jobs for all projects with Twitter handles.
   * Distributes jobs across 60 minutes with jitter to manage rate limits.
   */
  private async scheduleTwitterJobs(): Promise<void> {
    try {
      this.logger.log('Fetching projects with Twitter handles...');
      const projectsWithTwitter =
        await this.projectSocialAccountService.getProjectsWithXUrls();

      if (projectsWithTwitter.length === 0) {
        this.logger.log('No projects with Twitter handles found');
        return;
      }

      this.logger.log(
        `Found ${projectsWithTwitter.length} projects with Twitter handles`,
      );

      const jobs = await this.createDistributedJobs(
        projectsWithTwitter.map(project => project.projectId),
        JobType.TWEET_FETCH,
        'Twitter',
      );

      this.logger.log(
        `Successfully scheduled ${jobs.length} Twitter fetch jobs`,
      );
    } catch (error) {
      this.logger.error('Failed to schedule Twitter jobs:', error);
      // Continue with other job types even if this fails
    }
  }

  /**
   * Creates scheduled jobs for all projects with Farcaster usernames.
   * Distributes jobs across 60 minutes with jitter to manage rate limits.
   */
  private async scheduleFarcasterJobs(): Promise<void> {
    try {
      this.logger.log('Fetching projects with Farcaster usernames...');
      const projectsWithFarcaster =
        await this.projectSocialAccountService.getFarcasterProjects();

      if (projectsWithFarcaster.length === 0) {
        this.logger.log('No projects with Farcaster usernames found');
        return;
      }

      this.logger.log(
        `Found ${projectsWithFarcaster.length} projects with Farcaster usernames`,
      );

      const jobs = await this.createDistributedJobs(
        projectsWithFarcaster.map(project => project.projectId),
        JobType.FARCASTER_FETCH,
        'Farcaster',
      );

      this.logger.log(
        `Successfully scheduled ${jobs.length} Farcaster fetch jobs`,
      );
    } catch (error) {
      this.logger.error('Failed to schedule Farcaster jobs:', error);
      // Continue with other job types even if this fails
    }
  }

  /**
   * Creates distributed scheduled jobs for a list of project IDs.
   *
   * Distribution strategy:
   * - Spreads jobs across 60 minutes (3600 seconds)
   * - Adds random jitter (0-30 seconds) to prevent synchronized execution
   * - Prevents duplicate jobs by checking for existing pending jobs
   *
   * @param projectIds - Array of project IDs to create jobs for
   * @param jobType - Type of job to create (TWEET_FETCH or FARCASTER_FETCH)
   * @param platformName - Human-readable platform name for logging
   * @returns Array of created ScheduledJob entities
   */
  private async createDistributedJobs(
    projectIds: string[],
    jobType: JobType,
    platformName: string,
  ): Promise<ScheduledJob[]> {
    const jobs: ScheduledJob[] = [];
    const baseTime = new Date();
    const totalMinutes = 60; // Distribute across 60 minutes
    const maxJitterSeconds = 30; // Maximum jitter to add

    // Filter out projects that already have pending jobs for this job type
    const projectIdsWithoutPendingJobs =
      await this.filterProjectsWithoutPendingJobs(projectIds, jobType);

    if (projectIdsWithoutPendingJobs.length === 0) {
      this.logger.log(
        `All projects already have pending ${platformName} jobs, skipping`,
      );
      return jobs;
    }

    this.logger.log(
      `Creating jobs for ${projectIdsWithoutPendingJobs.length} projects (filtered out ${
        projectIds.length - projectIdsWithoutPendingJobs.length
      } with existing pending jobs)`,
    );

    for (let i = 0; i < projectIdsWithoutPendingJobs.length; i++) {
      try {
        const projectId = projectIdsWithoutPendingJobs[i];

        // Calculate distributed scheduling time
        // Spread jobs evenly across 60 minutes
        const minutesToAdd =
          (i * totalMinutes) / projectIdsWithoutPendingJobs.length;

        // Add random jitter (0-30 seconds)
        const jitterSeconds = Math.floor(Math.random() * maxJitterSeconds);

        const scheduledFor = new Date(baseTime);
        scheduledFor.setMinutes(
          scheduledFor.getMinutes() + Math.floor(minutesToAdd),
        );
        scheduledFor.setSeconds(
          scheduledFor.getSeconds() + (minutesToAdd % 1) * 60 + jitterSeconds,
        );

        // Create the scheduled job
        const job = this.scheduledJobRepository.create({
          projectId,
          jobType,
          scheduledFor,
          status: JobStatus.PENDING,
          attempts: 0,
          metadata: {
            platform: platformName.toLowerCase(),
            scheduledBy: 'job-scheduler-service',
            scheduledAt: new Date().toISOString(),
            distributionIndex: i,
            totalInBatch: projectIdsWithoutPendingJobs.length,
          },
        });

        const savedJob = await this.scheduledJobRepository.save(job);
        jobs.push(savedJob);

        this.logger.debug(
          `Created ${platformName} job for project ${projectId}, scheduled for ${scheduledFor.toISOString()}`,
        );
      } catch (error) {
        this.logger.warn(
          `Failed to create ${platformName} job for project ${projectIdsWithoutPendingJobs[i]}:`,
          error,
        );
        // Continue with other projects even if one fails
      }
    }

    return jobs;
  }

  /**
   * Filters project IDs to exclude those that already have pending jobs for the specified job type.
   * This prevents duplicate job creation and reduces unnecessary work.
   *
   * @param projectIds - Array of project IDs to filter
   * @param jobType - Job type to check for existing jobs
   * @returns Array of project IDs without existing pending jobs
   */
  private async filterProjectsWithoutPendingJobs(
    projectIds: string[],
    jobType: JobType,
  ): Promise<string[]> {
    if (projectIds.length === 0) {
      return [];
    }

    try {
      // Find all projects that already have pending jobs for this job type
      const existingJobs = await this.scheduledJobRepository
        .createQueryBuilder('job')
        .select('job.projectId')
        .where('job.projectId IN (:...projectIds)', { projectIds })
        .andWhere('job.jobType = :jobType', { jobType })
        .andWhere('job.status = :status', { status: JobStatus.PENDING })
        .getMany();

      const projectIdsWithExistingJobs = new Set(
        existingJobs.map(job => job.projectId),
      );

      // Return only project IDs that don't have existing pending jobs
      const filteredProjectIds = projectIds.filter(
        projectId => !projectIdsWithExistingJobs.has(projectId),
      );

      this.logger.debug(
        `Filtered ${projectIds.length} project IDs, found ${existingJobs.length} with existing pending ${jobType} jobs, ${filteredProjectIds.length} remaining`,
      );

      return filteredProjectIds;
    } catch (error) {
      this.logger.error(
        `Failed to filter projects with existing pending jobs for ${jobType}:`,
        error,
      );
      // If filtering fails, return all project IDs to avoid blocking job creation
      return projectIds;
    }
  }

  /**
   * Manual method to trigger job scheduling outside of the cron schedule.
   * Useful for testing or admin operations.
   *
   * @returns Object containing counts of created jobs by platform
   */
  async manualScheduleJobs(): Promise<{
    twitter: number;
    farcaster: number;
    total: number;
  }> {
    this.logger.log('Manual job scheduling triggered');

    try {
      const [twitterProjects, farcasterProjects] = await Promise.all([
        this.projectSocialAccountService.getProjectsWithXUrls(),
        this.projectSocialAccountService.getFarcasterProjects(),
      ]);

      const [twitterJobs, farcasterJobs] = await Promise.all([
        this.createDistributedJobs(
          twitterProjects.map(p => p.projectId),
          JobType.TWEET_FETCH,
          'Twitter',
        ),
        this.createDistributedJobs(
          farcasterProjects.map(p => p.projectId),
          JobType.FARCASTER_FETCH,
          'Farcaster',
        ),
      ]);

      const result = {
        twitter: twitterJobs.length,
        farcaster: farcasterJobs.length,
        total: twitterJobs.length + farcasterJobs.length,
      };

      this.logger.log(`Manual job scheduling completed:`, result);
      return result;
    } catch (error) {
      this.logger.error('Failed to manually schedule jobs:', error);
      throw error;
    }
  }

  /**
   * Gets statistics about scheduled jobs.
   * Useful for monitoring and admin operations.
   *
   * @returns Object containing job statistics
   */
  async getJobStatistics(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    byJobType: Record<JobType, number>;
  }> {
    try {
      const [
        pendingCount,
        processingCount,
        completedCount,
        failedCount,
        jobsByType,
      ] = await Promise.all([
        this.scheduledJobRepository.count({
          where: { status: JobStatus.PENDING },
        }),
        this.scheduledJobRepository.count({
          where: { status: JobStatus.PROCESSING },
        }),
        this.scheduledJobRepository.count({
          where: { status: JobStatus.COMPLETED },
        }),
        this.scheduledJobRepository.count({
          where: { status: JobStatus.FAILED },
        }),
        this.scheduledJobRepository
          .createQueryBuilder('job')
          .select('job.jobType, COUNT(*) as count')
          .where('job.status = :status', { status: JobStatus.PENDING })
          .groupBy('job.jobType')
          .getRawMany(),
      ]);

      const byJobType: Record<JobType, number> = {
        [JobType.TWEET_FETCH]: 0,
        [JobType.FARCASTER_FETCH]: 0,
        [JobType.PROJECT_SYNC]: 0,
      };

      // Populate job type counts
      jobsByType.forEach((row: { job_jobType: JobType; count: string }) => {
        byJobType[row.job_jobType] = parseInt(row.count, 10);
      });

      return {
        pending: pendingCount,
        processing: processingCount,
        completed: completedCount,
        failed: failedCount,
        byJobType,
      };
    } catch (error) {
      this.logger.error('Failed to get job statistics:', error);
      throw error;
    }
  }
}
