import { ScoringInputDto } from './scoring-input.dto';

/**
 * Input parameters for scoring a project within a cause.
 * This DTO contains all data needed for scoring a single project including
 * relevant fields from ProjectDetailsDto, CauseDetailsDto, and SocialPostDto[].
 *
 * Note: This is an alias for ScoringInputDto to maintain naming consistency
 * with the task specifications while preserving existing functionality.
 */
export class ProjectScoreInputsDto extends ScoringInputDto {
  constructor(data: Partial<ProjectScoreInputsDto>) {
    super(data);
  }
}

// Export ScoringInputDto as an alias for backward compatibility
export { ScoringInputDto as ProjectScoreInputsDtoAlias };
