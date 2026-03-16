import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock filesystem
vi.mock('node:fs/promises', () => ({
  mkdir: vi.fn().mockResolvedValue(undefined),
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
  access: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

import * as fsp from 'node:fs/promises';
import { ensureComparatorDir, readState, writeState, invalidateCache } from '@/lib/state-store';

const mockedFsp = vi.mocked(fsp);

describe('state-store', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateCache();
  });

  describe('ensureComparatorDir', () => {
    it('should create .comparator/worktrees/ and .comparator/logs/ directories', async () => {
      await ensureComparatorDir();

      // Should call mkdir at least twice — once for worktrees, once for logs
      expect(mockedFsp.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('worktrees'),
        expect.objectContaining({ recursive: true }),
      );
      expect(mockedFsp.mkdir).toHaveBeenCalledWith(
        expect.stringContaining('logs'),
        expect.objectContaining({ recursive: true }),
      );
    });
  });

  describe('readState', () => {
    it('should return empty object when state.json does not exist', async () => {
      mockedFsp.readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));

      const state = await readState();
      expect(state).toEqual({});
    });

    it('should parse and return state from state.json', async () => {
      const mockState = {
        abc: {
          id: 'abc',
          branch: 'main',
          worktreePath: '/tmp/wt/main',
          port: 3001,
          status: 'running' as const,
        },
      };
      mockedFsp.readFile.mockResolvedValue(JSON.stringify(mockState));

      const state = await readState();
      expect(state).toEqual(mockState);
    });

    it('should use cache on subsequent reads', async () => {
      const mockState = {
        abc: {
          id: 'abc',
          branch: 'main',
          worktreePath: '/tmp',
          port: 3001,
          status: 'running' as const,
        },
      };
      mockedFsp.readFile.mockResolvedValue(JSON.stringify(mockState));

      await readState();
      await readState();

      // readFile should only be called once because the second call uses cache
      expect(mockedFsp.readFile).toHaveBeenCalledTimes(1);
    });

    it('should read from disk after invalidateCache', async () => {
      const mockState = {
        abc: {
          id: 'abc',
          branch: 'main',
          worktreePath: '/tmp',
          port: 3001,
          status: 'running' as const,
        },
      };
      mockedFsp.readFile.mockResolvedValue(JSON.stringify(mockState));

      await readState();
      invalidateCache();
      await readState();

      expect(mockedFsp.readFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('writeState', () => {
    it('should write state atomically using temp file + rename', async () => {
      const state = {
        abc: {
          id: 'abc',
          branch: 'feature',
          worktreePath: '/tmp/wt/feature',
          port: 3010,
          status: 'building' as const,
        },
      };

      await writeState(state);

      // Should write to a temp file first
      expect(mockedFsp.writeFile).toHaveBeenCalledTimes(1);
      const writePath = mockedFsp.writeFile.mock.calls[0][0] as string;
      // ASSUMPTION: temp file is in the same directory but with a different name
      expect(writePath).not.toMatch(/state\.json$/);

      // Should rename temp file to state.json
      expect(mockedFsp.rename).toHaveBeenCalledTimes(1);
      const renameDest = mockedFsp.rename.mock.calls[0][1] as string;
      expect(renameDest).toMatch(/state\.json$/);
    });

    it('should write valid JSON', async () => {
      const state = {
        abc: {
          id: 'abc',
          branch: 'main',
          worktreePath: '/tmp',
          port: 3001,
          status: 'stopped' as const,
        },
      };
      await writeState(state);

      const writtenContent = mockedFsp.writeFile.mock.calls[0][1] as string;
      expect(() => JSON.parse(writtenContent)).not.toThrow();
      expect(JSON.parse(writtenContent)).toEqual(state);
    });
  });

  describe('invalidateCache', () => {
    it('should not throw when called multiple times', () => {
      expect(() => {
        invalidateCache();
        invalidateCache();
        invalidateCache();
      }).not.toThrow();
    });
  });
});
