import {
  Controller,
  Post,
  Body,
  Logger,
  ValidationPipe,
  UsePipes,
} from '@nestjs/common';
import { EvaluationService } from './evaluation.service';
import { EvaluateProjectsRequestDto } from './dto/evaluate-projects-request.dto';
import { EvaluationResultDto } from './dto/evaluation-result.dto';

@Controller('evaluate')
export class EvaluationController {
  private readonly logger = new Logger(EvaluationController.name);

  constructor(private readonly evaluationService: EvaluationService) {}

  /**
   * Evaluates projects within a cause and returns sorted scores.
   * Uses stored social media posts from database instead of live API calls.
   *
   * @param request - Contains cause details and project IDs to evaluate
   * @returns EvaluationResultDto - Sorted projects with scores and metadata
   */
  @Post('projects')
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
}
