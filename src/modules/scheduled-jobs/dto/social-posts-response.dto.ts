import { SocialPostDto } from '../../social-media/dto/social-post.dto';

/**
 * Project information included in social posts response
 */
export class ProjectInfoDto {
  title: string;
  slug: string;
  xUrl?: string;
  farcasterUrl?: string;
}

/**
 * Post counts by platform for a project
 */
export class PostCountsDto {
  twitter: number;
  farcaster: number;
}

/**
 * Posts grouped by platform for a project
 */
export class ProjectPostsDto {
  twitter: SocialPostDto[];
  farcaster: SocialPostDto[];
}

/**
 * Individual project's social posts with metadata
 */
export class ProjectSocialPostsDto {
  projectId: string;
  projectInfo: ProjectInfoDto;
  posts: ProjectPostsDto;
  postCounts: PostCountsDto;
}

/**
 * Response data for social posts retrieval
 */
export class SocialPostsDataDto {
  totalProjects: number;
  projectsWithPosts: number;
  projects: ProjectSocialPostsDto[];
}

/**
 * Complete response for social posts retrieval endpoint
 */
export class SocialPostsResponseDto {
  success: boolean;
  data: SocialPostsDataDto;
  correlationId: string;
  timestamp: string;
}
