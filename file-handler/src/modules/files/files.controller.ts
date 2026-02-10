import {
  Controller,
  Post,
  Get,
  Delete,
  UseInterceptors,
  UploadedFile,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { FilesService } from './files.service';
import { FileValidationService } from './services/file-validation.service';
import { FileUploadService } from './services/file-upload.service';
import { FileSecurityService } from './services/file-security.service';

@ApiTags('files')
@Controller()
export class FilesController {
  constructor(
    private filesService: FilesService,
    private validationService: FileValidationService,
    private uploadService: FileUploadService,
    private securityService: FileSecurityService,
  ) {}

  /**
   * Upload file endpoint
   * POST /v1/files/upload
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Upload file with validation and virus scanning' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
        chatId: {
          type: 'string',
        },
      },
    },
  })
  @Throttle({ default: { limit: 20, ttl: 60000 } }) // 20 uploads per minute
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body('chatId') chatId: string,
    @Request() req,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    // Extract user ID from JWT (set by auth middleware)
    const userId = req.user?.sub || req.user?.userId || 'anonymous';

    // Validate file
    const validationResult = await this.validationService.validateFile({
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    });

    if (!validationResult.valid) {
      throw new BadRequestException({
        message: 'File validation failed',
        errors: validationResult.errors,
      });
    }

    // Perform security check (virus scan)
    const securityResult = await this.securityService.performSecurityCheck(
      {
        originalName: file.originalname,
        mimeType: file.mimetype,
        size: file.size,
        buffer: file.buffer,
      },
      validationResult.errors,
    );

    if (!securityResult.passed) {
      // Audit log security failure
      this.securityService.auditLog('upload_failed', 'n/a', userId, {
        filename: file.originalname,
        reason: securityResult.validationErrors.join(', '),
        infected: securityResult.scanResult?.infected,
      });

      throw new BadRequestException({
        message: 'Security check failed',
        errors: securityResult.validationErrors,
        infected: securityResult.scanResult?.infected,
      });
    }

    // Upload file to storage
    const uploadResult = await this.uploadService.uploadFile({
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    });

    // Save file metadata to database
    const dbResult = await this.filesService.createFileRecord({
      fileId: uploadResult.fileId,
      filename: uploadResult.filename,
      storagePath: uploadResult.storagePath,
      storageAccountId: uploadResult.storageAccountId,
      container: uploadResult.container,
      size: uploadResult.size,
      mimeType: uploadResult.mimeType,
      checksum: uploadResult.checksum,
      chatId,
      uploadedBy: userId,
      scanStatus: securityResult.scanResult
        ? securityResult.scanResult.clean
          ? 'clean'
          : 'infected'
        : 'pending',
      scanResult: securityResult.scanResult ? JSON.stringify(securityResult.scanResult) : null,
    });

    // Audit log successful upload
    this.securityService.auditLog('upload_success', uploadResult.fileId, userId, {
      filename: uploadResult.filename,
      size: uploadResult.size,
      chatId,
    });

    return {
      fileId: uploadResult.fileId,
      filename: uploadResult.filename,
      size: uploadResult.size,
      mimeType: uploadResult.mimeType,
      uploadedAt: uploadResult.uploadedAt,
      scanStatus: securityResult.scanResult
        ? securityResult.scanResult.clean
          ? 'clean'
          : 'infected'
        : 'pending',
      warnings: securityResult.warnings,
    };
  }

  /**
   * Validate file endpoint (without uploading)
   * POST /v1/files/validate
   */
  @Post('validate')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Validate file without uploading' })
  @ApiConsumes('multipart/form-data')
  async validateFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    const validationResult = await this.validationService.validateFile({
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      buffer: file.buffer,
    });

    return {
      valid: validationResult.valid,
      errors: validationResult.errors,
      warnings: validationResult.warnings,
      category: this.validationService.getFileCategory(file.mimetype),
    };
  }

  /**
   * Get file metadata
   * GET /v1/files/:fileId
   */
  @Get(':fileId')
  @ApiOperation({ summary: 'Get file metadata' })
  async getFile(@Param('fileId') fileId: string, @Request() req) {
    const userId = req.user?.sub || req.user?.userId || 'anonymous';

    // Check access permission
    const hasPermission = await this.securityService.checkAccessPermission(fileId, userId, 'read');

    if (!hasPermission) {
      throw new BadRequestException('Access denied');
    }

    const fileRecord = await this.filesService.getFileRecord(fileId);

    if (!fileRecord) {
      throw new BadRequestException('File not found');
    }

    // Generate signed URL for download
    const signedUrl = await this.securityService.generateSignedUrl(
      fileRecord.storage_path,
      3600, // 1 hour
    );

    // Audit log access
    this.securityService.auditLog('file_accessed', fileId, userId);

    return {
      fileId: fileRecord.id,
      filename: fileRecord.original_filename,
      size: fileRecord.size_bytes,
      mimeType: fileRecord.mime_type,
      uploadedAt: fileRecord.uploaded_at,
      uploadedBy: fileRecord.uploaded_by,
      scanStatus: fileRecord.scan_status,
      downloadUrl: signedUrl,
    };
  }

  /**
   * Delete file
   * DELETE /v1/files/:fileId
   */
  @Delete(':fileId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete file' })
  async deleteFile(@Param('fileId') fileId: string, @Request() req) {
    const userId = req.user?.sub || req.user?.userId || 'anonymous';

    // Check access permission
    const hasPermission = await this.securityService.checkAccessPermission(
      fileId,
      userId,
      'delete',
    );

    if (!hasPermission) {
      throw new BadRequestException('Access denied');
    }

    const fileRecord = await this.filesService.getFileRecord(fileId);

    if (!fileRecord) {
      throw new BadRequestException('File not found');
    }

    // Delete from storage
    await this.uploadService.deleteFile(
      fileRecord.storage_account_id,
      fileRecord.container,
      fileRecord.storage_path,
    );

    // Delete record from database
    await this.filesService.deleteFileRecord(fileId);

    // Audit log deletion
    this.securityService.auditLog('file_deleted', fileId, userId, {
      filename: fileRecord.original_filename,
    });

    return {
      message: 'File deleted successfully',
    };
  }

  /**
   * Health check
   * GET /v1/files/health
   */
  @Get('health')
  @ApiOperation({ summary: 'Health check endpoint' })
  healthCheck() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }
}
