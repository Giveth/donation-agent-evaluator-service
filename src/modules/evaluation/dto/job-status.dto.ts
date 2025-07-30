import { IsString, IsOptional, IsNumber, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { JobResponseDto } from './job-response.dto';
import { EvaluationResultDto } from './evaluation-result.dto';
import { MultiCauseEvaluationResultDto } from './multi-cause-evaluation-result.dto';

export class JobStatusDto extends JobResponseDto {
  @IsOptional()
  @IsNumber()
  progress?: number; // 0-100%

  @IsOptional()
  result?: EvaluationResultDto | MultiCauseEvaluationResultDto;

  @IsOptional()
  @IsString()
  error?: string;

  @IsOptional()
  @IsDateString()
  @Type(() => Date)
  startedAt?: Date;

  @IsOptional()
  @IsDateString()
  @Type(() => Date)
  completedAt?: Date;
}
