import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('node:child_process', () => ({
  execSync: vi.fn(),
  spawnSync: vi.fn(),
}));

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  rmSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  rm: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  rename: vi.fn().mockResolvedValue(undefined),
}));

// Mock state-store
vi.mock('@/lib/state-store', () => ({
  readState: vi.fn().mockResolvedValue({}),
  writeState: vi.fn().mockResolvedValue(undefined),
  invalidateCache: vi.fn(),
  ensureComparatorDir: vi.fn().mockResolvedValue(undefined),
}));

// Mock server-spawner with all exports the implementation might use
vi.mock('@/lib/server-spawner', () => ({
  stopServer: vi.fn().mockResolvedValue(undefined),
  stopAll: vi.fn().mockResolvedValue(undefined),
  stopAllServers: vi.fn().mockResolvedValue(undefined),
}));

// Mock screenshot-engine
vi.mock('@/lib/screenshot-engine', () => ({
  closeBrowser: vi.fn().mockResolvedValue(undefined),
}));

// Mock worktree-manager
vi.mock('@/lib/worktree-manager', () => ({
  removeWorktree: vi.fn().mockResolvedValue(undefined),
  removeAllWorktrees: vi.fn().mockResolvedValue(undefined),
}));

import { readState, writeState } from '@/lib/state-store';
import { registerShutdownHandlers, performShutdown, recoverFromCrash } from '@/lib/lifecycle';

const mockedReadState = vi.mocked(readState);
const mockedWriteState = vi.mocked(writeState);

describe('lifecycle', () => {
  const originalProcessOn = process.on;
  let registeredHandlers: Record<string, ((...args: unknown[]) => void)[]>;

  beforeEach(() => {
    vi.clearAllMocks();
    registeredHandlers = {};
    process.on = vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!registeredHandlers[event]) registeredHandlers[event] = [];
      registeredHandlers[event].push(handler);
      return process;
    }) as typeof process.on;
  });

  afterEach(() => {
    process.on = originalProcessOn;
  });

  describe('registerShutdownHandlers', () => {
    it('should register handlers for SIGTERM and SIGINT', () => {
      registerShutdownHandlers();

      expect(process.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
      expect(process.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
    });
  });

  describe('performShutdown', () => {
    it('should mark all sources as stopped after shutdown', async () => {
      mockedReadState.mockResolvedValue({
        abc: {
          id: 'abc',
          branch: 'main',
          worktreePath: '/tmp/wt/main',
          port: 3001,
          status: 'running',
          pid: 1234,
        },
        def: {
          id: 'def',
          branch: 'dev',
          worktreePath: '/tmp/wt/dev',
          port: 3002,
          status: 'building',
        },
      });

      await performShutdown();

      expect(mockedWriteState).toHaveBeenCalled();
      const writtenState = mockedWriteState.mock.calls[0][0];
      for (const source of Object.values(writtenState)) {
        expect(source.status).toBe('stopped');
      }
    });

    it('should not throw when state is empty', async () => {
      mockedReadState.mockResolvedValue({});

      await expect(performShutdown()).resolves.not.toThrow();
    });
  });

  describe('recoverFromCrash', () => {
    it('should update state for previously running sources', async () => {
      mockedReadState.mockResolvedValue({
        abc: {
          id: 'abc',
          branch: 'main',
          worktreePath: '/tmp/wt/main',
          port: 3001,
          status: 'running',
          pid: 9999,
        },
      });

      await recoverFromCrash();

      // Should write updated state after recovery
      expect(mockedWriteState).toHaveBeenCalled();
    });

    it('should not throw when state is empty', async () => {
      mockedReadState.mockResolvedValue({});

      await expect(recoverFromCrash()).resolves.not.toThrow();
    });

    it('should handle missing PIDs gracefully', async () => {
      mockedReadState.mockResolvedValue({
        abc: {
          id: 'abc',
          branch: 'main',
          worktreePath: '/tmp/wt/main',
          port: 3001,
          status: 'running',
          // no pid
        },
      });

      await expect(recoverFromCrash()).resolves.not.toThrow();
    });
  });
});
