import { IsString, IsOptional, IsNumber } from 'class-validator';

export class JobResponseDto {
  @IsString()
  jobId: string;

  @IsString()
  status: 'queued' | 'processing' | 'completed' | 'failed';

  @IsOptional()
  @IsString()
  estimatedDuration?: string;

  @IsOptional()
  @IsNumber()
  queuePosition?: number;
}
