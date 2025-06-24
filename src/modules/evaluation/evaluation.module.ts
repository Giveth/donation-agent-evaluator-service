import { Module } from '@nestjs/common';
import { EvaluationService } from './evaluation.service';
import { EvaluationController } from './evaluation.controller';
import { DataFetchingModule } from '../data-fetching/data-fetching.module';
import { SocialMediaStorageModule } from '../social-media-storage/social-media-storage.module';

@Module({
  imports: [
    DataFetchingModule,
    SocialMediaStorageModule,
    // TODO: Add LLMIntegrationModule when Phase 8 is implemented
    // TODO: Add ScoringModule when Phase 9 is implemented
  ],
  providers: [EvaluationService],
  controllers: [EvaluationController],
  exports: [EvaluationService],
})
export class EvaluationModule {}
