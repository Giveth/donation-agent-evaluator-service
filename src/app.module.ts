import { Module } from '@nestjs/common';
import {
  ConfigModule as NestConfigModule,
  ConfigService,
} from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './core/config/config.module';
import { CacheModule } from './core/cache/cache.module';
import { SocialMediaModule } from './modules/social-media/social-media.module';
import { SocialMediaStorageModule } from './modules/social-media-storage/social-media-storage.module';
import { ScheduledJobsModule } from './modules/scheduled-jobs/scheduled-jobs.module';
import { DataFetchingModule } from './modules/data-fetching/data-fetching.module';
import { EvaluationModule } from './modules/evaluation/evaluation.module';
import { LLMIntegrationModule } from './modules/llm-integration/llm-integration.module';
import { ScoringModule } from './modules/scoring/scoring.module';

@Module({
  imports: [
    ConfigModule,
    CacheModule,
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [NestConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        url: configService.get('DATABASE_URL'),
        host: configService.get('POSTGRES_HOST'),
        port: parseInt(configService.get('POSTGRES_PORT', '5432'), 10),
        username: configService.get('POSTGRES_USER'),
        password: configService.get('POSTGRES_PASSWORD'),
        database: configService.get('POSTGRES_DB'),
        entities: [`${__dirname}/**/*.entity{.ts,.js}`],
        synchronize: configService.get('NODE_ENV') === 'development',
        logging:
          configService.get('NODE_ENV') === 'development'
            ? true
            : ['error', 'warn', 'migration'],
        autoLoadEntities: true,

        // Connection pool configuration
        poolSize: parseInt(configService.get('DATABASE_POOL_SIZE', '20'), 10),
        connectTimeoutMS: parseInt(
          configService.get('DATABASE_CONNECTION_TIMEOUT', '30000'),
          10,
        ),

        // Retry configuration for connection failures
        retryAttempts: parseInt(
          configService.get('DATABASE_RETRY_ATTEMPTS', '10'),
          10,
        ),
        retryDelay: parseInt(
          configService.get('DATABASE_RETRY_DELAY', '3000'),
          10,
        ),

        // SSL configuration for production
        ssl:
          configService.get('NODE_ENV') === 'production'
            ? {
                rejectUnauthorized:
                  configService.get('DATABASE_SSL_REJECT_UNAUTHORIZED') !==
                  'false',
              }
            : false,

        // Extra connection options
        extra: {
          // Maximum query execution time (in ms)
          statement_timeout: parseInt(
            configService.get('DATABASE_STATEMENT_TIMEOUT', '60000'),
            10,
          ),
          // Idle transaction timeout
          idle_in_transaction_session_timeout: parseInt(
            configService.get('DATABASE_IDLE_TRANSACTION_TIMEOUT', '60000'),
            10,
          ),
          // Application name for database monitoring
          application_name: configService.get(
            'DATABASE_APPLICATION_NAME',
            'donation-evaluator-service',
          ),
        },

        // Migration configuration
        migrations: [`${__dirname}/database/migrations/*{.ts,.js}`],
        migrationsRun: configService.get('DATABASE_RUN_MIGRATIONS') === 'true',
        migrationsTableName: 'typeorm_migrations',

        // Schema configuration
        schema: configService.get('DATABASE_SCHEMA', 'public'),

        // Timezone configuration
        timezone: configService.get('DATABASE_TIMEZONE', 'Z'),

        // Cache configuration
        cache:
          configService.get('DATABASE_QUERY_CACHE_ENABLED') === 'true'
            ? {
                duration: parseInt(
                  configService.get('DATABASE_QUERY_CACHE_DURATION', '30000'),
                  10,
                ),
              }
            : false,

        // Maximum query execution time logging
        maxQueryExecutionTime: parseInt(
          configService.get('DATABASE_MAX_QUERY_EXECUTION_TIME', '1000'),
          10,
        ),
      }),
    }),
    SocialMediaModule,
    SocialMediaStorageModule,
    ScheduledJobsModule,
    DataFetchingModule,
    LLMIntegrationModule,
    ScoringModule,
    EvaluationModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
