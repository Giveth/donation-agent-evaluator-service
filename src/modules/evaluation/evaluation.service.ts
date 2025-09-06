import { Injectable, Logger } from '@nestjs/common';
import pLimit from 'p-limit';
import { DataFetchingService } from '../data-fetching/services/data-fetching.service';
import { ImpactGraphService } from '../data-fetching/services/impact-graph.service';
import { SocialPostStorageService } from '../social-media-storage/services/social-post-storage.service';
import { CsvLoggerService } from './services/csv-logger.service';
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
import {
  UpdateCauseProjectEvaluationDto,
  createUpdateCauseProjectEvaluationDto,
} from '../data-fetching/dto/update-cause-project-evaluation.dto';

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);
  private readonly concurrencyLimit = pLimit(5); // Limit to 5 concurrent cause evaluations
  private readonly projectConcurrencyLimit = pLimit(3); // Limit to 3 concurrent project evaluations

  constructor(
    private readonly dataFetchingService: DataFetchingService,
    private readonly impactGraphService: ImpactGraphService,
    private readonly socialPostStorageService: SocialPostStorageService,
    private readonly scoringService: ScoringService,
    private readonly csvLoggerService: CsvLoggerService,
  ) {}

  /**
   * Evaluates projects within a cause using stored social posts from database
   * instead of direct API calls to Twitter/Farcaster services.
   *
   * @param cause - The cause details
   * @param projects - Array of project objects with power data
   * @returns Promise<ScoredProjectDto[]> - Sorted list of scored projects
   */
  async evaluateProjects(
    cause: CauseDto,
    projects: {
      id: number;
      powerRank?: number;
      totalPower?: number;
    }[],
    highestPowerRank?: number,
  ): Promise<ScoredProjectDto[]> {
    const startTime = Date.now();
    this.logger.log(
      `Starting evaluation for cause ${cause.id} with ${projects.length} projects`,
    );

    // Log project power data structure for debugging
    const powerDataSummary = projects.map(p => ({
      id: p.id,
      powerRank: p.powerRank,
      totalPower: p.totalPower,
    }));
    this.logger.debug(
      `Cause ${cause.id} project power data: ${JSON.stringify(powerDataSummary)}`,
    );

    const scoredProjects: ScoredProjectDto[] = [];

    try {
      // Use highestPowerRank from request instead of fetching it
      if (highestPowerRank == null) {
        this.logger.warn(
          `Highest power rank unavailable for cause ${cause.id} - GIVpower scores will be set to 0 for all projects`,
        );
      } else {
        this.logger.debug(
          `Using highest power rank: ${highestPowerRank} for all projects in cause ${cause.id}`,
        );
      }

      // Extract project IDs for fetching project details
      const projectIds = projects.map(p => p.id);

      // Fetch project details from local database first, fallback to GraphQL
      const projectDetails =
        await this.dataFetchingService.getProjectsByIds(projectIds);

      this.logger.debug(
        `Processing ${projectDetails.length} projects with concurrency limit of 3`,
      );

      // Process projects in parallel with controlled concurrency
      const evaluationPromises = projectDetails.map(project => {
        // Find the power data for this project
        const powerData = projects.find(p => p.id === project.id);

        // Log Givpower data for debugging staging issues
        this.logger.debug(
          `Project ${project.id}: powerRank from request=${powerData?.powerRank}, project.projectPower.powerRank=${project.projectPower?.powerRank}, using powerRank=${powerData?.powerRank}`,
        );

        return this.projectConcurrencyLimit(async () => {
          try {
            const scoredProject = await this.evaluateProject(
              project,
              cause,
              highestPowerRank,
              powerData?.powerRank,
            );
            this.logger.debug(
              `Successfully evaluated project ${project.id} with score ${scoredProject.causeScore}`,
            );
            return scoredProject;
          } catch (error) {
            this.logger.error(
              `Failed to evaluate project ${project.id}:`,
              error,
            );
            // Return zero-score entry for failed evaluations
            return {
              projectId: project.id.toString(),
              projectTitle: project.title,
              causeScore: 0,
              hasStoredPosts: false,
              totalStoredPosts: 0,
              evaluationTimestamp: new Date(),
            };
          }
        });
      });

      // Wait for all project evaluations to complete
      const evaluationResults = await Promise.all(evaluationPromises);
      scoredProjects.push(...evaluationResults);
    } catch (error) {
      this.logger.error(
        `Failed to fetch projects for cause ${cause.id}:`,
        error,
      );
      throw error;
    }

    // Sort by causeScore in descending order
    scoredProjects.sort((a, b) => b.causeScore - a.causeScore);

    const duration = Date.now() - startTime;
    const projectsWithStoredPosts = scoredProjects.filter(
      p => p.hasStoredPosts,
    ).length;
    this.logger.log(
      `Completed evaluation for cause ${cause.id} in ${duration}ms. ` +
        `${projectsWithStoredPosts}/${scoredProjects.length} projects had stored posts.`,
    );

    return scoredProjects;
  }

  /**
   * Evaluates a single project against a cause using stored social posts
   *
   * @param project - The project details
   * @param cause - The cause context
   * @param highestPowerRank - The highest power rank value for scoring normalization, or null if unavailable
   * @param powerRank - The power rank for this specific project
   * @returns Promise<ScoredProjectDto> - The scored project
   */
  private async evaluateProject(
    project: ProjectDetailsDto,
    cause: CauseDto,
    highestPowerRank: number | null | undefined,
    powerRank?: number,
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

    // Log Givpower values being passed to scoring
    this.logger.debug(
      `Project ${project.id}: Passing to scoring - givPowerRank=${powerRank}, topPowerRank=${highestPowerRank}`,
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
      givPowerRank: powerRank, // Use powerRank from request instead of project.givPowerRank
      topPowerRank: highestPowerRank, // Use highestPowerRank from request
      causeTitle: cause.title,
      causeDescription: cause.description,
      causeCategories: cause.categories,
    });

    // Calculate scores using the scoring service
    const { finalScore, breakdown } =
      await this.scoringService.calculateCauseScore(scoringInput);

    // Log final GIVpower scoring result
    this.logger.debug(
      `Project ${project.id}: Final scores - GIVpower score=${breakdown.givPowerRankScore}, overall cause score=${finalScore}`,
    );

    const result = {
      projectId: project.id.toString(),
      projectTitle: project.title,
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
    highestPowerRank?: number,
  ): Promise<EvaluationResultDto> {
    const startTime = Date.now();

    // Log single cause evaluation request for debugging
    this.logger.log(
      `Single cause evaluation: cause=${request.cause.id}, ${request.projects.length} projects, highestPowerRank=${highestPowerRank}`,
    );

    const scoredProjects = await this.evaluateProjects(
      request.cause,
      request.projects,
      highestPowerRank,
    );

    const duration = Date.now() - startTime;
    const projectsWithStoredPosts = scoredProjects.filter(
      p => p.hasStoredPosts,
    ).length;

    const result = {
      data: scoredProjects,
      status: 'success',
      causeId: request.cause.id,
      totalProjects: scoredProjects.length,
      projectsWithStoredPosts,
      evaluationDuration: duration,
      timestamp: new Date(),
    };

    // Send evaluation results to Impact Graph (non-blocking)
    this.sendEvaluationToImpactGraph(request.cause.id, scoredProjects);

    // Log evaluation results to CSV (non-blocking)
    this.csvLoggerService
      .logEvaluationResult(request.cause, result)
      .catch(error => {
        this.logger.warn(
          `Failed to log CSV for cause ${request.cause.id}: ${error.message}`,
        );
      });

    return result;
  }

  /**
   * Helper method to evaluate projects with a pre-fetched highestPowerRank
   * Used by multi-cause evaluation to avoid calling getTopPowerRank multiple times
   *
   * @param request - Contains cause details and project IDs to evaluate
   * @param highestPowerRank - Pre-fetched highest power rank value (or null if unavailable)
   * @returns Promise<EvaluationResultDto> - Evaluation result with metadata
   */
  private async evaluateProjectsWithTopPowerRank(
    request: EvaluateProjectsRequestDto,
    highestPowerRank: number | null,
  ): Promise<EvaluationResultDto> {
    const startTime = Date.now();

    const scoredProjects = await this.evaluateProjects(
      request.cause,
      request.projects,
      highestPowerRank ?? undefined,
    );

    const duration = Date.now() - startTime;
    const projectsWithStoredPosts = scoredProjects.filter(
      p => p.hasStoredPosts,
    ).length;

    const result = {
      data: scoredProjects,
      status: 'success',
      causeId: request.cause.id,
      totalProjects: scoredProjects.length,
      projectsWithStoredPosts,
      evaluationDuration: duration,
      timestamp: new Date(),
    };

    // Send evaluation results to Impact Graph (non-blocking)
    this.sendEvaluationToImpactGraph(request.cause.id, scoredProjects);

    // Log evaluation results to CSV (non-blocking)
    this.csvLoggerService
      .logEvaluationResult(request.cause, result)
      .catch(error => {
        this.logger.warn(
          `Failed to log CSV for cause ${request.cause.id}: ${error.message}`,
        );
      });

    return result;
  }

  /**
   * Evaluates multiple causes with their associated projects in parallel.
   * Returns results grouped by cause with aggregated metadata.
   * Optimized to call getTopPowerRank only once for all causes.
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

    // Use highestPowerRank from request instead of fetching it
    const { highestPowerRank } = request;

    // Log request structure for debugging
    this.logger.log(
      `Multi-cause request: ${totalCauses} causes, highestPowerRank=${highestPowerRank}`,
    );

    if (highestPowerRank == null) {
      this.logger.warn(
        `Highest power rank unavailable for multi-cause evaluation - GIVpower scores will be set to 0 for all projects across ${totalCauses} causes`,
      );
    } else {
      this.logger.debug(
        `Using highest power rank: ${highestPowerRank} for all ${totalCauses} causes in multi-cause evaluation`,
      );
    }

    // Process causes with concurrency control and error isolation
    const causePromises = request.causes.map(causeRequest =>
      this.concurrencyLimit(async () => {
        const causeResult: CauseEvaluationResult = {
          causeId: causeRequest.cause.id,
          causeName: causeRequest.cause.title,
          success: false,
        };

        try {
          // Use the shared highestPowerRank instead of calling evaluateProjectsWithMetadata
          const result = await this.evaluateProjectsWithTopPowerRank(
            causeRequest,
            highestPowerRank ?? null,
          );
          causeResult.result = result;
          causeResult.success = true;

          this.logger.debug(
            `Cause ${causeRequest.cause.id} evaluation completed successfully`,
          );
        } catch (error) {
          causeResult.error =
            (error as Error).message || 'Unknown error occurred';
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

  /**
   * Sends evaluation results to Impact Graph (non-blocking operation)
   * This method runs asynchronously and logs success/failure without affecting the main evaluation flow
   *
   * @param causeId - The cause ID for the evaluation
   * @param scoredProjects - Array of scored projects from the evaluation
   */
  private sendEvaluationToImpactGraph(
    causeId: number,
    scoredProjects: ScoredProjectDto[],
  ): void {
    // Run asynchronously without blocking the main evaluation response
    (async () => {
      try {
        if (scoredProjects.length === 0) {
          this.logger.debug(
            `No scored projects to send to Impact Graph for cause ${causeId}`,
          );
          return;
        }

        // Transform evaluation results to Impact Graph format
        const updates: UpdateCauseProjectEvaluationDto[] = [];

        for (const project of scoredProjects) {
          try {
            const update = createUpdateCauseProjectEvaluationDto(
              causeId,
              project.projectId,
              project.causeScore,
            );
            updates.push(update);
          } catch (error) {
            this.logger.warn(
              `Failed to transform project ${project.projectId} for Impact Graph: ${
                error instanceof Error ? error.message : String(error)
              }`,
            );
          }
        }

        if (updates.length === 0) {
          this.logger.warn(
            `No valid updates to send to Impact Graph for cause ${causeId}`,
          );
          return;
        }

        this.logger.log(
          `Sending ${updates.length} evaluation updates to Impact Graph for cause ${causeId}`,
          {
            causeId,
            projectCount: updates.length,
            averageScore:
              updates.reduce((sum, u) => sum + u.causeScore, 0) /
              updates.length,
          },
        );

        // Send updates to Impact Graph
        const response =
          await this.impactGraphService.bulkUpdateCauseProjectEvaluation(
            updates,
          );

        this.logger.log(
          `Successfully sent evaluation results to Impact Graph for cause ${causeId}`,
          {
            causeId,
            updatedRecords: response.length,
            updates: response.map(r => ({
              id: r.id,
              projectId: r.projectId,
              causeScore: r.causeScore,
            })),
          },
        );
      } catch (error) {
        this.logger.error(
          `Failed to send evaluation results to Impact Graph for cause ${causeId}`,
          {
            error: error instanceof Error ? error.message : String(error),
            causeId,
            projectCount: scoredProjects.length,
          },
        );
      }
    })().catch(error => {
      this.logger.error(
        `Unexpected error in Impact Graph integration for cause ${causeId}`,
        error,
      );
    });
  }
}
