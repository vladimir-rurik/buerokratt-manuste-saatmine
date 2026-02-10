import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DatabaseService } from '../database/database.service';
import { ClamavService } from '../clamav/clamav.service';
import { StorageService } from '../storage/storage.service';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private databaseService: DatabaseService,
    private clamavService: ClamavService,
    private storageService: StorageService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Health check' })
  async healthCheck() {
    const [dbHealthy, clamavVersion, storageAccounts] = await Promise.all([
      this.databaseService.healthCheck(),
      this.clamavService.getVersion().catch(() => 'unavailable'),
      this.storageService.getStorageAccounts().catch(() => []),
    ]);

    return {
      status: dbHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        database: {
          status: dbHealthy ? 'up' : 'down',
        },
        clamav: {
          status: clamavVersion !== 'unavailable' ? 'up' : 'down',
          version: clamavVersion,
        },
        storage: {
          status: storageAccounts.length > 0 ? 'up' : 'down',
          accounts: storageAccounts,
        },
      },
    };
  }
}
