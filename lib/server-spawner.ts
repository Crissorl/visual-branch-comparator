import { spawn, type ChildProcess } from 'node:child_process';
import http from 'node:http';
import { writeFile, readFile, copyFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type { Source } from './worktree-manager';
import { readState, writeState, ensureComparatorDir } from './state-store';
import { patchIframeHeaders } from './config-patcher';
import { getTargetRepo } from './target-repo';

interface FrameworkConfig {
  name: string;
  install: string;
  build: string;
  start: string;
  healthCheckPath: string;
  env: Record<string, string>;
}

const DEFAULT_CONFIG: FrameworkConfig = {
  name: 'nextjs',
  install: 'pnpm install',
  build: 'pnpm build',
  start: 'pnpm start',
  healthCheckPath: '/',
  env: { NEXT_TELEMETRY_DISABLED: '1' },
};

async function loadConfig(): Promise<FrameworkConfig> {
  try {
    const raw = await readFile(path.join(getTargetRepo(), 'comparator.config.json'), 'utf-8');
    const parsed = JSON.parse(raw) as Partial<FrameworkConfig>;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return DEFAULT_CONFIG;
  }
}

// Sequential build queue — max 1 build at a time
let buildChain: Promise<void> = Promise.resolve();

function enqueueBuild(fn: () => Promise<void>): void {
  buildChain = buildChain.catch(() => {}).then(fn);
}

function spawnCommand(
  cmd: string,
  cwd: string,
  env: Record<string, string>,
  logLines: string[],
): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn('sh', ['-c', cmd], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const collectLine = (line: string): void => {
      logLines.push(line);
      if (logLines.length > 1000) {
        logLines.shift();
      }
    };

    child.stdout.on('data', (data: Buffer) => {
      for (const line of data.toString().split('\n')) {
        if (line) collectLine(line);
      }
    });

    child.stderr.on('data', (data: Buffer) => {
      for (const line of data.toString().split('\n')) {
        if (line) collectLine(line);
      }
    });

    child.on('close', (code) => {
      resolve(code ?? 1);
    });
  });
}

async function writeLog(sourceId: string, lines: string[]): Promise<void> {
  await ensureComparatorDir();
  const logPath = path.join(getTargetRepo(), '.comparator', 'logs', `${sourceId}.log`);
  await writeFile(logPath, lines.join('\n'), 'utf-8');
}

async function updateSourceState(sourceId: string, updates: Partial<Source>): Promise<void> {
  const state = await readState();
  if (state[sourceId]) {
    Object.assign(state[sourceId], updates);
    await writeState(state);
  }
}

export async function startServer(source: Source): Promise<void> {
  // Skip if already building
  if (source.status === 'building') return;

  const config = await loadConfig();
  await updateSourceState(source.id, { status: 'building' });

  enqueueBuild(async () => {
    const logLines: string[] = [];
    const env = { ...config.env };
    let serverProcess: ChildProcess | undefined;

    try {
      // Non-fatal config patching
      try {
        patchIframeHeaders(source.worktreePath);
      } catch (patchError: unknown) {
        logLines.push(
          `VBC: Failed to patch next.config: ${patchError instanceof Error ? patchError.message : String(patchError)}`,
        );
      }

      // Copy .env files from target repo to worktree (git worktree doesn't copy gitignored files)
      try {
        const targetRepo = getTargetRepo();
        const entries = await readdir(targetRepo);
        const envFiles = entries.filter((f) => f.startsWith('.env'));
        for (const envFile of envFiles) {
          await copyFile(path.join(targetRepo, envFile), path.join(source.worktreePath, envFile));
        }
        if (envFiles.length > 0) {
          logLines.push(`VBC: Copied ${envFiles.length} .env file(s) to worktree`);
        }
      } catch {
        logLines.push('VBC: Could not copy .env files (non-fatal)');
      }

      // Install dependencies
      const installCode = await spawnCommand(config.install, source.worktreePath, env, logLines);
      if (installCode !== 0) {
        const errorLines = logLines.slice(-50).join('\n');
        await updateSourceState(source.id, {
          status: 'error',
          buildError: errorLines,
        });
        await writeLog(source.id, logLines);
        return;
      }

      // Build
      const buildCode = await spawnCommand(config.build, source.worktreePath, env, logLines);
      if (buildCode !== 0) {
        const errorLines = logLines.slice(-50).join('\n');
        await updateSourceState(source.id, {
          status: 'error',
          buildError: errorLines,
        });
        await writeLog(source.id, logLines);
        return;
      }

      // Start server (long-running)
      serverProcess = spawn('sh', ['-c', config.start], {
        cwd: source.worktreePath,
        env: { ...process.env, ...env, PORT: String(source.port) },
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: true,
      });

      serverProcess.stdout?.on('data', (data: Buffer) => {
        for (const line of data.toString().split('\n')) {
          if (line) {
            logLines.push(line);
            if (logLines.length > 1000) logLines.shift();
          }
        }
      });

      serverProcess.stderr?.on('data', (data: Buffer) => {
        for (const line of data.toString().split('\n')) {
          if (line) {
            logLines.push(line);
            if (logLines.length > 1000) logLines.shift();
          }
        }
      });

      serverProcess.unref();

      const pid = serverProcess.pid;
      if (pid) {
        await updateSourceState(source.id, { pid });
      }

      // Health check
      const healthy = await healthCheck(source.port, config.healthCheckPath);

      if (healthy) {
        await updateSourceState(source.id, {
          status: 'running',
          pid: pid,
          lastBuildTime: Date.now(),
          buildError: undefined,
        });
      } else {
        if (pid) {
          try {
            process.kill(pid, 'SIGKILL');
          } catch {
            /* already dead */
          }
        }
        await updateSourceState(source.id, {
          status: 'error',
          buildError: 'Health check timed out',
          pid: undefined,
        });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (serverProcess?.pid) {
        try {
          process.kill(serverProcess.pid, 'SIGKILL');
        } catch {
          /* already dead */
        }
      }
      await updateSourceState(source.id, {
        status: 'error',
        buildError: message,
        pid: undefined,
      });
    }

    await writeLog(source.id, logLines);
  });
}

export async function healthCheck(
  port: number,
  checkPath: string = '/',
  timeout: number = 180_000,
): Promise<boolean> {
  const start = Date.now();

  while (Date.now() - start < timeout) {
    const ok = await new Promise<boolean>((resolve) => {
      const req = http.get(`http://localhost:${port}${checkPath}`, { timeout: 5000 }, (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
    });

    if (ok) return true;

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return false;
}

export async function stopAllServers(): Promise<void> {
  const state = await readState();
  const runningOrBuilding = Object.values(state).filter((s) => s.pid);
  await Promise.allSettled(runningOrBuilding.map((source) => stopServer(source)));
}

export async function stopServer(source: Source): Promise<void> {
  if (source.pid) {
    try {
      process.kill(source.pid, 'SIGTERM');
    } catch {
      // Process already dead
      await updateSourceState(source.id, { status: 'stopped', pid: undefined });
      return;
    }

    // Poll for exit (max 5s)
    const start = Date.now();
    while (Date.now() - start < 5000) {
      try {
        process.kill(source.pid, 0);
      } catch {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    // Force kill if still alive
    try {
      process.kill(source.pid, 0);
      process.kill(source.pid, 'SIGKILL');
    } catch {
      /* already dead */
    }
  }

  await updateSourceState(source.id, { status: 'stopped', pid: undefined });
}
