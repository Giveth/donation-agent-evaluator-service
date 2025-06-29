import { IsNumber, Min, Max, IsString, IsOptional } from 'class-validator';

/**
 * DTO for text quality assessment results from LLM
 * Used to evaluate the quality of project descriptions, updates, and other textual content
 */
export class TextQualityAssessmentDto {
  /**
   * Quality score from 0-100
   * Evaluates clarity, comprehensiveness, professionalism, and appeal of the text
   */
  @IsNumber()
  @Min(0)
  @Max(100)
  score!: number;

  /**
   * Optional reasoning from LLM explaining the score
   */
  @IsOptional()
  @IsString()
  reasoning?: string;

  constructor(data: Partial<TextQualityAssessmentDto>) {
    Object.assign(this, data);
  }

  /**
   * Create a fallback assessment when LLM evaluation fails
   * Returns a neutral score with explanation
   */
  static createFallback(
    reason: string = 'LLM assessment failed',
  ): TextQualityAssessmentDto {
    return new TextQualityAssessmentDto({
      score: 50, // Neutral score on failure
      reasoning: reason,
    });
  }

  /**
   * Create assessment from raw score and optional reasoning
   */
  static fromScore(
    score: number,
    reasoning?: string,
  ): TextQualityAssessmentDto {
    return new TextQualityAssessmentDto({
      score: Math.max(0, Math.min(100, score)), // Ensure score is within bounds
      reasoning,
    });
  }

  /**
   * Convert to plain object for return values
   */
  toObject(): { score: number; reasoning?: string } {
    return {
      score: this.score,
      ...(this.reasoning && { reasoning: this.reasoning }),
    };
  }
}
