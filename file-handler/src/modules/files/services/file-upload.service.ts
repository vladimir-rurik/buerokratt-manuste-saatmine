import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { v4 as uuidv4 } from 'uuid';
import * as crypto from 'crypto';
import { StorageService } from '../../storage/storage.service';
import { FileMetadata } from './file-validation.service';

export interface UploadResult {
  fileId: string;
  filename: string;
  storagePath: string;
  storageAccountId: string;
  container: string;
  size: number;
  mimeType: string;
  checksum: string;
  uploadedAt: Date;
}

export interface MultipartUploadOptions {
  chunkSize?: number; // Default: 5MB
  maxConcurrentParts?: number; // Default: 5
}

@Injectable()
export class FileUploadService {
  private readonly logger = new Logger(FileUploadService.name);
  private readonly DEFAULT_CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
  private readonly MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100MB

  constructor(
    private configService: ConfigService,
    private storageService: StorageService,
  ) {}

  /**
   * Upload file to S3-compatible storage
   */
  async uploadFile(
    file: FileMetadata,
    options: MultipartUploadOptions = {},
  ): Promise<UploadResult> {
    const fileId = uuidv4();
    const checksum = crypto.createHash('sha256').update(file.buffer).digest('hex');

    this.logger.log(
      `Starting file upload: ${file.originalName} (${file.size} bytes)`,
    );

    try {
      // Determine if multipart upload is needed
      const useMultipart = file.size > this.MULTIPART_THRESHOLD;

      // Generate storage path
      const storagePath = this.generateStoragePath(fileId, file.originalName);
      const container = this.configService.get<string>('S3_DATA_BUCKET_NAME') || 'files';
      const storageAccountId =
        this.configService.get<string>('STORAGE_ACCOUNT_ID') || 's3-default';

      let uploadResult;

      if (useMultipart) {
        this.logger.log(`Using multipart upload for large file`);
        uploadResult = await this.uploadMultipart(
          file,
          storagePath,
          container,
          options,
        );
      } else {
        uploadResult = await this.uploadSingle(file, storagePath, container);
      }

      this.logger.log(
        `File uploaded successfully: ${storagePath} (checksum: ${checksum})`,
      );

      return {
        fileId,
        filename: file.originalName,
        storagePath,
        storageAccountId,
        container,
        size: file.size,
        mimeType: file.mimeType,
        checksum,
        uploadedAt: new Date(),
      };
    } catch (error) {
      this.logger.error(`File upload failed: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to upload file: ${error.message}`);
    }
  }

  /**
   * Single part upload (for files < 100MB)
   */
  private async uploadSingle(
    file: FileMetadata,
    storagePath: string,
    container: string,
  ): Promise<any> {
    // Use S3-Ferry service for actual upload
    const response = await this.storageService.createFile({
      files: [
        {
          storageAccountId: this.configService.get<string>(
            'STORAGE_ACCOUNT_ID',
          ) || 's3-default',
          container,
          fileName: storagePath,
        },
      ],
      content: file.buffer.toString('base64'),
    });

    return response;
  }

  /**
   * Multipart upload (for files > 100MB)
   */
  private async uploadMultipart(
    file: FileMetadata,
    storagePath: string,
    container: string,
    options: MultipartUploadOptions,
  ): Promise<any> {
    const chunkSize = options.chunkSize || this.DEFAULT_CHUNK_SIZE;
    const totalChunks = Math.ceil(file.size / chunkSize);

    this.logger.log(
      `Starting multipart upload: ${totalChunks} chunks of ${chunkSize} bytes`,
    );

    // For now, we'll delegate to S3-Ferry's multipart support
    // In production, you'd use AWS SDK's multipart upload directly
    const response = await this.storageService.createFile({
      files: [
        {
          storageAccountId: this.configService.get<string>(
            'STORAGE_ACCOUNT_ID',
          ) || 's3-default',
          container,
          fileName: storagePath,
        },
      ],
      content: file.buffer.toString('base64'),
      multipart: true,
      chunkSize,
    });

    return response;
  }

  /**
   * Generate storage path with date-based organization
   */
  private generateStoragePath(fileId: string, originalName: string): string {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    // Format: files/YYYY/MM/DD/uuid-filename.ext
    return `files/${year}/${month}/${day}/${fileId}-${this.sanitizeFilename(originalName)}`;
  }

  /**
   * Sanitize filename for storage
   */
  private sanitizeFilename(filename: string): string {
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_')
      .toLowerCase()
      .substring(0, 100);
  }

  /**
   * Delete file from storage
   */
  async deleteFile(
    storageAccountId: string,
    container: string,
    storagePath: string,
  ): Promise<void> {
    this.logger.log(`Deleting file: ${storagePath}`);

    try {
      await this.storageService.deleteFile({
        files: [
          {
            storageAccountId,
            container,
            fileName: storagePath,
          },
        ],
      });

      this.logger.log(`File deleted successfully: ${storagePath}`);
    } catch (error) {
      this.logger.error(`File deletion failed: ${error.message}`, error.stack);
      throw new BadRequestException(`Failed to delete file: ${error.message}`);
    }
  }

  /**
   * Get public URL for file (if applicable)
   */
  getPublicUrl(container: string, storagePath: string): string {
    const endpoint = this.configService.get<string>('S3_ENDPOINT_URL');
    return `${endpoint}/${container}/${storagePath}`;
  }
}
