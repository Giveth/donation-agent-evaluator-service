import { Injectable, Logger } from '@nestjs/common';
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
import { ScoringService } from '../scoring/scoring.service';
import { ProjectScoreInputsDto } from '../scoring/dto';

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

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

    // Check if project is eligible for evaluation
    const statusName = project.status?.name ?? 'unknown';
    if (project.status && !this.isProjectEligible(statusName)) {
      this.logger.warn(
        `Project ${project.id} is not eligible for evaluation (status: ${statusName})`,
      );
      return {
        projectId: project.id.toString(),
        causeScore: 0,
        hasStoredPosts: false,
        totalStoredPosts: 0,
        evaluationTimestamp: new Date(),
      };
    }

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

    return {
      projectId: project.id.toString(),
      causeScore: finalScore,
      scoreBreakdown: breakdown,
      hasStoredPosts,
      totalStoredPosts: allSocialPosts.length,
      lastPostDate,
      evaluationTimestamp: new Date(),
    };
  }

  /**
   * Check if project is eligible for evaluation based on status
   */
  private isProjectEligible(status: string): boolean {
    const eligibleStatuses = ['active', 'verified', 'draft'];
    return eligibleStatuses.includes(status.toLowerCase());
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
      totalProjects: scoredProjects.length,
      projectsWithStoredPosts,
      evaluationDuration: duration,
      timestamp: new Date(),
    };
  }
}
