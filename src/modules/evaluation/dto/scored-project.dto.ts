export interface CauseScoreBreakdownDto {
  projectInfoQualityScore: number;
  updateRecencyScore: number;
  socialMediaQualityScore: number;
  socialMediaRecencyScore: number;
  socialMediaFrequencyScore: number;
  relevanceToCauseScore: number;
  givPowerRankScore: number;
}

export class ScoredProjectDto {
  projectId: string;
  causeScore: number;
  scoreBreakdown?: CauseScoreBreakdownDto;

  // Additional metadata for debugging/transparency
  hasStoredPosts?: boolean;
  totalStoredPosts?: number;
  lastPostDate?: Date;
  evaluationTimestamp: Date;
}
