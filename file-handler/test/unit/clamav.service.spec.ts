import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ClamavService } from '../../src/modules/clamav/clamav.service';

// Mock functions for each method
const mockScanBuffer = jest.fn();
const mockScanFile = jest.fn();
const mockGetVersion = jest.fn();
const mockInstanceInit = jest.fn();

// Setup the mock structure - will be configured in beforeEach
jest.mock('clamav.js', () => ({
  init: jest.fn(),
}));

describe('ClamavService', () => {
  let service: ClamavService;
  let mockConfigService: any;

  // Mock instance that will be returned by NodeClam.init()
  let mockClamavInstance: any;

  beforeEach(async () => {
    // Create fresh config service mock for each test
    mockConfigService = {
      get: jest.fn((key: string) => {
        const config: any = {
          CLAMAV_HOST: 'localhost',
          CLAMAV_PORT: 3310,
          CLAMAV_TIMEOUT: 60000,
        };
        return config[key];
      }),
    };
    // Create fresh mock instance for each test
    mockClamavInstance = {
      scanBuffer: mockScanBuffer,
      scanFile: mockScanFile,
      getVersion: mockGetVersion,
      init: mockInstanceInit,
    };

    // Get reference to mocked NodeClam.init and configure it
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const clamavModule = require('clamav.js');
    clamavModule.init.mockResolvedValue(mockClamavInstance);

    // Default mock implementations
    mockInstanceInit.mockResolvedValue(true);
    mockScanBuffer.mockResolvedValue({
      isInfected: false,
      viruses: [],
    });
    mockScanFile.mockResolvedValue({
      isInfected: false,
      viruses: [],
    });
    mockGetVersion.mockResolvedValue('ClamAV 0.103.0');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClamavService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<ClamavService>(ClamavService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onModuleInit', () => {
    it('should initialize ClamAV successfully', async () => {
      mockInstanceInit.mockResolvedValue(true);

      await service.onModuleInit();

      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const clamavModule = require('clamav.js');
      expect(clamavModule.init).toHaveBeenCalledWith({
        clamdscan: {
          host: 'localhost',
          port: 3310,
          timeout: 60000,
        },
        clamscan: {
          path: '/usr/bin/clamscan',
          db: '/var/lib/clamav',
          scanRecursively: true,
        },
      });
      expect(mockInstanceInit).toHaveBeenCalled();
    });

    it('should handle initialization failure gracefully', async () => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const clamavModule = require('clamav.js');
      clamavModule.init.mockRejectedValue(new Error('Connection failed'));

      await service.onModuleInit();

      // Should not throw, service should still be usable
      expect(service['clamav']).toBeUndefined();
    });
  });

  describe('scanBuffer', () => {
    const testBuffer = Buffer.from('test file content');

    it('should scan buffer and return false if clean', async () => {
      mockInstanceInit.mockResolvedValue(true);
      await service.onModuleInit();

      mockScanBuffer.mockResolvedValue({
        isInfected: false,
        viruses: [],
      });

      const result = await service.scanBuffer(testBuffer);

      expect(result).toBe(false);
      expect(mockScanBuffer).toHaveBeenCalledWith(testBuffer);
    });

    it('should scan buffer and return true if infected', async () => {
      mockInstanceInit.mockResolvedValue(true);
      await service.onModuleInit();

      mockScanBuffer.mockResolvedValue({
        isInfected: true,
        viruses: ['Trojan.Generic.123456'],
      });

      const result = await service.scanBuffer(testBuffer);

      expect(result).toBe(true);
    });

    it('should return false if ClamAV not initialized', async () => {
      service['clamav'] = undefined;

      const result = await service.scanBuffer(testBuffer);

      expect(result).toBe(false);
      expect(mockScanBuffer).not.toHaveBeenCalled();
    });

    it('should throw error on scan failure', async () => {
      mockInstanceInit.mockResolvedValue(true);
      await service.onModuleInit();

      mockScanBuffer.mockRejectedValue(new Error('Scan failed'));

      await expect(service.scanBuffer(testBuffer)).rejects.toThrow('Virus scan failed');
    });
  });

  describe('scanFile', () => {
    const testFilePath = '/tmp/test-file.pdf';

    it('should scan file and return false if clean', async () => {
      mockInstanceInit.mockResolvedValue(true);
      await service.onModuleInit();

      mockScanFile.mockResolvedValue({
        isInfected: false,
        viruses: [],
      });

      const result = await service.scanFile(testFilePath);

      expect(result).toBe(false);
      expect(mockScanFile).toHaveBeenCalledWith(testFilePath);
    });

    it('should scan file and return true if infected', async () => {
      mockInstanceInit.mockResolvedValue(true);
      await service.onModuleInit();

      mockScanFile.mockResolvedValue({
        isInfected: true,
        viruses: ['Virus.Example'],
      });

      const result = await service.scanFile(testFilePath);

      expect(result).toBe(true);
    });

    it('should return false if ClamAV not initialized', async () => {
      service['clamav'] = undefined;

      const result = await service.scanFile(testFilePath);

      expect(result).toBe(false);
      expect(mockScanFile).not.toHaveBeenCalled();
    });
  });

  describe('getVersion', () => {
    it('should return ClamAV version', async () => {
      mockInstanceInit.mockResolvedValue(true);
      await service.onModuleInit();

      mockGetVersion.mockResolvedValue('ClamAV 0.103.0');

      const version = await service.getVersion();

      expect(version).toBe('ClamAV 0.103.0');
    });

    it('should return "Not initialized" if ClamAV not ready', async () => {
      service['clamav'] = undefined;

      const version = await service.getVersion();

      expect(version).toBe('Not initialized');
    });

    it('should return "Unknown" on error', async () => {
      mockInstanceInit.mockResolvedValue(true);
      await service.onModuleInit();

      mockGetVersion.mockRejectedValue(new Error('Failed'));

      const version = await service.getVersion();

      expect(version).toBe('Unknown');
    });
  });
});
