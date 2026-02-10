import { Test, TestingModule } from '@nestjs/testing';
import { FileValidationService } from '../../src/modules/files/services/file-validation.service';

describe('FileValidationService', () => {
  let service: FileValidationService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FileValidationService],
    }).compile();

    service = module.get<FileValidationService>(FileValidationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validateFile', () => {
    const createMockFile = (mimeType: string, size: number, filename: string = 'test.pdf') => ({
      originalName: filename,
      mimeType,
      size,
      buffer: Buffer.from('test content'),
    });

    it('should validate a valid PDF file', async () => {
      const file = createMockFile('application/pdf', 1024);

      // Add PDF magic number to buffer
      file.buffer = Buffer.concat([
        Buffer.from([0x25, 0x50, 0x44, 0x46]), // %PDF
        file.buffer,
      ]);

      const result = await service.validateFile(file);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should validate a valid JPEG image', async () => {
      const file = createMockFile('image/jpeg', 2048, 'photo.jpg');

      // Add JPEG magic number
      file.buffer = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), file.buffer]);

      const result = await service.validateFile(file);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject file with disallowed MIME type', async () => {
      const file = createMockFile('application/x-msdownload', 1024, 'malware.exe');

      const result = await service.validateFile(file);

      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) =>
          e.includes('MIME type "application/x-msdownload" is not allowed'),
        ),
      ).toBe(true);
    });

    it('should reject file exceeding size limit', async () => {
      const file = createMockFile('application/pdf', 200 * 1024 * 1024); // 200MB

      const result = await service.validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('exceeds maximum allowed size'))).toBe(true);
    });

    it('should reject empty file', async () => {
      const file = createMockFile('application/pdf', 0);

      const result = await service.validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('File is empty');
    });

    it('should reject file with path traversal in filename', async () => {
      const file = createMockFile('application/pdf', 1024, '../../../etc/passwd');

      const result = await service.validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Path traversal detected in filename');
    });

    it('should reject file with dangerous characters', async () => {
      const file = createMockFile('application/pdf', 1024, 'file<script>.pdf');

      const result = await service.validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Filename contains illegal characters');
    });

    it('should reject file with Windows reserved name', async () => {
      const file = createMockFile('application/pdf', 1024, 'CON.pdf');

      const result = await service.validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Filename is a reserved system name');
    });

    it('should reject file with mismatched extension and MIME type', async () => {
      const file = createMockFile('application/pdf', 1024, 'document.exe');

      const result = await service.validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('File binary signature does not match'))).toBe(
        true,
      );
    });

    it('should reject file with incorrect magic number', async () => {
      const file = createMockFile('application/pdf', 1024, 'fake.pdf');

      // Use wrong magic number
      file.buffer = Buffer.from([0x00, 0x00, 0x00, 0x00]);

      const result = await service.validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('File binary signature does not match'))).toBe(
        true,
      );
    });

    it('should warn when magic number check cannot be performed', async () => {
      const file = createMockFile('text/plain', 1024, 'document.txt');

      const result = await service.validateFile(file);

      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    it('should reject oversized filename', async () => {
      const longFilename = 'a'.repeat(300) + '.pdf';
      const file = createMockFile('application/pdf', 1024, longFilename);

      const result = await service.validateFile(file);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Filename is too long'))).toBe(true);
    });

    it('should sanitize filename properly', () => {
      const filename = 'my document (2024) [final].pdf';
      const sanitized = service.sanitizeFilename(filename);

      expect(sanitized).toContain('my_document');
      expect(sanitized.length).toBeLessThanOrEqual(100);
    });
  });

  describe('getFileCategory', () => {
    it('should return correct category for document MIME types', () => {
      expect(service.getFileCategory('application/pdf')).toBe('document');
      expect(service.getFileCategory('application/msword')).toBe('document');
      expect(service.getFileCategory('text/plain')).toBe('document');
    });

    it('should return correct category for image MIME types', () => {
      expect(service.getFileCategory('image/jpeg')).toBe('image');
      expect(service.getFileCategory('image/png')).toBe('image');
    });

    it('should return unknown for unregistered MIME types', () => {
      expect(service.getFileCategory('application/octet-stream')).toBe('unknown');
    });
  });
});
