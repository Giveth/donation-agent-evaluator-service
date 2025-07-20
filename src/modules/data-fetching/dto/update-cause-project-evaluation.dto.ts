import { IsNumber, Min, Max, IsInt } from 'class-validator';

/**
 * DTO for updating cause project evaluation scores in Impact Graph
 * Maps to UpdateCauseProjectEvaluationInput GraphQL input type
 */
export class UpdateCauseProjectEvaluationDto {
  @IsNumber()
  @IsInt()
  @Min(1)
  causeId: number;

  @IsNumber()
  @IsInt()
  @Min(1)
  projectId: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  causeScore: number;
}

/**
 * Response type from Impact Graph bulk update mutation
 */
export interface BulkUpdateCauseProjectEvaluationResponse {
  id: string;
  causeId: number;
  projectId: number;
  causeScore: number;
}

/**
 * Factory function to create UpdateCauseProjectEvaluationDto from evaluation result
 * @param causeId - The cause ID
 * @param projectId - The project ID (as string from evaluation)
 * @param causeScore - The calculated cause score
 * @returns ValidatedDTO instance
 */
export function createUpdateCauseProjectEvaluationDto(
  causeId: number,
  projectId: string,
  causeScore: number,
): UpdateCauseProjectEvaluationDto {
  const dto = new UpdateCauseProjectEvaluationDto();
  dto.causeId = causeId;
  dto.projectId = parseInt(projectId, 10);
  dto.causeScore = Math.round(causeScore * 100) / 100; // Round to 2 decimal places

  // Validate the parsed project ID
  if (isNaN(dto.projectId) || dto.projectId <= 0) {
    throw new Error(
      `Invalid project ID: ${projectId}. Must be a positive integer.`,
    );
  }

  // Validate cause score range
  if (dto.causeScore < 0 || dto.causeScore > 100) {
    throw new Error(
      `Invalid cause score: ${causeScore}. Must be between 0 and 100.`,
    );
  }

  return dto;
}
