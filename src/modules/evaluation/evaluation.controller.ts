import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Param,
  Logger,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { EvaluationQueueService } from './services/evaluation-queue.service';
import { EvaluateProjectsRequestDto } from './dto/evaluate-projects-request.dto';
import { EvaluateMultipleCausesRequestDto } from './dto/evaluate-multiple-causes-request.dto';
import { EvaluationDetailedQueryDto } from './dto/evaluation-detailed-query.dto';
import { EvaluationDetailedResponseDto } from './dto/evaluation-detailed-response.dto';
import { JobResponseDto } from './dto/job-response.dto';
import { JobStatusDto } from './dto/job-status.dto';
import { CsvLoggerService, CsvRowData } from './services/csv-logger.service';

@Controller('evaluate')
export class EvaluationController {
  private readonly logger = new Logger(EvaluationController.name);

  constructor(
    private readonly evaluationQueueService: EvaluationQueueService,
    private readonly csvLoggerService: CsvLoggerService,
  ) {}

  /**
   * Queues evaluation of projects within a cause and returns job ID for tracking.
   * Uses stored social media posts from database instead of live API calls.
   *
   * @param request - Contains cause details and project IDs to evaluate
   * @returns JobResponseDto - Job ID and estimated duration for tracking
   */
  @Post('cause')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async evaluateProjects(
    @Body() request: EvaluateProjectsRequestDto,
  ): Promise<JobResponseDto> {
    this.logger.log(
      `Received async evaluation request for cause ${request.cause.id} (${request.cause.title}) with ${request.projects.length} projects`,
    );

    try {
      const jobResponse =
        await this.evaluationQueueService.addSingleCauseJob(request);

      this.logger.log(
        `Evaluation job queued for cause ${request.cause.id} with job ID ${jobResponse.jobId}. ` +
          `Estimated duration: ${jobResponse.estimatedDuration}`,
      );

      return jobResponse;
    } catch (error) {
      this.logger.error(
        `Failed to queue evaluation for cause ${request.cause.id}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Queues evaluation of multiple causes and returns job ID for tracking.
   * Uses stored social media posts from database instead of live API calls.
   *
   * @param request - Contains array of cause evaluation requests
   * @returns JobResponseDto - Job ID and estimated duration for tracking
   */
  @Post('causes')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async evaluateMultipleCauses(
    @Body() request: EvaluateMultipleCausesRequestDto,
  ): Promise<JobResponseDto> {
    const totalProjects = request.causes.reduce(
      (sum, cause) => sum + cause.projects.length,
      0,
    );

    this.logger.log(
      `Received async multi-cause evaluation request for ${request.causes.length} causes with ${totalProjects} total projects`,
    );

    try {
      const jobResponse =
        await this.evaluationQueueService.addMultiCauseJob(request);

      this.logger.log(
        `Multi-cause evaluation job queued with job ID ${jobResponse.jobId}. ` +
          `Estimated duration: ${jobResponse.estimatedDuration}`,
      );

      return jobResponse;
    } catch (error) {
      this.logger.error(`Failed to queue multi-cause evaluation:`, error);
      throw error;
    }
  }

  /**
   * Gets the status and results of an evaluation job by ID.
   *
   * @param jobId - The evaluation job ID to check
   * @returns JobStatusDto - Current status, progress, and results if completed
   */
  @Get('jobs/:jobId')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async getJobStatus(@Param('jobId') jobId: string): Promise<JobStatusDto> {
    this.logger.log(`Received job status request for job ID: ${jobId}`);

    try {
      const jobStatus = await this.evaluationQueueService.getJobStatus(jobId);

      this.logger.log(
        `Job status retrieved for ${jobId}: ${jobStatus.status}${
          jobStatus.progress !== undefined
            ? ` (${jobStatus.progress}% complete)`
            : ''
        }`,
      );

      return jobStatus;
    } catch (error) {
      this.logger.error(`Failed to get job status for ${jobId}:`, error);
      throw error;
    }
  }

  /**
   * Returns detailed evaluation reports from CSV data for specified cause IDs.
   * If no cause IDs provided, returns all available evaluation data.
   *
   * @param query - Optional array of cause IDs to filter results
   * @returns EvaluationDetailedResponseDto - Detailed reports grouped by cause
   */
  @Get('evaluation-detailed')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  getEvaluationDetailed(
    @Query() query: EvaluationDetailedQueryDto,
  ): EvaluationDetailedResponseDto {
    this.logger.log(
      `Received detailed evaluation request for causes: ${query.causeIds?.join(', ') ?? 'all'}`,
    );

    try {
      const csvData = this.csvLoggerService.readEvaluationResults(
        query.causeIds,
      );

      if (csvData.length === 0) {
        return {
          totalCauses: 0,
          totalProjects: 0,
          causes: [],
        };
      }

      // Group data by cause
      const causeGroups = csvData.reduce(
        (acc, row) => {
          acc[row.causeId] ??= {
            causeId: row.causeId,
            causeTitle: row.causeTitle,
            projects: [],
          };
          acc[row.causeId].projects.push(row);
          return acc;
        },
        {} as Record<
          number,
          { causeId: number; causeTitle: string; projects: CsvRowData[] }
        >,
      );

      // Calculate statistics for each cause
      const causes = Object.values(causeGroups).map(group => {
        const scores = group.projects.map((p: CsvRowData) => p.causeScore);
        return {
          causeId: group.causeId,
          causeTitle: group.causeTitle,
          totalProjects: group.projects.length,
          averageScore:
            Math.round(
              (scores.reduce((sum: number, score: number) => sum + score, 0) /
                scores.length) *
                100,
            ) / 100,
          highestScore: Math.max(...scores),
          lowestScore: Math.min(...scores),
          projects: group.projects.map((project: CsvRowData) => ({
            causeId: project.causeId,
            causeTitle: project.causeTitle,
            projectId: project.projectId,
            projectTitle: project.projectTitle,
            causeScore: project.causeScore,
            projectInfoQualityScore: project.projectInfoQualityScore,
            updateRecencyScore: project.updateRecencyScore,
            socialMediaQualityScore: project.socialMediaQualityScore,
            socialMediaRecencyScore: project.socialMediaRecencyScore,
            socialMediaFrequencyScore: project.socialMediaFrequencyScore,
            relevanceToCauseScore: project.relevanceToCauseScore,
            evidenceOfImpactScore: project.evidenceOfImpactScore,
            givPowerRankScore: project.givPowerRankScore,
            evaluationTimestamp: project.evaluationTimestamp,
          })),
        };
      });

      const totalProjects = causes.reduce(
        (sum: number, cause) => sum + cause.totalProjects,
        0,
      );

      this.logger.log(
        `Detailed evaluation completed. Found ${causes.length} causes with ${totalProjects} total projects`,
      );

      return {
        totalCauses: causes.length,
        totalProjects,
        causes,
      };
    } catch (error) {
      this.logger.error('Failed to get detailed evaluation data:', error);
      throw error;
    }
  }
}
