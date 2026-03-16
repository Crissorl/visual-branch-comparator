import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
  access: vi.fn(),
}));

import * as fs from 'node:fs';
import { patchIframeHeaders, injectNavSyncScript, patchProject } from '@/lib/config-patcher';

const mockedFs = vi.mocked(fs);

describe('config-patcher', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('patchIframeHeaders', () => {
    it('should detect next.config.ts first', () => {
      mockedFs.existsSync.mockImplementation((p) => {
        return String(p).endsWith('next.config.ts');
      });
      mockedFs.readFileSync.mockReturnValue('const nextConfig = {};\nexport default nextConfig;');

      patchIframeHeaders('/tmp/worktree');

      // Should read and write the .ts config
      expect(mockedFs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('next.config.ts'),
        expect.anything(),
      );
    });

    it('should fall back to next.config.mjs if .ts not found', () => {
      mockedFs.existsSync.mockImplementation((p) => {
        return String(p).endsWith('next.config.mjs');
      });
      mockedFs.readFileSync.mockReturnValue('export default {};');

      patchIframeHeaders('/tmp/worktree');

      expect(mockedFs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('next.config.mjs'),
        expect.anything(),
      );
    });

    it('should fall back to next.config.js if .ts and .mjs not found', () => {
      mockedFs.existsSync.mockImplementation((p) => {
        return String(p).endsWith('next.config.js');
      });
      mockedFs.readFileSync.mockReturnValue('module.exports = {};');

      patchIframeHeaders('/tmp/worktree');

      expect(mockedFs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('next.config.js'),
        expect.anything(),
      );
    });

    it('should not throw when no config file exists', () => {
      mockedFs.existsSync.mockReturnValue(false);

      expect(() => patchIframeHeaders('/tmp/worktree')).not.toThrow();
    });

    it('should skip patching if already patched (X-Frame-Options marker)', () => {
      mockedFs.existsSync.mockImplementation((p) => {
        return String(p).endsWith('next.config.ts');
      });
      mockedFs.readFileSync.mockReturnValue(
        'const nextConfig = { headers: [{ key: "X-Frame-Options" }] };\nexport default nextConfig;',
      );

      patchIframeHeaders('/tmp/worktree');

      // Should NOT write the file since it's already patched
      expect(mockedFs.writeFileSync).not.toHaveBeenCalled();
    });

    it('should handle CJS module.exports format', () => {
      mockedFs.existsSync.mockImplementation((p) => {
        return String(p).endsWith('next.config.js');
      });
      mockedFs.readFileSync.mockReturnValue('module.exports = {\n  reactStrictMode: true,\n};');

      patchIframeHeaders('/tmp/worktree');

      expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(1);
      const written = mockedFs.writeFileSync.mock.calls[0][1] as string;
      expect(written).toContain('X-Frame-Options');
    });

    it('should handle ESM export default format', () => {
      mockedFs.existsSync.mockImplementation((p) => {
        return String(p).endsWith('next.config.mjs');
      });
      mockedFs.readFileSync.mockReturnValue('export default {\n  reactStrictMode: true,\n};');

      patchIframeHeaders('/tmp/worktree');

      expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(1);
      const written = mockedFs.writeFileSync.mock.calls[0][1] as string;
      expect(written).toContain('X-Frame-Options');
    });

    it('should handle TS const nextConfig format', () => {
      mockedFs.existsSync.mockImplementation((p) => {
        return String(p).endsWith('next.config.ts');
      });
      mockedFs.readFileSync.mockReturnValue(
        'import type { NextConfig } from "next";\nconst nextConfig: NextConfig = {};\nexport default nextConfig;',
      );

      patchIframeHeaders('/tmp/worktree');

      expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(1);
      const written = mockedFs.writeFileSync.mock.calls[0][1] as string;
      expect(written).toContain('X-Frame-Options');
    });
  });

  describe('injectNavSyncScript', () => {
    it('should inject into app/layout.tsx if it exists', () => {
      mockedFs.existsSync.mockImplementation((p) => {
        return String(p).includes('app/layout.tsx');
      });
      mockedFs.readFileSync.mockReturnValue('<html><body>{children}</body></html>');

      injectNavSyncScript('/tmp/worktree');

      expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(1);
      const written = mockedFs.writeFileSync.mock.calls[0][1] as string;
      expect(written).toContain('vbc-nav');
    });

    it('should try app/layout.jsx if .tsx not found', () => {
      mockedFs.existsSync.mockImplementation((p) => {
        return String(p).includes('app/layout.jsx');
      });
      mockedFs.readFileSync.mockReturnValue('<html><body>{children}</body></html>');

      injectNavSyncScript('/tmp/worktree');

      expect(mockedFs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('app/layout.jsx'),
        expect.anything(),
      );
    });

    it('should try pages/_document.tsx if no app/layout found', () => {
      mockedFs.existsSync.mockImplementation((p) => {
        return String(p).includes('pages/_document.tsx');
      });
      mockedFs.readFileSync.mockReturnValue('<Html><body></body></Html>');

      injectNavSyncScript('/tmp/worktree');

      expect(mockedFs.readFileSync).toHaveBeenCalledWith(
        expect.stringContaining('pages/_document.tsx'),
        expect.anything(),
      );
    });

    it('should create minimal App Router layout when no layout exists', () => {
      mockedFs.existsSync.mockReturnValue(false);

      injectNavSyncScript('/tmp/worktree');

      // ASSUMPTION: creates a new file with vbc-nav script
      expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(1);
      const written = mockedFs.writeFileSync.mock.calls[0][1] as string;
      expect(written).toContain('vbc-nav');
    });

    it('should skip injection if vbc-nav marker already present', () => {
      mockedFs.existsSync.mockImplementation((p) => {
        return String(p).includes('app/layout.tsx');
      });
      mockedFs.readFileSync.mockReturnValue(
        '<html><body><script id="vbc-nav"></script>{children}</body></html>',
      );

      injectNavSyncScript('/tmp/worktree');

      expect(mockedFs.writeFileSync).not.toHaveBeenCalled();
    });
  });

  describe('patchProject', () => {
    it('should call both patchIframeHeaders and injectNavSyncScript', () => {
      // Setup: no config file found, no layout found (simplest path)
      mockedFs.existsSync.mockReturnValue(false);

      patchProject('/tmp/worktree');

      // ASSUMPTION: patchProject calls both functions; since no config exists,
      // patchIframeHeaders won't write, but injectNavSyncScript creates a layout
      expect(mockedFs.writeFileSync).toHaveBeenCalled();
    });
  });
});
