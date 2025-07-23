import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { GraphQLClient, ClientError } from 'graphql-request';
import { GraphQLError as BaseGraphQLError } from 'graphql';
import {
  PROJECT_BY_SLUG_QUERY,
  PROJECTS_BY_SLUGS_QUERY,
  PROJECT_UPDATES_QUERY,
  ALL_CAUSES_WITH_PROJECTS_QUERY,
  CAUSE_BY_ID_QUERY,
  ALL_PROJECTS_WITH_FILTERS_QUERY,
  BULK_UPDATE_CAUSE_PROJECT_EVALUATION_MUTATION,
} from '../graphql/queries';
import {
  ProjectDetailsDto,
  createProjectDetailsDto,
} from '../dto/project-details.dto';
import {
  CauseDetailsDto,
  CauseProjectSlugsDto,
  createCauseDetailsDto,
  createCauseProjectSlugsDto,
} from '../dto/cause-details.dto';
import {
  UpdateCauseProjectEvaluationDto,
  BulkUpdateCauseProjectEvaluationResponse,
} from '../dto/update-cause-project-evaluation.dto';

/**
 * Type definitions for GraphQL responses
 */
type GraphQLProjectData = Record<string, unknown>;
type GraphQLCauseData = Record<string, unknown>;
type GraphQLError = unknown;

/**
 * Service for interacting with Giveth Impact-Graph GraphQL API
 * Handles fetching project data for evaluation purposes
 */
