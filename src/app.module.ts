import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from './core/config/config.module';
import { CacheModule } from './core/cache/cache.module';

@Module({
  imports: [ConfigModule, CacheModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
