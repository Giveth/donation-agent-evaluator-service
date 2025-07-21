import { Module } from '@nestjs/common';
import { LoggerModule } from '../../core/logger/logger.module';
import { EvaluationService } from './evaluation.service';
import { EvaluationController } from './evaluation.controller';
import { DataFetchingModule } from '../data-fetching/data-fetching.module';
import { SocialMediaStorageModule } from '../social-media-storage/social-media-storage.module';
import { LLMIntegrationModule } from '../llm-integration/llm-integration.module';
import { ScoringModule } from '../scoring/scoring.module';

@Module({
  imports: [
    LoggerModule,
    DataFetchingModule,
    SocialMediaStorageModule,
    LLMIntegrationModule,
    ScoringModule,
  ],
  providers: [EvaluationService],
  controllers: [EvaluationController],
  exports: [EvaluationService],
})
export class EvaluationModule {}
