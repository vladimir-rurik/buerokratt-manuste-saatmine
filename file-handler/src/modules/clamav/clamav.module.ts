import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClamavService } from './clamav.service';

@Module({
  providers: [ClamavService],
  exports: [ClamavService],
})
export class ClamavModule {
  constructor(private configService: ConfigService) {}
}
