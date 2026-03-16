import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { execSync } from 'node:child_process';
import { getGitDiff } from '@/lib/git-diff';

const mockedExecSync = vi.mocked(execSync);

describe('git-diff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getGitDiff', () => {
    it('should run git diff with three-dot syntax between branches', () => {
      // ASSUMPTION: execSync is called with encoding option so returns string
      mockedExecSync.mockReturnValue('diff --git a/file.ts\n+added line');

      const result = getGitDiff('main', 'feature');

      expect(mockedExecSync).toHaveBeenCalledWith(
        expect.stringContaining('main...feature'),
        expect.anything(),
      );
      expect(result).toContain('added line');
    });

    it('should exclude pnpm-lock.yaml from diff', () => {
      mockedExecSync.mockReturnValue('some diff');

      getGitDiff('main', 'dev');

      const command = mockedExecSync.mock.calls[0][0] as string;
      expect(command).toContain('pnpm-lock.yaml');
    });

    it('should exclude package-lock.json from diff', () => {
      mockedExecSync.mockReturnValue('some diff');

      getGitDiff('main', 'dev');

      const command = mockedExecSync.mock.calls[0][0] as string;
      expect(command).toContain('package-lock.json');
    });

    it('should truncate output at maxChars with suffix', () => {
      const longDiff = 'x'.repeat(10000);
      mockedExecSync.mockReturnValue(longDiff);

      const result = getGitDiff('main', 'feature', 100);

      expect(result.length).toBeLessThanOrEqual(120); // 100 + suffix length
      expect(result).toContain('truncated');
    });

    it('should default maxChars to 5000', () => {
      const longDiff = 'y'.repeat(10000);
      mockedExecSync.mockReturnValue(longDiff);

      const result = getGitDiff('main', 'feature');

      // Should be truncated around 5000 chars + suffix
      expect(result.length).toBeLessThanOrEqual(5050);
      expect(result).toContain('truncated');
    });

    it('should not truncate output shorter than maxChars', () => {
      const shortDiff = 'short diff content';
      mockedExecSync.mockReturnValue(shortDiff);

      const result = getGitDiff('main', 'feature', 5000);

      expect(result).toBe(shortDiff);
      expect(result).not.toContain('truncated');
    });

    it('should return "No differences found." when branches are identical', () => {
      mockedExecSync.mockReturnValue('');

      const result = getGitDiff('main', 'main');

      expect(result).toBe('No differences found.');
    });

    it('should return error message string on failure (not throw)', () => {
      mockedExecSync.mockImplementation(() => {
        throw new Error('fatal: ambiguous argument');
      });

      const result = getGitDiff('nonexistent', 'branch');

      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });

    it('should handle branch names with slashes', () => {
      mockedExecSync.mockReturnValue('diff content');

      const result = getGitDiff('feature/auth', 'feature/login');

      expect(mockedExecSync).toHaveBeenCalledWith(
        expect.stringContaining('feature/auth...feature/login'),
        expect.anything(),
      );
      expect(result).toBe('diff content');
    });
  });
});
