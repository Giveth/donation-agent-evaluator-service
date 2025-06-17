import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ImpactGraphService } from './services/impact-graph.service';

@Module({
  imports: [
    HttpModule.register({
      timeout: 30000, // 30 second timeout
      maxRedirects: 5,
    }),
  ],
  providers: [ImpactGraphService],
  exports: [ImpactGraphService],
})
export class DataFetchingModule {}
