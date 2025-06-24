import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './core/common/exceptions/global-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Register global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  // Get ConfigService and use environment variable for port
  const configService = app.get(ConfigService);
  const port = parseInt(configService.get('PORT', '3000'), 10);

  await app.listen(port);
}

bootstrap().catch(err => {
  console.error('Error during application bootstrap:', err);
  process.exit(1);
});
