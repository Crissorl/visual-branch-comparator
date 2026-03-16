import { readState, writeState } from './state-store';
import { stopAllServers } from './server-spawner';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

let shutdownInProgress = false;

export function registerShutdownHandlers(): void {
  const handler = async (signal: string): Promise<void> => {
    if (shutdownInProgress) return;
    shutdownInProgress = true;
    console.log(`[lifecycle] Received ${signal}, shutting down gracefully...`);
    await performShutdown();
    process.exit(0);
  };

  process.on('SIGTERM', () => void handler('SIGTERM'));
  process.on('SIGINT', () => void handler('SIGINT'));
}

export async function performShutdown(): Promise<void> {
  console.log('[lifecycle] Stopping all servers...');

  try {
    await stopAllServers();
  } catch (err) {
    console.error('[lifecycle] Error stopping servers:', err);
  }

  // Try to close browser if screenshot engine has one open
  try {
    const screenshotEngine = (await import('./screenshot-engine')) as Record<string, unknown>;
    if (typeof screenshotEngine['closeBrowser'] === 'function') {
      await (screenshotEngine['closeBrowser'] as () => Promise<void>)();
    }
  } catch {
    // screenshot-engine may not be initialized or may not export closeBrowser
  }

  // Mark all sources as stopped
  const state = await readState();
  for (const source of Object.values(state)) {
    source.status = 'stopped';
    source.pid = undefined;
  }
  await writeState(state);

  console.log('[lifecycle] Shutdown complete.');
}

export async function recoverFromCrash(): Promise<void> {
  console.log('[lifecycle] Checking for crash recovery...');
  const state = await readState();
  let changed = false;

  const idsToRemove: string[] = [];

  for (const [id, source] of Object.entries(state)) {
    // Check if PID is still alive
    if (source.pid !== undefined) {
      try {
        process.kill(source.pid, 0); // just check if alive
        // Process is alive but we're starting fresh — kill it (orphan)
        console.log(`[lifecycle] Killing orphan process ${source.pid} for ${source.branch}`);
        try {
          process.kill(source.pid, 'SIGKILL');
        } catch {
          // already dead
        }
      } catch {
        // Process is dead, that's fine
      }
      source.pid = undefined;
      source.status = 'stopped';
      changed = true;
    }

    // Check if worktree path exists; if not, remove the source entry
    if (source.worktreePath && !existsSync(source.worktreePath)) {
      console.log(
        `[lifecycle] Removing stale source ${id} — worktree missing: ${source.worktreePath}`,
      );
      idsToRemove.push(id);
      changed = true;
    } else if (source.worktreePath && source.status !== 'running') {
      // Worktree exists but server is not running — clean up the worktree
      console.log(`[lifecycle] Cleaning up stale worktree: ${source.worktreePath}`);
      try {
        execSync(`git worktree remove --force "${source.worktreePath}"`, { stdio: 'pipe' });
      } catch {
        // worktree may already be removed
      }
      idsToRemove.push(id);
      changed = true;
    }
  }

  for (const id of idsToRemove) {
    delete state[id];
  }

  if (changed) {
    await writeState(state);
  }

  console.log('[lifecycle] Recovery complete.');
}
