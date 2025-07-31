export class EvaluationDetailedProjectDto {
  causeId: number;
  causeTitle: string;
  projectId: string;
  projectTitle: string;
  causeScore: number;
  projectInfoQualityScore: number;
  updateRecencyScore: number;
  socialMediaQualityScore: number;
  socialMediaRecencyScore: number;
  socialMediaFrequencyScore: number;
  relevanceToCauseScore: number;
  evidenceOfImpactScore: number;
  givPowerRankScore: number;
  evaluationTimestamp: string;
}

export class EvaluationDetailedCauseDto {
  causeId: number;
  causeTitle: string;
  totalProjects: number;
  averageScore: number;
  highestScore: number;
  lowestScore: number;
  projects: EvaluationDetailedProjectDto[];
}

export class EvaluationDetailedResponseDto {
  totalCauses: number;
  totalProjects: number;
  causes: EvaluationDetailedCauseDto[];
}
