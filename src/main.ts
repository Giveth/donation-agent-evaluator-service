import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './core/common/exceptions/global-exception.filter';
import helmet from 'helmet';
import {
  json,
  urlencoded,
  type Request,
  type Response,
  type NextFunction,
} from 'express';

const logger = new Logger('Bootstrap');

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Get ConfigService for environment variables
  const configService = app.get(ConfigService);
  const port = parseInt(configService.get('PORT', '3000'), 10);
  const nodeEnv = configService.get('NODE_ENV', 'development');

  // ===========================================
  // SECURITY CONFIGURATIONS
  // ===========================================

  // CORS Configuration - Enable for Impact Graph integration
  const corsOrigins = configService.get<string>(
    'CORS_ORIGIN',
    'http://localhost:3000',
  );
  const corsCredentials =
    configService.get('CORS_CREDENTIALS', 'false') === 'true';

  app.enableCors({
    origin: corsOrigins.split(',').map((origin: string) => origin.trim()),
    credentials: corsCredentials,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'Accept',
    ],
    exposedHeaders: ['X-Total-Count', 'X-Page-Count'],
    maxAge: 86400, // 24 hours
  });

  // Helmet Security Headers
  if (configService.get('SECURITY_HELMET_ENABLED', 'true') === 'true') {
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: [
              "'self'",
              'https://impact-graph.serve.giveth.io',
              'https://openrouter.ai',
            ],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
          },
        },
        crossOriginEmbedderPolicy: false, // Disable for API service
        hsts: {
          maxAge: 31536000, // 1 year
          includeSubDomains: true,
          preload: false,
        },
        frameguard: { action: 'deny' },
        noSniff: true,
        xssFilter: true,
        referrerPolicy: { policy: 'same-origin' },
      }),
    );
  }

  // Request Limits Configuration
  const requestTimeout = parseInt(
    configService.get('REQUEST_TIMEOUT', '30000'),
    10,
  );
  const bodyParserLimit = configService.get('BODY_PARSER_LIMIT', '10mb');

  // Configure body parser limits
  app.use(json({ limit: bodyParserLimit }));
  app.use(urlencoded({ extended: true, limit: bodyParserLimit }));

  // Set request timeout
  app.use((req: Request, res: Response, next: NextFunction) => {
    req.setTimeout(requestTimeout, () => {
      const err = new Error('Request timeout');
      err.name = 'RequestTimeoutError';
      next(err);
    });
    res.setTimeout(requestTimeout, () => {
      const err = new Error('Response timeout');
      err.name = 'ResponseTimeoutError';
      next(err);
    });
    next();
  });

  // ===========================================
  // GLOBAL CONFIGURATIONS
  // ===========================================

  // Global Validation Pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
      disableErrorMessages: nodeEnv === 'production',
      validationError: {
        target: false,
        value: false,
      },
    }),
  );

  // Register global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  // ===========================================
  // GRACEFUL SHUTDOWN HANDLERS
  // ===========================================

  // Handle graceful shutdown
  const gracefulShutdown = async (signal: string) => {
    logger.log(`Received ${signal}, starting graceful shutdown...`);

    try {
      // Close HTTP server
      await app.close();
      logger.log('HTTP server closed');

      // Additional cleanup if needed
      logger.log('Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown:', error);
      process.exit(1);
    }
  };

  // Register signal handlers
  process.on('SIGTERM', () => void gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => void gracefulShutdown('SIGINT'));

  // Handle uncaught exceptions
  process.on('uncaughtException', error => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  // ===========================================
  // START SERVER
  // ===========================================

  await app.listen(port);
  logger.log(`Application is running on port ${port} in ${nodeEnv} mode`);
  logger.log(`CORS enabled for origins: ${corsOrigins}`);
  logger.log(
    `Security headers enabled: ${configService.get('SECURITY_HELMET_ENABLED', 'true')}`,
  );
}

bootstrap().catch(err => {
  logger.error('Error during application bootstrap:', err);
  process.exit(1);
});
