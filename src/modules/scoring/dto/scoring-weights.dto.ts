import { IsNumber, Min, Max } from 'class-validator';

/**
 * Configurable weights for each scoring component
 * All weights should sum to 1.0 (100%)
 */
export class ScoringWeightsDto {
  /**
   * Weight for project information and update quality (LLM-assessed)
   * Default: 0.15 (15%)
   */
  @IsNumber()
  @Min(0)
  @Max(1)
  projectInfoQualityWeight: number = 0.15;

  /**
   * Weight for update recency score
   * Default: 0.10 (10%)
   */
  @IsNumber()
  @Min(0)
  @Max(1)
  updateRecencyWeight: number = 0.1;

  /**
   * Weight for social media content quality (LLM-assessed)
   * Default: 0.10 (10%)
   */
  @IsNumber()
  @Min(0)
  @Max(1)
  socialMediaQualityWeight: number = 0.1;

  /**
   * Weight for social media posting recency
   * Default: 0.05 (5%)
   */
  @IsNumber()
  @Min(0)
  @Max(1)
  socialMediaRecencyWeight: number = 0.05;

  /**
   * Weight for social media posting frequency
   * Default: 0.05 (5%)
   */
  @IsNumber()
  @Min(0)
  @Max(1)
  socialMediaFrequencyWeight: number = 0.05;

  /**
   * Weight for relevance to cause (LLM-assessed)
   * Default: 0.20 (20%)
   */
  @IsNumber()
  @Min(0)
  @Max(1)
  relevanceToCauseWeight: number = 0.2;

  /**
   * Weight for evidence of social/environmental impact (LLM-assessed)
   * Default: 0.20 (20%)
   */
  @IsNumber()
  @Min(0)
  @Max(1)
  evidenceOfImpactWeight: number = 0.2;

  /**
   * Weight for GIVpower rank
   * Default: 0.15 (15%)
   */
  @IsNumber()
  @Min(0)
  @Max(1)
  givPowerRankWeight: number = 0.15;

  /**
   * Validate that all weights sum to 1.0
   */
  validateWeights(): boolean {
    const sum =
      this.projectInfoQualityWeight +
      this.updateRecencyWeight +
      this.socialMediaQualityWeight +
      this.socialMediaRecencyWeight +
      this.socialMediaFrequencyWeight +
      this.relevanceToCauseWeight +
      this.evidenceOfImpactWeight +
      this.givPowerRankWeight;

    // Allow for small floating-point rounding errors
    return Math.abs(sum - 1.0) < 0.001;
  }

  /**
   * Get weights as an object for easy access
   */
  toObject() {
    return {
      projectInfoQuality: this.projectInfoQualityWeight,
      updateRecency: this.updateRecencyWeight,
      socialMediaQuality: this.socialMediaQualityWeight,
      socialMediaRecency: this.socialMediaRecencyWeight,
      socialMediaFrequency: this.socialMediaFrequencyWeight,
      relevanceToCause: this.relevanceToCauseWeight,
      evidenceOfImpact: this.evidenceOfImpactWeight,
      givPowerRank: this.givPowerRankWeight,
    };
  }

  /**
   * Create default weights
   */
  static createDefault(): ScoringWeightsDto {
    return new ScoringWeightsDto();
  }

  /**
   * Create custom weights from percentages (ensures they sum to 100%)
   */
  static createFromPercentages(percentages: {
    projectInfoQuality?: number;
    updateRecency?: number;
    socialMediaQuality?: number;
    socialMediaRecency?: number;
    socialMediaFrequency?: number;
    relevanceToCause?: number;
    evidenceOfImpact?: number;
    givPowerRank?: number;
  }): ScoringWeightsDto {
    // Convert percentages to decimal weights
    const weights = {
      projectInfoQualityWeight: (percentages.projectInfoQuality ?? 15) / 100,
      updateRecencyWeight: (percentages.updateRecency ?? 10) / 100,
      socialMediaQualityWeight: (percentages.socialMediaQuality ?? 10) / 100,
      socialMediaRecencyWeight: (percentages.socialMediaRecency ?? 5) / 100,
      socialMediaFrequencyWeight: (percentages.socialMediaFrequency ?? 5) / 100,
      relevanceToCauseWeight: (percentages.relevanceToCause ?? 20) / 100,
      evidenceOfImpactWeight: (percentages.evidenceOfImpact ?? 20) / 100,
      givPowerRankWeight: (percentages.givPowerRank ?? 15) / 100,
    };

    // Calculate actual sum including defaults for missing values
    let actualSum = 0;
    actualSum += percentages.projectInfoQuality ?? 15;
    actualSum += percentages.updateRecency ?? 10;
    actualSum += percentages.socialMediaQuality ?? 10;
    actualSum += percentages.socialMediaRecency ?? 5;
    actualSum += percentages.socialMediaFrequency ?? 5;
    actualSum += percentages.relevanceToCause ?? 20;
    actualSum += percentages.evidenceOfImpact ?? 20;
    actualSum += percentages.givPowerRank ?? 15;

    if (Math.abs(actualSum - 100) > 0.1) {
      throw new Error(
        `Scoring weight percentages must sum to exactly 100%. Current sum: ${actualSum}%`,
      );
    }

    const dto = new ScoringWeightsDto();
    Object.assign(dto, weights);

    return dto;
  }

  /**
   * Create custom weights (ensures they sum to 1.0)
   */
  static createCustom(weights: Partial<ScoringWeightsDto>): ScoringWeightsDto {
    const dto = new ScoringWeightsDto();
    Object.assign(dto, weights);

    if (!dto.validateWeights()) {
      throw new Error('Scoring weights must sum to 1.0 (100%)');
    }

    return dto;
  }
}
