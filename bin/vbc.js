#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const args = process.argv.slice(2);

if (args.includes('--help') || args.includes('-h')) {
  console.log(`
Usage: vbc [options]

Options:
  --port <number>  Port to run the comparator UI on (default: 4000)
  --help           Show this help message

Visual Branch Comparator — compare how your app looks across git branches.
Run from the root of a git repository.
`);
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

// Resolve the package dir (where this script lives, one level up from bin/)
const packageDir = path.resolve(__dirname, '..');

console.log(`Starting Visual Branch Comparator on port ${port}...`);

const child = spawn('node', ['node_modules/.bin/next', 'start', '-p', String(port)], {
  cwd: packageDir,
  stdio: 'inherit',
  env: { ...process.env },
});

child.on('error', (err) => {
  console.error('Failed to start Next.js server:', err.message);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
