import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { FilesModule } from './modules/files/files.module';
import { ClamavModule } from './modules/clamav/clamav.module';
import { StorageModule } from './modules/storage/storage.module';
import { DatabaseModule } from './modules/database/database.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 100, // 100 requests per minute
      },
    ]),
    FilesModule,
    ClamavModule,
    StorageModule,
    DatabaseModule,
    HealthModule,
  ],
})
export class AppModule {}
