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
   * Relevance to cause score (0-100)
   * Evaluates how well the project aligns with the cause's mission and goals
   */
  @IsNumber()
  @Min(0)
  @Max(100)
  relevanceToCauseScore!: number;

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
      relevanceToCauseScore: 0,
      projectInfoQualityReasoning: 'LLM assessment failed',
      socialMediaQualityReasoning: 'LLM assessment failed',
      relevanceToCauseReasoning: 'LLM assessment failed',
    });
  }

  /**
   * Create a partial assessment when some data is missing
   */
  static createPartialAssessment(
    projectInfoScore: number,
    socialMediaScore: number,
    relevanceScore: number,
  ): LLMAssessmentDto {
    return new LLMAssessmentDto({
      projectInfoQualityScore: projectInfoScore,
      socialMediaQualityScore: socialMediaScore,
      relevanceToCauseScore: relevanceScore,
    });
  }
}
