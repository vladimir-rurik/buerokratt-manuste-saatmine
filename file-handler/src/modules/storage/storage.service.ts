import { Injectable, Logger, HttpException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

export interface CreateFileRequest {
  files: Array<{
    storageAccountId: string;
    container: string;
    fileName: string;
  }>;
  content: string;
  multipart?: boolean;
  chunkSize?: number;
}

export interface DeleteFileRequest {
  files: Array<{
    storageAccountId: string;
    container: string;
    fileName: string;
  }>;
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);
  private readonly S3_FERRY_URL: string;

  constructor(private configService: ConfigService) {
    this.S3_FERRY_URL = this.configService.get<string>('S3_FERRY_URL', 'http://s3-ferry:3000');
  }

  /**
   * Create file via S3-Ferry
   */
  async createFile(request: CreateFileRequest): Promise<any> {
    try {
      this.logger.log(
        `Creating file: ${request.files[0].fileName} in container ${request.files[0].container}`,
      );

      const response = await axios.post(`${this.S3_FERRY_URL}/v1/files/create`, request, {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 300000, // 5 minutes timeout for large files
      });

      this.logger.log(`File created successfully: ${request.files[0].fileName}`);
      return response.data;
    } catch (error) {
      this.logger.error(`Failed to create file: ${error.message}`, error.stack);
      throw new HttpException(
        `Failed to create file: ${error.message}`,
        error.response?.status || 500,
      );
    }
  }

  /**
   * Delete file via S3-Ferry
   */
  async deleteFile(request: DeleteFileRequest): Promise<void> {
    try {
      this.logger.log(
        `Deleting file: ${request.files[0].fileName} from container ${request.files[0].container}`,
      );

      const response = await axios.delete(`${this.S3_FERRY_URL}/v1/files/delete`, {
        data: request,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      this.logger.log(`File deleted successfully: ${request.files[0].fileName}`);
    } catch (error) {
      this.logger.error(`Failed to delete file: ${error.message}`, error.stack);
      throw new HttpException(
        `Failed to delete file: ${error.message}`,
        error.response?.status || 500,
      );
    }
  }

  /**
   * Get storage accounts
   */
  async getStorageAccounts(): Promise<string[]> {
    try {
      const response = await axios.get(`${this.S3_FERRY_URL}/v1/storage-accounts`);

      return response.data.map((acc: any) => acc.id);
    } catch (error) {
      this.logger.error(`Failed to get storage accounts: ${error.message}`);
      throw new HttpException(
        `Failed to get storage accounts: ${error.message}`,
        error.response?.status || 500,
      );
    }
  }
}
