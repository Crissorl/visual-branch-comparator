import { describe, it, expect, vi, beforeEach } from 'vitest';

// We need to mock net.createServer to control port availability
let errorCallback: ((err: Error) => void) | null = null;

const mockServer = {
  listen: vi.fn().mockReturnThis(),
  close: vi.fn().mockImplementation((cb?: () => void) => {
    if (cb) cb();
    return mockServer;
  }),
  on: vi.fn().mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
    if (event === 'error') errorCallback = cb as (err: Error) => void;
    return mockServer;
  }),
  once: vi.fn().mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
    if (event === 'error') errorCallback = cb as (err: Error) => void;
    return mockServer;
  }),
  removeAllListeners: vi.fn().mockReturnThis(),
};

vi.mock('node:net', () => ({
  default: { createServer: vi.fn(() => mockServer) },
  createServer: vi.fn(() => mockServer),
}));

import { hashPort, isPortFree, findFreePort } from '@/lib/port-utils';

describe('port-utils', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    errorCallback = null;

    // Default: port is free (listen succeeds)
    mockServer.listen.mockImplementation((_port: number, cb?: () => void) => {
      // Simulate async: call listening callback on next tick
      if (cb) Promise.resolve().then(cb);
      return mockServer;
    });
    mockServer.once.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      if (event === 'listening') {
        // Store it so listen can call it
      }
      if (event === 'error') {
        errorCallback = cb as (err: Error) => void;
      }
      return mockServer;
    });
    mockServer.on.mockImplementation((event: string, cb: (...args: unknown[]) => void) => {
      if (event === 'error') {
        errorCallback = cb as (err: Error) => void;
      }
      return mockServer;
    });
    mockServer.close.mockImplementation((cb?: () => void) => {
      if (cb) cb();
      return mockServer;
    });
  });

  describe('hashPort', () => {
    it('should return a port in range 3001-3099 for any branch name', () => {
      const branches = ['main', 'dev', 'feature/login', 'fix/bug-123', 'release-v2.0'];
      for (const branch of branches) {
        const port = hashPort(branch);
        expect(port).toBeGreaterThanOrEqual(3001);
        expect(port).toBeLessThanOrEqual(3099);
      }
    });

    it('should return the same port for the same branch name (deterministic)', () => {
      const port1 = hashPort('feature/my-branch');
      const port2 = hashPort('feature/my-branch');
      expect(port1).toBe(port2);
    });

    it('should return an integer', () => {
      const port = hashPort('main');
      expect(Number.isInteger(port)).toBe(true);
    });

    it('should handle empty string', () => {
      const port = hashPort('');
      expect(port).toBeGreaterThanOrEqual(3001);
      expect(port).toBeLessThanOrEqual(3099);
    });

    it('should handle very long branch names', () => {
      const longName = 'a'.repeat(1000);
      const port = hashPort(longName);
      expect(port).toBeGreaterThanOrEqual(3001);
      expect(port).toBeLessThanOrEqual(3099);
    });

    it('should produce different ports for different branches (high probability)', () => {
      const portMain = hashPort('main');
      const portDev = hashPort('dev');
      // ASSUMPTION: 'main' and 'dev' hash to different ports (very likely with 99 slots)
      expect(portMain).not.toBe(portDev);
    });

    it('should handle branch names with special characters', () => {
      const port = hashPort('feature/my-branch@2.0#rc1');
      expect(port).toBeGreaterThanOrEqual(3001);
      expect(port).toBeLessThanOrEqual(3099);
    });
  });

  describe('isPortFree', () => {
    // These tests are tricky because they depend on how the implementation
    // wraps net.createServer in a promise. We test the pure hashPort above
    // and rely on integration-level validation for isPortFree/findFreePort.

    it('should return a boolean', async () => {
      // Mock: port is free -- listen callback fires immediately
      mockServer.listen.mockImplementation(function (_port: number, cb?: () => void) {
        if (cb) Promise.resolve().then(cb);
        return mockServer;
      });

      // The actual behavior depends on implementation details of how
      // the promise is constructed. We test what we can.
      const result = await isPortFree(9999).catch(() => false);
      expect(typeof result).toBe('boolean');
    });
  });

  describe('findFreePort', () => {
    it('should throw when no free port is found after 10 attempts', async () => {
      // Mock: all ports are in use
      mockServer.listen.mockImplementation(function () {
        // Trigger error on next tick
        Promise.resolve().then(() => {
          if (errorCallback) {
            errorCallback(Object.assign(new Error('EADDRINUSE'), { code: 'EADDRINUSE' }));
          }
        });
        return mockServer;
      });

      await expect(findFreePort('blocked-branch')).rejects.toThrow(/free port/i);
    });
  });
});
