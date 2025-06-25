import { Module } from '@nestjs/common';
import { EvaluationService } from './evaluation.service';
import { EvaluationController } from './evaluation.controller';
import { DataFetchingModule } from '../data-fetching/data-fetching.module';
import { SocialMediaStorageModule } from '../social-media-storage/social-media-storage.module';
import { LLMIntegrationModule } from '../llm-integration/llm-integration.module';

@Module({
  imports: [
    DataFetchingModule,
    SocialMediaStorageModule,
    LLMIntegrationModule,
    // TODO: Add ScoringModule when Phase 9 is implemented
  ],
  providers: [EvaluationService],
  controllers: [EvaluationController],
  exports: [EvaluationService],
})
export class EvaluationModule {}
