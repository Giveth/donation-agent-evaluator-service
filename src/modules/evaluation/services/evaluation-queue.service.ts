import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import {
  ScheduledJob,
  JobType,
  JobStatus,
} from '../../social-media-storage/entities/scheduled-job.entity';
import { EvaluateProjectsRequestDto } from '../dto/evaluate-projects-request.dto';
import { EvaluateMultipleCausesRequestDto } from '../dto/evaluate-multiple-causes-request.dto';
import { JobResponseDto, JobStatusType } from '../dto/job-response.dto';
import { JobStatusDto } from '../dto/job-status.dto';
import { EvaluationResultDto } from '../dto/evaluation-result.dto';
import { MultiCauseEvaluationResultDto } from '../dto/multi-cause-evaluation-result.dto';

@Injectable()
export class EvaluationQueueService {
  private readonly logger = new Logger(EvaluationQueueService.name);

  constructor(
    @InjectRepository(ScheduledJob)
    private readonly scheduledJobRepository: Repository<ScheduledJob>,
  ) {}

  /**
   * Adds a single cause evaluation job to the queue
   * @param request - Single cause evaluation request
   * @returns JobResponseDto with job ID and estimated duration
   */
  async addSingleCauseJob(
    request: EvaluateProjectsRequestDto,
  ): Promise<JobResponseDto> {
    this.logger.log(
      `Queueing single cause evaluation for cause ${request.cause.id} with ${request.projectIds.length} projects`,
    );

    const job = this.scheduledJobRepository.create({
      projectId: request.cause.id.toString(), // Use cause ID as project ID for evaluation jobs
      jobType: JobType.SINGLE_CAUSE_EVALUATION,
      scheduledFor: new Date(), // Execute immediately
      status: JobStatus.PENDING,
      attempts: 0,
      metadata: {
        requestType: 'single_cause',
        causeId: request.cause.id,
        causeName: request.cause.title,
        projectCount: request.projectIds.length,
        queuedAt: new Date().toISOString(),
        requestData: request,
      },
    });

    const savedJob = await this.scheduledJobRepository.save(job);

    // Calculate estimated duration (30-45 seconds per project)
    const minSeconds = request.projectIds.length * 30;
    const maxSeconds = request.projectIds.length * 45;
    const estimatedDuration = `${minSeconds}s - ${maxSeconds}s`;

    this.logger.log(
      `Single cause evaluation job queued with ID ${savedJob.id}, estimated duration: ${estimatedDuration}`,
    );

    return {
      jobId: savedJob.id,
      status: JobStatusType.QUEUED,
      estimatedDuration,
    };
  }

  /**
   * Adds a multi-cause evaluation job to the queue
   * @param request - Multi-cause evaluation request
   * @returns JobResponseDto with job ID and estimated duration
   */
  async addMultiCauseJob(
    request: EvaluateMultipleCausesRequestDto,
  ): Promise<JobResponseDto> {
    const totalProjects = request.causes.reduce(
      (sum, cause) => sum + cause.projectIds.length,
      0,
    );

    this.logger.log(
      `Queueing multi-cause evaluation for ${request.causes.length} causes with ${totalProjects} total projects`,
    );

    const job = this.scheduledJobRepository.create({
      projectId: 'multi-cause', // Special project ID for multi-cause jobs
      jobType: JobType.MULTI_CAUSE_EVALUATION,
      scheduledFor: new Date(), // Execute immediately
      status: JobStatus.PENDING,
      attempts: 0,
      metadata: {
        requestType: 'multi_cause',
        causeCount: request.causes.length,
        totalProjects,
        queuedAt: new Date().toISOString(),
        requestData: request,
      },
    });

    const savedJob = await this.scheduledJobRepository.save(job);

    // Calculate estimated duration (35-50 seconds per project, converted to minutes)
    const minMinutes = Math.ceil((totalProjects * 35) / 60);
    const maxMinutes = Math.ceil((totalProjects * 50) / 60);
    const estimatedDuration = `${minMinutes} - ${maxMinutes} minutes`;

    this.logger.log(
      `Multi-cause evaluation job queued with ID ${savedJob.id}, estimated duration: ${estimatedDuration}`,
    );

    return {
      jobId: savedJob.id,
      status: JobStatusType.QUEUED,
      estimatedDuration,
    };
  }

