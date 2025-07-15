import { Controller, Get, HttpStatus, HttpException } from '@nestjs/common';
import {
  HealthService,
  HealthCheckResult,
  DetailedHealthReport,
} from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  /**
   * Basic application health check
   * GET /health
   */
  @Get()
  getHealth() {
    const result: HealthCheckResult = this.healthService.getBasicHealth();

    if (result.status === 'error') {
      throw new HttpException(
        {
          status: result.status,
          service: 'donation-agent-evaluator-service',
          ...result.details,
          timestamp: result.timestamp,
        },
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    return {
      status: result.status,
      service: 'donation-agent-evaluator-service',
      ...result.details,
      timestamp: result.timestamp,
    };
  }

  /**
   * Database connectivity health check
   * GET /health/db
   */
  @Get('db')
  async getDatabaseHealth() {
    const result: HealthCheckResult =
      await this.healthService.getDatabaseHealth();

    const response = {
      status: result.status,
      check: 'database',
      details: result.details,
      duration: result.duration,
      timestamp: result.timestamp,
    };

    if (result.status === 'error') {
      throw new HttpException(response, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return response;
  }

  /**
   * Cache connectivity and performance health check
   * GET /health/cache
   */
  @Get('cache')
  async getCacheHealth() {
    const result: HealthCheckResult = await this.healthService.getCacheHealth();

    const response = {
      status: result.status,
      check: 'cache',
      details: result.details,
      duration: result.duration,
      timestamp: result.timestamp,
    };

    if (result.status === 'error') {
      throw new HttpException(response, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return response;
  }

  /**
   * External services health check
   * GET /health/external
   */
  @Get('external')
  async getExternalServicesHealth() {
    const result = await this.healthService.getExternalServicesHealth();

    // Determine overall status - if any external service is down, overall status is error
    const overallStatus =
      result.impactGraph.status === 'ok' && result.openRouterApi.status === 'ok'
        ? 'ok'
        : 'error';

    const response = {
      status: overallStatus,
      check: 'external-services',
      services: {
        impactGraph: {
          status: result.impactGraph.status,
          details: result.impactGraph.details,
          duration: result.impactGraph.duration,
          timestamp: result.impactGraph.timestamp,
        },
        openRouterApi: {
          status: result.openRouterApi.status,
          details: result.openRouterApi.details,
          duration: result.openRouterApi.duration,
          timestamp: result.openRouterApi.timestamp,
        },
      },
      timestamp: new Date().toISOString(),
    };

    if (overallStatus === 'error') {
      throw new HttpException(response, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return response;
  }

  /**
   * Comprehensive health report with all metrics
   * GET /health/detailed
   */
  @Get('detailed')
  async getDetailedHealth() {
    const result: DetailedHealthReport =
      await this.healthService.getDetailedHealthReport();

    const response = {
      status: result.status,
      service: 'donation-agent-evaluator-service',
      uptime: result.uptime,
      memory: result.memory,
      checks: {
        database: {
          status: result.database.status,
          details: result.database.details,
          duration: result.database.duration,
          timestamp: result.database.timestamp,
        },
        cache: {
          status: result.cache.status,
          details: result.cache.details,
          duration: result.cache.duration,
          timestamp: result.cache.timestamp,
        },
        external: {
          impactGraph: {
            status: result.external.impactGraph.status,
            details: result.external.impactGraph.details,
            duration: result.external.impactGraph.duration,
            timestamp: result.external.impactGraph.timestamp,
          },
          openRouterApi: {
            status: result.external.openRouterApi.status,
            details: result.external.openRouterApi.details,
            duration: result.external.openRouterApi.duration,
            timestamp: result.external.openRouterApi.timestamp,
          },
        },
      },
      timestamp: result.timestamp,
    };

    if (result.status === 'error') {
      throw new HttpException(response, HttpStatus.SERVICE_UNAVAILABLE);
    }

    return response;
  }
}
