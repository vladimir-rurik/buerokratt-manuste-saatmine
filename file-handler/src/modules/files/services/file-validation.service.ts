import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { extname, basename } from 'path';

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

interface FileMetadata {
  originalName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class FileValidationService {
  private readonly logger = new Logger(FileValidationService.name);
  private readonly MIME_WHITELIST: Record<string, string[]> = {
    document: [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.oasis.opendocument.text',
      'application/rtf',
      'text/plain',
    ],
    image: [
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/svg+xml',
    ],
    archive: [
      'application/zip',
      'application/x-tar',
      'application/gzip',
      'application/x-7z-compressed',
    ],
    data: [
      'application/json',
      'application/xml',
      'text/xml',
      'text/csv',
    ],
  };

  private readonly FILE_SIZE_LIMITS: Record<string, number> = {
    default: 52428800, // 50MB
    document: 104857600, // 100MB
    image: 20971520, // 20MB
    archive: 524288000, // 500MB
    data: 10485760, // 10MB
  };

  private readonly MAGIC_NUMBERS: Record<string, Buffer> = {
    'application/pdf': Buffer.from([0x25, 0x50, 0x44, 0x46]),
    'image/jpeg': Buffer.from([0xff, 0xd8, 0xff]),
    'image/png': Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    'application/zip': Buffer.from([0x50, 0x4b, 0x03, 0x04]),
    'application/gzip': Buffer.from([0x1f, 0x8b]),
  };

  constructor(private configService: ConfigService) {}

  /**
   * Validate file upload request
   */
  async validateFile(file: FileMetadata): Promise<ValidationResult> {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    // Check if file exists
    if (!file || !file.buffer) {
      result.valid = false;
      result.errors.push('No file provided');
      return result;
    }

    // Validate MIME type
    const mimeTypeValidation = this.validateMimeType(file.mimeType);
    if (!mimeTypeValidation.valid) {
      result.valid = false;
      result.errors.push(...mimeTypeValidation.errors);
    }

    // Validate file extension
    const extensionValidation = this.validateExtension(file.originalName, file.mimeType);
    if (!extensionValidation.valid) {
      result.valid = false;
      result.errors.push(...extensionValidation.errors);
    }

    // Validate file size
    const sizeValidation = this.validateFileSize(file.size, file.mimeType);
    if (!sizeValidation.valid) {
      result.valid = false;
      result.errors.push(...sizeValidation.errors);
    }

    // Validate magic number (binary signature)
    const magicNumberValidation = this.validateMagicNumber(file);
    if (!magicNumberValidation.valid) {
      result.valid = false;
      result.errors.push(...magicNumberValidation.errors);
      result.warnings.push(...magicNumberValidation.warnings);
    }

    // Sanitize filename
    const filenameValidation = this.validateFilename(file.originalName);
    if (!filenameValidation.valid) {
      result.valid = false;
      result.errors.push(...filenameValidation.errors);
    }

    // Log validation results
    if (result.valid) {
      this.logger.log(
        `File validation passed: ${file.originalName} (${file.size} bytes, ${file.mimeType})`,
      );
    } else {
      this.logger.warn(
        `File validation failed: ${file.originalName} - ${result.errors.join(', ')}`,
      );
    }

    return result;
  }

  /**
   * Validate MIME type against whitelist
   */
  private validateMimeType(mimeType: string): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    // Flatten all allowed MIME types
    const allowedMimeTypes = Object.values(this.MIME_WHITELIST).flat();

    if (!allowedMimeTypes.includes(mimeType)) {
      result.valid = false;
      result.errors.push(
        `MIME type "${mimeType}" is not allowed. Allowed types: ${allowedMimeTypes.join(', ')}`,
      );
    }

    return result;
  }

  /**
   * Validate file extension matches MIME type
   */
  private validateExtension(filename: string, mimeType: string): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    const ext = extname(filename).toLowerCase();
    const extWithoutDot = ext.substring(1);

