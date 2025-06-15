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
