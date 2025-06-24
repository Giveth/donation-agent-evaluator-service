import { Injectable, Logger } from '@nestjs/common';
import { DataFetchingService } from '../data-fetching/services/data-fetching.service';
import { SocialPostStorageService } from '../social-media-storage/services/social-post-storage.service';
import { SocialMediaPlatform } from '../social-media/dto/social-post.dto';
import { ProjectDetailsDto } from '../data-fetching/dto/project-details.dto';
import {
  CauseDto,
  EvaluateProjectsRequestDto,
} from './dto/evaluate-projects-request.dto';
import {
  ScoredProjectDto,
  CauseScoreBreakdownDto,
} from './dto/scored-project.dto';
import { EvaluationResultDto } from './dto/evaluation-result.dto';

@Injectable()
export class EvaluationService {
  private readonly logger = new Logger(EvaluationService.name);

  constructor(
    private readonly dataFetchingService: DataFetchingService,
    private readonly socialPostStorageService: SocialPostStorageService,
    // TODO: Inject LLMService when Phase 8 is implemented
    // TODO: Inject ScoringService when Phase 9 is implemented
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
    _cause: CauseDto,
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

    // TODO: When LLMIntegrationModule is implemented (Phase 8), add:
    // - LLM assessment of project description and update quality
    // - LLM assessment of social media content quality
    // - LLM assessment of relevance to cause

    // TODO: When ScoringModule is implemented (Phase 9), add:
    // - Calculated scoring based on rubric weights
    // - Recency calculations for updates and social posts
    // - Frequency calculations for social media activity
    // - GIVpower rank scoring

    // For now, provide basic placeholder scoring
    const causeScore = this.calculatePlaceholderScore(
      project,
      twitterPosts.length,
      farcasterPosts.length,
      lastPostDate,
    );

    const scoreBreakdown: CauseScoreBreakdownDto = {
      projectInfoQualityScore: 0, // TODO: LLM assessment
      updateRecencyScore: this.calculateUpdateRecencyScore(
        project.lastUpdateDate,
      ),
      socialMediaQualityScore: 0, // TODO: LLM assessment
      socialMediaRecencyScore: this.calculateSocialRecencyScore(lastPostDate),
      socialMediaFrequencyScore: this.calculateSocialFrequencyScore(
        twitterPosts.length,
        farcasterPosts.length,
      ),
      relevanceToCauseScore: 0, // TODO: LLM assessment
      givPowerRankScore: this.calculateGivPowerScore(project.givPowerRank),
    };

    return {
      projectId: project.id.toString(),
      causeScore,
      scoreBreakdown,
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
   * Placeholder scoring until full LLM and Scoring modules are implemented
   */
  private calculatePlaceholderScore(
    project: ProjectDetailsDto,
    twitterPostsCount: number,
    farcasterPostsCount: number,
    lastPostDate?: Date,
  ): number {
    let score = 0;

    // Basic scoring based on available data
    if (project.qualityScore) {
      score += Math.min(project.qualityScore * 10, 25); // Up to 25 points
    }

    if (project.givPowerRank) {
      score += this.calculateGivPowerScore(project.givPowerRank);
    }

    score += this.calculateUpdateRecencyScore(project.lastUpdateDate);
    score += this.calculateSocialRecencyScore(lastPostDate);
    score += this.calculateSocialFrequencyScore(
      twitterPostsCount,
      farcasterPostsCount,
    );

    return Math.min(Math.round(score), 100);
  }

  /**
   * Calculate score based on update recency (10% of total score)
   */
  private calculateUpdateRecencyScore(lastUpdateDate?: Date): number {
    if (!lastUpdateDate) return 0;

    const daysSinceUpdate = Math.floor(
      (Date.now() - lastUpdateDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysSinceUpdate <= 7) return 10;
    if (daysSinceUpdate <= 30) return 7;
    if (daysSinceUpdate <= 60) return 4;
    if (daysSinceUpdate <= 90) return 2;
    return 0;
  }

  /**
   * Calculate score based on social media post recency (5% of total score)
   */
  private calculateSocialRecencyScore(lastPostDate?: Date): number {
    if (!lastPostDate) return 0;

    const daysSincePost = Math.floor(
      (Date.now() - lastPostDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (daysSincePost <= 3) return 5;
    if (daysSincePost <= 7) return 3;
    if (daysSincePost <= 30) return 1;
    return 0;
  }

  /**
   * Calculate score based on social media posting frequency (5% of total score)
   */
  private calculateSocialFrequencyScore(
    twitterCount: number,
    farcasterCount: number,
  ): number {
    const totalPosts = twitterCount + farcasterCount;

    if (totalPosts >= 15) return 5;
    if (totalPosts >= 10) return 4;
    if (totalPosts >= 5) return 3;
    if (totalPosts >= 1) return 2;
    return 0;
  }

  /**
   * Calculate score based on GIVpower rank (25% of total score)
   */
  private calculateGivPowerScore(givPowerRank?: number): number {
    if (!givPowerRank) return 0;

    // Assuming rank is 1-based (lower number = better rank)
    // This is a placeholder formula - actual implementation depends on GIVpower rank definition
    if (givPowerRank <= 10) return 25;
    if (givPowerRank <= 50) return 20;
    if (givPowerRank <= 100) return 15;
    if (givPowerRank <= 500) return 10;
    if (givPowerRank <= 1000) return 5;
    return 2;
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
