import { IsString, IsOptional, IsEnum, IsInt, Min, Max } from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { SocialMediaPlatform } from '../../social-media/dto/social-post.dto';

/**
 * Query DTO for retrieving social media posts for multiple projects
 */
export class GetSocialPostsQueryDto {
  /**
   * Comma-separated list of project IDs
   * @example "project1,project2,project3"
   */
  @IsString()
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.trim();
    }
    return value;
  })
  projectIds!: string;

  /**
   * Optional platform filter
   * @example "twitter"
   */
  @IsOptional()
  @IsEnum(SocialMediaPlatform)
  platform?: SocialMediaPlatform;

  /**
   * Maximum number of posts per project per platform
   * @example 5
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  /**
   * Helper method to get parsed project IDs array
   */
  getParsedProjectIds(): string[] {
    return this.projectIds
      .split(',')
      .map(id => id.trim())
      .filter(id => id.length > 0);
  }
}
