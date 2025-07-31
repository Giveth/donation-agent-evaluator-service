import { IsString, IsOptional, IsNumber } from 'class-validator';

export enum JobStatusType {
  QUEUED = 'queued',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

export class JobResponseDto {
  @IsString()
  jobId: string;

  @IsString()
  status: JobStatusType;

  @IsOptional()
  @IsString()
  estimatedDuration?: string;

  @IsOptional()
  @IsNumber()
  queuePosition?: number;
}
