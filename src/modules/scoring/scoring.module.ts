import { Module } from '@nestjs/common';
import { LoggerModule } from '../../core/logger/logger.module';
import { ScoringService } from './scoring.service';
import { LLMIntegrationModule } from '../llm-integration/llm-integration.module';

@Module({
  imports: [LoggerModule, LLMIntegrationModule],
  providers: [ScoringService],
  exports: [ScoringService],
})
export class ScoringModule {}
