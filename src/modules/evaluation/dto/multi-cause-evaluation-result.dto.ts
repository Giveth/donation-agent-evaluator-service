import { EvaluationResultDto } from './evaluation-result.dto';

export enum EvaluationStatus {
  SUCCESS = 'success',
  PARTIAL_SUCCESS = 'partial_success',
}

export class CauseEvaluationResult {
  causeId: number;
  causeName: string;
  result?: EvaluationResultDto;
  error?: string;
  success: boolean;
}

export class MultiCauseEvaluationResultDto {
  data: CauseEvaluationResult[];
  status: EvaluationStatus = EvaluationStatus.SUCCESS;

  // Aggregated metadata
  totalCauses: number;
  successfulCauses: number;
  failedCauses: number;
  totalProjects: number;
  totalProjectsWithStoredPosts: number;
  evaluationDuration: number; // in milliseconds
  timestamp: Date;
}
