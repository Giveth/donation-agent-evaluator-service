import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { GraphQLClient, ClientError } from 'graphql-request';
import { GraphQLError as BaseGraphQLError } from 'graphql';
import {
  PROJECT_BY_SLUG_QUERY,
  PROJECTS_BY_SLUGS_QUERY,
  PROJECT_UPDATES_QUERY,
} from '../graphql/queries';
import {
  ProjectDetailsDto,
  createProjectDetailsDto,
} from '../dto/project-details.dto';

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

    // Initialize GraphQL client
    this.graphqlClient = new GraphQLClient(this.baseUrl, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Donation-Evaluator-Service/1.0',
      },
    });

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

      const response = await this.graphqlClient.request<{ projectBySlug: any }>(
        PROJECT_BY_SLUG_QUERY,
        variables,
      );

      if (!response.projectBySlug) {
        this.logger.warn(`Project not found with slug: ${slug}`);
        throw new HttpException(
          `Project not found with slug: ${slug}`,
          HttpStatus.NOT_FOUND,
        );
      }

      const project = createProjectDetailsDto(response.projectBySlug);

      this.logger.log(
        `Successfully fetched project: ${project.title} (slug: ${slug})`,
      );
      return project;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }

      this.handleGraphQLError(error, 'getProjectBySlug');
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
          projects: any[];
          totalCount: number;
        };
      }>(PROJECTS_BY_SLUGS_QUERY, variables);

      const projects = response.projectsBySlugs.projects.map(project =>
        createProjectDetailsDto(project),
      );

      this.logger.log(
        `Successfully fetched ${projects.length} projects by slugs`,
      );
      return {
        projects,
        totalCount: response.projectsBySlugs.totalCount,
      };
    } catch (error) {
      this.handleGraphQLError(error, 'getProjectsBySlugs');
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
  ): Promise<any[]> {
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
        getProjectUpdates: any[];
      }>(PROJECT_UPDATES_QUERY, variables);

      const updates = response.getProjectUpdates;

      this.logger.log(
        `Successfully fetched ${updates.length} updates for project ${projectId}`,
      );
      return updates;
    } catch (error) {
      this.handleGraphQLError(error, 'getProjectUpdates');
      // Don't throw for project updates - this is not critical
      return [];
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
          projects: any[];
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

      const isHealthy =
        response.projectsBySlugs &&
        Array.isArray(response.projectsBySlugs.projects);

      if (isHealthy) {
        this.logger.log('Impact-Graph service health check passed');
      } else {
        this.logger.warn(
          'Impact-Graph service health check failed - unexpected response format',
        );
      }

      return isHealthy;
    } catch (error) {
      this.logger.error('Impact-Graph service health check failed', error);
      return false;
    }
  }

  /**
   * Handle GraphQL errors and log appropriate details
   * @param error - The error object from GraphQL request
   * @param operation - The operation that failed
   */
  private handleGraphQLError(error: any, operation: string): void {
    if (error instanceof ClientError) {
      // GraphQL-specific error handling
      this.logger.error(`GraphQL error in ${operation}:`, {
        message: error.message,
        query: error.request.query,
        variables: error.request.variables,
        errors: error.response.errors,
        status: error.response.status,
      });

      // Log individual GraphQL errors
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
            });
          },
        );
      }
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      // Network connectivity issues
      this.logger.error(`Network error in ${operation}:`, {
        message: error.message,
        code: error.code,
        hostname: error.hostname,
      });
    } else if (error.code === 'ETIMEDOUT') {
      // Timeout issues
      this.logger.error(`Timeout error in ${operation}:`, {
        message: error.message,
        timeout: error.timeout,
      });
    } else {
      // Generic error handling
      this.logger.error(`Unexpected error in ${operation}:`, {
        message: error.message,
        stack: error.stack,
        name: error.name,
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
