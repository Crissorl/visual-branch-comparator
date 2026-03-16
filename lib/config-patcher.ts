import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { NAV_SYNC_SCRIPT } from './nav-sync-script';

const IFRAME_HEADERS_MARKER = 'X-Frame-Options';

export function patchIframeHeaders(worktreePath: string): void {
  const configNames = ['next.config.ts', 'next.config.mjs', 'next.config.js'];
  let configPath: string | null = null;

  for (const name of configNames) {
    const p = join(worktreePath, name);
    if (existsSync(p)) {
      configPath = p;
      break;
    }
  }

  if (!configPath) {
    console.log('[config-patcher] No next.config found, skipping header patch');
    return;
  }

  const content = readFileSync(configPath, 'utf-8');

  if (content.includes(IFRAME_HEADERS_MARKER)) {
    console.log('[config-patcher] Already patched for iframe headers');
    return;
  }

  const headersBlock = `
    async headers() {
      return [
        {
          source: '/(.*)',
          headers: [
            { key: 'X-Frame-Options', value: 'ALLOWALL' },
            { key: 'Content-Security-Policy', value: 'frame-ancestors *' },
          ],
        },
      ];
    },`;

  let patched: string;

  if (content.includes('module.exports')) {
    // CJS format
    patched = content.replace(/module\.exports\s*=\s*\{/, `module.exports = {\n${headersBlock}`);
  } else if (content.match(/export\s+default\s+\{/)) {
    // ESM object export
    patched = content.replace(/export\s+default\s+\{/, `export default {\n${headersBlock}`);
  } else if (content.match(/const\s+\w+Config[^=]*=\s*\{/)) {
    // Named config variable (TS pattern: const nextConfig: NextConfig = {)
    patched = content.replace(/(const\s+\w+Config[^=]*=\s*\{)/, `$1\n${headersBlock}`);
  } else if (content.match(/export\s+default\s+\w+/)) {
    // Export default with variable name — wrap it
    // e.g. `export default nextConfig` — need to inject before
    const match = content.match(/(const|let|var)\s+(\w+)\s*[=:][^{]*\{/);
    if (match) {
      patched = content.replace(
        new RegExp(`(${match[1]}\\s+${match[2]}\\s*[=:][^{]*\\{)`),
        `$1\n${headersBlock}`,
      );
    } else {
      // Fallback: just create a new config
      patched = content + `\n// Injected by VBC\nmodule.exports = { ${headersBlock} };\n`;
    }
  } else {
    patched = content + `\n// Injected by VBC\nexport default { ${headersBlock} };\n`;
  }

  writeFileSync(configPath, patched);
  console.log(`[config-patcher] Patched ${configPath} with iframe headers`);
}

export function injectNavSyncScript(worktreePath: string): void {
  const appLayoutPath = join(worktreePath, 'app', 'layout.tsx');
  const appLayoutJsxPath = join(worktreePath, 'app', 'layout.jsx');
  const pagesDocPath = join(worktreePath, 'pages', '_document.tsx');
  const pagesDocJsxPath = join(worktreePath, 'pages', '_document.jsx');

  let targetPath: string | null = null;

  if (existsSync(appLayoutPath)) targetPath = appLayoutPath;
  else if (existsSync(appLayoutJsxPath)) targetPath = appLayoutJsxPath;
  else if (existsSync(pagesDocPath)) targetPath = pagesDocPath;
  else if (existsSync(pagesDocJsxPath)) targetPath = pagesDocJsxPath;

  if (!targetPath) {
    // Create minimal App Router layout
    const dir = join(worktreePath, 'app');
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    targetPath = appLayoutPath;
    const minimalLayout = `export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: \`${NAV_SYNC_SCRIPT}\` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
`;
    writeFileSync(targetPath, minimalLayout);
    console.log(`[config-patcher] Created minimal layout with nav sync at ${targetPath}`);
    return;
  }

  const content = readFileSync(targetPath, 'utf-8');

  if (content.includes('vbc-nav')) {
    console.log('[config-patcher] Nav sync already injected');
    return;
  }

  const scriptTag = `<script dangerouslySetInnerHTML={{ __html: \`${NAV_SYNC_SCRIPT}\` }} />`;

  let patched: string;
  if (content.includes('<head>') || content.includes('<head ')) {
    // Insert after <head...>
    patched = content.replace(/(<head[^>]*>)/, `$1\n        ${scriptTag}`);
  } else if (content.includes('<html')) {
    // Insert head section
    patched = content.replace(
      /(<html[^>]*>)/,
      `$1\n      <head>\n        ${scriptTag}\n      </head>`,
    );
  } else {
    console.log('[config-patcher] Could not find injection point for nav sync script');
    return;
  }

  writeFileSync(targetPath, patched);
  console.log(`[config-patcher] Injected nav sync script into ${targetPath}`);
}

export function patchProject(worktreePath: string): void {
  patchIframeHeaders(worktreePath);
  injectNavSyncScript(worktreePath);
}
