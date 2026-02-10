// Test setup file
/* eslint-disable @typescript-eslint/no-namespace */

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_NAME = 'test_db';
process.env.DB_USER = 'test_user';
process.env.DB_PASSWORD = 'test_pass';
process.env.ENABLE_VIRUS_SCAN = 'false';
process.env.MAX_FILE_SIZE = '10485760'; // 10MB
process.env.API_DOCUMENTATION_ENABLED = 'false';

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};

// Extend Jest matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidFile(): R;
      toBeClean(): R;
      toBeInfected(): R;
    }
  }
}

// Custom matchers
expect.extend({
  toBeValidFile(received: any) {
    const pass =
      received &&
      typeof received === 'object' &&
      typeof received.originalName === 'string' &&
      typeof received.mimeType === 'string' &&
      typeof received.size === 'number' &&
      Buffer.isBuffer(received.buffer);

    return {
      pass,
      message: () =>
        pass
          ? `Expected ${received} not to be a valid file object`
          : `Expected ${received} to be a valid file object with originalName, mimeType, size, and buffer properties`,
    };
  },

  toBeClean(received: any) {
    const pass =
      received &&
      typeof received === 'object' &&
      received.clean === true &&
      received.infected === false;

    return {
      pass,
      message: () =>
        pass ? `Expected scan result not to be clean` : `Expected scan result to be clean`,
    };
  },

  toBeInfected(received: any) {
    const pass =
      received &&
      typeof received === 'object' &&
      received.infected === true &&
      Array.isArray(received.viruses) &&
      received.viruses.length > 0;

    return {
      pass,
      message: () =>
        pass ? `Expected scan result not to be infected` : `Expected scan result to be infected`,
    };
  },
});

// Increase timeout for async operations
jest.setTimeout(10000);

// Mock axios for HTTP requests
jest.mock('axios', () => ({
  default: {
    post: jest.fn().mockResolvedValue({ data: {} }),
    get: jest.fn().mockResolvedValue({ data: {} }),
    delete: jest.fn().mockResolvedValue({ data: {} }),
    create: jest.fn().mockReturnValue({
      post: jest.fn().mockResolvedValue({ data: {} }),
      get: jest.fn().mockResolvedValue({ data: {} }),
      delete: jest.fn().mockResolvedValue({ data: {} }),
    }),
  },
}));

export {};
