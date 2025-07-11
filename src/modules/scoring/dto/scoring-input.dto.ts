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
   * Existing quality score from Giveth (0-100)
   */
  @IsOptional()
  @IsNumber()
  qualityScore?: number;

  /**
   * GIVpower rank for the project
   */
  @IsOptional()
  @IsNumber()
  givPowerRank?: number;

  /**
   * Total number of projects in the system (for rank normalization)
   */
  @IsOptional()
  @IsNumber()
  totalProjectCount?: number;

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
   * Main category of the cause
   */
  @IsOptional()
  @IsString()
  causeMainCategory?: string;

  /**
   * Sub-categories of the cause
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  causeSubCategories?: string[];

  constructor(data: Partial<ScoringInputDto>) {
    Object.assign(this, data);
  }
}