  /**
   * Gets the status and results of a job by ID
   * @param jobId - The job ID to check
   * @returns JobStatusDto with current status and results if completed
   */
  async getJobStatus(jobId: string): Promise<JobStatusDto> {
    const job = await this.scheduledJobRepository.findOne({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException(`Job with ID ${jobId} not found`);
    }

    // Verify this is an evaluation job
    if (
      job.jobType !== JobType.SINGLE_CAUSE_EVALUATION &&
      job.jobType !== JobType.MULTI_CAUSE_EVALUATION
    ) {
      throw new NotFoundException(`Job ${jobId} is not an evaluation job`);
    }

    const response: JobStatusDto = {
      jobId: job.id,
      status: this.mapJobStatus(job.status),
      startedAt: job.processedAt,
      completedAt:
        job.status === JobStatus.COMPLETED ? job.updatedAt : undefined,
    };

    // Add progress if available
    if (job.metadata?.progress) {
      response.progress = job.metadata.progress as number;
    }

    // Add error if failed
    if (job.status === JobStatus.FAILED && job.error) {
      response.error = job.error;
    }

    // Add results if completed
    if (job.status === JobStatus.COMPLETED && job.metadata?.result) {
      response.result = job.metadata.result as
        | EvaluationResultDto
        | MultiCauseEvaluationResultDto;
    }

    return response;
  }

  /**
   * Updates job progress (for multi-cause evaluations)
   * @param jobId - The job ID to update
   * @param progress - Progress percentage (0-100)
   */
  async updateJobProgress(jobId: string, progress: number): Promise<void> {
    await this.scheduledJobRepository.update(jobId, {
      metadata: () => `metadata || '{"progress": ${progress}}'::jsonb`,
    });

    this.logger.debug(`Updated job ${jobId} progress to ${progress}%`);
  }

  /**
   * Marks a job as processing and sets the start time
   * @param jobId - The job ID to update
   */
  async markJobAsProcessing(jobId: string): Promise<void> {
    await this.scheduledJobRepository.update(jobId, {
      status: JobStatus.PROCESSING,
      processedAt: new Date(),
    });

    this.logger.debug(`Marked job ${jobId} as processing`);
  }

  /**
   * Stores job result and marks as completed
   * @param jobId - The job ID to update
   * @param result - The evaluation result to store
   */
  async storeJobResult(
    jobId: string,
    result: EvaluationResultDto | MultiCauseEvaluationResultDto,
  ): Promise<void> {
    const job = await this.scheduledJobRepository.findOne({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException(`Job with ID ${jobId} not found`);
    }

    const updatedMetadata = {
      ...job.metadata,
      result,
      completedAt: new Date().toISOString(),
    };

    await this.scheduledJobRepository.update(jobId, {
      status: JobStatus.COMPLETED,
      metadata: updatedMetadata,
    });

    this.logger.log(`Stored result for job ${jobId} and marked as completed`);
  }

  /**
   * Marks a job as failed with error message
   * @param jobId - The job ID to update
   * @param error - The error message
   */
  async markJobAsFailed(jobId: string, error: string): Promise<void> {
    await this.scheduledJobRepository.update(jobId, {
      status: JobStatus.FAILED,
      error,
    });

    this.logger.error(`Marked job ${jobId} as failed with error: ${error}`);
  }

  /**
   * Gets pending evaluation jobs ready for processing
   * @returns Array of pending evaluation jobs
   */
  async getPendingEvaluationJobs(): Promise<ScheduledJob[]> {
    return this.scheduledJobRepository
      .createQueryBuilder('job')
      .where('job.jobType IN (:...types)', {
        types: [
          JobType.SINGLE_CAUSE_EVALUATION,
          JobType.MULTI_CAUSE_EVALUATION,
        ],
      })
      .andWhere('job.status = :status', { status: JobStatus.PENDING })
      .andWhere('job.scheduledFor <= NOW()')
      .orderBy('job.scheduledFor', 'ASC')
      .limit(10)
      .getMany();
  }

  /**
   * Cleans up stuck evaluation jobs that have been processing for too long
   * This handles cases where jobs get stuck due to crashes or timeouts
   * @param timeoutMinutes - Minutes after which a processing job is considered stuck (default: 10)
   * @returns Number of stuck jobs cleaned up
   */
  async cleanupStuckEvaluationJobs(
    timeoutMinutes: number = 10,
  ): Promise<number> {
    const timeoutThreshold = new Date();
    timeoutThreshold.setMinutes(timeoutThreshold.getMinutes() - timeoutMinutes);

    const result = await this.scheduledJobRepository
      .createQueryBuilder()
      .update(ScheduledJob)
      .set({
        status: JobStatus.PENDING,
        error:
          'Job was stuck in processing state and has been reset to pending',
      })
      .where('jobType IN (:...types)', {
        types: [
          JobType.SINGLE_CAUSE_EVALUATION,
          JobType.MULTI_CAUSE_EVALUATION,
        ],
      })
      .andWhere('status = :status', { status: JobStatus.PROCESSING })
      .andWhere('processedAt < :threshold', { threshold: timeoutThreshold })
      .execute();

    if (result.affected && result.affected > 0) {
      this.logger.warn(
        `Cleaned up ${result.affected} stuck evaluation jobs that were processing for more than ${timeoutMinutes} minutes`,
      );
    }

    return result.affected ?? 0;
  }

  /**
   * Checks if there are any evaluation jobs currently processing
   * @returns True if any evaluation jobs are in PROCESSING status
   */
  async hasProcessingEvaluationJobs(): Promise<boolean> {
    const count = await this.scheduledJobRepository.count({
      where: {
        jobType: In([
          JobType.SINGLE_CAUSE_EVALUATION,
          JobType.MULTI_CAUSE_EVALUATION,
        ]),
        status: JobStatus.PROCESSING,
      },
    });

    return count > 0;
  }

  /**
   * Maps internal JobStatus to external JobStatusType
   * @param status - Internal job status
   * @returns External job status type
   */
  private mapJobStatus(status: JobStatus): JobStatusType {
    switch (status) {
      case JobStatus.PENDING:
        return JobStatusType.QUEUED;
      case JobStatus.PROCESSING:
        return JobStatusType.PROCESSING;
      case JobStatus.COMPLETED:
        return JobStatusType.COMPLETED;
      case JobStatus.FAILED:
      case JobStatus.CANCELLED:
        return JobStatusType.FAILED;
      default:
        return JobStatusType.QUEUED;
    }
  }

  /**
   * Gets evaluation job statistics
   * @returns Object containing job counts by status
   */
  async getEvaluationJobStatistics(): Promise<{
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    singleCause: number;
    multiCause: number;
  }> {
    const [
      pendingCount,
      processingCount,
      completedCount,
      failedCount,
      singleCauseCount,
      multiCauseCount,
    ] = await Promise.all([
      this.scheduledJobRepository
        .createQueryBuilder('job')
        .where('job.jobType IN (:...types)', {
          types: [
            JobType.SINGLE_CAUSE_EVALUATION,
            JobType.MULTI_CAUSE_EVALUATION,
          ],
        })
        .andWhere('job.status = :status', { status: JobStatus.PENDING })
        .getCount(),
      this.scheduledJobRepository
        .createQueryBuilder('job')
        .where('job.jobType IN (:...types)', {
          types: [
            JobType.SINGLE_CAUSE_EVALUATION,
            JobType.MULTI_CAUSE_EVALUATION,
          ],
        })
        .andWhere('job.status = :status', { status: JobStatus.PROCESSING })
        .getCount(),
      this.scheduledJobRepository
        .createQueryBuilder('job')
        .where('job.jobType IN (:...types)', {
          types: [
            JobType.SINGLE_CAUSE_EVALUATION,
            JobType.MULTI_CAUSE_EVALUATION,
          ],
        })
        .andWhere('job.status = :status', { status: JobStatus.COMPLETED })
        .getCount(),
      this.scheduledJobRepository
        .createQueryBuilder('job')
        .where('job.jobType IN (:...types)', {
          types: [
            JobType.SINGLE_CAUSE_EVALUATION,
            JobType.MULTI_CAUSE_EVALUATION,
          ],
        })
        .andWhere('job.status = :status', { status: JobStatus.FAILED })
        .getCount(),
      this.scheduledJobRepository.count({
        where: { jobType: JobType.SINGLE_CAUSE_EVALUATION },
      }),
      this.scheduledJobRepository.count({
        where: { jobType: JobType.MULTI_CAUSE_EVALUATION },
      }),
    ]);

    return {
      pending: pendingCount,
      processing: processingCount,
      completed: completedCount,
      failed: failedCount,
      singleCause: singleCauseCount,
      multiCause: multiCauseCount,
    };
  }
}
