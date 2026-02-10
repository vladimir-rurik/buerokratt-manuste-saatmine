import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as NodeClam from 'clamav.js';

@Injectable()
export class ClamavService implements OnModuleInit {
  private readonly logger = new Logger(ClamavService.name);
  private clamav: NodeClam;
  private readonly CLAMAV_HOST: string;
  private readonly CLAMAV_PORT: number;
  private readonly CLAMAV_TIMEOUT: number;

  constructor(private configService: ConfigService) {
    this.CLAMAV_HOST =
      this.configService.get<string>('CLAMAV_HOST', 'localhost');
    this.CLAMAV_PORT =
      this.configService.get<number>('CLAMAV_PORT', 3310);
    this.CLAMAV_TIMEOUT =
      this.configService.get<number>('CLAMAV_TIMEOUT', 60000);
  }

  async onModuleInit() {
    await this.initializeClamAV();
  }

  /**
   * Initialize ClamAV connection
   */
  private async initializeClamAV(): Promise<void> {
    try {
      this.clamav = await NodeClam.init({
        clamdscan: {
          host: this.CLAMAV_HOST,
          port: this.CLAMAV_PORT,
          timeout: this.CLAMAV_TIMEOUT,
        },
        clamscan: {
          path: '/usr/bin/clamscan',
          db: '/var/lib/clamav',
          scanRecursively: true,
        },
      });

      // Test connection
      const isInitialized = await this.clamav.init();
      if (isInitialized) {
        this.logger.log(
          `ClamAV initialized successfully at ${this.CLAMAV_HOST}:${this.CLAMAV_PORT}`,
        );
      } else {
        this.logger.warn('ClamAV initialization returned false');
      }
    } catch (error) {
      this.logger.error(`Failed to initialize ClamAV: ${error.message}`);
      // Don't throw - allow service to start without ClamAV
      // Scans will fail gracefully
    }
  }

  /**
   * Scan buffer for viruses
   */
  async scanBuffer(buffer: Buffer): Promise<boolean> {
    if (!this.clamav) {
      this.logger.warn('ClamAV not initialized, skipping scan');
      return false; // Assume clean if scanner not available
    }

    try {
      this.logger.debug(`Scanning buffer of size ${buffer.length}`);

      const result = await this.clamav.scanBuffer(buffer);

      if (result.isInfected) {
        this.logger.warn(`Virus detected: ${result.viruses.join(', ')}`);
        return true;
      }

      this.logger.debug('Scan completed: file is clean');
      return false;
    } catch (error) {
      this.logger.error(`ClamAV scan error: ${error.message}`);
      throw new Error(`Virus scan failed: ${error.message}`);
    }
  }

  /**
   * Scan file by path
   */
  async scanFile(filePath: string): Promise<boolean> {
    if (!this.clamav) {
      this.logger.warn('ClamAV not initialized, skipping scan');
      return false;
    }

    try {
      this.logger.debug(`Scanning file: ${filePath}`);

      const result = await this.clamav.scanFile(filePath);

      if (result.isInfected) {
        this.logger.warn(`Virus detected in ${filePath}: ${result.viruses.join(', ')}`);
        return true;
      }

      this.logger.debug(`Scan completed: ${filePath} is clean`);
      return false;
    } catch (error) {
      this.logger.error(`ClamAV scan error: ${error.message}`);
      throw new Error(`Virus scan failed: ${error.message}`);
    }
  }

  /**
   * Get ClamAV version
   */
  async getVersion(): Promise<string> {
    if (!this.clamav) {
      return 'Not initialized';
    }

    try {
      const version = await this.clamav.getVersion();
      return version;
    } catch (error) {
      this.logger.error(`Failed to get ClamAV version: ${error.message}`);
      return 'Unknown';
    }
  }
}
