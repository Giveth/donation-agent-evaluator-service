import { Inject, Injectable } from '@nestjs/common';
import { Logger } from 'nestjs-pino';
import { ConfigService } from '@nestjs/config';
import { TypeOrmHealthIndicator, HttpHealthIndicator } from '@nestjs/terminus';
import { Cache } from 'cache-manager';
import { CACHE_MANAGER } from '@nestjs/cache-manager';

// Constants
const HEALTH_CHECK_CACHE_KEY = 'health_check_test';

export interface HealthCheckResult {
  status: 'ok' | 'error';
  details?: Record<string, unknown>;
  duration?: number;
  timestamp: string;
}

export interface DetailedHealthReport {
  status: 'ok' | 'error';
  uptime: number;
  memory: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
    arrayBuffers: number;
  };
  database: HealthCheckResult;
  cache: HealthCheckResult;
  external: {
    impactGraph: HealthCheckResult;
    openRouterApi: HealthCheckResult;
  };
  timestamp: string;
}

@Injectable()
export class HealthService {
  private readonly healthCheckTimeout: number;
  private readonly startTime: number;

  constructor(
    private readonly logger: Logger,
    private readonly typeOrmHealthIndicator: TypeOrmHealthIndicator,
    private readonly httpHealthIndicator: HttpHealthIndicator,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    this.healthCheckTimeout = parseInt(
      this.configService.get('HEALTH_CHECK_TIMEOUT', '10000'),
      10,
    );
    this.startTime = Date.now();
  }

  /**
   * Basic application health check
   */
  getBasicHealth(): HealthCheckResult {
    try {
      const uptime = Date.now() - this.startTime;
      const memoryUsage = process.memoryUsage();

      return {
        status: 'ok',
        details: {
          uptime: Math.floor(uptime / 1000), // uptime in seconds
          memory: {
            rss: Math.round(memoryUsage.rss / 1024 / 1024), // MB
            heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024), // MB
            heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
            external: Math.round(memoryUsage.external / 1024 / 1024), // MB
            arrayBuffers: Math.round(memoryUsage.arrayBuffers / 1024 / 1024), // MB
          },
          version: process.env.npm_package_version ?? '1.0.0',
          nodeVersion: process.version,
          environment: this.configService.get('NODE_ENV', 'development'),
        },
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      this.logger.error('Basic health check failed', error);
      return {
        status: 'error',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Database connectivity health check
   */
  async getDatabaseHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      const result = await this.typeOrmHealthIndicator.pingCheck('database', {
        timeout: this.healthCheckTimeout,
      });

      const duration = Date.now() - startTime;

      return {
        status: 'ok',
        details: result,
        duration,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Database health check failed', error);
      return {
        status: 'error',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        duration,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Cache connectivity and performance health check
   */
  async getCacheHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      const testKey = HEALTH_CHECK_CACHE_KEY;
      const testValue = 'test_value';

      // Test cache write
      await this.cacheManager.set(testKey, testValue, 1000); // 1 second TTL

      // Test cache read
      const retrievedValue = await this.cacheManager.get(testKey);

      // Test cache delete
      await this.cacheManager.del(testKey);

      const duration = Date.now() - startTime;

      if (retrievedValue === testValue) {
        return {
          status: 'ok',
          details: {
            operations: ['set', 'get', 'del'],
            performance: `${duration}ms`,
          },
          duration,
          timestamp: new Date().toISOString(),
        };
      } else {
        throw new Error('Cache read/write test failed');
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Cache health check failed', error);
      return {
        status: 'error',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        duration,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * External services health check
   */
  async getExternalServicesHealth(): Promise<{
    impactGraph: HealthCheckResult;
    openRouterApi: HealthCheckResult;
  }> {
    const [impactGraphResult, openRouterResult] = await Promise.allSettled([
      this.checkImpactGraphHealth(),
      this.checkOpenRouterApiHealth(),
    ]);

    return {
      impactGraph:
        impactGraphResult.status === 'fulfilled'
          ? impactGraphResult.value
          : {
              status: 'error',
              details: {
                error:
                  impactGraphResult.reason instanceof Error
                    ? impactGraphResult.reason.message
                    : 'Unknown error',
              },
              timestamp: new Date().toISOString(),
            },
      openRouterApi:
        openRouterResult.status === 'fulfilled'
          ? openRouterResult.value
          : {
              status: 'error',
              details: {
                error:
                  openRouterResult.reason instanceof Error
                    ? openRouterResult.reason.message
                    : 'Unknown error',
              },
              timestamp: new Date().toISOString(),
            },
    };
  }

  /**
   * Impact Graph service health check
   */
  private async checkImpactGraphHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      const impactGraphUrl = this.configService.get<string>(
        'IMPACT_GRAPH_URL',
        'https://impact-graph.serve.giveth.io/graphql',
      );

      const result = await this.httpHealthIndicator.pingCheck(
        'impact-graph',
        impactGraphUrl,
        { timeout: this.healthCheckTimeout },
      );

      const duration = Date.now() - startTime;

      return {
        status: 'ok',
        details: {
          ...result,
          service: 'Impact Graph GraphQL API',
        },
        duration,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('Impact Graph health check failed', error);
      return {
        status: 'error',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          service: 'Impact Graph GraphQL API',
        },
        duration,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * OpenRouter API health check
   */
  private async checkOpenRouterApiHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      // Use HTTP health indicator to check OpenRouter API
      const result = await this.httpHealthIndicator.pingCheck(
        'openrouter-api',
        'https://openrouter.ai/api/v1/models',
        { timeout: this.healthCheckTimeout },
      );

      const duration = Date.now() - startTime;

      return {
        status: 'ok',
        details: {
          ...result,
          service: 'OpenRouter API',
        },
        duration,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logger.error('OpenRouter API health check failed', error);
      return {
        status: 'error',
        details: {
          error: error instanceof Error ? error.message : 'Unknown error',
          service: 'OpenRouter API',
        },
        duration,
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Comprehensive health report
   */
  async getDetailedHealthReport(): Promise<DetailedHealthReport> {
    const basicHealth = this.getBasicHealth();
    const databaseHealth = await this.getDatabaseHealth();
    const cacheHealth = await this.getCacheHealth();
    const externalHealth = await this.getExternalServicesHealth();

    const overallStatus = [
      basicHealth.status,
      databaseHealth.status,
      cacheHealth.status,
      externalHealth.impactGraph.status,
      externalHealth.openRouterApi.status,
    ].every(status => status === 'ok')
      ? 'ok'
      : 'error';

    return {
      status: overallStatus,
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      memory: basicHealth.details?.memory as {
        rss: number;
        heapTotal: number;
        heapUsed: number;
        external: number;
        arrayBuffers: number;
      },
      database: databaseHealth,
      cache: cacheHealth,
      external: externalHealth,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Simple health status check for Terminus compatibility
   */
  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.getDetailedHealthReport();
      return result.status === 'ok';
    } catch (error) {
      this.logger.error('Health check failed', error);
      return false;
    }
  }
}
