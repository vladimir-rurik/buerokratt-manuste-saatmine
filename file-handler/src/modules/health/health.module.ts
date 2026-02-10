import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { DatabaseService } from '../database/database.service';
import { DatabaseModule } from '../database/database.module';
import { ClamavService } from '../clamav/clamav.service';
import { ClamavModule } from '../clamav/clamav.module';
import { StorageService } from '../storage/storage.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [DatabaseModule, ClamavModule, StorageModule],
  controllers: [HealthController],
})
export class HealthModule {}