@Injectable()
export class ImpactGraphService {
  private readonly logger = new Logger(ImpactGraphService.name);
  private readonly graphqlClient: GraphQLClient;
  private readonly baseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
  ) {
    // Set the base URL for the Impact-Graph GraphQL endpoint
    this.baseUrl = this.configService.get<string>(
      'IMPACT_GRAPH_URL',
      'https://impact-graph.serve.giveth.io/graphql',
    );

    // Initialize GraphQL client with timeout configuration
    this.graphqlClient = new GraphQLClient(this.baseUrl, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Donation-Evaluator-Service/1.0',
      },
      fetch: (url: RequestInfo | URL, init?: RequestInit) => {
        return fetch(url, {
          ...init,
          signal: AbortSignal.timeout(150000), // 150 seconds timeout
        });
      },
    });

    this.logger.log(`Initialized GraphQL client with 150 second timeout`);

    this.logger.log(
      `Initialized ImpactGraphService with endpoint: ${this.baseUrl}`,
    );
  }

  /**
   * Fetch detailed project information by slug
   * @param slug - The project slug to fetch
   * @param connectedWalletUserId - Optional user ID for personalized data
   * @returns Detailed project information
   */
  async getProjectBySlug(
    slug: string,
    connectedWalletUserId?: number,
  ): Promise<ProjectDetailsDto> {
    try {
      this.logger.debug(`Fetching project with slug: ${slug}`);

      const variables = {
        slug,
        connectedWalletUserId,
      };

      const response = await this.graphqlClient.request<{
        projectBySlug: GraphQLProjectData | null;
      }>(PROJECT_BY_SLUG_QUERY, variables);

      if (
        !response.projectBySlug ||
        Object.keys(response.projectBySlug).length === 0
      ) {
        this.logger.warn(`Project not found with slug: ${slug}`);
        throw new HttpException(
          `Project not found with slug: ${slug}`,
          HttpStatus.NOT_FOUND,
        );
      }

      const project = createProjectDetailsDto(response.projectBySlug);

      // Validate that this is actually a project
      if (project.projectType && project.projectType !== 'project') {
        this.logger.warn(
          `Project ${slug} has unexpected projectType: ${project.projectType}`,
        );
      }

      this.logger.log(
        `Successfully fetched project: ${project.title} (slug: ${slug})`,
      );
      return project;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.handleGraphQLError(error as GraphQLError, 'getProjectBySlug');
      throw new HttpException(
        `Failed to fetch project with slug: ${slug}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Fetch multiple projects by their slugs with pagination
   * @param slugs - Array of project slugs to fetch
   * @param connectedWalletUserId - Optional user ID for personalized data
   * @param take - Number of projects to return (default: 50)
   * @param skip - Number of projects to skip (default: 0)
   * @returns Array of project details and total count
   */
  async getProjectsBySlugs(
    slugs: string[],
    connectedWalletUserId?: number,
    take: number = 50,
    skip: number = 0,
  ): Promise<{ projects: ProjectDetailsDto[]; totalCount: number }> {
    try {
      this.logger.debug(`Fetching ${slugs.length} projects by slugs`);

      const variables = {
        slugs,
        connectedWalletUserId,
        take,
        skip,
        orderBy: {
          field: 'CreationDate',
          direction: 'DESC',
        },
      };

      const response = await this.graphqlClient.request<{
        projectsBySlugs: {
          projects: GraphQLProjectData[];
          totalCount: number;
        };
      }>(PROJECTS_BY_SLUGS_QUERY, variables);

      const projects = response.projectsBySlugs.projects.map(project => {
        const dto = createProjectDetailsDto(project);
        // Log a warning if projectType is not 'project' for better debugging
        if (dto.projectType && dto.projectType !== 'project') {
          this.logger.warn(
            `Project ${dto.slug} has unexpected projectType: ${dto.projectType}`,
          );
        }
        return dto;
      });

      this.logger.log(
        `Successfully fetched ${projects.length} projects by slugs`,
      );
      return {
        projects,
        totalCount: response.projectsBySlugs.totalCount,
      };
    } catch (error) {
      this.handleGraphQLError(error as GraphQLError, 'getProjectsBySlugs');
      throw new HttpException(
        'Failed to fetch projects by slugs from Impact-Graph',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Fetch project updates for a specific project
   * @param projectId - The project ID to fetch updates for
   * @param take - Number of updates to return (default: 10)
   * @param skip - Number of updates to skip (default: 0)
   * @returns Array of project updates
   */
  async getProjectUpdates(
    projectId: number,
    take: number = 10,
    skip: number = 0,
  ): Promise<unknown[]> {
    try {
      this.logger.debug(`Fetching updates for project ID: ${projectId}`);

      const variables = {
        projectId,
        take,
        skip,
        orderBy: {
          field: 'CreationAt',
          direction: 'DESC',
        },
      };

      const response = await this.graphqlClient.request<{
        getProjectUpdates: unknown[];
      }>(PROJECT_UPDATES_QUERY, variables);

      const updates = response.getProjectUpdates;

      this.logger.log(
        `Successfully fetched ${updates.length} updates for project ${projectId}`,
      );
      return updates;
    } catch (error) {
      this.handleGraphQLError(error as GraphQLError, 'getProjectUpdates');
      // Don't throw for project updates - this is not critical
      return [];
    }
  }

  /**
   * Fetch all causes with their associated projects in a single optimized query
   * This is the most efficient way to get all project data for synchronization
   * @param limit - Number of causes to return (default: 100)
   * @param offset - Number of causes to skip (default: 0)
   * @returns Array of causes with complete project data
   */
  async getAllCausesWithProjects(
    limit: number = 100,
    offset: number = 0,
  ): Promise<{
    causes: Array<{ cause: CauseDetailsDto; projects: ProjectDetailsDto[] }>;
    totalProcessed: number;
  }> {
    try {
      this.logger.debug(
        `Fetching all causes with projects (limit: ${limit}, offset: ${offset})`,
      );

      const variables = {
        limit,
        offset,
      };

      const response = await this.graphqlClient.request<{
        causes: GraphQLCauseData[] | null;
      }>(ALL_CAUSES_WITH_PROJECTS_QUERY, variables);

      if (!response.causes || response.causes.length === 0) {
        this.logger.warn('No causes found in GraphQL response');
        return { causes: [], totalProcessed: 0 };
      }

      const processedCauses = response.causes.map(causeData => {
        // Create cause DTO
        const cause = createCauseDetailsDto(causeData);

        // Validate that this is actually a cause
        if (cause.projectType && cause.projectType !== 'cause') {
          this.logger.warn(
            `Cause ${cause.id} has unexpected projectType: ${cause.projectType}`,
          );
        }

        // Process projects separately to avoid circular dependency
        const projects = (
          (causeData as { projects?: GraphQLProjectData[] }).projects ?? []
        ).map((project: GraphQLProjectData) => {
          const dto = createProjectDetailsDto(project);
          // Validate that projects under causes are actually projects
          if (dto.projectType && dto.projectType !== 'project') {
            this.logger.warn(
              `Project ${dto.slug} under cause ${cause.id} has unexpected projectType: ${dto.projectType}`,
            );
          }
          return dto;
        });

        return { cause, projects };
      });

      this.logger.log(
        `Successfully fetched ${processedCauses.length} causes with ${processedCauses.reduce((sum, c) => sum + c.projects.length, 0)} total projects`,
      );

      return {
        causes: processedCauses,
        totalProcessed: processedCauses.length,
      };
    } catch (error) {
      this.handleGraphQLError(
        error as GraphQLError,
        'getAllCausesWithProjects',
      );
      throw new HttpException(
        'Failed to fetch causes with projects from Impact-Graph',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Fetch a specific cause by ID with minimal project data (slugs only)
   * Useful when you need to fetch projects individually later
   * @param causeId - The cause ID to fetch
   * @returns Cause details with project slugs
   */
  async getCauseById(causeId: number): Promise<CauseProjectSlugsDto> {
    try {
      this.logger.debug(`Fetching cause with ID: ${causeId}`);

      const variables = {
        id: causeId,
      };

      const response = await this.graphqlClient.request<{
        cause: GraphQLCauseData | null;
      }>(CAUSE_BY_ID_QUERY, variables);

      if (!response.cause || Object.keys(response.cause).length === 0) {
        this.logger.warn(`Cause not found with ID: ${causeId}`);
        throw new HttpException(
          `Cause not found with ID: ${causeId}`,
          HttpStatus.NOT_FOUND,
        );
      }

      const cause = createCauseProjectSlugsDto(response.cause);

      // Validate that this is actually a cause
      if (
        (response.cause as any).projectType &&
        (response.cause as any).projectType !== 'cause'
      ) {
        this.logger.warn(
          `Cause ${causeId} has unexpected projectType: ${(response.cause as any).projectType}`,
        );
      }

      this.logger.log(
        `Successfully fetched cause: ${cause.title} (ID: ${causeId}) with ${cause.projectSlugs.length} projects`,
      );
      return cause;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.handleGraphQLError(error as GraphQLError, 'getCauseById');
      throw new HttpException(
        `Failed to fetch cause with ID: ${causeId}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Fetch causes with their associated projects using filters for evaluation
   * This method uses the ALL_PROJECTS_WITH_FILTERS_QUERY to fetch causes with filtering options
   * @param limit - Number of causes to return (default: 50)
   * @param offset - Number of causes to skip (default: 0)
   * @param searchTerm - Optional search term to filter causes
   * @param chainId - Optional chain ID to filter causes
   * @param sortBy - Optional field to sort by
   * @param sortDirection - Optional sort direction (ASC/DESC)
   * @param listingStatus - Optional listing status filter
   * @returns Array of causes with complete project data for evaluation
   */
  async getCausesWithProjectsForEvaluation(
    limit: number = 2,
    offset: number = 0,
    searchTerm?: string,
    chainId?: number,
    sortBy?: string,
    sortDirection?: string,
    listingStatus?: string,
  ): Promise<{
    causes: Array<{ cause: CauseDetailsDto; projects: ProjectDetailsDto[] }>;
    totalProcessed: number;
  }> {
    const startTime = Date.now();
    try {
      this.logger.debug(
        `Fetching causes with projects for evaluation (limit: ${limit}, offset: ${offset})`,
        {
          limit,
          offset,
          searchTerm,
          chainId,
          sortBy,
          sortDirection,
          listingStatus,
        },
      );

      const variables = {
        limit,
        offset,
        searchTerm,
        chainId,
        sortBy,
        sortDirection,
        listingStatus,
      };

      const response = await this.graphqlClient.request<{
        causes: GraphQLCauseData[] | null;
      }>(ALL_PROJECTS_WITH_FILTERS_QUERY, variables);

      const responseTime = Date.now() - startTime;
      this.logger.debug(`GraphQL request completed in ${responseTime}ms`, {
        responseTime,
        limit,
        offset,
      });

      if (!response.causes || response.causes.length === 0) {
        this.logger.warn('No causes found in filtered GraphQL response');
        return { causes: [], totalProcessed: 0 };
      }

      const processedCauses = response.causes.map(causeData => {
        // Create cause DTO
        const cause = createCauseDetailsDto(causeData);

        // Validate that this is actually a cause
        if (cause.projectType && cause.projectType !== 'cause') {
          this.logger.warn(
            `Cause ${cause.id} has unexpected projectType: ${cause.projectType}`,
          );
        }

        // Process projects separately to avoid circular dependency
        const projects = (
          (causeData as { projects?: GraphQLProjectData[] }).projects ?? []
        ).map((project: GraphQLProjectData) => {
          const dto = createProjectDetailsDto(project);
          // Validate that projects under causes are actually projects
          if (dto.projectType && dto.projectType !== 'project') {
            this.logger.warn(
              `Project ${dto.slug} under cause ${cause.id} has unexpected projectType: ${dto.projectType}`,
            );
          }
          return dto;
        });

        return { cause, projects };
      });

      const totalResponseTime = Date.now() - startTime;
      this.logger.log(
        `Successfully fetched ${processedCauses.length} filtered causes with ${processedCauses.reduce((sum, c) => sum + c.projects.length, 0)} total projects in ${totalResponseTime}ms`,
        {
          totalResponseTime,
          causesCount: processedCauses.length,
        },
      );

      return {
        causes: processedCauses,
        totalProcessed: processedCauses.length,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.logger.error(`GraphQL request failed after ${responseTime}ms`, {
        responseTime,
        limit,
        offset,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      this.handleGraphQLError(
        error as GraphQLError,
        'getCausesWithProjectsForEvaluation',
      );
      throw new HttpException(
        'Failed to fetch filtered causes with projects from Impact-Graph',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Get all unique project slugs from all causes
   * Useful for batch synchronization scenarios
   * @returns Array of unique project slugs across all causes
   */
  async getAllProjectSlugsFromCauses(): Promise<string[]> {
    try {
      this.logger.debug('Fetching all unique project slugs from causes');

      // Start with first batch
      const allSlugs = new Set<string>();
      let offset = 0;
      const limit = 5; // Reasonable batch size
      let hasMore = true;

      while (hasMore) {
        const { causes } = await this.getAllCausesWithProjects(limit, offset);

        if (causes.length === 0) {
          hasMore = false;
          break;
        }

        // Extract slugs from all projects
        causes.forEach(({ projects }) => {
          projects.forEach(project => {
            if (project.slug && project.slug.trim() !== '') {
              allSlugs.add(project.slug);
            }
          });
        });

        offset += limit;
        hasMore = causes.length === limit; // If we got less than limit, we're done
      }

      const uniqueSlugs = Array.from(allSlugs);
      this.logger.log(
        `Found ${uniqueSlugs.length} unique project slugs across all causes`,
      );

      return uniqueSlugs;
    } catch (error) {
      this.handleGraphQLError(
        error as GraphQLError,
        'getAllProjectSlugsFromCauses',
      );
      throw new HttpException(
        'Failed to fetch project slugs from causes',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Bulk update cause project evaluation scores in Impact Graph
   * Sends evaluation results back to Impact Graph after evaluation completion
   * @param updates - Array of cause project evaluation updates
   * @returns Array of updated cause project records
   */
  async bulkUpdateCauseProjectEvaluation(
    updates: UpdateCauseProjectEvaluationDto[],
  ): Promise<BulkUpdateCauseProjectEvaluationResponse[]> {
    try {
      if (updates.length === 0) {
        this.logger.warn(
          'No updates provided for bulk cause project evaluation',
        );
        return [];
      }

      this.logger.log(
        `Sending bulk update for ${updates.length} cause project evaluations to Impact Graph`,
        {
          updates: updates.map(u => ({
            causeId: u.causeId,
            projectId: u.projectId,
            causeScore: u.causeScore,
          })),
        },
      );

      const variables = {
        updates: updates.map(update => ({
          causeId: update.causeId,
          projectId: update.projectId,
          causeScore: update.causeScore,
        })),
      };

      const response = await this.graphqlClient.request<{
        bulkUpdateCauseProjectEvaluation: BulkUpdateCauseProjectEvaluationResponse[];
      }>(BULK_UPDATE_CAUSE_PROJECT_EVALUATION_MUTATION, variables);

      const updatedRecords = response.bulkUpdateCauseProjectEvaluation;

      this.logger.log(
        `Successfully updated ${updatedRecords.length} cause project evaluations in Impact Graph`,
        {
          updatedRecords: updatedRecords.map(record => ({
            id: record.id,
            causeId: record.causeId,
            projectId: record.projectId,
            causeScore: record.causeScore,
          })),
        },
      );

      return updatedRecords;
    } catch (error) {
      this.logger.error(
        'Failed to bulk update cause project evaluations in Impact Graph',
        {
          error: error instanceof Error ? error.message : String(error),
          updatesCount: updates.length,
          updates: updates.map(u => ({
            causeId: u.causeId,
            projectId: u.projectId,
            causeScore: u.causeScore,
          })),
        },
      );

      this.handleGraphQLError(
        error as GraphQLError,
        'bulkUpdateCauseProjectEvaluation',
      );

      // Re-throw the error to let the calling service handle it
      throw new HttpException(
        'Failed to update cause project evaluations in Impact Graph',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Check if the Impact-Graph service is healthy
   * @returns Boolean indicating service health
   */
  async healthCheck(): Promise<boolean> {
    try {
      this.logger.debug('Performing health check on Impact-Graph service');

      // Try to fetch projects data with minimal parameters to verify connectivity
      const response = await this.graphqlClient.request<{
        projectsBySlugs: {
          projects: GraphQLProjectData[];
          totalCount: number;
        };
      }>(PROJECTS_BY_SLUGS_QUERY, {
        slugs: [],
        take: 1,
        skip: 0,
        orderBy: {
          field: 'CreationDate',
          direction: 'DESC',
        },
      });

      // Validate response structure
      const isValidResponse = Array.isArray(response.projectsBySlugs.projects);

      if (isValidResponse) {
        this.logger.log('Impact-Graph service health check passed');
      } else {
        this.logger.warn(
          'Impact-Graph service health check failed - unexpected response format',
        );
      }

      return isValidResponse;
    } catch (error) {
      this.logger.error(
        'Impact-Graph service health check failed',
        error as GraphQLError,
      );
      return false;
    }
  }

  /**
   * Handle GraphQL errors and log appropriate details
   * @param error - The error object from GraphQL request
   * @param operation - The operation that failed
   */
  private handleGraphQLError(error: GraphQLError, operation: string): void {
    if (error instanceof ClientError) {
      // GraphQL-specific error handling with enhanced logging
      this.logger.error(`GraphQL error in ${operation}:`, {
        message: error.message,
        query: error.request.query,
        variables: error.request.variables,
        errors: error.response.errors,
        status: error.response.status,
        data: error.response.data,
        extensions: error.response.extensions,
      });

      // Log individual GraphQL errors with more detail
      if (error.response.errors) {
        error.response.errors.forEach(
          (gqlError: BaseGraphQLError, index: number) => {
            this.logger.error(`GraphQL Error ${index + 1}:`, {
              message: gqlError.message,
              path: gqlError.path,
              locations: gqlError.locations?.map(loc => ({
                line: loc.line,
                column: loc.column,
              })),
              extensions: gqlError.extensions,
              source: gqlError.source?.body,
            });
          },
        );
      } else {
        this.logger.error(
          `No specific GraphQL errors found in response for ${operation}`,
        );
      }
    } else if (
      (error as { code?: string }).code === 'ENOTFOUND' ||
      (error as { code?: string }).code === 'ECONNREFUSED'
    ) {
      // Network connectivity issues
      this.logger.error(`Network error in ${operation}:`, {
        message: (error as { message: string }).message,
        code: (error as { code: string }).code,
        hostname: (error as { hostname?: string }).hostname,
        errno: (error as { errno?: string }).errno,
        syscall: (error as { syscall?: string }).syscall,
      });
    } else if ((error as { code?: string }).code === 'ETIMEDOUT') {
      // Timeout issues
      this.logger.error(`Timeout error in ${operation}:`, {
        message: (error as { message: string }).message,
        timeout: (error as { timeout?: number }).timeout,
        code: (error as { code: string }).code,
      });
    } else if ((error as { name?: string }).name === 'AbortError') {
      // Request was aborted (likely timeout)
      this.logger.error(`Request aborted in ${operation}:`, {
        message: (error as { message: string }).message,
        name: (error as { name: string }).name,
        cause: (error as { cause?: unknown }).cause,
      });
    } else {
      // Generic error handling with more context
      this.logger.error(`Unexpected error in ${operation}:`, {
        message: (error as { message: string }).message,
        stack: (error as { stack?: string }).stack,
        name: (error as { name?: string }).name,
        cause: (error as { cause?: unknown }).cause,
        code: (error as { code?: string }).code,
      });
    }
  }

  /**
   * Get the current GraphQL endpoint URL
   * @returns The GraphQL endpoint URL
   */
  getEndpointUrl(): string {
    return this.baseUrl;
  }

  /**
   * Update GraphQL client configuration if needed
   * @param options - Additional client options
   */
  updateClientConfig(
    options: Partial<ConstructorParameters<typeof GraphQLClient>[1]>,
  ): void {
    // For runtime configuration updates if needed
    Object.assign(this.graphqlClient, options);
    this.logger.log('Updated GraphQL client configuration');
  }
}
