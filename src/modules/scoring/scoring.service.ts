import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ScoringInputDto,
  ScoringWeightsDto,
  LLMAssessmentDto,
  CauseScoreBreakdownDto,
} from './dto';
import { LLMService } from '../llm-integration/llm.service';
import { SocialPostDto } from '../social-media/dto/social-post.dto';

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);
  private readonly weights: ScoringWeightsDto;

  // Configurable decay rates and thresholds
  private readonly updateRecencyDecayDays: number;
  private readonly socialRecencyDecayDays: number;
  private readonly socialFrequencyDays: number;
  private readonly minPostsForFullFrequencyScore: number;

  constructor(
    private readonly configService: ConfigService,
    private readonly llmService: LLMService,
  ) {
    // Initialize weights from config or use defaults
    this.weights = this.initializeWeights();

    // Initialize decay rates and thresholds from config
    this.updateRecencyDecayDays = this.configService.get<number>(
      'SCORING_UPDATE_RECENCY_DECAY_DAYS',
      30, // Default: 30 days for 50% score
    );

    this.socialRecencyDecayDays = this.configService.get<number>(
      'SCORING_SOCIAL_RECENCY_DECAY_DAYS',
      14, // Default: 14 days for 50% score
    );

    this.socialFrequencyDays = this.configService.get<number>(
      'SCORING_SOCIAL_FREQUENCY_DAYS',
      30, // Default: Consider posts from last 30 days
    );

    this.minPostsForFullFrequencyScore = this.configService.get<number>(
      'SCORING_MIN_POSTS_FOR_FULL_FREQUENCY',
      8, // Default: 8 posts in 30 days for full score
    );

    this.logger.log(
      'ScoringService initialized with weights:',
      this.weights.toObject(),
    );
  }

  /**
   * Calculate the complete cause score for a project
   */
  async calculateCauseScore(input: ScoringInputDto): Promise<{
    causeScore: number;
    breakdown: CauseScoreBreakdownDto;
  }> {
    this.logger.debug(`Calculating cause score for project ${input.projectId}`);

    try {
      // Get LLM assessments for quality and relevance
      const llmAssessment = await this.performLLMAssessment(input);

      // Calculate individual score components
      const breakdown: CauseScoreBreakdownDto = {
        projectInfoQualityScore: llmAssessment.projectInfoQualityScore,
        updateRecencyScore: this.calculateUpdateRecencyScore(
          input.lastUpdateDate,
        ),
        socialMediaQualityScore: llmAssessment.socialMediaQualityScore,
        socialMediaRecencyScore: this.calculateSocialMediaRecencyScore(
          input.socialPosts,
        ),
        socialMediaFrequencyScore: this.calculateSocialMediaFrequencyScore(
          input.socialPosts,
        ),
        relevanceToCauseScore: llmAssessment.relevanceToCauseScore,
        givPowerRankScore: this.calculateGivPowerRankScore(
          input.givPowerRank,
          input.totalProjectCount,
        ),
      };

      // Calculate weighted total score
      const causeScore = this.calculateWeightedScore(breakdown);

      this.logger.debug(
        `Project ${input.projectId} scored ${causeScore} with breakdown:`,
        breakdown,
      );

      return { causeScore, breakdown };
    } catch (error) {
      this.logger.error(
        `Failed to calculate cause score for project ${input.projectId}:`,
        error,
      );

      // Return zero scores on error
      const breakdown: CauseScoreBreakdownDto = {
        projectInfoQualityScore: 0,
        updateRecencyScore: 0,
        socialMediaQualityScore: 0,
        socialMediaRecencyScore: 0,
        socialMediaFrequencyScore: 0,
        relevanceToCauseScore: 0,
        givPowerRankScore: 0,
      };

      return { causeScore: 0, breakdown };
    }
  }

  /**
   * Perform LLM assessment for quality and relevance scores
   */
  private async performLLMAssessment(
    input: ScoringInputDto,
  ): Promise<LLMAssessmentDto> {
    try {
      // Prepare social media content for assessment
      const recentPosts = input.socialPosts
        .slice(0, 10) // Limit to 10 most recent posts
        .map(post => ({
          platform: post.platform,
          content: post.text,
          createdAt: post.createdAt,
        }));

      // Create the assessment prompt
      const systemPrompt = `You are an expert evaluator for charitable projects. 
You will assess projects based on three criteria and provide numerical scores from 0-100 for each.
Be objective and consistent in your scoring. Consider professionalism, clarity, impact, and engagement.`;

      const userPrompt = `Please evaluate the following project for a charitable cause:

CAUSE INFORMATION:
Title: ${input.causeTitle}
Description: ${input.causeDescription}
Category: ${input.causeMainCategory ?? 'General'}
Subcategories: ${input.causeSubCategories?.join(', ') ?? 'None'}

PROJECT INFORMATION:
Title: ${input.projectTitle}
Description: ${input.projectDescription}

LATEST UPDATE:
Title: ${input.lastUpdateTitle ?? 'No recent update'}
Content: ${input.lastUpdateContent ?? 'No recent update'}
Date: ${input.lastUpdateDate?.toISOString() ?? 'Unknown'}

RECENT SOCIAL MEDIA POSTS:
${recentPosts.length > 0 ? JSON.stringify(recentPosts, null, 2) : 'No recent social media activity'}

Please provide scores for:

1. PROJECT INFO QUALITY (0-100): Evaluate the quality, completeness, and professionalism of the project description and updates. Consider clarity, detail, transparency, and communication quality.

2. SOCIAL MEDIA QUALITY (0-100): Evaluate the quality of social media content. Consider engagement, professionalism, frequency of updates, and value provided to followers. If no social media activity, score 0.

3. RELEVANCE TO CAUSE (0-100): Evaluate how well the project aligns with the cause's mission and goals. Consider direct impact, thematic alignment, and contribution to the cause's objectives.

Respond in JSON format:
{
  "projectInfoQualityScore": <number>,
  "socialMediaQualityScore": <number>,
  "relevanceToCauseScore": <number>,
  "projectInfoQualityReasoning": "<brief explanation>",
  "socialMediaQualityReasoning": "<brief explanation>",
  "relevanceToCauseReasoning": "<brief explanation>"
}`;

      const response = await this.llmService.createChatCompletion(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        {
          temperature: 0.3, // Lower temperature for more consistent scoring
          max_tokens: 1000,
          response_format: { type: 'json_object' },
        },
      );

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from LLM');
      }

      const assessment = JSON.parse(content) as LLMAssessmentDto;
      return new LLMAssessmentDto(assessment);
    } catch (error) {
      this.logger.error('LLM assessment failed:', error);
      return LLMAssessmentDto.createZeroScores();
    }
  }

  /**
   * Calculate update recency score (0-100)
   * Uses exponential decay based on days since last update
   */
  private calculateUpdateRecencyScore(lastUpdateDate?: Date): number {
    if (!lastUpdateDate) {
      return 0;
    }

    const daysSinceUpdate = this.getDaysSince(lastUpdateDate);

    // Exponential decay: score = 100 * e^(-k * days)
    // k is calculated so that score = 50 at decayDays
    const k = Math.log(2) / this.updateRecencyDecayDays;
    const score = 100 * Math.exp(-k * daysSinceUpdate);

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  /**
   * Calculate social media recency score (0-100)
   * Based on the most recent post across all platforms
   */
  private calculateSocialMediaRecencyScore(posts: SocialPostDto[]): number {
    if (posts.length === 0) {
      return 0;
    }

    // Find the most recent post
    const mostRecentPost = posts.reduce((latest, post) =>
      post.createdAt > latest.createdAt ? post : latest,
    );

    const daysSincePost = this.getDaysSince(mostRecentPost.createdAt);

    // Exponential decay similar to update recency
    const k = Math.log(2) / this.socialRecencyDecayDays;
    const score = 100 * Math.exp(-k * daysSincePost);

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  /**
   * Calculate social media frequency score (0-100)
   * Based on posting frequency in the recent period
   */
  private calculateSocialMediaFrequencyScore(posts: SocialPostDto[]): number {
    if (posts.length === 0) {
      return 0;
    }

    // Filter posts within the frequency period
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.socialFrequencyDays);

    const recentPosts = posts.filter(post => post.createdAt >= cutoffDate);
    const postCount = recentPosts.length;

    // Linear scoring up to the minimum posts threshold
    const score = (postCount / this.minPostsForFullFrequencyScore) * 100;

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  /**
   * Calculate GIVpower rank score (0-100)
   * Lower rank = higher score
   */
  private calculateGivPowerRankScore(
    givPowerRank?: number,
    totalProjectCount?: number,
  ): number {
    if (!givPowerRank) {
      return 0;
    }

    // If we don't know total project count, use a reasonable default
    const totalProjects = totalProjectCount ?? 1000;

    // Normalize rank to percentile (lower rank is better)
    // Top 10% get 90-100 score, bottom 10% get 0-10 score
    const percentile = (totalProjects - givPowerRank) / totalProjects;
    const score = percentile * 100;

    return Math.round(Math.max(0, Math.min(100, score)));
  }

  /**
   * Calculate the weighted total score
   */
  private calculateWeightedScore(breakdown: CauseScoreBreakdownDto): number {
    const weights = this.weights.toObject();

    const weightedScore =
      breakdown.projectInfoQualityScore * weights.projectInfoQuality +
      breakdown.updateRecencyScore * weights.updateRecency +
      breakdown.socialMediaQualityScore * weights.socialMediaQuality +
      breakdown.socialMediaRecencyScore * weights.socialMediaRecency +
      breakdown.socialMediaFrequencyScore * weights.socialMediaFrequency +
      breakdown.relevanceToCauseScore * weights.relevanceToCause +
      breakdown.givPowerRankScore * weights.givPowerRank;

    return Math.round(Math.max(0, Math.min(100, weightedScore)));
  }

  /**
   * Calculate days between a date and now
   */
  private getDaysSince(date: Date): number {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  /**
   * Initialize scoring weights from configuration
   */
  private initializeWeights(): ScoringWeightsDto {
    try {
      // Check if custom weight percentages are provided in config
      const percentages = {
        projectInfoQuality:
          Number(
            this.configService.get('SCORING_WEIGHT_PROJECT_INFO_QUALITY'),
          ) || undefined,
        updateRecency:
          Number(this.configService.get('SCORING_WEIGHT_UPDATE_RECENCY')) ||
          undefined,
        socialMediaQuality:
          Number(
            this.configService.get('SCORING_WEIGHT_SOCIAL_MEDIA_QUALITY'),
          ) || undefined,
        socialMediaRecency:
          Number(
            this.configService.get('SCORING_WEIGHT_SOCIAL_MEDIA_RECENCY'),
          ) || undefined,
        socialMediaFrequency:
          Number(
            this.configService.get('SCORING_WEIGHT_SOCIAL_MEDIA_FREQUENCY'),
          ) || undefined,
        relevanceToCause:
          Number(this.configService.get('SCORING_WEIGHT_RELEVANCE_TO_CAUSE')) ||
          undefined,
        givPowerRank:
          Number(this.configService.get('SCORING_WEIGHT_GIVPOWER_RANK')) ||
          undefined,
      };

      // If any custom percentages are provided, create weights from percentages
      if (Object.values(percentages).some(val => val !== undefined)) {
        return ScoringWeightsDto.createFromPercentages(percentages);
      }
    } catch (error) {
      this.logger.error('Failed to load custom weight percentages:', error);
      throw error; // Re-throw to fail fast if configuration is invalid
    }

    return ScoringWeightsDto.createDefault();
  }
}
