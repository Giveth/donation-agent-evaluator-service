import { Module } from '@nestjs/common';
import { ScoringService } from './scoring.service';
import { LLMIntegrationModule } from '../llm-integration/llm-integration.module';

@Module({
  imports: [LLMIntegrationModule],
  providers: [ScoringService],
  exports: [ScoringService],
})
export class ScoringModule {}
