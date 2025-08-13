import { IsNumber, Min, Max, IsString, IsOptional } from 'class-validator';

/**
 * DTO for LLM assessment results
 * All scores should be between 0 and 100
 */
export class LLMAssessmentDto {
  /**
   * Project information and update quality score (0-100)
   * Evaluates the comprehensiveness, clarity, and professionalism of project description and updates
   */
  @IsNumber()
  @Min(0)
  @Max(100)
  projectInfoQualityScore!: number;

  /**
   * Social media content quality score (0-100)
   * Evaluates the quality, engagement, and professionalism of social media posts
   */
  @IsNumber()
  @Min(0)
  @Max(100)
  socialMediaQualityScore!: number;

  /**
   * Twitter content quality score (0-100)
   * Evaluates the quality of Twitter posts specifically
   */
  @IsNumber()
  @Min(0)
  @Max(100)
  twitterQualityScore!: number;

  /**
   * Farcaster content quality score (0-100)
   * Evaluates the quality of Farcaster posts specifically
   */
  @IsNumber()
  @Min(0)
  @Max(100)
  farcasterQualityScore!: number;

  /**
   * Relevance to cause score (0-100)
   * Evaluates how well the project aligns with the cause's mission and goals
   */
  @IsNumber()
  @Min(0)
  @Max(100)
  relevanceToCauseScore!: number;

  /**
   * Social media relevance to cause score (0-100)
   * Evaluates how well all social media posts (Twitter + Farcaster) align with the cause's mission
   */
  @IsNumber()
  @Min(0)
  @Max(100)
  socialMediaRelevanceScore!: number;

  /**
   * Project data relevance to cause score (0-100)
   * Evaluates how well project information aligns with the cause's mission
   */
  @IsNumber()
  @Min(0)
  @Max(100)
  projectRelevanceScore!: number;

  /**
   * Evidence of social/environmental impact score (0-100)
   * Evaluates evidence of philanthropic action in project updates and social media
   */
  @IsNumber()
  @Min(0)
  @Max(100)
  evidenceOfImpactScore!: number;

  /**
   * Optional reasoning for project info quality score
   */
  @IsOptional()
  @IsString()
  projectInfoQualityReasoning?: string;

  /**
   * Optional reasoning for social media quality score
   */
  @IsOptional()
  @IsString()
  socialMediaQualityReasoning?: string;

  /**
   * Optional reasoning for relevance to cause score
   */
  @IsOptional()
  @IsString()
  relevanceToCauseReasoning?: string;

  /**
   * Optional reasoning for evidence of impact score
   */
  @IsOptional()
  @IsString()
  evidenceOfImpactReasoning?: string;

  constructor(data: Partial<LLMAssessmentDto>) {
    Object.assign(this, data);
  }

  /**
   * Create a zero-score assessment (used when LLM assessment fails)
   */
  static createZeroScores(): LLMAssessmentDto {
    return new LLMAssessmentDto({
      projectInfoQualityScore: 0,
      socialMediaQualityScore: 0,
      twitterQualityScore: 0,
      farcasterQualityScore: 0,
      relevanceToCauseScore: 0,
      socialMediaRelevanceScore: 0,
      projectRelevanceScore: 0,
      evidenceOfImpactScore: 0,
      projectInfoQualityReasoning: 'LLM assessment failed',
      socialMediaQualityReasoning: 'LLM assessment failed',
      relevanceToCauseReasoning: 'LLM assessment failed',
      evidenceOfImpactReasoning: 'LLM assessment failed',
    });
  }

  /**
   * Create a partial assessment when some data is missing
   */
  static createPartialAssessment(
    projectInfoScore: number,
    socialMediaScore: number,
    twitterQualityScore: number,
    farcasterQualityScore: number,
    relevanceScore: number,
    socialMediaRelevanceScore: number,
    projectRelevanceScore: number,
    evidenceOfImpactScore: number,
  ): LLMAssessmentDto {
    return new LLMAssessmentDto({
      projectInfoQualityScore: projectInfoScore,
      socialMediaQualityScore: socialMediaScore,
      twitterQualityScore,
      farcasterQualityScore,
      relevanceToCauseScore: relevanceScore,
      socialMediaRelevanceScore,
      projectRelevanceScore,
      evidenceOfImpactScore,
    });
  }
}
