import {
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
  IsDate,
  IsEnum,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

/**
 * Enum for cause status values
 */
export enum CauseStatus {
  REJECTED = 'REJECTED',
  PENDING = 'PENDING',
  CLARIFICATION = 'CLARIFICATION',
  VERIFICATION = 'VERIFICATION',
  ACTIVE = 'ACTIVE',
  DEACTIVE = 'DEACTIVE',
  CANCELLED = 'CANCELLED',
  DRAFTED = 'DRAFTED',
}

/**
 * DTO for basic project information within a cause
 */
export class CauseProjectDto {
  /**
   * Project ID
   */
  @IsNumber()
  id!: number;

  /**
   * Project slug for URL identification
   */
  @IsString()
  slug!: string;

  /**
   * Project title
   */
  @IsString()
  title!: string;

  /**
   * Project status information
   */
  @IsOptional()
  status?: {
    id: number;
    name: string;
    symbol: string;
  };

  constructor(data: {
    id: number;
    slug: string;
    title: string;
    status?: {
      id: number;
      name: string;
      symbol: string;
    };
  }) {
    this.id = data.id;
    this.slug = data.slug;
    this.title = data.title;
    this.status = data.status;
  }
}

/**
 * DTO for Cause details fetched from Giveth backend/Impact-Graph
 * Contains cause information and associated project IDs for evaluation
 */
export class CauseDetailsDto {
  /**
   * Unique cause identifier
   * @example 1
   */
  @IsNumber()
  id!: number;

  /**
   * Display title of the cause
   * @example "Environmental Conservation"
   */
  @IsString()
  title!: string;

  /**
   * Detailed description of the cause and its goals
   * @example "Supporting projects that focus on environmental protection and sustainability initiatives"
   */
  @IsString()
  description!: string;

  /**
   * Main category of the cause
   * @example "Environment"
   */
  @IsString()
  mainCategory!: string;

  /**
   * Array of subcategories for more specific classification
   * @example ["Climate Change", "Wildlife Protection", "Clean Energy"]
   */
  @IsArray()
  @IsString({ each: true })
  subCategories!: string[];

  /**
   * Current status of the cause
   */
  @IsEnum(CauseStatus)
  status!: CauseStatus;

  /**
   * Array of projects associated with this cause
   */
  @IsArray()
  @Type(() => CauseProjectDto)
  projects!: CauseProjectDto[];

  /**
   * Array of project IDs for backward compatibility
   */
  @IsArray()
  @IsNumber({}, { each: true })
  projectIds!: number[];

  /**
   * Number of active projects in this cause
   */
  @IsOptional()
  @IsNumber()
  activeProjectsCount?: number;

  /**
   * Total amount raised for this cause
   */
  @IsOptional()
  @IsNumber()
  totalRaised?: number;

  /**
   * Total amount distributed from this cause
   */
  @IsOptional()
  @IsNumber()
  totalDistributed?: number;

  /**
   * Total amount donated to this cause
   */
  @IsOptional()
  @IsNumber()
  totalDonated?: number;

  /**
   * When the cause was created
   */
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  @Transform(({ value }: { value: string | Date }) => {
    if (typeof value === 'string') {
      return new Date(value);
    }
    return value;
  })
  createdAt?: Date;

  /**
   * When the cause was last updated
   */
  @IsOptional()
  @IsDate()
  @Type(() => Date)
  @Transform(({ value }: { value: string | Date }) => {
    if (typeof value === 'string') {
      return new Date(value);
    }
    return value;
  })
  updatedAt?: Date;

  constructor(data: {
    id: number;
    title: string;
    description: string;
    mainCategory: string;
    subCategories: string[];
    status: CauseStatus;
    projects: CauseProjectDto[];
    activeProjectsCount?: number;
    totalRaised?: number;
    totalDistributed?: number;
    totalDonated?: number;
    createdAt?: Date | string;
    updatedAt?: Date | string;
  }) {
    this.id = data.id;
    this.title = data.title;
    this.description = data.description;
    this.mainCategory = data.mainCategory;
    this.subCategories = data.subCategories;
    this.status = data.status;
    this.projects = data.projects;
    this.projectIds = data.projects.map(p => p.id);
    this.activeProjectsCount = data.activeProjectsCount;
    this.totalRaised = data.totalRaised;
    this.totalDistributed = data.totalDistributed;
    this.totalDonated = data.totalDonated;
    this.createdAt =
      typeof data.createdAt === 'string'
        ? new Date(data.createdAt)
        : data.createdAt;
    this.updatedAt =
      typeof data.updatedAt === 'string'
        ? new Date(data.updatedAt)
        : data.updatedAt;
  }
}

/**
 * Helper function to create a cause details DTO
 * @param cause - The cause data from GraphQL
 * @returns A new CauseDetailsDto instance
 */
export function createCauseDetailsDto(cause: any): CauseDetailsDto {
  const projects =
    cause.projects?.map(
      (project: any) =>
        new CauseProjectDto({
          id: project.id,
          slug: project.slug,
          title: project.title,
          status: project.status,
        }),
    ) ?? [];

  return new CauseDetailsDto({
    id: cause.id,
    title: cause.title,
    description: cause.description,
    mainCategory: cause.mainCategory,
    subCategories: cause.subCategories ?? [],
    status: cause.status as CauseStatus,
    projects,
    activeProjectsCount: cause.activeProjectsCount,
    totalRaised: cause.totalRaised,
    totalDistributed: cause.totalDistributed,
    totalDonated: cause.totalDonated,
    createdAt: cause.createdAt,
    updatedAt: cause.updatedAt,
  });
}
