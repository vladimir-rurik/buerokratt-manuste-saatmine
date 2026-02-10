import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

export interface CreateFileRecordDto {
  fileId: string;
  filename: string;
  storagePath: string;
  storageAccountId: string;
  container: string;
  size: number;
  mimeType: string;
  checksum: string;
  chatId?: string;
  uploadedBy: string;
  scanStatus: string;
  scanResult?: string;
}

@Injectable()
export class FilesService {
  private readonly logger = new Logger(FilesService.name);

  constructor(private databaseService: DatabaseService) {}

  /**
   * Create file record in database
   */
  async createFileRecord(dto: CreateFileRecordDto): Promise<any> {
    this.logger.log(`Creating file record: ${dto.fileId}`);

    const query = `
      INSERT INTO file_attachments (
        id, filename, original_filename, mime_type, size_bytes,
        storage_path, storage_account_id, container, checksum,
        chat_id, uploaded_by, uploaded_at, scan_status, scan_result
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12, $13)
      RETURNING *
    `;

    const values = [
      dto.fileId,
      dto.filename,
      dto.filename, // Assuming filename == original_filename for now
      dto.mimeType,
      dto.size,
      dto.storagePath,
      dto.storageAccountId,
      dto.container,
      dto.checksum,
      dto.chatId || null,
      dto.uploadedBy,
      dto.scanStatus,
      dto.scanResult || null,
    ];

    try {
      const result = await this.databaseService.query(query, values);
      this.logger.log(`File record created: ${dto.fileId}`);
      return result.rows[0];
    } catch (error) {
      this.logger.error(`Failed to create file record: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get file record by ID
   */
  async getFileRecord(fileId: string): Promise<any> {
    const query = 'SELECT * FROM file_attachments WHERE id = $1';

    try {
      const result = await this.databaseService.query(query, [fileId]);
      return result.rows[0] || null;
    } catch (error) {
      this.logger.error(`Failed to get file record: ${error.message}`);
      throw error;
    }
  }

  /**
   * Delete file record
   */
  async deleteFileRecord(fileId: string): Promise<void> {
    const query = 'DELETE FROM file_attachments WHERE id = $1';

    try {
      await this.databaseService.query(query, [fileId]);
      this.logger.log(`File record deleted: ${fileId}`);
    } catch (error) {
      this.logger.error(`Failed to delete file record: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update scan status
   */
  async updateScanStatus(
    fileId: string,
    status: string,
    result?: string,
  ): Promise<void> {
    const query = `
      UPDATE file_attachments
      SET scan_status = $1, scan_result = $2
      WHERE id = $3
    `;

    try {
      await this.databaseService.query(query, [status, result || null, fileId]);
      this.logger.log(`Scan status updated: ${fileId} -> ${status}`);
    } catch (error) {
      this.logger.error(`Failed to update scan status: ${error.message}`);
      throw error;
    }
  }
}
