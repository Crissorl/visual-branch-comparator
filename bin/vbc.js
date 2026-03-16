#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn, exec } = require('child_process');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(`
Usage: vbc [options]

Options:
  --port <number>  Port to run the comparator UI on (default: 4000)
  --no-open        Do not automatically open browser on startup
  --help           Show this help message

Visual Branch Comparator — compare how your app looks across git branches.
Run from the root of a git repository.
\n`);
  process.exit(0);
}

// Check .git exists in cwd
const cwd = process.cwd();
if (!fs.existsSync(path.join(cwd, '.git'))) {
  console.error('Error: No .git directory found. Run vbc from the root of a git repository.');
  process.exit(1);
}

// Parse --port flag
let port = 4000;
const portIdx = args.indexOf('--port');
if (portIdx !== -1 && args[portIdx + 1]) {
  const parsed = parseInt(args[portIdx + 1], 10);
  if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
    console.error('Error: --port must be a valid port number (1-65535)');
    process.exit(1);
  }
  port = parsed;
}

// Parse --no-open flag
const shouldOpen = !args.includes('--no-open');

// Resolve the package dir (where this script lives, one level up from bin/)
const packageDir = path.resolve(__dirname, '..');

process.stdout.write(`Starting Visual Branch Comparator on port ${port}...\n`);

/**
 * Poll for server availability and open browser when ready
 */
async function waitForServer(port, maxAttempts = 30) {
  const http = await import('node:http');
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await new Promise((resolve, reject) => {
        const req = http.get(`http://localhost:${port}`, (res) => {
          if (res.statusCode === 200) {
            resolve(res.statusCode);
          } else {
            reject(new Error(`Got status ${res.statusCode}`));
          }
        });
        req.on('error', reject);
        req.setTimeout(1000, () => {
          req.destroy();
          reject(new Error('timeout'));
        });
      });
      return true;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  return false;
}

/**
 * Open browser to the given URL using platform-specific command
 */
function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${cmd} ${url}`, (error) => {
    if (error && error.code !== 0) {
      process.stderr.write(`Could not automatically open browser: ${error.message}\n`);
    }
  });
}

const nextBin = path.join(packageDir, 'node_modules', 'next', 'dist', 'bin', 'next');
const child = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
  cwd: packageDir,
  stdio: 'inherit',
  env: { ...process.env, VBC_TARGET_REPO: cwd },
});

child.on('error', (err) => {
  console.error('Failed to start Next.js server:', err.message);
  process.exit(1);
});

// Poll for server and open browser if requested
if (shouldOpen) {
  waitForServer(port).then((success) => {
    if (success) {
      process.stdout.write(`\nOpening browser at http://localhost:${port}...\n`);
      openBrowser(`http://localhost:${port}`);
    } else {
      process.stderr.write(
        `\nServer did not respond after 30 seconds. Open http://localhost:${port} manually.\n`,
      );
    }
  });
}

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
