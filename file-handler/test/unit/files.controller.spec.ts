import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FilesController } from '../../src/modules/files/files.controller';
import { FilesService } from '../../src/modules/files/files.service';
import { FileValidationService } from '../../src/modules/files/services/file-validation.service';
import { FileUploadService } from '../../src/modules/files/services/file-upload.service';
import { FileSecurityService } from '../../src/modules/files/services/file-security.service';
import { mockFileFactory, mockUserFactory } from '../mocks';

describe('FilesController', () => {
  let controller: FilesController;
  let validationService: FileValidationService;
  let securityService: FileSecurityService;
  let uploadService: FileUploadService;
  let filesService: FilesService;

  const mockFile = mockFileFactory();
  const mockUser = mockUserFactory();

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FilesController],
      providers: [
        {
          provide: FilesService,
          useValue: {
            createFileRecord: jest.fn().mockResolvedValue({
              id: 'file-123',
              filename: 'test.pdf',
            }),
            getFileRecord: jest.fn().mockResolvedValue({
              id: 'file-123',
              original_filename: 'test.pdf',
              size_bytes: 1024,
              mime_type: 'application/pdf',
              storage_path: 'files/2025/02/10/test.pdf',
              scan_status: 'clean',
              uploaded_by: 'user-123',
            }),
            deleteFileRecord: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: FileValidationService,
          useValue: {
            validateFile: jest.fn().mockResolvedValue({
              valid: true,
              errors: [],
              warnings: [],
            }),
            getFileCategory: jest.fn().mockReturnValue('document'),
          },
        },
        {
          provide: FileUploadService,
          useValue: {
            uploadFile: jest.fn().mockResolvedValue({
              fileId: 'file-123',
              filename: 'test.pdf',
              storagePath: 'files/2025/02/10/test.pdf',
              size: 1024,
              mimeType: 'application/pdf',
              checksum: 'abc123',
            }),
            deleteFile: jest.fn().mockResolvedValue(undefined),
          },
        },
        {
          provide: FileSecurityService,
          useValue: {
            performSecurityCheck: jest.fn().mockResolvedValue({
              passed: true,
              validationErrors: [],
              scanResult: { clean: true, infected: false },
            }),
            generateSignedUrl: jest.fn().mockResolvedValue('http://signed-url'),
            auditLog: jest.fn(),
            checkAccessPermission: jest.fn().mockResolvedValue(true),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config = {
                ENABLE_VIRUS_SCAN: 'false',
              };
              return config[key];
            }),
          },
        },
      ],
    }).compile();

    controller = module.get<FilesController>(FilesController);
    validationService = module.get<FileValidationService>(FileValidationService);
    securityService = module.get<FileSecurityService>(FileSecurityService);
    uploadService = module.get<FileUploadService>(FileUploadService);
    filesService = module.get<FilesService>(FilesService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadFile', () => {
    it('should upload a valid file successfully', async () => {
      const result = await controller.uploadFile(mockFile, 'chat-123', { user: mockUser } as any);

      expect(result).toHaveProperty('fileId');
      expect(result).toHaveProperty('filename', 'test.pdf');
      expect(validationService.validateFile).toHaveBeenCalledWith({
        originalName: mockFile.originalname,
        mimeType: mockFile.mimetype,
        size: mockFile.size,
        buffer: mockFile.buffer,
      });
    });

    it('should throw BadRequestException if no file provided', async () => {
      await expect(
        controller.uploadFile(null, 'chat-123', { user: mockUser } as any),
      ).rejects.toThrow('No file provided');
    });

    it('should fail on validation errors', async () => {
      jest.spyOn(validationService, 'validateFile').mockResolvedValueOnce({
        valid: false,
        errors: ['Invalid file type'],
        warnings: [],
      });

      await expect(
        controller.uploadFile(mockFile, 'chat-123', { user: mockUser } as any),
      ).rejects.toThrow();
    });
  });

  describe('validateFile', () => {
    it('should validate file without uploading', async () => {
      const result = await controller.validateFile(mockFile);

      expect(result).toHaveProperty('valid', true);
      expect(result).toHaveProperty('errors');
      expect(validationService.validateFile).toHaveBeenCalled();
    });
  });

  describe('getFile', () => {
    it('should return file metadata with signed URL', async () => {
      const result = await controller.getFile('file-123', { user: mockUser } as any);

      expect(result).toHaveProperty('fileId', 'file-123');
      expect(result).toHaveProperty('filename');
      expect(result).toHaveProperty('downloadUrl');
      expect(securityService.checkAccessPermission).toHaveBeenCalled();
    });

    it('should deny access if permission check fails', async () => {
      jest.spyOn(securityService, 'checkAccessPermission').mockResolvedValueOnce(false);

      await expect(controller.getFile('file-123', { user: mockUser } as any)).rejects.toThrow(
        'Access denied',
      );
    });
  });

  describe('deleteFile', () => {
    it('should delete file successfully', async () => {
      const result = await controller.deleteFile('file-123', { user: mockUser } as any);

      expect(result).toHaveProperty('message', 'File deleted successfully');
      expect(uploadService.deleteFile).toHaveBeenCalled();
      expect(filesService.deleteFileRecord).toHaveBeenCalled();
    });
  });

  describe('healthCheck', () => {
    it('should return health status', async () => {
      const result = await controller.healthCheck();

      expect(result).toHaveProperty('status', 'ok');
      expect(result).toHaveProperty('timestamp');
    });
  });
});
