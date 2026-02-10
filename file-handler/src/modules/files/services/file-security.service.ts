import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { ClamavService } from '../../clamav/clamav.service';
import { FileMetadata } from './file-validation.service';

export interface ScanResult {
  clean: boolean;
  infected: boolean;
  viruses: string[];
  scanTime: number;
}

export interface SecurityCheckResult {
  passed: boolean;
  validationErrors: string[];
  scanResult?: ScanResult;
  warnings: string[];
}

@Injectable()
export class FileSecurityService {
  private readonly logger = new Logger(FileSecurityService.name);
  private readonly ENABLE_VIRUS_SCAN: boolean;

  constructor(
    private configService: ConfigService,
    private clamavService: ClamavService,
  ) {
    this.ENABLE_VIRUS_SCAN =
      this.configService.get<string>('ENABLE_VIRUS_SCAN', 'true') === 'true';
  }

  /**
   * Perform comprehensive security check on file
   */
  async performSecurityCheck(
    file: FileMetadata,
    validationErrors: string[],
  ): Promise<SecurityCheckResult> {
    const result: SecurityCheckResult = {
      passed: true,
      validationErrors,
      warnings: [],
    };

    // Check if validation passed
    if (validationErrors.length > 0) {
      result.passed = false;
      this.logger.warn(
        `File ${file.originalName} failed validation: ${validationErrors.join(', ')}`,
      );
      return result;
    }

    // Perform virus scan if enabled
    if (this.ENABLE_VIRUS_SCAN) {
      this.logger.log(`Starting virus scan for: ${file.originalName}`);

      try {
        const scanResult = await this.scanFile(file);
        result.scanResult = scanResult;

        if (scanResult.infected) {
          result.passed = false;
          this.logger.error(
            `File ${file.originalName} is infected with: ${scanResult.viruses.join(', ')}`,
          );
        } else {
          this.logger.log(`File ${file.originalName} is clean`);
        }
      } catch (error) {
        this.logger.error(`Virus scan failed: ${error.message}`, error.stack);
        result.warnings.push('Virus scan failed, proceeding with caution');
      }
    } else {
      this.logger.warn('Virus scanning is disabled');
      result.warnings.push('Virus scanning is disabled');
    }

    // Additional security checks can be added here
    // For example: PII detection, content analysis, etc.

    return result;
  }

  /**
   * Scan file for viruses using ClamAV
   */
  private async scanFile(file: FileMetadata): Promise<ScanResult> {
    const startTime = Date.now();

    try {
      const isInfected = await this.clamavService.scanBuffer(file.buffer);
      const scanTime = Date.now() - startTime;

      if (isInfected) {
        return {
          clean: false,
          infected: true,
          viruses: ['Virus detected'],
          scanTime,
        };
      }

      return {
        clean: true,
        infected: false,
        viruses: [],
        scanTime,
      };
    } catch (error) {
      this.logger.error(`ClamAV scan error: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Generate signed URL for secure file access
   */
  async generateSignedUrl(
    storagePath: string,
    expiresIn: number = 3600, // 1 hour default
  ): Promise<string> {
    // This would integrate with S3-Ferry or S3 directly
    // For now, return a placeholder
    this.logger.log(`Generating signed URL for: ${storagePath} (${expiresIn}s)`);

    // In production, use AWS SDK's getSignedUrl or similar
    const signedUrl = `${this.configService.get<string>(
      'S3_ENDPOINT_URL',
    )}/files/${storagePath}?expires=${Date.now() + expiresIn * 1000}`;

    return signedUrl;
  }

  /**
   * Verify signed URL
   */
  verifySignedUrl(signedUrl: string): boolean {
    // Verify URL signature and expiration
    // This is a placeholder - implement proper verification
    const urlParams = new URL(signedUrl).searchParams;
    const expires = parseInt(urlParams.get('expires') || '0');

    if (expires < Date.now()) {
      this.logger.warn('Signed URL has expired');
      return false;
    }

    return true;
  }

  /**
   * Audit log for file operations
   */
  auditLog(
    action: string,
    fileId: string,
    userId: string,
    metadata?: Record<string, any>,
  ): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      action,
      fileId,
      userId,
      ...metadata,
    };

    this.logger.log(`AUDIT: ${JSON.stringify(logEntry)}`);

    // In production, send to OpenSearch or audit database
    // This is where you'd integrate with Bürokratt's logging system
  }

  /**
   * Check if user has permission to access file
   */
  async checkAccessPermission(
    fileId: string,
    userId: string,
    action: 'read' | 'write' | 'delete',
  ): Promise<boolean> {
    // This would integrate with TIM and the database
    // For now, perform basic checks

    // Check if user is authenticated
    if (!userId) {
      this.logger.warn('Access denied: No user ID provided');
      return false;
    }

    // Check if file belongs to user's organization/chat
    // This would query the database to verify ownership

    // Placeholder: allow access for now
    return true;
  }

  /**
   * Calculate file checksum
   */
  calculateChecksum(buffer: Buffer, algorithm: string = 'sha256'): string {
    return crypto.createHash(algorithm).update(buffer).digest('hex');
  }
}
