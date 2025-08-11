import {
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
  IsDate,
  IsEnum,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
// Note: ProjectDetailsDto imported dynamically to avoid circular dependency

/**
 * Cause status enum based on GraphQL schema
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
 * Listing status enum based on GraphQL schema
 */
export enum ListingStatus {
  NotReviewed = 'NotReviewed',
  Listed = 'Listed',
  NotListed = 'NotListed',
}

/**
 * DTO for cause owner information
 */
export class CauseOwnerDto {
  @IsNumber()
  id!: number;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  walletAddress?: string;

  constructor(data: { id: number; name?: string; walletAddress?: string }) {
    this.id = data.id;
    this.name = data.name;
    this.walletAddress = data.walletAddress;
  }
}

/**
 * DTO for Cause details fetched from Giveth backend/Impact-Graph
 * Contains all cause information needed for project synchronization
 */
export class CauseDetailsDto {
  @IsNumber()
  id!: number;

  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  projectType?: string;

  @IsNumber()
  chainId!: number;

  @IsString()
  fundingPoolAddress!: string;

  @IsString()
  causeId!: string;

  @IsOptional()
  @IsString()
  depositTxHash?: string;

  @IsOptional()
  @IsNumber()
  depositTxChainId?: number;

  @IsOptional()
  @IsNumber()
  givpowerRank?: number;

  @IsOptional()
  @IsNumber()
  instantBoostingRank?: number;

  @IsString()
  mainCategory!: string;

  @IsArray()
  @IsString({ each: true })
  subCategories!: string[];

  @IsEnum(CauseStatus)
  status!: CauseStatus;

  @IsEnum(ListingStatus)
  listingStatus!: ListingStatus;

  @IsOptional()
  @IsNumber()
  activeProjectsCount?: number;

  @IsNumber()
  totalDistributed!: number;

  @IsNumber()
  totalDonated!: number;

  @IsDate()
  @Type(() => Date)
  @Transform(({ value }: { value: string | Date }) => {
    if (typeof value === 'string') {
      return new Date(value);
    }
    return value;
  })
  createdAt!: Date;

  @IsDate()
  @Type(() => Date)
  @Transform(({ value }: { value: string | Date }) => {
    if (typeof value === 'string') {
      return new Date(value);
    }
    return value;
  })
  updatedAt!: Date;

  @IsOptional()
  @Type(() => CauseOwnerDto)
  owner?: CauseOwnerDto;

  @IsOptional()
  @IsArray()
  projects?: any[]; // Project data will be processed separately to avoid circular dependency

  constructor(data: {
    id: number;
    title: string;
    description: string;
    projectType?: string;
    chainId: number;
    fundingPoolAddress: string;
    causeId: string;
    depositTxHash?: string;
    depositTxChainId?: number;
    givpowerRank?: number;
    instantBoostingRank?: number;
    mainCategory: string;
    subCategories: string[];
    status: CauseStatus;
    listingStatus: ListingStatus;
    activeProjectsCount?: number;
    totalDistributed: number;
    totalDonated: number;
    createdAt: Date | string;
    updatedAt: Date | string;
    owner?: any;
    projects?: any[];
  }) {
    this.id = data.id;
    this.title = data.title;
    this.description = data.description;
    this.projectType = data.projectType;
    this.chainId = data.chainId;
    this.fundingPoolAddress = data.fundingPoolAddress;
    this.causeId = data.causeId;
    this.depositTxHash = data.depositTxHash;
    this.depositTxChainId = data.depositTxChainId;
    this.givpowerRank = data.givpowerRank;
    this.instantBoostingRank = data.instantBoostingRank;
    this.mainCategory = data.mainCategory;
    this.subCategories = data.subCategories;
    this.status = data.status;
    this.listingStatus = data.listingStatus;
    this.activeProjectsCount = data.activeProjectsCount;
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
    this.owner = data.owner ? new CauseOwnerDto(data.owner) : undefined;
    this.projects = data.projects; // Raw project data - will be processed by service layer
  }
}

/**
 * Simplified DTO for cause with project slugs only
 * Used when we only need project slugs for individual fetching
 */
export class CauseProjectSlugsDto {
  @IsNumber()
  id!: number;

  @IsString()
  title!: string;

  @IsString()
  description!: string;

  @IsArray()
  @IsString({ each: true })
  projectSlugs!: string[];

  constructor(data: {
    id: number;
    title: string;
    description: string;
    projects: Array<{ slug: string; title: string; status?: any }>;
  }) {
    this.id = data.id;
    this.title = data.title;
    this.description = data.description;
    // Extract only the slugs from projects and filter out projects without slugs
    this.projectSlugs = data.projects
      .filter(project => project.slug && project.slug.trim() !== '')
      .map(project => project.slug);
  }
}

/**
 * Factory function to create CauseDetailsDto from GraphQL response
 * @param data - Raw GraphQL response data
 * @returns CauseDetailsDto instance
 */
export function createCauseDetailsDto(data: any): CauseDetailsDto {
  return new CauseDetailsDto({
    id: data.id,
    title: data.title,
    description: data.description,
    projectType: data.projectType,
    chainId: data.chainId,
    fundingPoolAddress: data.fundingPoolAddress,
    causeId: data.causeId,
    depositTxHash: data.depositTxHash,
    depositTxChainId: data.depositTxChainId,
    givpowerRank: data.givpowerRank,
    instantBoostingRank: data.instantBoostingRank,
    mainCategory: data.mainCategory,
    subCategories: data.subCategories ?? [],
    status: data.status,
    listingStatus: data.listingStatus,
    activeProjectsCount: data.activeProjectsCount,
    totalDistributed: data.totalDistributed,
    totalDonated: data.totalDonated,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    owner: data.owner,
    projects: data.projects,
  });
}

/**
 * Factory function to create CauseProjectSlugsDto from GraphQL response
 * @param data - Raw GraphQL response data
 * @returns CauseProjectSlugsDto instance
 */
export function createCauseProjectSlugsDto(data: any): CauseProjectSlugsDto {
  return new CauseProjectSlugsDto({
    id: data.id,
    title: data.title,
    description: data.description,
    projects: data.projects ?? [],
  });
}
