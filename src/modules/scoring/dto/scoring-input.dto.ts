import {
  IsNumber,
  IsOptional,
  IsArray,
  IsDate,
  IsString,
} from 'class-validator';
import { Type } from 'class-transformer';
import { SocialPostDto } from '../../social-media/dto/social-post.dto';

/**
 * Input parameters for scoring a project
 */
export class ScoringInputDto {
  /**
   * Project ID
   */
  @IsString()
  projectId!: string;

  /**
   * Project title for context
   */
  @IsString()
  projectTitle!: string;

  /**
   * Project description for LLM assessment
   */
  @IsString()
  projectDescription!: string;

  /**
   * Date of the last project update
   */
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  lastUpdateDate?: Date;

  /**
   * Content of the last project update for LLM assessment
   */
  @IsOptional()
  @IsString()
  lastUpdateContent?: string;

  /**
   * Title of the last project update
   */
  @IsOptional()
  @IsString()
  lastUpdateTitle?: string;

  /**
   * Array of recent social media posts
   */
  @IsArray()
  socialPosts!: SocialPostDto[];

  /**
   * GIVpower rank for the project
   */
  @IsOptional()
  @IsNumber()
  givPowerRank?: number;

  /**
   * Top (highest/worst) power rank value for rank normalization
   * When null, GIVpower scoring will be disabled (score = 0)
   */
  @IsOptional()
  @IsNumber()
  topPowerRank?: number | null;

  /**
   * Cause title for relevance assessment
   */
  @IsString()
  causeTitle!: string;

  /**
   * Cause description for relevance assessment
   */
  @IsString()
  causeDescription!: string;

  /**
   * Complete category information for the cause
   */
  @IsOptional()
  @IsArray()
  causeCategories?: Array<{
    category_name: string;
    category_description: string;
    maincategory_title: string;
    maincategory_description: string;
  }>;

  constructor(data: Partial<ScoringInputDto>) {
    Object.assign(this, data);
  }
}
