import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';
import { DatabaseService } from './database.service';

@Module({
  providers: [
    {
      provide: 'DATABASE_POOL',
      useFactory: (configService: ConfigService) => {
        return new Pool({
          host: configService.get<string>('DB_HOST', 'localhost'),
          port: configService.get<number>('DB_PORT', 5432),
          database: configService.get<string>('DB_NAME', 'byk'),
          user: configService.get<string>('DB_USER', 'byk'),
          password: configService.get<string>('DB_PASSWORD', '01234'),
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 2000,
        });
      },
      inject: [ConfigService],
    },
    DatabaseService,
  ],
  exports: [DatabaseService],
})
export class DatabaseModule {}
