import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ScoringInputDto,
  ProjectScoreInputsDto,
  ScoringWeightsDto,
  LLMAssessmentDto,
  CauseScoreBreakdownDto,
} from './dto';
import { LLMService } from '../llm-integration/llm.service';
import {
  SocialMediaPlatform,
  SocialPostDto,
} from '../social-media/dto/social-post.dto';

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
   * Uses ProjectScoreInputsDto and returns finalScore
   */
  async calculateCauseScore(inputs: ProjectScoreInputsDto): Promise<{
    finalScore: number;
    breakdown: CauseScoreBreakdownDto;
  }> {
    const result = await this.calculateCauseScoreInternal(inputs);
    return {
      finalScore: result.causeScore,
      breakdown: result.breakdown,
    };
  }

  /**
   * Internal method for calculating cause score (backward compatibility)
   */
  private async calculateCauseScoreInternal(input: ScoringInputDto): Promise<{
    causeScore: number;
    breakdown: CauseScoreBreakdownDto;
  }> {
    this.logger.debug(`Calculating cause score for project ${input.projectId}`);

    try {
      // Get LLM assessments for quality and relevance
      const llmAssessment = await this.performLLMAssessment(input);
      this.logger.debug('Input Log Values', input);
      // Calculate individual score components
      const breakdown: CauseScoreBreakdownDto = {
        projectInfoQualityScore: llmAssessment.projectInfoQualityScore,
        updateRecencyScore: this.calculateUpdateRecencyScore(
          input.lastUpdateDate,
        ),
        socialMediaQualityScore:
          this.calculatePlatformSpecificSocialMediaScore(llmAssessment),
        socialMediaRecencyScore: this.calculateSocialMediaRecencyScore(
          input.socialPosts,
        ),
        socialMediaFrequencyScore: this.calculateSocialMediaFrequencyScore(
          input.socialPosts,
        ),
        relevanceToCauseScore:
          this.calculateCombinedRelevanceScore(llmAssessment),
        evidenceOfImpactScore: llmAssessment.evidenceOfImpactScore,
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
        evidenceOfImpactScore: 0,
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

      // Separate posts by platform for platform-specific evaluation
      const twitterPosts = recentPosts.filter(
        post => post.platform === SocialMediaPlatform.TWITTER,
      );
      const farcasterPosts = recentPosts.filter(
        post => post.platform === SocialMediaPlatform.FARCASTER,
      );

      // Format category information for better LLM understanding
      const categoryInfo =
        input.causeCategories
          ?.map(
            cat =>
              `- ${cat.category_name} (${cat.category_description}) - Main Category: ${cat.maincategory_title} (${cat.maincategory_description})`,
          )
          .join('\n') ?? 'No categories specified';

      const userPrompt = `Please evaluate the following project for a charitable cause:

CAUSE INFORMATION:
Title: ${input.causeTitle}
Description: ${input.causeDescription}
Categories:
${categoryInfo}

PROJECT INFORMATION:
Title: ${input.projectTitle}
Description: ${input.projectDescription}

LATEST UPDATE:
Title: ${input.lastUpdateTitle ?? 'No recent update'}
Content: ${input.lastUpdateContent ?? 'No recent update'}
Date: ${input.lastUpdateDate?.toISOString() ?? 'Unknown'}

TWITTER POSTS:
${twitterPosts.length > 0 ? JSON.stringify(twitterPosts, null, 2) : 'No recent Twitter activity'}

FARCASTER POSTS:
${farcasterPosts.length > 0 ? JSON.stringify(farcasterPosts, null, 2) : 'No recent Farcaster activity'}

Please provide scores for:

1. PROJECT INFO QUALITY (0-100): Evaluate the quality, completeness, and professionalism of the project description and updates. Consider clarity, detail, transparency, and communication quality.
   SCORING RUBRIC:
   - 80-100: Exceptional quality - very clear, detailed, professional, transparent
   - 60-79: Strong quality - clear and well-structured with good detail
   - 40-59: Moderate quality - adequate information but could be clearer
   - 20-39: Weak quality - limited information, unclear or unprofessional
   - 0-19: Poor quality - very limited, confusing, or unprofessional content

2. SOCIAL MEDIA QUALITY (0-100): Overall social media content quality score (combination of Twitter and Farcaster).
   SCORING RUBRIC:
   - 80-100: Exceptional content - highly engaging, professional, valuable to followers
   - 60-79: Strong content - good engagement, professional tone, informative
   - 40-59: Moderate content - adequate posts but could be more engaging
   - 20-39: Weak content - limited engagement, inconsistent quality
   - 0-19: Poor content - low quality, irrelevant, or unprofessional posts

3. TWITTER QUALITY (0-100): Evaluate the quality of Twitter content specifically. Consider engagement, professionalism, and value provided. If no Twitter activity, score 0.

4. FARCASTER QUALITY (0-100): Evaluate the quality of Farcaster content specifically. Consider engagement, professionalism, and value provided. If no Farcaster activity, score 0.

5. SOCIAL MEDIA RELEVANCE (0-100): Evaluate how well ALL social media posts (Twitter + Farcaster combined) align with the cause's goals or mission as stated in the cause description and the cause's categories. If no social media activity, score 0.
   RELEVANCE SCORING RUBRIC:
   - 80-100: Exceptional alignment - directly supports cause mission with clear evidence
   - 60-79: Strong alignment - closely matches cause goals with good evidence  
   - 40-59: Moderate alignment - some connection but not perfectly aligned
   - 20-39: Weak alignment - minimal connection to cause
   - 0-19: No meaningful alignment - unrelated to cause

6. PROJECT RELEVANCE (0-100): Evaluate how well the project information aligns with the cause's goals or mission as stated in the cause description and the causes's categories. Base your assessment on: project title, project description, latest update title, and latest update content. Be generous with scoring if project genuinely works toward cause goals.
   RELEVANCE SCORING RUBRIC:
   - 80-100: Exceptional alignment - directly supports cause mission with clear evidence
   - 60-79: Strong alignment - closely matches cause goals with good evidence  
   - 40-59: Moderate alignment - some connection but not perfectly aligned
   - 20-39: Weak alignment - minimal connection to cause
   - 0-19: No meaningful alignment - unrelated to cause

7. EVIDENCE OF IMPACT (0–100): Evaluate the project’s demonstrated results and progress toward positive change included in their project updates, Twitter posts and/or Farcaster posts. Scope of impact includes:  
- Social or environmental impact (measurable benefits to people, communities, or ecosystems).  
- Philanthropic action (charitable activities, donations, volunteer initiatives).  
- Mission-aligned action (contributions toward the goals or vision stated in the Cause description, even if not strictly social/environmental).  

  EVIDENCE OF IMPACT SCORING RUBRIC:  
  - 80–100: Exceptional impact – clear, documented, substantial evidence of positive change or mission advancement, strongly aligned with Cause goals.  
  - 60–79: Strong impact – good evidence of meaningful results or mission-aligned contributions.  
  - 40–59: Moderate impact – some evidence of positive change or alignment with Cause goals.  
  - 20–39: Weak impact – minimal, vague, or indirect evidence of change or alignment.  
  - 0–19: No meaningful impact – no evidence of positive change or mission advancement.  


Respond in JSON format:
{
  "projectInfoQualityScore": <number>,
  "socialMediaQualityScore": <number>,
  "twitterQualityScore": <number>,
  "farcasterQualityScore": <number>,
  "socialMediaRelevanceScore": <number>,
  "projectRelevanceScore": <number>,
  "evidenceOfImpactScore": <number>,
  "projectInfoQualityReasoning": "<brief explanation>",
  "socialMediaQualityReasoning": "<brief explanation>",
  "projectRelevanceReasoning": "<brief explanation>",
  "evidenceOfImpactReasoning": "<brief explanation>"
}`;

      // Log the full prompt being sent to LLM
      this.logger.log('=== LLM PROMPT BEING SENT ===');
      this.logger.log('System Prompt:', systemPrompt);
      this.logger.log('User Prompt:', userPrompt);
      this.logger.log('=== END LLM PROMPT ===');

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

      // Log the full LLM response
      this.logger.log('=== LLM RESPONSE RECEIVED ===');
      this.logger.log('Raw Response:', content);
      this.logger.log('=== END LLM RESPONSE ===');

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
   * Returns 0 when totalProjectCount is null (indicating getTopPowerRank query failed)
   */
  private calculateGivPowerRankScore(
    _givPowerRank?: number,
    _totalProjectCount?: number | null,
  ): number {
    // TODO: Re-enable GIVpower scoring when Impact Graph is fixed
    // Currently returning 0 for all projects due to Impact Graph issues
    return 0;

    // Original implementation commented out until Impact Graph is fixed:
    // // Return 0 if top power rank query failed (indicated by null totalProjectCount)
    // if (totalProjectCount === null) {
    //   this.logger.debug(
    //     'GIVpower scoring disabled - totalProjectCount is null (getTopPowerRank query failed)',
    //   );
    //   return 0;
    // }

    // // Return 0 if project has no GIVpower rank
    // if (!givPowerRank) {
    //   return 0;
    // }

    // // Return 0 if totalProjectCount is not available (shouldn't happen with new implementation)
    // if (!totalProjectCount) {
    //   this.logger.warn(
    //     'GIVpower scoring disabled - totalProjectCount is undefined',
    //   );
    //   return 0;
    // }

    // // Normalize rank to percentile (lower rank is better)
    // // Top 10% get 90-100 score, bottom 10% get 0-10 score
    // const percentile = (totalProjectCount - givPowerRank) / totalProjectCount;
    // const score = percentile * 100;

    // return Math.round(Math.max(0, Math.min(100, score)));
  }

  /**
   * Calculate platform-specific social media quality score
   * Twitter 50%, Farcaster 50%
   */
  private calculatePlatformSpecificSocialMediaScore(
    llmAssessment: LLMAssessmentDto,
  ): number {
    const twitterWeight = 0.5;
    const farcasterWeight = 0.5;

    const platformSpecificScore =
      llmAssessment.twitterQualityScore * twitterWeight +
      llmAssessment.farcasterQualityScore * farcasterWeight;

    return Math.round(Math.max(0, Math.min(100, platformSpecificScore)));
  }

  /**
   * Calculate combined relevance to cause score
   * Social Media 50%, Project 50%
   */
  private calculateCombinedRelevanceScore(
    llmAssessment: LLMAssessmentDto,
  ): number {
    const socialMediaWeight = 0.5;
    const projectWeight = 0.5;

    const combinedScore =
      llmAssessment.socialMediaRelevanceScore * socialMediaWeight +
      llmAssessment.projectRelevanceScore * projectWeight;

    return Math.round(Math.max(0, Math.min(100, combinedScore)));
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
      breakdown.evidenceOfImpactScore * weights.evidenceOfImpact +
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
        evidenceOfImpact:
          Number(this.configService.get('SCORING_WEIGHT_EVIDENCE_OF_IMPACT')) ||
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
