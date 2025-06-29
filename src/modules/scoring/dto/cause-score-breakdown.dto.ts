/**
 * Breakdown of the CauseScore components showing how each criterion
 * contributed to the final score. Each component represents a weighted
 * portion of the total 100-point CauseScore.
 */
export interface CauseScoreBreakdownDto {
  /**
   * Score from project information and update quality assessment (0-20 points, 20% weight)
   */
  projectInfoQualityScore: number;

  /**
   * Score from project update recency assessment (0-10 points, 10% weight)
   */
  updateRecencyScore: number;

  /**
   * Score from social media content quality assessment (0-15 points, 15% weight)
   */
  socialMediaQualityScore: number;

  /**
   * Score from social media posting recency assessment (0-5 points, 5% weight)
   */
  socialMediaRecencyScore: number;

  /**
   * Score from social media posting frequency assessment (0-5 points, 5% weight)
   */
  socialMediaFrequencyScore: number;

  /**
   * Score from project relevance to cause assessment (0-30 points, 30% weight)
   */
  relevanceToCauseScore: number;

  /**
   * Score from GIVpower rank assessment (0-15 points, 15% weight)
   */
  givPowerRankScore: number;
}
