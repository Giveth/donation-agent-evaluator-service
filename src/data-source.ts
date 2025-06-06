import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as dotenv from 'dotenv';

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
      ? {
          rejectUnauthorized:
            configService.get('DATABASE_SSL_REJECT_UNAUTHORIZED') !== 'false',
        }
      : false,
});
