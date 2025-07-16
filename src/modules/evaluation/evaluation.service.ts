import { Injectable, Logger } from '@nestjs/common';
import pLimit from 'p-limit';
import { DataFetchingService } from '../data-fetching/services/data-fetching.service';
import { SocialPostStorageService } from '../social-media-storage/services/social-post-storage.service';
import { SocialMediaPlatform } from '../social-media/dto/social-post.dto';
import { ProjectDetailsDto } from '../data-fetching/dto/project-details.dto';
import {
  CauseDto,
  EvaluateProjectsRequestDto,
} from './dto/evaluate-projects-request.dto';
import { ScoredProjectDto } from './dto/scored-project.dto';
import { EvaluationResultDto } from './dto/evaluation-result.dto';
import { EvaluateMultipleCausesRequestDto } from './dto/evaluate-multiple-causes-request.dto';
import {
  MultiCauseEvaluationResultDto,
  CauseEvaluationResult,
  EvaluationStatus,
} from './dto/multi-cause-evaluation-result.dto';
import { ScoringService } from '../scoring/scoring.service';
import { ProjectScoreInputsDto } from '../scoring/dto';

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);
  private readonly concurrencyLimit = pLimit(5); // Limit to 5 concurrent cause evaluations

  constructor(
    private readonly dataFetchingService: DataFetchingService,
    private readonly socialPostStorageService: SocialPostStorageService,
    private readonly scoringService: ScoringService,
  ) {}

  /**
   * Evaluates projects within a cause using stored social posts from database
   * instead of direct API calls to Twitter/Farcaster services.
   *
   * @param cause - The cause details
   * @param projectIds - Array of project IDs to evaluate
   * @returns Promise<ScoredProjectDto[]> - Sorted list of scored projects
   */
  async evaluateProjects(
    cause: CauseDto,
    projectIds: number[],
  ): Promise<ScoredProjectDto[]> {
    const startTime = Date.now();
    this.logger.log(
      `Starting evaluation for cause ${cause.id} with ${projectIds.length} projects`,
    );

    const scoredProjects: ScoredProjectDto[] = [];
    let projectsWithStoredPosts = 0;

    try {
      // Fetch project details from local database first, fallback to GraphQL
      const projects =
        await this.dataFetchingService.getProjectsByIds(projectIds);

      for (const project of projects) {
        try {
          const scoredProject = await this.evaluateProject(project, cause);
          scoredProjects.push(scoredProject);

          if (scoredProject.hasStoredPosts) {
            projectsWithStoredPosts++;
          }
        } catch (error) {
          this.logger.error(`Failed to evaluate project ${project.id}:`, error);
          // Continue with other projects, add zero-score entry
          scoredProjects.push({
            projectId: project.id.toString(),
            causeScore: 0,
            hasStoredPosts: false,
            totalStoredPosts: 0,
            evaluationTimestamp: new Date(),
          });
        }
      }

      // Sort by causeScore in descending order
      scoredProjects.sort((a, b) => b.causeScore - a.causeScore);

      const duration = Date.now() - startTime;
      this.logger.log(
        `Completed evaluation for cause ${cause.id} in ${duration}ms. ` +
          `${projectsWithStoredPosts}/${scoredProjects.length} projects had stored posts.`,
      );

      return scoredProjects;
    } catch (error) {
      this.logger.error(
        `Failed to evaluate projects for cause ${cause.id}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Evaluates a single project using stored social posts
   */
  private async evaluateProject(
    project: ProjectDetailsDto,
    cause: CauseDto,
  ): Promise<ScoredProjectDto> {
    this.logger.debug(`Evaluating project ${project.id} (${project.title})`);

    // All projects are eligible for evaluation
    this.logger.debug(`Project ${project.id} proceeding with evaluation`);

    // Fetch stored social posts for this project (database-first approach)

    const [twitterPosts, farcasterPosts] = await Promise.all([
      this.socialPostStorageService.getRecentSocialPosts(
        project.id.toString(),
        10, // limit to 10 posts per platform
        SocialMediaPlatform.TWITTER,
      ),
      this.socialPostStorageService.getRecentSocialPosts(
        project.id.toString(),
        10, // limit to 10 posts per platform
        SocialMediaPlatform.FARCASTER,
      ),
    ]);

    const allSocialPosts = [...twitterPosts, ...farcasterPosts];
    const hasStoredPosts = allSocialPosts.length > 0;
    const lastPostDate =
      allSocialPosts.length > 0
        ? new Date(Math.max(...allSocialPosts.map(p => p.createdAt.getTime())))
        : undefined;

    this.logger.debug(
      `Project ${project.id}: Found ${twitterPosts.length} Twitter posts, ${farcasterPosts.length} Farcaster posts`,
    );

    // Prepare scoring input
    const scoringInput = new ProjectScoreInputsDto({
      projectId: project.id.toString(),
      projectTitle: project.title,
      projectDescription: project.description,
      lastUpdateDate: project.lastUpdateDate,
      lastUpdateContent: project.lastUpdateContent,
      lastUpdateTitle: project.lastUpdateTitle,
      socialPosts: allSocialPosts,
      qualityScore: project.qualityScore,
      givPowerRank: project.givPowerRank,
      causeTitle: cause.title,
      causeDescription: cause.description,
      // Note: causeMainCategory and causeSubCategories would need to be fetched
      // from the full cause details if needed for more accurate scoring
    });

    // Calculate scores using the scoring service
    const { finalScore, breakdown } =
      await this.scoringService.calculateCauseScore(scoringInput);

    const result = {
      projectId: project.id.toString(),
      causeScore: finalScore,
      scoreBreakdown: breakdown,
      hasStoredPosts,
      totalStoredPosts: allSocialPosts.length,
      lastPostDate,
      evaluationTimestamp: new Date(),
    };

    this.logger.debug(`Project ${project.id} evaluation complete:`, {
      causeScore: result.causeScore,
      hasBreakdown: !!result.scoreBreakdown,
      hasStoredPosts: result.hasStoredPosts,
      totalStoredPosts: result.totalStoredPosts,
    });

    return result;
  }

  /**
   * Helper method to create evaluation result with metadata
   */
  async evaluateProjectsWithMetadata(
    request: EvaluateProjectsRequestDto,
  ): Promise<EvaluationResultDto> {
    const startTime = Date.now();

    const scoredProjects = await this.evaluateProjects(
      request.cause,
      request.projectIds,
    );

    const duration = Date.now() - startTime;
    const projectsWithStoredPosts = scoredProjects.filter(
      p => p.hasStoredPosts,
    ).length;

    return {
      data: scoredProjects,
      status: 'success',
      causeId: request.cause.id,
      totalProjects: scoredProjects.length,
      projectsWithStoredPosts,
      evaluationDuration: duration,
      timestamp: new Date(),
    };
  }

  /**
   * Evaluates multiple causes with their associated projects in parallel.
   * Returns results grouped by cause with aggregated metadata.
   *
   * @param request - Contains array of cause evaluation requests
   * @returns Promise<MultiCauseEvaluationResultDto> - Results grouped by cause
   */
  async evaluateMultipleCauses(
    request: EvaluateMultipleCausesRequestDto,
  ): Promise<MultiCauseEvaluationResultDto> {
    const startTime = Date.now();
    const totalCauses = request.causes.length;

    this.logger.log(
      `Starting multi-cause evaluation for ${totalCauses} causes`,
    );

    // Process causes with concurrency control and error isolation
    const causePromises = request.causes.map(causeRequest =>
      this.concurrencyLimit(async () => {
        const causeResult: CauseEvaluationResult = {
          causeId: causeRequest.cause.id,
          causeName: causeRequest.cause.title,
          success: false,
        };

        try {
          const result = await this.evaluateProjectsWithMetadata(causeRequest);
          causeResult.result = result;
          causeResult.success = true;

          this.logger.debug(
            `Cause ${causeRequest.cause.id} evaluation completed successfully`,
          );
        } catch (error) {
          causeResult.error = error.message ?? 'Unknown error occurred';
          causeResult.success = false;

          this.logger.error(
            `Failed to evaluate cause ${causeRequest.cause.id}:`,
            error,
          );
        }

        return causeResult;
      }),
    );

    // Wait for all cause evaluations to complete
    const causeResults = await Promise.all(causePromises);

    // Calculate aggregated metadata
    const successfulCauses = causeResults.filter(r => r.success);
    const failedCauses = causeResults.filter(r => !r.success);

    const totalProjects = successfulCauses.reduce(
      (sum, r) => sum + (r.result?.totalProjects ?? 0),
      0,
    );

    const totalProjectsWithStoredPosts = successfulCauses.reduce(
      (sum, r) => sum + (r.result?.projectsWithStoredPosts ?? 0),
      0,
    );

    const evaluationDuration = Date.now() - startTime;

    const result: MultiCauseEvaluationResultDto = {
      data: causeResults,
      status:
        failedCauses.length === 0
          ? EvaluationStatus.SUCCESS
          : EvaluationStatus.PARTIAL_SUCCESS,
      totalCauses,
      successfulCauses: successfulCauses.length,
      failedCauses: failedCauses.length,
      totalProjects,
      totalProjectsWithStoredPosts,
      evaluationDuration,
      timestamp: new Date(),
    };

    this.logger.log(
      `Multi-cause evaluation completed. ${successfulCauses.length}/${totalCauses} causes succeeded. ` +
        `Duration: ${evaluationDuration}ms`,
    );

    return result;
  }
}
