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

  // Project metrics
  @Column({ name: 'giv_power_rank', type: 'integer', nullable: true })
  givPowerRank?: number;

  // Project update information
  @Column({ name: 'last_update_date', type: 'timestamp', nullable: true })
  lastUpdateDate?: Date;

  @Column({ name: 'last_update_content', type: 'text', nullable: true })
  lastUpdateContent?: string;

  @Column({
    name: 'last_update_title',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  lastUpdateTitle?: string;

  // Social media URLs
  @Column({ name: 'x_url', nullable: true })
  xUrl?: string;

  @Column({ name: 'farcaster_url', nullable: true })
  farcasterUrl?: string;

  @Column({ name: 'last_x_fetch', type: 'timestamp', nullable: true })
  lastXFetch?: Date;

  @Column({ name: 'last_farcaster_fetch', type: 'timestamp', nullable: true })
  lastFarcasterFetch?: Date;

  @Column({
    name: 'latest_x_post_timestamp',
    type: 'timestamp',
    nullable: true,
  })
  latestXPostTimestamp?: Date | null;

  @Column({
    name: 'latest_farcaster_post_timestamp',
    type: 'timestamp',
    nullable: true,
  })
  latestFarcasterPostTimestamp?: Date | null;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => StoredSocialPost, socialPost => socialPost.projectAccount)
  socialPosts: StoredSocialPost[];
}
