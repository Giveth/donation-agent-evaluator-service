import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CauseCache } from './entities/cause-cache.entity';
import { CauseCacheService } from './services/cause-cache.service';

@Module({
  imports: [TypeOrmModule.forFeature([CauseCache])],
  providers: [CauseCacheService],
  exports: [CauseCacheService],
})
export class DataFetchingModule {}