    // Extension to MIME type mapping
    const extToMime: Record<string, string> = {
      pdf: 'application/pdf',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      odt: 'application/vnd.oasis.opendocument.text',
      rtf: 'application/rtf',
      txt: 'text/plain',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      zip: 'application/zip',
      tar: 'application/x-tar',
      gz: 'application/gzip',
      json: 'application/json',
      xml: 'application/xml',
      csv: 'text/csv',
    };

    if (extToMime[extWithoutDot] && extToMime[extWithoutDot] !== mimeType) {
      result.valid = false;
      result.errors.push(
        `File extension "${ext}" does not match MIME type "${mimeType}"`,
      );
    }

    return result;
  }

  /**
   * Validate file size
   */
  private validateFileSize(size: number, mimeType: string): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    // Determine category
    let category = 'default';
    for (const [key, mimes] of Object.entries(this.MIME_WHITELIST)) {
      if (mimes.includes(mimeType)) {
        category = key;
        break;
      }
    }

    const maxSize = this.FILE_SIZE_LIMITS[category] || this.FILE_SIZE_LIMITS.default;

    if (size > maxSize) {
      result.valid = false;
      result.errors.push(
        `File size ${this.formatBytes(size)} exceeds maximum allowed size ${this.formatBytes(maxSize)} for ${category} files`,
      );
    }

    if (size === 0) {
      result.valid = false;
      result.errors.push('File is empty');
    }

    return result;
  }

  /**
   * Validate magic number (binary signature)
   */
  private validateMagicNumber(file: FileMetadata): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    const magicNumber = this.MAGIC_NUMBERS[file.mimeType];
    if (!magicNumber) {
      // No magic number check for this type
      return result;
    }

    if (file.buffer.length < magicNumber.length) {
      result.valid = false;
      result.errors.push('File is too small to be valid');
      return result;
    }

    const fileHeader = file.buffer.subarray(0, magicNumber.length);

    if (!fileHeader.equals(magicNumber)) {
      result.valid = false;
      result.errors.push(
        `File binary signature does not match declared MIME type "${file.mimeType}"`,
      );
      result.warnings.push('Possible file type spoofing detected');
    }

    return result;
  }

  /**
   * Validate and sanitize filename
   */
  private validateFilename(filename: string): ValidationResult {
    const result: ValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
    };

    const originalName = basename(filename);

    // Check for path traversal attempts
    if (filename !== originalName) {
      result.valid = false;
      result.errors.push('Path traversal detected in filename');
    }

    // Check for dangerous characters
    const dangerousChars = /[<>:"|?*\x00-\x1f]/;
    if (dangerousChars.test(originalName)) {
      result.valid = false;
      result.errors.push('Filename contains illegal characters');
    }

    // Check for Windows reserved names
    const reservedNames = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
    const nameWithoutExt = originalName.replace(extname(originalName), '');
    if (reservedNames.test(nameWithoutExt)) {
      result.valid = false;
      result.errors.push('Filename is a reserved system name');
    }

    // Check length
    if (originalName.length > 255) {
      result.valid = false;
      result.errors.push('Filename is too long (max 255 characters)');
    }

    return result;
  }

  /**
   * Get category for a MIME type
   */
  getFileCategory(mimeType: string): string {
    for (const [category, mimes] of Object.entries(this.MIME_WHITELIST)) {
      if (mimes.includes(mimeType)) {
        return category;
      }
    }
    return 'unknown';
  }

  /**
   * Format bytes to human-readable size
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Generate safe filename
   */
  sanitizeFilename(filename: string): string {
    const originalName = basename(filename);
    const ext = extname(originalName);
    const nameWithoutExt = originalName.replace(ext, '');

    // Remove dangerous characters
    const sanitizedName = nameWithoutExt
      .replace(/[<>:"|?*\x00-\x1f]/g, '')
      .replace(/\s+/g, '_')
      .substring(0, 200);

    return `${sanitizedName}${ext}`;
  }
}
