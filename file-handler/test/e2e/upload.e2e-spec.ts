import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { FilesModule } from '../../src/modules/files/files.module';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';

describe('File Upload E2E', () => {
  let app: INestApplication;

  // Mock external dependencies
  const mockStorageService = {
    createFile: jest.fn().mockResolvedValue({
      fileId: 'test-uuid',
      storagePath: 'files/2025/02/10/test.pdf',
    }),
    deleteFile: jest.fn().mockResolvedValue(undefined),
  };

  const mockDatabaseService = {
    query: jest.fn().mockResolvedValue({
      rows: [
        {
          id: 'test-uuid',
          filename: 'test.pdf',
          original_filename: 'test.pdf',
          size_bytes: 1024,
          mime_type: 'application/pdf',
          storage_path: 'files/2025/02/10/test.pdf',
          scan_status: 'clean',
        },
      ],
    }),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              ENABLE_VIRUS_SCAN: 'false', // Disable for faster tests
              MAX_FILE_SIZE: '10485760', // 10MB
            }),
          ],
        }),
        ThrottlerModule.forRoot([{ ttl: 60000, limit: 100 }]),
        FilesModule,
      ],
    })
      .overrideProvider('DATABASE_POOL')
      .useValue(mockDatabaseService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /v1/files/upload', () => {
    it('should upload a valid PDF file successfully', async () => {
      const pdfBuffer = Buffer.concat([
        Buffer.from([0x25, 0x50, 0x44, 0x46]), // PDF magic number
        Buffer.from('%PDF-1.4 test content'),
      ]);

      const response = await request(app.getHttpServer())
        .post('/v1/files/upload')
        .attach('file', pdfBuffer, 'test.pdf')
        .field('chatId', 'chat-123')
        .expect(201);

      expect(response.body).toHaveProperty('fileId');
      expect(response.body).toHaveProperty('filename', 'test.pdf');
      expect(response.body).toHaveProperty('scanStatus');
      expect(response.body).toHaveProperty('uploadedAt');
    });

    it('should reject file with disallowed MIME type', async () => {
      const exeBuffer = Buffer.from('MZ executable content');

      const response = await request(app.getHttpServer())
        .post('/v1/files/upload')
        .attach('file', exeBuffer, 'malware.exe')
        .expect(400);

      expect(response.body).toHaveProperty('message', 'File validation failed');
      expect(response.body.errors).toContain('MIME type "application/x-dosexec" is not allowed');
    });

    it('should reject file exceeding size limit', async () => {
      const largeBuffer = Buffer.concat([
        Buffer.from([0x25, 0x50, 0x44, 0x46]), // PDF magic number
        Buffer.alloc(20 * 1024 * 1024), // 20MB
      ]);

      const response = await request(app.getHttpServer())
        .post('/v1/files/upload')
        .attach('file', largeBuffer, 'large.pdf')
        .expect(400);

      expect(response.body).toHaveProperty('message', 'File validation failed');
      expect(response.body.errors.some((e) => e.includes('exceeds maximum allowed size'))).toBe(
        true,
      );
    });

    it('should reject file with path traversal in filename', async () => {
      const pdfBuffer = Buffer.concat([
        Buffer.from([0x25, 0x50, 0x44, 0x46]),
        Buffer.from('test content'),
      ]);

      const response = await request(app.getHttpServer())
        .post('/v1/files/upload')
        .attach('file', pdfBuffer, '../../../etc/passwd')
        .expect(400);

      expect(response.body).toHaveProperty('message', 'File validation failed');
      expect(response.body.errors).toContain('Path traversal detected in filename');
    });

    it('should reject upload without file', async () => {
      const response = await request(app.getHttpServer())
        .post('/v1/files/upload')
        .field('chatId', 'chat-123')
        .expect(400);

      expect(response.body).toHaveProperty('message', 'No file provided');
    });

    it('should handle chatId as optional field', async () => {
      const pdfBuffer = Buffer.concat([
        Buffer.from([0x25, 0x50, 0x44, 0x46]),
        Buffer.from('test content'),
      ]);

      const response = await request(app.getHttpServer())
        .post('/v1/files/upload')
        .attach('file', pdfBuffer, 'test.pdf')
        .expect(201);

      expect(response.body).toHaveProperty('fileId');
    });
  });

  describe('POST /v1/files/validate', () => {
    it('should validate a clean PDF file', async () => {
      const pdfBuffer = Buffer.concat([
        Buffer.from([0x25, 0x50, 0x44, 0x46]),
        Buffer.from('test content'),
      ]);

      const response = await request(app.getHttpServer())
        .post('/v1/files/validate')
        .attach('file', pdfBuffer, 'test.pdf')
        .expect(201);

      expect(response.body).toHaveProperty('valid', true);
      expect(response.body).toHaveProperty('errors');
      expect(response.body.errors).toHaveLength(0);
      expect(response.body).toHaveProperty('category', 'document');
    });

    it('should return validation errors for invalid file', async () => {
      const invalidBuffer = Buffer.from('invalid content');

      const response = await request(app.getHttpServer())
        .post('/v1/files/validate')
        .attach('file', invalidBuffer, 'test.pdf')
        .expect(201);

      expect(response.body).toHaveProperty('valid', false);
      expect(response.body.errors.length).toBeGreaterThan(0);
    });
  });

  describe('GET /v1/files/:fileId', () => {
    it('should return file metadata', async () => {
      const response = await request(app.getHttpServer()).get('/v1/files/test-uuid').expect(200);

      expect(response.body).toHaveProperty('fileId', 'test-uuid');
      expect(response.body).toHaveProperty('filename');
      expect(response.body).toHaveProperty('downloadUrl');
    });

    it('should return 404 for non-existent file', async () => {
      mockDatabaseService.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app.getHttpServer()).get('/v1/files/non-existent').expect(400);

      expect(response.body).toHaveProperty('message', 'File not found');
    });
  });

  describe('DELETE /v1/files/:fileId', () => {
    it('should delete file successfully', async () => {
      await request(app.getHttpServer()).delete('/v1/files/test-uuid').expect(204);

      expect(mockStorageService.deleteFile).toHaveBeenCalled();
    });

    it('should return error for non-existent file', async () => {
      mockDatabaseService.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app.getHttpServer())
        .delete('/v1/files/non-existent')
        .expect(400);

      expect(response.body).toHaveProperty('message', 'File not found');
    });
  });

  describe('GET /v1/files/health', () => {
    it('should return health status', async () => {
      const response = await request(app.getHttpServer()).get('/v1/files/health').expect(200);

      expect(response.body).toHaveProperty('status', 'ok');
      expect(response.body).toHaveProperty('timestamp');
    });
  });
});
