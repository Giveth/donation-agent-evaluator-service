import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum JobType {
  TWEET_FETCH = 'tweet_fetch',
  FARCASTER_FETCH = 'farcaster_fetch',
  PROJECT_SYNC = 'project_sync',
  SINGLE_CAUSE_EVALUATION = 'single_cause_evaluation',
  MULTI_CAUSE_EVALUATION = 'multi_cause_evaluation',
}

export enum JobStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

@Entity('scheduled_jobs')
@Index(['status', 'scheduledFor'])
@Index(['scheduledFor'])
export class ScheduledJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id' })
  projectId: string;

  @Column({
    name: 'job_type',
    type: 'enum',
    enum: JobType,
  })
  jobType: JobType;

  @Column({ name: 'scheduled_for', type: 'timestamp' })
  scheduledFor: Date;

  @Column({
    name: 'status',
    type: 'enum',
    enum: JobStatus,
    default: JobStatus.PENDING,
  })
  status: JobStatus;

  @Column({ name: 'processed_at', type: 'timestamp', nullable: true })
  processedAt?: Date;

  @Column({ name: 'error', type: 'text', nullable: true })
  error?: string;

  @Column({ name: 'attempts', type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
