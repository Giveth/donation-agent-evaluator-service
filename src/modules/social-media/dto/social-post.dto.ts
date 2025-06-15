import { IsString, IsOptional, IsDate, IsUrl, IsEnum } from 'class-validator';
import { Transform, Type } from 'class-transformer';

/**
 * Enum for supported social media platforms
 */
export enum SocialMediaPlatform {
  TWITTER = 'twitter',
  FARCASTER = 'farcaster',
}

/**
 * DTO for standardized social media posts from different platforms.
 * This DTO ensures consistent data structure for posts from Twitter and Farcaster.
 */
export class SocialPostDto {
  /**
   * Optional post ID from the platform
   * @example "1234567890123456789"
   */
  @IsOptional()
  @IsString()
  id?: string;

  /**
   * The text content of the social media post
   * @example "Check out our latest project update! We've made significant progress on environmental conservation efforts."
   */
  @IsString()
  text!: string;

  /**
   * The date when the post was created
   * @example "2024-01-15T10:30:00.000Z"
   */
  @IsDate()
  @Type(() => Date)
  @Transform(({ value }: { value: string | Date }) => {
    if (typeof value === 'string') {
      return new Date(value);
    }
    return value;
  })
  createdAt!: Date;

  /**
   * The platform where the post was published
   * @example "twitter"
   */
  @IsEnum(SocialMediaPlatform)
  platform!: SocialMediaPlatform;

  /**
   * Optional URL to the original post
   * @example "https://twitter.com/username/status/1234567890123456789"
   */
  @IsOptional()
  @IsUrl()
  url?: string;

  constructor(data: {
    id?: string;
    text: string;
    createdAt: Date | string;
    platform: SocialMediaPlatform;
    url?: string;
  }) {
    this.id = data.id;
    this.text = data.text;
    this.createdAt =
      typeof data.createdAt === 'string'
        ? new Date(data.createdAt)
        : data.createdAt;
    this.platform = data.platform;
    this.url = data.url;
  }
}

/**
 * Helper function to create a social post DTO
 * @param post - The social post data
 * @returns A new SocialPostDto instance
 */
export function createSocialPostDto(post: {
  id?: string;
  text: string;
  createdAt: Date | string;
  platform: SocialMediaPlatform;
  url?: string;
}): SocialPostDto {
  return new SocialPostDto(post);
}
