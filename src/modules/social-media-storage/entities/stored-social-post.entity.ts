import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ProjectSocialAccount } from './project-social-account.entity';

@Entity('stored_social_posts')
@Index(['postId'], { unique: true })
@Index(['postTimestamp'])
@Index(['projectAccountId', 'postTimestamp'])
export class StoredSocialPost {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'post_id', unique: true })
  postId: string;

  @Column({ name: 'content', type: 'text' })
  content: string;

  @Column({ name: 'url', nullable: true })
  url?: string;

  @Column({ name: 'post_timestamp', type: 'timestamp' })
  postTimestamp: Date;

  @Column({ name: 'fetched_at', type: 'timestamp' })
  fetchedAt: Date;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata?: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'project_account_id' })
  projectAccountId: string;

  @ManyToOne(() => ProjectSocialAccount, account => account.socialPosts, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'project_account_id' })
  projectAccount: ProjectSocialAccount;
}
