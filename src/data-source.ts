import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import pino from 'pino';

// Load environment variables
dotenv.config();

const configService = new ConfigService();

// Create Pino logger for data source configuration
const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  base: {
    service: 'donation-evaluator-service',
    context: 'DataSource',
  },
  transport:
    process.env.NODE_ENV !== 'production'
      ? {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'yyyy-mm-dd HH:MM:ss',
            ignore: 'pid,hostname',
          },
        }
      : undefined,
});

export default new DataSource({
  type: 'postgres',
  // url: configService.get('DATABASE_URL'),
  host: configService.get('POSTGRES_HOST'),
  port: parseInt(configService.get('POSTGRES_PORT', '5432'), 10),
  username: configService.get('POSTGRES_USER'),
  password: configService.get('POSTGRES_PASSWORD'),
  database: configService.get('POSTGRES_DB'),

  // Entity and migration paths
  entities: ['src/**/*.entity{.ts,.js}'],
  migrations: ['src/database/migrations/*{.ts,.js}'],

  // Migration configuration
  synchronize: configService.get('NODE_ENV') === 'development',
  migrationsTableName: 'typeorm_migrations',

  // SSL configuration for production
  ssl:
    configService.get('NODE_ENV') === 'production'
      ? (() => {
          const sslConfig: { rejectUnauthorized: boolean; ca?: string } = {
            rejectUnauthorized:
              configService.get('DATABASE_SSL_REJECT_UNAUTHORIZED') !== 'false',
          };

          // Add CA certificate if available
          const caCertPath = configService.get('PGSSLROOTCERT');
          logger.debug('PGSSLROOTCERT environment variable', {
            caCertPath,
            currentWorkingDirectory: process.cwd(),
            sslEnvVars: {
              PGSSLROOTCERT: process.env.PGSSLROOTCERT,
              DATABASE_SSL_REJECT_UNAUTHORIZED:
                process.env.DATABASE_SSL_REJECT_UNAUTHORIZED,
              NODE_ENV: process.env.NODE_ENV,
            },
          });

          if (caCertPath && fs.existsSync(caCertPath)) {
            try {
              logger.debug('Reading CA certificate from path', { caCertPath });
              sslConfig.ca = fs.readFileSync(caCertPath, 'utf8');
              logger.info('CA certificate loaded successfully', {
                certificateLength: sslConfig.ca.length,
              });
            } catch (error) {
              logger.warn('Failed to read SSL CA certificate', {
                error: (error as Error).message,
                caCertPath,
              });
            }
          } else {
            logger.warn('CA certificate file not found or path empty', {
              path: caCertPath,
              exists: caCertPath ? fs.existsSync(caCertPath) : false,
            });
          }

          return sslConfig;
        })()
      : false,
});
