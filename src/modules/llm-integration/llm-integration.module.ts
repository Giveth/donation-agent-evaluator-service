import { Module } from '@nestjs/common';
import { ConfigModule } from '../../core/config/config.module';
import { LLMService } from './llm.service';

@Module({
  imports: [ConfigModule],
  providers: [LLMService],
  exports: [LLMService],
})
export class LLMIntegrationModule {}
