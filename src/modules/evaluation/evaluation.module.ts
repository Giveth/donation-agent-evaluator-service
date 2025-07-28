import { Module } from '@nestjs/common';
import { EvaluationService } from './evaluation.service';
import { EvaluationController } from './evaluation.controller';
import { CsvLoggerService } from './services/csv-logger.service';
import { DataFetchingModule } from '../data-fetching/data-fetching.module';
import { SocialMediaStorageModule } from '../social-media-storage/social-media-storage.module';
import { LLMIntegrationModule } from '../llm-integration/llm-integration.module';
import { ScoringModule } from '../scoring/scoring.module';

@Module({
  imports: [
    DataFetchingModule,
    SocialMediaStorageModule,
    LLMIntegrationModule,
    ScoringModule,
  ],
  providers: [EvaluationService, CsvLoggerService],
  controllers: [EvaluationController],
  exports: [EvaluationService],
})
export class EvaluationModule {}
