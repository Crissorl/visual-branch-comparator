import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the Anthropic SDK - need to match how the implementation constructs it
const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => {
  return {
    __esModule: true,
    default: class MockAnthropic {
      messages = { create: mockCreate };
    },
    Anthropic: class MockAnthropic {
      messages = { create: mockCreate };
    },
  };
});

import { describe as describeEngine } from '@/lib/description-engine';

describe('description-engine', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  const mockDiffResult = {
    diffImagePath: '/tmp/diff.png',
    diffPercentage: 15.5,
    changedPixels: 1550,
    totalPixels: 10000,
    width: 100,
    height: 100,
  };

  describe('when ANTHROPIC_API_KEY is not set', () => {
    it('should return message about setting API key', async () => {
      delete process.env.ANTHROPIC_API_KEY;

      const result = await describeEngine('some git diff', mockDiffResult);

      expect(result).toBe('Set ANTHROPIC_API_KEY environment variable to enable AI descriptions.');
    });
  });

  describe('when ANTHROPIC_API_KEY is set', () => {
    beforeEach(() => {
      process.env.ANTHROPIC_API_KEY = 'test-key-123';
    });

    it('should call Claude API and return description', async () => {
      mockCreate.mockResolvedValue({
        content: [
          {
            type: 'text',
            text: '- Changed the header color\n- Updated button text',
          },
        ],
      });

      const result = await describeEngine('diff --git a/file.ts', mockDiffResult);

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(result).toContain('Changed the header color');
      expect(result).toContain('Updated button text');
    });

    it('should fall back to pixel stats on API error', async () => {
      mockCreate.mockRejectedValue(new Error('API rate limit'));

      const result = await describeEngine('some diff', mockDiffResult);

      // ASSUMPTION: fallback includes pixel stats from diffResult
      expect(result).toMatch(/15\.5|1550|pixel|changed|diff/i);
    });

    it('should handle null diffResult and describe based on git diff only', async () => {
      mockCreate.mockResolvedValue({
        content: [{ type: 'text', text: '- Added new login page component' }],
      });

      const result = await describeEngine('diff --git a/login.tsx', null);

      expect(mockCreate).toHaveBeenCalledTimes(1);
      expect(result).toContain('Added new login page component');
    });

    it('should fall back gracefully on API error with null diffResult', async () => {
      mockCreate.mockRejectedValue(new Error('Network error'));

      const result = await describeEngine('some diff', null);

      // ASSUMPTION: with null diffResult and API error, returns some fallback string
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });
});
