import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Logger,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { EvaluationService } from './evaluation.service';
import { EvaluateProjectsRequestDto } from './dto/evaluate-projects-request.dto';
import { EvaluationResultDto } from './dto/evaluation-result.dto';
import { EvaluateMultipleCausesRequestDto } from './dto/evaluate-multiple-causes-request.dto';
import { MultiCauseEvaluationResultDto } from './dto/multi-cause-evaluation-result.dto';
import { EvaluationDetailedQueryDto } from './dto/evaluation-detailed-query.dto';
import { EvaluationDetailedResponseDto } from './dto/evaluation-detailed-response.dto';
import { CsvLoggerService, CsvRowData } from './services/csv-logger.service';

@Controller('evaluate')
export class EvaluationController {
  private readonly logger = new Logger(EvaluationController.name);

  constructor(
    private readonly evaluationService: EvaluationService,
    private readonly csvLoggerService: CsvLoggerService,
  ) {}

  /**
   * Evaluates projects within a cause and returns sorted scores.
   * Uses stored social media posts from database instead of live API calls.
   *
   * @param request - Contains cause details and project IDs to evaluate
   * @returns EvaluationResultDto - Sorted projects with scores and metadata
   */
  @Post('cause')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async evaluateProjects(
    @Body() request: EvaluateProjectsRequestDto,
  ): Promise<EvaluationResultDto> {
    this.logger.log(
      `Received evaluation request for cause ${request.cause.id} (${request.cause.title}) with ${request.projectIds.length} projects`,
    );

    try {
      const result =
        await this.evaluationService.evaluateProjectsWithMetadata(request);

      this.logger.log(
        `Evaluation completed for cause ${request.cause.id}. ` +
          `${result.projectsWithStoredPosts}/${result.totalProjects} projects had stored posts. ` +
          `Duration: ${result.evaluationDuration}ms`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to evaluate projects for cause ${request.cause.id}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Evaluates multiple causes with their associated projects and returns results grouped by cause.
   * Uses stored social media posts from database instead of live API calls.
   *
   * @param request - Contains array of cause evaluation requests
   * @returns MultiCauseEvaluationResultDto - Results grouped by cause with aggregated metadata
   */
  @Post('causes')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async evaluateMultipleCauses(
    @Body() request: EvaluateMultipleCausesRequestDto,
  ): Promise<MultiCauseEvaluationResultDto> {
    this.logger.log(
      `Received multi-cause evaluation request for ${request.causes.length} causes`,
    );

    try {
      const result =
        await this.evaluationService.evaluateMultipleCauses(request);

      this.logger.log(
        `Multi-cause evaluation completed. ${result.successfulCauses}/${result.totalCauses} causes succeeded. ` +
          `Total projects: ${result.totalProjects}, with stored posts: ${result.totalProjectsWithStoredPosts}. ` +
          `Duration: ${result.evaluationDuration}ms`,
      );

      return result;
    } catch (error) {
      this.logger.error(`Failed to evaluate multiple causes:`, error);
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
