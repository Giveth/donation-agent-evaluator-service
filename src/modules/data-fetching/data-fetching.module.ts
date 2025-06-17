import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { CauseCache } from './entities/cause-cache.entity';
import { CauseCacheService } from './services/cause-cache.service';
import { ImpactGraphService } from './services/impact-graph.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CauseCache]),
    HttpModule.register({
      timeout: 30000, // 30 second timeout
      maxRedirects: 5,
    }),
  ],
  providers: [CauseCacheService, ImpactGraphService],
  exports: [CauseCacheService, ImpactGraphService],
})
export class DataFetchingModule {}
