import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ProjectDetailsDto,
  ProjectSocialMediaDto,
} from '../dto/project-details.dto';
import { ImpactGraphService } from './impact-graph.service';
import { ProjectSocialAccountService } from '../../social-media-storage/services/project-social-account.service';
import { ProjectSocialAccount } from '../../social-media-storage/entities/project-social-account.entity';

/**
 * DataFetchingService acts as the "Central Records Office" in our architecture.
 * It prioritizes locally stored project data over expensive GraphQL API calls,
 * providing fast access to project information for evaluation.
 */
@Injectable()
export class DataFetchingService {
  private readonly logger = new Logger(DataFetchingService.name);

  constructor(
    private readonly projectSocialAccountService: ProjectSocialAccountService,
    private readonly impactGraphService: ImpactGraphService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Get project information by ID, checking local database first
   * @param projectId - The project ID to fetch
   * @returns Project details with all evaluation data
   */
  async getProjectInfo(projectId: string): Promise<ProjectDetailsDto> {
    try {
      this.logger.debug(`Fetching project info for ID: ${projectId}`);

      // Step 1: Check local database first (fast!)
      const localProject =
        await this.projectSocialAccountService.getProjectAccount(projectId);

      if (localProject) {
        this.logger.debug(`Found project ${projectId} in local database`);
        return this.mapProjectAccountToDto(localProject);
      }

      // Step 2: Fallback to GraphQL if not found locally
      this.logger.debug(
        `Project ${projectId} not found locally, falling back to GraphQL`,
      );

      // We need to get the project slug from GraphQL to fetch the project
      // This is a limitation since GraphQL uses slugs, not numeric IDs
      throw new HttpException(
        `Project ${projectId} not found in local database and GraphQL lookup by numeric ID not supported. ` +
          `Please ensure project is synced via ProjectSyncProcessor.`,
        HttpStatus.NOT_FOUND,
      );
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.logger.error(
        `Failed to fetch project info for ID ${projectId}:`,
        error,
      );
      throw new HttpException(
        `Failed to fetch project information for ID: ${projectId}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Get multiple projects by their IDs from local database
   * @param projectIds - Array of project IDs to fetch
   * @returns Array of project details with all evaluation data
   */
  async getProjectsByIds(projectIds: number[]): Promise<ProjectDetailsDto[]> {
    try {
      this.logger.debug(`Fetching ${projectIds.length} projects by IDs`);

      const results: ProjectDetailsDto[] = [];
      const notFoundIds: number[] = [];

      // Process each project ID
      for (const projectId of projectIds) {
        try {
          const projectIdStr = projectId.toString();
          const localProject =
            await this.projectSocialAccountService.getProjectAccount(
              projectIdStr,
            );

          if (localProject) {
            const projectDto = this.mapProjectAccountToDto(localProject);
            results.push(projectDto);
            this.logger.debug(`Found project ${projectId} in local database`);
          } else {
            notFoundIds.push(projectId);
            this.logger.warn(
              `Project ${projectId} not found in local database`,
            );
          }
        } catch (error) {
          this.logger.error(`Error fetching project ${projectId}:`, error);
          notFoundIds.push(projectId);
        }
      }

      // Log statistics
      this.logger.log(
        `Retrieved ${results.length}/${projectIds.length} projects from local database. ` +
          `Not found: [${notFoundIds.join(', ')}]`,
      );

      // For now, we don't attempt GraphQL fallback for missing projects
      // as the sync process should ensure all projects are available locally
      if (notFoundIds.length > 0) {
        this.logger.warn(
          `${notFoundIds.length} projects not found in local database. ` +
            `Consider running project sync to update local data.`,
        );
      }

      return results;
    } catch (error) {
      this.logger.error(`Failed to fetch projects by IDs:`, error);
      throw new HttpException(
        'Failed to fetch projects from local database',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Get project information by slug from GraphQL (direct GraphQL access)
   * @param slug - The project slug to fetch
   * @returns Project details from GraphQL API
   */
  async getProjectBySlug(slug: string): Promise<ProjectDetailsDto> {
    try {
      this.logger.debug(`Fetching project by slug: ${slug}`);
      return await this.impactGraphService.getProjectBySlug(slug);
    } catch (error) {
      this.logger.error(`Failed to fetch project by slug ${slug}:`, error);
      throw error; // Re-throw as ImpactGraphService already handles error formatting
    }
  }

  /**
   * Get projects by their slugs from GraphQL (batch operation)
   * @param slugs - Array of project slugs to fetch
   * @param take - Number of projects to return (default: 50)
   * @param skip - Number of projects to skip (default: 0)
   * @returns Projects data with total count
   */
  async getProjectsBySlugs(
    slugs: string[],
    take: number = 50,
    skip: number = 0,
  ): Promise<{ projects: ProjectDetailsDto[]; totalCount: number }> {
    try {
      this.logger.debug(`Fetching ${slugs.length} projects by slugs`);
      return await this.impactGraphService.getProjectsBySlugs(
        slugs,
        undefined,
        take,
        skip,
      );
    } catch (error) {
      this.logger.error(`Failed to fetch projects by slugs:`, error);
      throw error; // Re-throw as ImpactGraphService already handles error formatting
    }
  }

  /**
   * Get cache statistics for monitoring and optimization
   * @returns Statistics about local vs GraphQL data usage
   */
  async getCacheStatistics(): Promise<{
    totalProjectsInCache: number;
    projectsWithSocialMedia: {
      x: number;
      farcaster: number;
      total: number;
    };
  }> {
    try {
      const [totalProjects, socialMediaStats] = await Promise.all([
        this.projectSocialAccountService.getProjectCount(),
        this.projectSocialAccountService.getProjectCountWithSocialMedia(),
      ]);

      return {
        totalProjectsInCache: totalProjects,
        projectsWithSocialMedia: socialMediaStats,
      };
    } catch (error) {
      this.logger.error('Failed to get cache statistics:', error);
      throw new HttpException(
        'Failed to retrieve cache statistics',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Check if project exists in local database
   * @param projectId - The project ID to check
   * @returns Boolean indicating if project exists locally
   */
  async isProjectInLocalCache(projectId: string): Promise<boolean> {
    try {
      const project =
        await this.projectSocialAccountService.getProjectAccount(projectId);
      return project !== null;
    } catch (error) {
      this.logger.error(
        `Failed to check if project ${projectId} exists in cache:`,
        error,
      );
      return false;
    }
  }

  /**
   * Map ProjectSocialAccount entity to ProjectDetailsDto
   * @param project - The project entity from local database
   * @returns Standardized ProjectDetailsDto
   */
  private mapProjectAccountToDto(
    project: ProjectSocialAccount,
  ): ProjectDetailsDto {
    // Create social media handles object
    const socialMediaHandles = new ProjectSocialMediaDto({
      X: project.xUrl ?? undefined,
      FARCASTER: project.farcasterUrl ?? undefined,
    });

    // Map the entity to DTO format
    return new ProjectDetailsDto({
      id: parseInt(project.projectId, 10), // Convert string ID to number
      title: project.title,
      slug: project.slug,
      description: project.description ?? 'No description available',
      lastUpdateDate: project.lastUpdateDate,
      lastUpdateContent: project.lastUpdateContent,
      socialMediaHandles,
      givPowerRank: project.givPowerRank,
      // Set status based on projectStatus
      status: project.projectStatus
        ? {
            id: 1, // Default status ID
            symbol: project.projectStatus,
            name: project.projectStatus,
            description: `Project status: ${project.projectStatus}`,
          }
        : undefined,
      // Map remaining fields with defaults
      descriptionSummary: undefined,
      website: undefined,
      youtube: undefined,
      lastUpdateTitle: project.lastUpdateTitle,
      mainCategory: undefined,
      subCategories: [],
      isGivbackEligible: undefined,
      giveBacks: undefined,
      listed: undefined,
      totalProjectUpdates: undefined,
      countUniqueDonors: undefined,
      creationDate: undefined,
      updatedAt: undefined,
      latestUpdateCreationDate: project.lastUpdateDate,
      projectPower: project.givPowerRank
        ? {
            projectId: parseInt(project.projectId, 10),
            powerRank: project.givPowerRank,
            totalPower: undefined,
            round: undefined,
          }
        : undefined,
      projectInstantPower: undefined,
      projectFuturePower: undefined,
      projectUpdate: project.lastUpdateContent
        ? {
            id: 1, // Default update ID
            title: project.lastUpdateTitle ?? 'Latest Update',
            content: project.lastUpdateContent,
            createdAt: project.lastUpdateDate ?? new Date(),
            isMain: true,
          }
        : undefined,
      projectUpdates: undefined,
      categories: undefined,
      image: undefined,
      impactLocation: undefined,
      givbackFactor: undefined,
    });
  }

  /**
   * Health check method to verify service dependencies
   * @returns Boolean indicating service health
   */
  async healthCheck(): Promise<boolean> {
    try {
      this.logger.debug('Performing DataFetchingService health check');

      // Check local database connectivity
      const cacheStats = await this.getCacheStatistics();

      // Check GraphQL service health
      const graphqlHealthy = await this.impactGraphService.healthCheck();

      const isHealthy = graphqlHealthy && cacheStats.totalProjectsInCache >= 0;

      if (isHealthy) {
        this.logger.log(
          `DataFetchingService health check passed. Local projects: ${cacheStats.totalProjectsInCache}`,
        );
      } else {
        this.logger.warn('DataFetchingService health check failed');
      }

      return isHealthy;
    } catch (error) {
      this.logger.error('DataFetchingService health check failed:', error);
      return false;
    }
  }
}
