import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
} from 'class-validator';

export enum JobStatusType {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export class JobResponseDto {
  @IsString()
  jobId: string;

  @IsEnum(JobStatusType)
  status: JobStatusType;

  @IsOptional()
  @IsString()
  estimatedDuration?: string;

  @IsOptional()
  @IsNumber()
  queuePosition?: number;
}
