import { describe, it, expect, vi, beforeEach } from 'vitest';

// This file tests screenshot-engine but since Playwright is an optional dependency,
// the module should handle its absence gracefully.

vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// Mock playwright as unavailable by default
vi.mock('playwright', () => {
  throw new Error('Cannot find module playwright');
});

describe('screenshot-engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('isAvailable', () => {
    it('should return false when Playwright is not installed', async () => {
      // Re-import with playwright mocked as unavailable
      const { isAvailable } = await import('@/lib/screenshot-engine');
      expect(isAvailable()).toBe(false);
    });
  });

  describe('capture', () => {
    it('should throw when Playwright is not available', async () => {
      const { capture } = await import('@/lib/screenshot-engine');
      await expect(capture('http://localhost:3001', '/tmp/test-screenshot.png')).rejects.toThrow(
        'Playwright is not available',
      );
    });
  });

  describe('captureAll', () => {
    it('should throw when Playwright is not available and multiple sources given', async () => {
      const { captureAll } = await import('@/lib/screenshot-engine');
      await expect(
        captureAll([
          { url: 'http://localhost:3001', outputPath: '/tmp/a.png' },
          { url: 'http://localhost:3002', outputPath: '/tmp/b.png' },
        ]),
      ).rejects.toThrow('Playwright is not available');
    });
  });
});
