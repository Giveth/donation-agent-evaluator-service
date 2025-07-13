import {
  IsString,
  IsNumber,
  IsArray,
  IsOptional,
  IsDate,
  IsBoolean,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

/**
 * DTO for project status information
 */
export class ProjectStatusDto {
  @IsNumber()
  id!: number;

  @IsString()
  symbol!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  constructor(data: {
    id: number;
    symbol: string;
    name: string;
    description?: string;
  }) {
    this.id = data.id;
    this.symbol = data.symbol;
    this.name = data.name;
    this.description = data.description;
  }
}

/**
 * DTO for project admin user information
 */
export class ProjectAdminDto {
  @IsNumber()
  id!: number;

  @IsOptional()
  @IsString()
  firstName?: string;

  @IsOptional()
  @IsString()
  lastName?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  walletAddress?: string;

  @IsOptional()
  @IsString()
  avatar?: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  location?: string;

  constructor(data: {
    id: number;
    firstName?: string;
    lastName?: string;
    name?: string;
    walletAddress?: string;
    avatar?: string;
    url?: string;
    location?: string;
  }) {
    this.id = data.id;
    this.firstName = data.firstName;
    this.lastName = data.lastName;
    this.name = data.name;
    this.walletAddress = data.walletAddress;
    this.avatar = data.avatar;
    this.url = data.url;
    this.location = data.location;
  }
}

/**
 * DTO for project social media URLs matching Impact Graph structure
 */
export class ProjectSocialMediaDto {
  @IsOptional()
  @IsString()
  X?: string;

  @IsOptional()
  @IsString()
  FARCASTER?: string;

  @IsOptional()
  @IsString()
  website?: string;

  @IsOptional()
  @IsString()
  youtube?: string;

  @IsOptional()
  @IsString()
  linkedin?: string;

  @IsOptional()
  @IsString()
  instagram?: string;

  @IsOptional()
  @IsString()
  facebook?: string;

  @IsOptional()
  @IsString()
  discord?: string;

  @IsOptional()
  @IsString()
  telegram?: string;

  @IsOptional()
  @IsString()
  github?: string;

  constructor(data: {
    X?: string;
    FARCASTER?: string;
    website?: string;
    youtube?: string;
    linkedin?: string;
    instagram?: string;
    facebook?: string;
    discord?: string;
    telegram?: string;
    github?: string;
  }) {
    this.X = data.X;
    this.FARCASTER = data.FARCASTER;
    this.website = data.website;
    this.youtube = data.youtube;
    this.linkedin = data.linkedin;
    this.instagram = data.instagram;
    this.facebook = data.facebook;
    this.discord = data.discord;
    this.telegram = data.telegram;
    this.github = data.github;
  }
}

/**
 * DTO for project power ranking information
 */
export class ProjectPowerDto {
  @IsOptional()
  @IsNumber()
  projectId?: number;

  @IsOptional()
  @IsNumber()
  totalPower?: number;

  @IsOptional()
  @IsNumber()
  powerRank?: number;

  @IsOptional()
  @IsNumber()
  round?: number;

  constructor(data: {
    projectId?: number;
    totalPower?: number;
    powerRank?: number;
    round?: number;
  }) {
    this.projectId = data.projectId;
    this.totalPower = data.totalPower;
    this.powerRank = data.powerRank;
    this.round = data.round;
  }
}

/**
 * DTO for project update information
 */
export class ProjectUpdateDto {
  @IsNumber()
  id!: number;

  @IsString()
  title!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  contentSummary?: string;

  @IsDate()
  @Type(() => Date)
  @Transform(({ value }: { value: string | Date }) => {
    if (typeof value === 'string') {
      return new Date(value);
    }
    return value;
  })
  createdAt!: Date;

  @IsOptional()
  @IsBoolean()
  isMain?: boolean;

  @IsOptional()
  @IsNumber()
  totalReactions?: number;

  constructor(data: {
    id: number;
    title: string;
    content: string;
    contentSummary?: string;
    createdAt: Date | string;
    isMain?: boolean;
    totalReactions?: number;
  }) {
    this.id = data.id;
    this.title = data.title;
    this.content = data.content;
    this.contentSummary = data.contentSummary;
    this.createdAt =
      typeof data.createdAt === 'string'
        ? new Date(data.createdAt)
        : data.createdAt;
    this.isMain = data.isMain;
    this.totalReactions = data.totalReactions;
  }
}

/**
 * DTO for project category information
 */
export class ProjectCategoryDto {
  @IsNumber()
  id!: number;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  value?: string;

  @IsOptional()
  mainCategory?: {
    id: number;
    title: string;
    slug: string;
  };

  constructor(data: {
    id: number;
    name: string;
    value?: string;
    mainCategory?: {
      id: number;
      title: string;
      slug: string;
    };
  }) {
    this.id = data.id;
    this.name = data.name;
    this.value = data.value;
    this.mainCategory = data.mainCategory;
  }
}

/**
 * DTO for Project details fetched from Giveth backend/Impact-Graph
 * Contains all project information needed for scoring and evaluation
 */
export class ProjectDetailsDto {
  /**
   * Unique project identifier
   */
  @IsNumber()
  id!: number;

  /**
   * Project title
   */
  @IsString()
  title!: string;

  /**
   * Project URL slug
   */
  @IsString()
  slug!: string;

  /**
   * Project type (project or cause)
   */
  @IsOptional()
  @IsString()
  projectType?: string;

  /**
   * Full project description
   */
  @IsString()
  description!: string;

  /**
   * Summarized project description
   */
  @IsOptional()
  @IsString()
  descriptionSummary?: string;

  /**
   * Project website URL
   */
  @IsOptional()
  @IsString()
  website?: string;

  /**
   * Project YouTube URL
   */
  @IsOptional()
  @IsString()
  youtube?: string;

  /**
   * Total amount raised by the project
   */
  @IsOptional()
  @IsNumber()
  totalRaised?: number;

  /**
   * Date of the last project update
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
  lastUpdateDate?: Date;

  /**
   * Content of the last project update
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
   * Main category of the project
   */
  @IsOptional()
  @IsString()
  mainCategory?: string;

  /**
   * Array of sub-categories
   */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  subCategories?: string[];

  /**
   * Social media handles for the project
   */
  @IsOptional()
  @Type(() => ProjectSocialMediaDto)
  socialMediaHandles?: ProjectSocialMediaDto;

  /**
   * Existing quality score from Giveth
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
   * Project status (Active, Deactivated, etc.)
   */
  @IsOptional()
  @Type(() => ProjectStatusDto)
  status?: ProjectStatusDto;

  /**
   * Whether the project is verified
   */
  @IsOptional()
  @IsBoolean()
  verified?: boolean;

  /**
   * Project verification status string
   */
  @IsOptional()
  @IsString()
  verificationStatus?: string;

  /**
   * Whether the project is eligible for GIVbacks
   */
  @IsOptional()
  @IsBoolean()
  isGivbackEligible?: boolean;

  /**
   * Whether the project gives back
   */
  @IsOptional()
  @IsBoolean()
  giveBacks?: boolean;

  /**
   * Whether the project is listed
   */
  @IsOptional()
  @IsBoolean()
  listed?: boolean;

  /**
   * Total donations received
   */
  @IsOptional()
  @IsNumber()
  totalDonations?: number;

  /**
   * Total reactions received
   */
  @IsOptional()
  @IsNumber()
  totalReactions?: number;

  /**
   * Total number of project updates
   */
  @IsOptional()
  @IsNumber()
  totalProjectUpdates?: number;

  /**
   * Number of unique donors
   */
  @IsOptional()
  @IsNumber()
  countUniqueDonors?: number;

  /**
   * When the project was created
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
  creationDate?: Date;

  /**
   * When the project was last updated
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

  /**
   * When the latest update was created
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
  latestUpdateCreationDate?: Date;

  /**
   * Project admin user information
   */
  @IsOptional()
  @Type(() => ProjectAdminDto)
  adminUser?: ProjectAdminDto;

  /**
   * Project power ranking information
   */
  @IsOptional()
  @Type(() => ProjectPowerDto)
  projectPower?: ProjectPowerDto;

  /**
   * Project instant power ranking information
   */
  @IsOptional()
  @Type(() => ProjectPowerDto)
  projectInstantPower?: ProjectPowerDto;

  /**
   * Project future power ranking information
   */
  @IsOptional()
  @Type(() => ProjectPowerDto)
  projectFuturePower?: ProjectPowerDto;

  /**
   * Latest project update
   */
  @IsOptional()
  @Type(() => ProjectUpdateDto)
  projectUpdate?: ProjectUpdateDto;

  /**
   * All project updates
   */
  @IsOptional()
  @IsArray()
  @Type(() => ProjectUpdateDto)
  projectUpdates?: ProjectUpdateDto[];

  /**
   * Project categories
   */
  @IsOptional()
  @IsArray()
  @Type(() => ProjectCategoryDto)
  categories?: ProjectCategoryDto[];

  /**
   * Project image URL
   */
  @IsOptional()
  @IsString()
  image?: string;

  /**
   * Project impact location
   */
  @IsOptional()
  @IsString()
  impactLocation?: string;

  /**
   * GIVback factor
   */
  @IsOptional()
  @IsNumber()
  givbackFactor?: number;

  constructor(data: {
    id: number;
    title: string;
    slug: string;
    projectType?: string;
    description: string;
    descriptionSummary?: string;
    website?: string;
    youtube?: string;
    totalRaised?: number;
    lastUpdateDate?: Date | string;
    lastUpdateContent?: string;
    lastUpdateTitle?: string;
    mainCategory?: string;
    subCategories?: string[];
    socialMediaHandles?: ProjectSocialMediaDto;
    qualityScore?: number;
    givPowerRank?: number;
    status?: ProjectStatusDto;
    verified?: boolean;
    verificationStatus?: string;
    isGivbackEligible?: boolean;
    giveBacks?: boolean;
    listed?: boolean;
    totalDonations?: number;
    totalReactions?: number;
    totalProjectUpdates?: number;
    countUniqueDonors?: number;
    creationDate?: Date | string;
    updatedAt?: Date | string;
    latestUpdateCreationDate?: Date | string;
    adminUser?: ProjectAdminDto;
    projectPower?: ProjectPowerDto;
    projectInstantPower?: ProjectPowerDto;
    projectFuturePower?: ProjectPowerDto;
    projectUpdate?: ProjectUpdateDto;
    projectUpdates?: ProjectUpdateDto[];
    categories?: ProjectCategoryDto[];
    image?: string;
    impactLocation?: string;
    givbackFactor?: number;
  }) {
    this.id = data.id;
    this.title = data.title;
    this.slug = data.slug;
    this.projectType = data.projectType;
    this.description = data.description;
    this.descriptionSummary = data.descriptionSummary;
    this.website = data.website;
    this.youtube = data.youtube;
    this.totalRaised = data.totalDonations; // Map totalDonations to totalRaised for compatibility
    this.lastUpdateDate =
      typeof data.lastUpdateDate === 'string'
        ? new Date(data.lastUpdateDate)
        : data.lastUpdateDate;
    this.lastUpdateContent = data.lastUpdateContent;
    this.lastUpdateTitle = data.lastUpdateTitle;
    this.mainCategory = data.mainCategory;
    this.subCategories = data.subCategories;
    this.socialMediaHandles = data.socialMediaHandles;
    this.qualityScore = data.qualityScore;
    this.givPowerRank = data.givPowerRank;
    this.status = data.status;
    this.verified = data.verified;
    this.verificationStatus = data.verificationStatus;
    this.isGivbackEligible = data.isGivbackEligible;
    this.giveBacks = data.giveBacks;
    this.listed = data.listed;
    this.totalDonations = data.totalDonations;
    this.totalReactions = data.totalReactions;
    this.totalProjectUpdates = data.totalProjectUpdates;
    this.countUniqueDonors = data.countUniqueDonors;
    this.creationDate =
      typeof data.creationDate === 'string'
        ? new Date(data.creationDate)
        : data.creationDate;
    this.updatedAt =
      typeof data.updatedAt === 'string'
        ? new Date(data.updatedAt)
        : data.updatedAt;
    this.latestUpdateCreationDate =
      typeof data.latestUpdateCreationDate === 'string'
        ? new Date(data.latestUpdateCreationDate)
        : data.latestUpdateCreationDate;
    this.adminUser = data.adminUser;
    this.projectPower = data.projectPower;
    this.projectInstantPower = data.projectInstantPower;
    this.projectFuturePower = data.projectFuturePower;
    this.projectUpdate = data.projectUpdate;
    this.projectUpdates = data.projectUpdates;
    this.categories = data.categories;
    this.image = data.image;
    this.impactLocation = data.impactLocation;
    this.givbackFactor = data.givbackFactor;
  }
}

/**
 * Helper function to extract social media URLs from project data
 * Stores full URLs exactly as they come from Impact Graph
 */
export function extractSocialMediaHandles(
  project: unknown,
): ProjectSocialMediaDto {
  const handles: { [key: string]: string } = {};

  // Extract from socialMedia array
  if (
    (project as any)?.socialMedia &&
    Array.isArray((project as any).socialMedia)
  ) {
    (project as any).socialMedia.forEach((social: unknown) => {
      const socialObj = social as any;
      const { type, link } = socialObj; // Preserve original case
      if (type && link) {
        handles[type] = link; // Store full URL
      }
    });
  }

  // Extract from verification social profiles
  if (
    (project as any)?.socialProfiles &&
    Array.isArray((project as any).socialProfiles)
  ) {
    (project as any).socialProfiles.forEach((profile: unknown) => {
      const profileObj = profile as any;
      const { socialNetwork: network, link } = profileObj; // Preserve original case
      if (network && link) {
        handles[network] = link; // Store full URL
      }
    });
  }

  // Extract from project verification form
  if ((project as any)?.projectVerificationForm?.socialProfiles) {
    (project as any).projectVerificationForm.socialProfiles.forEach(
      (profile: unknown) => {
        const profileObj = profile as any;
        const { socialNetwork: network, link } = profileObj; // Preserve original case
        if (network && link) {
          handles[network] = link; // Store full URL
        }
      },
    );
  }

  // Extract direct fields
  if ((project as any)?.website) handles.website = (project as any).website;
  if ((project as any)?.youtube) handles.youtube = (project as any).youtube;

  return new ProjectSocialMediaDto(handles);
}

/**
 * Helper function to create a project details DTO from GraphQL response
 */
export function createProjectDetailsDto(project: unknown): ProjectDetailsDto {
  const socialMediaHandles = extractSocialMediaHandles(project);

  const proj = project as any;

  // Extract latest update information
  const latestUpdate = proj.projectUpdate ?? proj.projectUpdates?.[0];
  const lastUpdateDate =
    latestUpdate?.createdAt ?? proj.latestUpdateCreationDate;
  const lastUpdateContent = latestUpdate?.content;
  const lastUpdateTitle = latestUpdate?.title;

  // Extract main category and subcategories
  const mainCategory = proj.categories?.[0]?.mainCategory?.title;
  const subCategories =
    proj.categories?.map((cat: unknown) => (cat as any).name) ?? [];

  // Extract power rank from various sources
  const givPowerRank =
    proj.projectPower?.powerRank ??
    proj.projectInstantPower?.powerRank ??
    proj.projectFuturePower?.powerRank;

  return new ProjectDetailsDto({
    id: proj.id,
    title: proj.title,
    slug: proj.slug,
    projectType: proj.projectType,
    description: proj.description,
    descriptionSummary: proj.descriptionSummary,
    website: proj.website,
    youtube: proj.youtube,
    totalRaised: proj.totalDonations,
    lastUpdateDate,
    lastUpdateContent,
    lastUpdateTitle,
    mainCategory,
    subCategories,
    socialMediaHandles,
    qualityScore: proj.qualityScore,
    givPowerRank,
    status: proj.status ? new ProjectStatusDto(proj.status) : undefined,
    verified: proj.verified,
    verificationStatus: proj.verificationStatus,
    isGivbackEligible: proj.isGivbackEligible,
    giveBacks: proj.giveBacks,
    listed: proj.listed,
    totalDonations: proj.totalDonations,
    totalReactions: proj.totalReactions,
    totalProjectUpdates: proj.totalProjectUpdates,
    countUniqueDonors: proj.countUniqueDonors,
    creationDate: proj.creationDate,
    updatedAt: proj.updatedAt,
    latestUpdateCreationDate: proj.latestUpdateCreationDate,
    adminUser: proj.adminUser ? new ProjectAdminDto(proj.adminUser) : undefined,
    projectPower: proj.projectPower
      ? new ProjectPowerDto(proj.projectPower)
      : undefined,
    projectInstantPower: proj.projectInstantPower
      ? new ProjectPowerDto(proj.projectInstantPower)
      : undefined,
    projectFuturePower: proj.projectFuturePower
      ? new ProjectPowerDto(proj.projectFuturePower)
      : undefined,
    projectUpdate: latestUpdate
      ? new ProjectUpdateDto(latestUpdate)
      : undefined,
    projectUpdates: proj.projectUpdates?.map(
      (update: unknown) => new ProjectUpdateDto(update as any),
    ),
    categories: proj.categories?.map(
      (cat: unknown) => new ProjectCategoryDto(cat as any),
    ),
    image: proj.image,
    impactLocation: proj.impactLocation,
    givbackFactor: proj.givbackFactor,
  });
}
