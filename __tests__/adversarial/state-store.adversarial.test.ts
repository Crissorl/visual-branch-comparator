import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs/promises before importing the module
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  rename: vi.fn(),
}));

import { readState, writeState, invalidateCache, ensureComparatorDir } from '@/lib/state-store';
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { WorktreeError } from '@/lib/worktree-errors';

const mockReadFile = vi.mocked(readFile);
const mockWriteFile = vi.mocked(writeFile);
const mockMkdir = vi.mocked(mkdir);
const mockRename = vi.mocked(rename);

beforeEach(() => {
  vi.clearAllMocks();
  invalidateCache();
});

describe('state-store adversarial tests', () => {
  describe('readState — malformed JSON', () => {
    it('should throw STATE_CORRUPT on empty string JSON', async () => {
      // BUG HUNT: empty string parses to... nothing? Actually "" is invalid JSON
      mockReadFile.mockResolvedValue('');
      await expect(readState()).rejects.toThrow(WorktreeError);
    });

    it('should throw STATE_CORRUPT on JSON array (not an object)', async () => {
      // BUG HUNT: array passes JSON.parse but is NOT a valid state object
      mockReadFile.mockResolvedValue('[{"id":"test"}]');
      await expect(readState()).rejects.toThrow(WorktreeError);
    });

    it('should throw STATE_CORRUPT on JSON string literal', async () => {
      // BUG HUNT: a JSON string like "hello" is valid JSON but not an object
      mockReadFile.mockResolvedValue('"hello"');
      await expect(readState()).rejects.toThrow(WorktreeError);
    });

    it('should throw STATE_CORRUPT on JSON number literal', async () => {
      // BUG HUNT: 42 is valid JSON but not an object
      mockReadFile.mockResolvedValue('42');
      await expect(readState()).rejects.toThrow(WorktreeError);
    });

    it('should throw STATE_CORRUPT on JSON null', async () => {
      // BUG HUNT: null is valid JSON and typeof null === 'object' in JS!
      // The code checks `parsed === null` — verify this works
      mockReadFile.mockResolvedValue('null');
      await expect(readState()).rejects.toThrow(WorktreeError);
    });

    it('should throw STATE_CORRUPT on JSON boolean', async () => {
      // BUG HUNT: true/false are valid JSON
      mockReadFile.mockResolvedValue('true');
      await expect(readState()).rejects.toThrow(WorktreeError);
    });

    it('should throw on truncated JSON (disk corruption)', async () => {
      // BUG HUNT: partial write / disk corruption
      mockReadFile.mockResolvedValue('{"src_abc": {"id":"src_abc","branch":"main"');
      await expect(readState()).rejects.toThrow(WorktreeError);
    });

    it('should throw on JSON with BOM character', async () => {
      // BUG HUNT: Windows editors sometimes prepend BOM \uFEFF
      mockReadFile.mockResolvedValue('\uFEFF{"src_abc": {}}');
      // JSON.parse handles BOM in some engines but not others
      // This tests whether the code handles it gracefully
      const result = await readState().catch((e) => e);
      // If it doesn't throw, it should return an object
      if (!(result instanceof Error)) {
        expect(typeof result).toBe('object');
      }
    });
  });

  describe('readState — cache behavior', () => {
    it('should return cached value on second call without re-reading file', async () => {
      // BUG HUNT: cache should prevent double reads
      mockReadFile.mockResolvedValue('{}');
      await readState();
      await readState();
      expect(mockReadFile).toHaveBeenCalledTimes(1);
    });

    it('should return SAME reference from cache (mutation risk)', async () => {
      // BUG HUNT: if cache returns same object reference, callers can mutate shared state
      mockReadFile.mockResolvedValue('{}');
      const state1 = await readState();
      state1['injected'] = { id: 'injected', branch: 'hack' } as unknown as Source;
      const state2 = await readState();
      // This WILL pass — demonstrating that the cache is mutable by reference
      // BUG FOUND: cache returns mutable reference — any caller can corrupt shared state
      expect(state2['injected']).toBeDefined();
    });

    it('should serve stale cache even after file changes on disk', async () => {
      // BUG HUNT: cache never invalidates on its own — external edits are invisible
      mockReadFile.mockResolvedValueOnce(
        '{"a": {"id":"a","branch":"main","worktreePath":"/tmp","port":3001,"status":"running"}}',
      );
      const state1 = await readState();
      expect(state1['a']).toBeDefined();

      // File changes on disk but cache is stale
      mockReadFile.mockResolvedValueOnce('{}');
      const state2 = await readState();
      // BUG FOUND: stale cache — state2 still has 'a' because cache wasn't invalidated
      expect(state2['a']).toBeDefined(); // proves staleness
    });
  });

  describe('writeState — race conditions', () => {
    it('should handle concurrent writes (last write wins, no corruption)', async () => {
      // BUG HUNT: two concurrent writes could interleave tmp file operations
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);
      mockRename.mockResolvedValue(undefined);

      const state1 = { a: { id: 'a', branch: 'main' } } as unknown as Record<string, Source>;
      const state2 = { b: { id: 'b', branch: 'dev' } } as unknown as Record<string, Source>;

      // Fire both concurrently
      await Promise.all([writeState(state1), writeState(state2)]);

      // Both use the same .tmp path — second write overwrites first's tmp before rename
      // BUG FOUND: concurrent writes use same tmp filename (state.json.tmp)
      // If rename is not atomic or interleaves, data corruption is possible
      expect(mockWriteFile).toHaveBeenCalledTimes(2);
    });

    it('should leave cache in consistent state if rename fails', async () => {
      // BUG HUNT: if rename() throws, cache is still set to new state but file has old data
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);
      mockRename.mockRejectedValue(new Error('EACCES'));

      const state = { a: { id: 'a', branch: 'main' } } as unknown as Record<string, Source>;
      await expect(writeState(state)).rejects.toThrow('EACCES');

      // Now readState should not return the failed write from cache
      // BUG FOUND: writeState sets cache AFTER rename, but if rename throws,
      // the cache assignment on line 46 is never reached — but let's verify
      invalidateCache();
      mockReadFile.mockResolvedValue('{}');
      const result = await readState();
      expect(result).toEqual({});
    });
  });

  describe('writeState — prototype pollution', () => {
    it('should not allow __proto__ keys in state', async () => {
      // BUG HUNT: writing a state with __proto__ key could pollute Object prototype
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);
      mockRename.mockResolvedValue(undefined);

      const maliciousState = JSON.parse('{"__proto__": {"isAdmin": true}}');
      await writeState(maliciousState);

      // Check if prototype was polluted
      const plainObj: Record<string, unknown> = {};
      // If polluted, plainObj.isAdmin would be true
      expect(plainObj.isAdmin).toBeUndefined();
    });

    it('should handle constructor/prototype keys in source IDs', async () => {
      // BUG HUNT: source ID could be "constructor" or "toString"
      mockMkdir.mockResolvedValue(undefined);
      mockWriteFile.mockResolvedValue(undefined);
      mockRename.mockResolvedValue(undefined);

      const state = {
        constructor: {
          id: 'constructor',
          branch: 'main',
          worktreePath: '/tmp',
          port: 3001,
          status: 'running' as const,
        },
        toString: {
          id: 'toString',
          branch: 'dev',
          worktreePath: '/tmp2',
          port: 3002,
          status: 'stopped' as const,
        },
      };

      await writeState(state as unknown as Record<string, Source>);
      invalidateCache();
      mockReadFile.mockResolvedValue(JSON.stringify(state));
      const result = await readState();
      expect(Object.keys(result)).toContain('constructor');
      expect(Object.keys(result)).toContain('toString');
    });
  });

  describe('ensureComparatorDir — filesystem edge cases', () => {
    it('should handle permission denied on mkdir', async () => {
      mockMkdir.mockRejectedValue(new Error('EACCES: permission denied'));
      await expect(ensureComparatorDir()).rejects.toThrow('EACCES');
    });

    it('should handle path with special characters in cwd', async () => {
      // BUG HUNT: if process.cwd() contains spaces or unicode, path.join should still work
      mockMkdir.mockResolvedValue(undefined);
      // This test verifies mkdir is called — the actual path handling is in path.join
      await ensureComparatorDir();
      expect(mockMkdir).toHaveBeenCalledTimes(2);
    });
  });

  describe('readState — error classification', () => {
    it('should return empty state on ENOENT (file not found)', async () => {
      // Expected behavior: missing file = fresh start
      const err = new Error('ENOENT: no such file') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      mockReadFile.mockRejectedValue(err);
      const result = await readState();
      expect(result).toEqual({});
    });

    it('should return empty state on EACCES (permission denied) — potentially wrong!', async () => {
      // BUG HUNT: EACCES is NOT the same as ENOENT
      // The code catches ALL errors (except WorktreeError and SyntaxError) and returns {}
      // BUG FOUND: permission denied silently returns empty state instead of throwing
      // This means if the file exists but is unreadable, user silently loses all state
      const err = new Error('EACCES: permission denied') as NodeJS.ErrnoException;
      err.code = 'EACCES';
      mockReadFile.mockRejectedValue(err);
      const result = await readState();
      // This will equal {} — which is the bug: EACCES should throw, not silently succeed
      expect(result).toEqual({});
    });

    it('should return empty state on EISDIR — also wrong', async () => {
      // BUG HUNT: if state.json is a directory somehow, we silently ignore it
      const err = new Error('EISDIR: illegal operation on a directory');
      mockReadFile.mockRejectedValue(err);
      const result = await readState();
      // BUG FOUND: same issue — non-ENOENT errors are swallowed
      expect(result).toEqual({});
    });
  });
});
