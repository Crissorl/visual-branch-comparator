import { EventEmitter } from 'node:events';
import { describe, it, expect, vi } from 'vitest';

vi.mock('node:net', () => ({
  default: {
    createServer: vi.fn(),
  },
}));

import { hashPort, findFreePort, isPortFree } from '@/lib/port-utils';

describe('port-utils adversarial tests', () => {
  describe('hashPort — boundary inputs', () => {
    it('should return port in valid range for empty string', () => {
      // BUG HUNT: empty branch name — does djb2 hash handle it?
      const port = hashPort('');
      expect(port).toBeGreaterThanOrEqual(3001);
      expect(port).toBeLessThanOrEqual(3099);
    });

    it('should return port in valid range for very long branch name', () => {
      // BUG HUNT: very long string could cause integer overflow in djb2
      // djb2 uses >>> 0 to stay unsigned 32-bit, but modulo should still work
      const longName = 'a'.repeat(100_000);
      const port = hashPort(longName);
      expect(port).toBeGreaterThanOrEqual(3001);
      expect(port).toBeLessThanOrEqual(3099);
    });

    it('should return port in valid range for unicode emoji branch name', () => {
      // BUG HUNT: charCodeAt on multi-byte chars (emoji are surrogate pairs)
      const port = hashPort('feature/add-🚀-rocket');
      expect(port).toBeGreaterThanOrEqual(3001);
      expect(port).toBeLessThanOrEqual(3099);
    });

    it('should return port in valid range for null byte in branch name', () => {
      // BUG HUNT: null bytes in string
      const port = hashPort('main\x00evil');
      expect(port).toBeGreaterThanOrEqual(3001);
      expect(port).toBeLessThanOrEqual(3099);
    });

    it('should return port in valid range for RTL text', () => {
      // BUG HUNT: right-to-left characters
      const port = hashPort('feature/مرحبا');
      expect(port).toBeGreaterThanOrEqual(3001);
      expect(port).toBeLessThanOrEqual(3099);
    });

    it('should be deterministic — same input always gives same port', () => {
      // BUG HUNT: non-deterministic hashing would break port persistence
      const port1 = hashPort('feature/login');
      const port2 = hashPort('feature/login');
      expect(port1).toBe(port2);
    });

    it('should not produce collisions for similar branch names', () => {
      // BUG HUNT: hash distribution — similar names shouldn't always collide
      // This is probabilistic; we check a sample of similar names
      const ports = new Set<number>();
      for (let i = 0; i < 99; i++) {
        ports.add(hashPort(`feature/branch-${i}`));
      }
      // With 99 branches and 99 slots, birthday paradox says we'll have collisions
      // but we should have decent distribution — at least 30 unique ports
      expect(ports.size).toBeGreaterThan(30);
    });

    it('should handle branch name with only special characters', () => {
      const port = hashPort('///___---...');
      expect(port).toBeGreaterThanOrEqual(3001);
      expect(port).toBeLessThanOrEqual(3099);
    });
  });

  describe('hashPort — integer arithmetic safety', () => {
    it('should use unsigned 32-bit arithmetic (>>> 0) preventing negative ports', () => {
      // BUG HUNT: without >>> 0, bit shift could produce negative numbers
      // which would make (negative % 99) produce negative port offsets
      // Test 1000 random-ish names to check
      for (let i = 0; i < 1000; i++) {
        const name = `branch-${i}-${String.fromCharCode(65 + (i % 26))}`;
        const port = hashPort(name);
        expect(port).toBeGreaterThanOrEqual(3001);
        expect(port).toBeLessThanOrEqual(3099);
      }
    });
  });

  describe('findFreePort — all ports busy', () => {
    it('should throw PORT_EXHAUSTED when no ports are available', async () => {
      // BUG HUNT: what happens when all 10 retries fail?
      // We need to mock isPortFree indirectly through net.createServer
      // Since findFreePort calls isPortFree internally, we mock at net level
      const net = await import('node:net');
      const mockCreateServer = vi.mocked(net.default.createServer);

      mockCreateServer.mockImplementation(() => {
        const server = new EventEmitter();
        (server as EventEmitter & { listen: unknown }).listen = vi.fn(() => {
          // Simulate port in use
          process.nextTick(() => server.emit('error', new Error('EADDRINUSE')));
        });
        server.close = vi.fn();
        return server;
      });

      await expect(findFreePort('some-branch')).rejects.toThrow('No free port found');
    });
  });

  describe('isPortFree — edge cases', () => {
    it('should handle port 0 (OS assigns random port)', async () => {
      // BUG HUNT: port 0 is special — OS assigns an ephemeral port
      // isPortFree(0) would try to bind to 0, which always succeeds
      const net = await import('node:net');
      const mockCreateServer = vi.mocked(net.default.createServer);

      mockCreateServer.mockImplementation(() => {
        const server = new EventEmitter();
        (server as EventEmitter & { listen: unknown }).listen = vi.fn(() => {
          process.nextTick(() => server.emit('listening'));
        });
        server.close = vi.fn((cb?: () => void) => cb?.());
        return server;
      });

      const result = await isPortFree(0);
      expect(typeof result).toBe('boolean');
    });

    it('should handle negative port number', async () => {
      // BUG HUNT: negative port — node's net.listen may throw or behave weirdly
      const net = await import('node:net');
      const mockCreateServer = vi.mocked(net.default.createServer);

      mockCreateServer.mockImplementation(() => {
        const server = new EventEmitter();
        (server as EventEmitter & { listen: unknown }).listen = vi.fn(() => {
          process.nextTick(() => server.emit('error', new Error('ERR_SOCKET_BAD_PORT')));
        });
        server.close = vi.fn();
        return server;
      });

      const result = await isPortFree(-1);
      expect(result).toBe(false);
    });

    it('should handle port above 65535', async () => {
      // BUG HUNT: port > 65535 is invalid
      const net = await import('node:net');
      const mockCreateServer = vi.mocked(net.default.createServer);

      mockCreateServer.mockImplementation(() => {
        const server = new EventEmitter();
        (server as EventEmitter & { listen: unknown }).listen = vi.fn(() => {
          process.nextTick(() => server.emit('error', new Error('ERR_SOCKET_BAD_PORT')));
        });
        server.close = vi.fn();
        return server;
      });

      const result = await isPortFree(99999);
      expect(result).toBe(false);
    });
  });
});
