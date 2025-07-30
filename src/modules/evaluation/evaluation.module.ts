import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EvaluationService } from './evaluation.service';
import { EvaluationController } from './evaluation.controller';
import { CsvLoggerService } from './services/csv-logger.service';
import { EvaluationQueueService } from './services/evaluation-queue.service';
import { EvaluationWorkerService } from './services/evaluation-worker.service';
import { ScheduledJob } from '../social-media-storage/entities/scheduled-job.entity';
import { DataFetchingModule } from '../data-fetching/data-fetching.module';
import { SocialMediaStorageModule } from '../social-media-storage/social-media-storage.module';
import { LLMIntegrationModule } from '../llm-integration/llm-integration.module';
import { ScoringModule } from '../scoring/scoring.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ScheduledJob]),
    DataFetchingModule,
    SocialMediaStorageModule,
    LLMIntegrationModule,
    ScoringModule,
  ],
  providers: [
    EvaluationService,
    CsvLoggerService,
    EvaluationQueueService,
    EvaluationWorkerService,
  ],
  controllers: [EvaluationController],
  exports: [EvaluationService, EvaluationQueueService],
})
export class EvaluationModule {}
