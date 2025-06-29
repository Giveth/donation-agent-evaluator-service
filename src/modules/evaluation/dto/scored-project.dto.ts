import { CauseScoreBreakdownDto } from '../../scoring/dto';

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
