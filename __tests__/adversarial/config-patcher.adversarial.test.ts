import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import { patchIframeHeaders, injectNavSyncScript, patchProject } from '@/lib/config-patcher';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockMkdirSync = vi.mocked(mkdirSync);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('config-patcher adversarial tests', () => {
  describe('patchIframeHeaders — config format detection', () => {
    it('should not write if no next.config file exists', () => {
      // BUG HUNT: all three config names missing
      mockExistsSync.mockReturnValue(false);
      patchIframeHeaders('/fake/worktree');
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('should skip if already patched (idempotency)', () => {
      mockExistsSync.mockImplementation((p) => String(p).endsWith('next.config.ts'));
      mockReadFileSync.mockReturnValue(
        'const nextConfig = { headers() { return [{ headers: [{ key: "X-Frame-Options" }] }] } }; export default nextConfig;',
      );
      patchIframeHeaders('/fake/worktree');
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('should patch CJS module.exports format', () => {
      mockExistsSync.mockImplementation((p) => String(p).endsWith('next.config.js'));
      mockReadFileSync.mockReturnValue('module.exports = {\n  reactStrictMode: true,\n};');

      patchIframeHeaders('/fake/worktree');

      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      const written = mockWriteFileSync.mock.calls[0][1] as string;
      expect(written).toContain('X-Frame-Options');
      expect(written).toContain('ALLOWALL');
      expect(written).toContain('frame-ancestors');
    });

    it('should patch ESM export default { } format', () => {
      mockExistsSync.mockImplementation((p) => String(p).endsWith('next.config.mjs'));
      mockReadFileSync.mockReturnValue('export default {\n  reactStrictMode: true,\n};');

      patchIframeHeaders('/fake/worktree');

      const written = mockWriteFileSync.mock.calls[0][1] as string;
      expect(written).toContain('X-Frame-Options');
    });

    it('should patch TypeScript const nextConfig = { } format', () => {
      mockExistsSync.mockImplementation((p) => String(p).endsWith('next.config.ts'));
      mockReadFileSync.mockReturnValue(
        'import type { NextConfig } from "next";\nconst nextConfig: NextConfig = {\n  reactStrictMode: true,\n};\nexport default nextConfig;',
      );

      patchIframeHeaders('/fake/worktree');

      const written = mockWriteFileSync.mock.calls[0][1] as string;
      expect(written).toContain('X-Frame-Options');
    });

    it('should handle export default variable (no object literal) with fallback', () => {
      // BUG HUNT: export default someVar — where someVar is defined elsewhere
      mockExistsSync.mockImplementation((p) => String(p).endsWith('next.config.ts'));
      mockReadFileSync.mockReturnValue('const config = getConfig();\nexport default config;');

      patchIframeHeaders('/fake/worktree');

      const written = mockWriteFileSync.mock.calls[0][1] as string;
      // Fallback appends module.exports — creates DUPLICATE export!
      // BUG FOUND: when config is `const config = getConfig(); export default config;`
      // the fallback appends `module.exports = { ... }` — mixing ESM and CJS
      expect(written).toContain('X-Frame-Options');
    });

    it('should handle completely empty config file', () => {
      // BUG HUNT: empty file — no pattern matches, falls to final else
      mockExistsSync.mockImplementation((p) => String(p).endsWith('next.config.js'));
      mockReadFileSync.mockReturnValue('');

      patchIframeHeaders('/fake/worktree');

      const written = mockWriteFileSync.mock.calls[0][1] as string;
      // Falls through to last else: appends export default
      expect(written).toContain('export default');
      expect(written).toContain('X-Frame-Options');
    });

    it('should handle config with comments only', () => {
      mockExistsSync.mockImplementation((p) => String(p).endsWith('next.config.js'));
      mockReadFileSync.mockReturnValue('// this is a comment\n/* block comment */');

      patchIframeHeaders('/fake/worktree');

      const written = mockWriteFileSync.mock.calls[0][1] as string;
      expect(written).toContain('X-Frame-Options');
    });

    it('should handle config that already has a headers() function without X-Frame-Options', () => {
      // BUG HUNT: existing headers() function gets a SECOND headers() injected
      // BUG FOUND: if config already has `async headers() { return [...] }` without X-Frame-Options,
      // the patcher injects ANOTHER headers() — duplicate method in object literal
      mockExistsSync.mockImplementation((p) => String(p).endsWith('next.config.js'));
      mockReadFileSync.mockReturnValue(
        'module.exports = {\n  async headers() {\n    return [{ source: "/api/(.*)", headers: [{ key: "Cache-Control", value: "no-store" }] }];\n  },\n};',
      );

      patchIframeHeaders('/fake/worktree');

      const written = mockWriteFileSync.mock.calls[0][1] as string;
      // Two headers() functions in same object — last one wins in JS, but it's still wrong
      const headersCount = (written.match(/async headers\(\)/g) || []).length;
      // BUG FOUND: duplicate headers() — the existing one is overridden silently
      expect(headersCount).toBe(2); // proves the bug exists
    });
  });

  describe('patchIframeHeaders — regex injection', () => {
    it('should handle config variable name with regex special characters', () => {
      // BUG HUNT: the regex uses dynamic content from the file in a new RegExp()
      // line 61: new RegExp(`(${match[1]}\\s+${match[2]}\\s*[=:][^{]*\\{)`)
      // If match[2] (variable name) contains regex specials, it breaks
      mockExistsSync.mockImplementation((p) => String(p).endsWith('next.config.ts'));
      // Variable name can't really have regex chars in valid JS, but let's test the edge
      mockReadFileSync.mockReturnValue(
        'const myConfig = {\n  reactStrictMode: true,\n};\nexport default myConfig;',
      );

      // This should work — "myConfig" matches \w+ but doesn't match "Config" suffix in the named pattern
      // Actually the regex is /const\s+\w+Config[^=]*=\s*\{/ — requires "Config" in the name!
      // BUG FOUND: if variable is named `mySettings` instead of `myConfig`, the TS pattern won't match
      patchIframeHeaders('/fake/worktree');
      const written = mockWriteFileSync.mock.calls[0][1] as string;
      expect(written).toContain('X-Frame-Options');
    });

    it('should handle variable named settings instead of Config — falls through', () => {
      // BUG FOUND: regex requires "Config" in variable name — nonstandard names are missed
      mockExistsSync.mockImplementation((p) => String(p).endsWith('next.config.ts'));
      mockReadFileSync.mockReturnValue(
        'const settings = {\n  reactStrictMode: true,\n};\nexport default settings;',
      );

      patchIframeHeaders('/fake/worktree');

      const written = mockWriteFileSync.mock.calls[0][1] as string;
      // Falls to the `export default \w+` branch, then tries to find const/let/var
      // `const settings = {` matches the inner regex — so it does work via fallback
      expect(written).toContain('X-Frame-Options');
    });
  });

  describe('injectNavSyncScript — layout detection', () => {
    it('should create minimal layout when no layout file exists', () => {
      mockExistsSync.mockReturnValue(false);
      mockMkdirSync.mockImplementation(() => undefined as unknown as string);

      injectNavSyncScript('/fake/worktree');

      expect(mockMkdirSync).toHaveBeenCalled();
      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
      const written = mockWriteFileSync.mock.calls[0][1] as string;
      expect(written).toContain('vbc-nav');
      expect(written).toContain('RootLayout');
    });

    it('should skip injection if vbc-nav marker already present', () => {
      mockExistsSync.mockImplementation((p) => String(p).endsWith('layout.tsx'));
      mockReadFileSync.mockReturnValue(
        '<html><head><script>/* vbc-nav */</script></head><body>{children}</body></html>',
      );

      injectNavSyncScript('/fake/worktree');
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('should inject after <head> tag', () => {
      mockExistsSync.mockImplementation((p) => String(p).endsWith('layout.tsx'));
      mockReadFileSync.mockReturnValue(
        '<html lang="en"><head><title>App</title></head><body>{children}</body></html>',
      );

      injectNavSyncScript('/fake/worktree');

      const written = mockWriteFileSync.mock.calls[0][1] as string;
      expect(written).toContain('<head>');
      expect(written).toContain('dangerouslySetInnerHTML');
    });

    it('should inject head section when only <html> exists (no <head>)', () => {
      mockExistsSync.mockImplementation((p) => String(p).endsWith('layout.tsx'));
      mockReadFileSync.mockReturnValue('<html lang="en"><body>{children}</body></html>');

      injectNavSyncScript('/fake/worktree');

      const written = mockWriteFileSync.mock.calls[0][1] as string;
      expect(written).toContain('<head>');
      expect(written).toContain('dangerouslySetInnerHTML');
    });

    it('should not inject if no <html> tag found — silently skips', () => {
      // BUG HUNT: layout with JSX fragments or custom structure
      mockExistsSync.mockImplementation((p) => String(p).endsWith('layout.tsx'));
      mockReadFileSync.mockReturnValue(
        'export default function Layout({ children }) { return <>{children}</>; }',
      );

      injectNavSyncScript('/fake/worktree');

      // BUG FOUND: silently does nothing — no error, no warning to user
      // The nav sync just won't work and user has no idea why
      expect(mockWriteFileSync).not.toHaveBeenCalled();
    });

    it('should handle layout.jsx (not just .tsx)', () => {
      mockExistsSync.mockImplementation((p) => String(p).endsWith('layout.jsx'));
      mockReadFileSync.mockReturnValue('<html><head></head><body>{children}</body></html>');

      injectNavSyncScript('/fake/worktree');
      expect(mockWriteFileSync).toHaveBeenCalledTimes(1);
    });

    it('should prefer app/layout.tsx over pages/_document.tsx', () => {
      // BUG HUNT: priority order — app router should win over pages router
      mockExistsSync.mockImplementation((p) => {
        const s = String(p);
        return s.endsWith('layout.tsx') || s.endsWith('_document.tsx');
      });
      mockReadFileSync.mockReturnValue('<html><head></head><body>{children}</body></html>');

      injectNavSyncScript('/fake/worktree');

      const writtenPath = mockWriteFileSync.mock.calls[0][0] as string;
      expect(writtenPath).toContain('layout.tsx');
      expect(writtenPath).not.toContain('_document');
    });
  });

  describe('injectNavSyncScript — XSS via NAV_SYNC_SCRIPT', () => {
    it('should use template literal injection (backtick in script content)', () => {
      // BUG HUNT: if NAV_SYNC_SCRIPT contains backticks, template literal breaks
      // The script is hardcoded so this is controlled, but if someone edits it...
      mockExistsSync.mockReturnValue(false);
      mockMkdirSync.mockImplementation(() => undefined as unknown as string);

      injectNavSyncScript('/fake/worktree');

      const written = mockWriteFileSync.mock.calls[0][1] as string;
      expect(written).toContain('dangerouslySetInnerHTML');
      // Verify the script doesn't break JSX template literal
      expect(written).not.toContain('${'); // no template injection in the output
    });
  });

  describe('patchProject — combined patching', () => {
    it('should call both patchIframeHeaders and injectNavSyncScript', () => {
      mockExistsSync.mockReturnValue(false);
      // Both functions will silently skip since no files exist
      patchProject('/fake/worktree');
      // patchIframeHeaders checks 3 config files, injectNavSyncScript checks 4 layout files
      // then creates a new layout
      expect(mockWriteFileSync).toHaveBeenCalledTimes(1); // only the created layout
    });
  });

  describe('patchIframeHeaders — security considerations', () => {
    it('should set ALLOWALL for X-Frame-Options — intentional security relaxation', () => {
      // SECURITY NOTE: X-Frame-Options: ALLOWALL + frame-ancestors * is intentionally insecure
      // This is by design for local development, but worth documenting
      mockExistsSync.mockImplementation((p) => String(p).endsWith('next.config.js'));
      mockReadFileSync.mockReturnValue('module.exports = {};');

      patchIframeHeaders('/fake/worktree');

      const written = mockWriteFileSync.mock.calls[0][1] as string;
      expect(written).toContain('ALLOWALL');
      expect(written).toContain('frame-ancestors *');
    });
  });
});
