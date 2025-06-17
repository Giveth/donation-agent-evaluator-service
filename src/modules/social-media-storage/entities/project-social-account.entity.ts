import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { StoredSocialPost } from './stored-social-post.entity';

@Entity('project_social_accounts')
@Index(['projectId'], { unique: true })
export class ProjectSocialAccount {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'project_id', unique: true })
  projectId: string;

  // Project basic information
  @Column({ name: 'title', type: 'varchar', length: 255 })
  title: string;

  @Column({ name: 'slug', type: 'varchar', length: 255 })
  slug: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'project_status', type: 'varchar', length: 100 })
  projectStatus: string;

  @Column({ name: 'verified', type: 'boolean', default: false })
  verified: boolean;

  // Project metrics
  @Column({
    name: 'quality_score',
    type: 'decimal',
    precision: 5,
    scale: 2,
    nullable: true,
  })
  qualityScore?: number;

  @Column({ name: 'giv_power_rank', type: 'integer', nullable: true })
  givPowerRank?: number;

  @Column({
    name: 'total_donations',
    type: 'decimal',
    precision: 15,
    scale: 2,
    default: 0,
  })
  totalDonations: number;

  @Column({ name: 'total_reactions', type: 'integer', default: 0 })
  totalReactions: number;

  // Project update information
  @Column({ name: 'last_update_date', type: 'timestamp', nullable: true })
  lastUpdateDate?: Date;

  @Column({ name: 'last_update_content', type: 'text', nullable: true })
  lastUpdateContent?: string;

  // Cause relationships
  @Column({ name: 'causes_ids', type: 'jsonb', nullable: true })
  causesIds?: number[];

  // Social media handles
  @Column({ name: 'twitter_handle', nullable: true })
  twitterHandle?: string;

  @Column({ name: 'farcaster_username', nullable: true })
  farcasterUsername?: string;

  @Column({ name: 'last_twitter_fetch', type: 'timestamp', nullable: true })
  lastTwitterFetch?: Date;

  @Column({ name: 'last_farcaster_fetch', type: 'timestamp', nullable: true })
  lastFarcasterFetch?: Date;

  @Column({
    name: 'latest_twitter_post_timestamp',
    type: 'timestamp',
    nullable: true,
  })
  latestTwitterPostTimestamp?: Date;

  @Column({
    name: 'latest_farcaster_post_timestamp',
    type: 'timestamp',
    nullable: true,
  })
  latestFarcasterPostTimestamp?: Date;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => StoredSocialPost, socialPost => socialPost.projectAccount)
  socialPosts: StoredSocialPost[];
}
