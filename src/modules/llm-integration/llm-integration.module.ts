import { Module } from '@nestjs/common';
import { LoggerModule } from '../../core/logger/logger.module';
import { ConfigModule } from '../../core/config/config.module';
import { LLMService } from './llm.service';

@Module({
  imports: [LoggerModule, ConfigModule],
  providers: [LLMService],
  exports: [LLMService],
})
export class LLMIntegrationModule {}
