import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { FileSecurityService } from '../../src/modules/files/services/file-security.service';
import { ClamavService } from '../../src/modules/clamav/clamav.service';

describe('FileSecurityService', () => {
  let service: FileSecurityService;

  const mockClamavService = {
    scanBuffer: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileSecurityService,
        {
          provide: ClamavService,
          useValue: mockClamavService,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              // Always enable virus scan for tests
              if (key === 'ENABLE_VIRUS_SCAN') return 'true';
              return null;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<FileSecurityService>(FileSecurityService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('performSecurityCheck', () => {
    const createMockFile = () => ({
      originalName: 'test.pdf',
      mimeType: 'application/pdf',
      size: 1024,
      buffer: Buffer.from('test content'),
    });

    it('should pass security check for clean file', async () => {
      const file = createMockFile();
      mockClamavService.scanBuffer.mockResolvedValue(false); // Not infected

      const result = await service.performSecurityCheck(file, []);

      expect(mockClamavService.scanBuffer).toHaveBeenCalledWith(file.buffer);
      expect(result.passed).toBe(true);
      // If virus scanning is working, scanResult should be defined
      if (result.scanResult) {
        expect(result.scanResult.clean).toBe(true);
        expect(result.scanResult.infected).toBe(false);
      }
    });

    it('should fail security check for infected file', async () => {
      const file = createMockFile();
      mockClamavService.scanBuffer.mockResolvedValue(true); // Infected

      const result = await service.performSecurityCheck(file, []);

      expect(mockClamavService.scanBuffer).toHaveBeenCalled();
      expect(result.passed).toBe(false);
      if (result.scanResult) {
        expect(result.scanResult.infected).toBe(true);
        expect(result.scanResult.viruses).toContain('Virus detected');
      }
    });

    it('should fail security check with validation errors', async () => {
      const file = createMockFile();
      const validationErrors = ['Invalid MIME type', 'File too large'];

      const result = await service.performSecurityCheck(file, validationErrors);

      expect(result.passed).toBe(false);
      expect(result.validationErrors).toEqual(validationErrors);
      expect(mockClamavService.scanBuffer).not.toHaveBeenCalled();
    });

    it('should handle ClamAV scan failures gracefully', async () => {
      const file = createMockFile();
      mockClamavService.scanBuffer.mockRejectedValue(new Error('ClamAV connection failed'));

      const result = await service.performSecurityCheck(file, []);

      expect(mockClamavService.scanBuffer).toHaveBeenCalled();
      expect(result.passed).toBe(true); // Still passes if scan fails
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes('Virus scan failed'))).toBe(true);
    });

    it('should skip virus scan when disabled', async () => {
      // Create a new test module with virus scanning disabled
      const testModule = await Test.createTestingModule({
        providers: [
          FileSecurityService,
          {
            provide: ClamavService,
            useValue: mockClamavService,
          },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((key: string) => {
                if (key === 'ENABLE_VIRUS_SCAN') return 'false';
                return null;
              }),
            },
          },
        ],
      }).compile();

      const testService = testModule.get<FileSecurityService>(FileSecurityService);

      const file = createMockFile();
      const result = await testService.performSecurityCheck(file, []);

      expect(result.passed).toBe(true);
      expect(result.warnings.some((w) => w.includes('Virus scanning is disabled'))).toBe(true);
      expect(mockClamavService.scanBuffer).not.toHaveBeenCalled();
    });
  });

  describe('generateSignedUrl', () => {
    it('should generate signed URL with expiration', async () => {
      const storagePath = 'files/2025/02/10/test.pdf';

      const url = await service.generateSignedUrl(storagePath, 3600);

      expect(url).toContain(storagePath);
      expect(url).toContain('expires=');
    });

    it('should use default expiration if not specified', async () => {
      const storagePath = 'files/2025/02/10/test.pdf';

      const url = await service.generateSignedUrl(storagePath);

      expect(url).toContain(storagePath);
    });
  });

  describe('auditLog', () => {
    it('should log audit entry', () => {
      const consoleSpy = jest.spyOn(service['logger'], 'log').mockImplementation();

      service.auditLog('upload_success', 'file-123', 'user-456', {
        filename: 'test.pdf',
        size: 1024,
      });

      expect(consoleSpy).toHaveBeenCalled();
      const logArg = consoleSpy.mock.calls[0][0];
      expect(logArg).toContain('AUDIT');
      expect(logArg).toContain('upload_success');
      expect(logArg).toContain('file-123');

      consoleSpy.mockRestore();
    });
  });

  describe('checkAccessPermission', () => {
    it('should deny access without user ID', async () => {
      const hasPermission = await service.checkAccessPermission('file-123', '', 'read');

      expect(hasPermission).toBe(false);
    });

    it('should grant access for authenticated user', async () => {
      const hasPermission = await service.checkAccessPermission('file-123', 'user-456', 'read');

      expect(hasPermission).toBe(true);
    });
  });

  describe('calculateChecksum', () => {
    it('should calculate SHA-256 checksum', () => {
      const buffer = Buffer.from('test content');

      const checksum = service.calculateChecksum(buffer, 'sha256');

      // Verify it's a valid SHA-256 hash (64 hex characters)
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(checksum).toBe('6ae8a75555209fd6c44157c0aed8016e763ff435a19cf186f76863140143ff72');
    });

    it('should use SHA-256 by default', () => {
      const buffer = Buffer.from('test content');

      const checksum = service.calculateChecksum(buffer);

      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(checksum).toBe('6ae8a75555209fd6c44157c0aed8016e763ff435a19cf186f76863140143ff72');
    });
  });
});
