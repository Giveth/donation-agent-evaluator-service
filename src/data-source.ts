import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

// Load environment variables
dotenv.config();

const configService = new ConfigService();

export default new DataSource({
  type: 'postgres',
  url: configService.get('DATABASE_URL'),
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
          console.log('DEBUG: PGSSLROOTCERT environment variable:', caCertPath);
          console.log('DEBUG: Current working directory:', process.cwd());
          console.log('DEBUG: All SSL-related env vars:', {
            PGSSLROOTCERT: process.env.PGSSLROOTCERT,
            DATABASE_SSL_REJECT_UNAUTHORIZED:
              process.env.DATABASE_SSL_REJECT_UNAUTHORIZED,
            NODE_ENV: process.env.NODE_ENV,
          });

          if (caCertPath && fs.existsSync(caCertPath)) {
            try {
              console.log('DEBUG: Reading CA certificate from:', caCertPath);
              sslConfig.ca = fs.readFileSync(caCertPath, 'utf8');
              console.log(
                'DEBUG: CA certificate loaded successfully, length:',
                sslConfig.ca.length,
              );
            } catch (error) {
              console.warn(
                'Failed to read SSL CA certificate:',
                (error as Error).message,
              );
            }
          } else {
            console.warn(
              'DEBUG: CA certificate file not found or path empty:',
              {
                path: caCertPath,
                exists: caCertPath ? fs.existsSync(caCertPath) : false,
              },
            );
          }

          return sslConfig;
        })()
      : false,
});
