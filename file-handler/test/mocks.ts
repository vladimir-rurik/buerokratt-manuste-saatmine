// Test utilities and mock factories
import { Readable } from 'stream';

export const mockFileFactory = (overrides?: Partial<any>): any => {
  const buffer = Buffer.concat([
    Buffer.from([0x25, 0x50, 0x44, 0x46]), // PDF magic number
    Buffer.from('test content'),
  ]);

  return {
    originalname: 'test.pdf',
    mimetype: 'application/pdf',
    size: 1024,
    buffer,
    fieldname: 'file',
    encoding: '7bit',
    destination: '/tmp/uploads',
    filename: 'test.pdf',
    path: '/tmp/uploads/test.pdf',
    stream: Readable.from(buffer),
    ...overrides,
  };
};

export const mockUserFactory = (overrides?: Partial<any>): any => ({
  sub: 'user-123',
  userId: 'user-123',
  email: 'test@example.com',
  role: 'citizen',
  ...overrides,
});

export const mockFileRecordFactory = (overrides?: Partial<any>): any => ({
  id: 'file-123',
  filename: 'test.pdf',
  original_filename: 'test.pdf',
  size_bytes: 1024,
  mime_type: 'application/pdf',
  storage_path: 'files/2025/02/10/test.pdf',
  storage_account_id: 's3-default',
  container: 'buerokratt-files',
  checksum: 'abc123',
  chat_id: 'chat-123',
  uploaded_by: 'user-123',
  uploaded_at: new Date().toISOString(),
  scan_status: 'clean',
  scan_result: null,
  ...overrides,
});

export const mockValidationResultFactory = (overrides?: Partial<any>): any => ({
  valid: true,
  errors: [],
  warnings: [],
  ...overrides,
});

export const mockScanResultFactory = (overrides?: Partial<any>): any => ({
  clean: true,
  infected: false,
  viruses: [],
  scanTime: 1000,
  ...overrides,
});

export const mockUploadResultFactory = (overrides?: Partial<any>): any => ({
  fileId: 'file-123',
  filename: 'test.pdf',
  storagePath: 'files/2025/02/10/test.pdf',
  storageAccountId: 's3-default',
  container: 'buerokratt-files',
  size: 1024,
  mimeType: 'application/pdf',
  checksum: 'abc123',
  uploadedAt: new Date(),
  ...overrides,
});

// Helper to create mock Express file with custom buffer
export const createMockFileWithBuffer = (
  mimeType: string,
  size: number,
  magicNumber?: number[],
): any => {
  const buffer = magicNumber
    ? Buffer.concat([Buffer.from(magicNumber), Buffer.alloc(size - magicNumber.length)])
    : Buffer.alloc(size);

  return {
    originalname: `test.${mimeType.split('/')[1]}`,
    mimetype: mimeType,
    size,
    buffer,
  };
};

// Helper to wait for async operations
export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

// Helper to generate random file ID
export const generateFileId = (): string =>
  `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

// Helper to generate random user ID
export const generateUserId = (): string =>
  `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
