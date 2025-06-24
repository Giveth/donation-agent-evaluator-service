import { ScoredProjectDto } from './scored-project.dto';

export class EvaluationResultDto {
  data: ScoredProjectDto[];
  status: string = 'success';

  // Additional metadata
  totalProjects: number;
  projectsWithStoredPosts: number;
  evaluationDuration?: number; // in milliseconds
  timestamp: Date;
}
