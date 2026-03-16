import path from 'node:path';
import { access } from 'node:fs/promises';
import crypto from 'node:crypto';
import simpleGit from 'simple-git';
import { readState, writeState, ensureComparatorDir } from './state-store';
import { findFreePort } from './port-utils';
import { WorktreeError } from './worktree-errors';
import { getTargetRepo } from './target-repo';

export interface Source {
  id: string;
  branch: string;
  commit?: string;
  worktreePath: string;
  port: number;
  status: 'building' | 'running' | 'error' | 'stopped';
  pid?: number;
  lastBuildTime?: number;
  buildError?: string;
}

function sanitizeBranchName(branch: string): string {
  return branch.replace(/\//g, '__');
}

export async function addSource(branch: string, commit?: string): Promise<Source> {
  const git = simpleGit(getTargetRepo());
  const branches = await git.branch();

  const branchExists =
    branches.all.includes(branch) || branches.all.includes(`remotes/origin/${branch}`);

  if (!branchExists) {
    throw new WorktreeError(
      'BRANCH_NOT_FOUND',
      `Branch "${branch}" not found in local or remote branches`,
    );
  }

  const state = await readState();
  const existing = Object.values(state).find((s) => s.branch === branch);
  if (existing) {
    return existing;
  }

  const id = 'src_' + crypto.randomUUID().slice(0, 8);
  const port = await findFreePort(branch);
  const worktreePath = path.join(
    getTargetRepo(),
    '.comparator',
    'worktrees',
    sanitizeBranchName(branch),
  );

  await ensureComparatorDir();

  try {
    if (commit) {
      await git.raw('worktree', 'add', '--detach', worktreePath, commit);
    } else {
      await git.raw('worktree', 'add', worktreePath, branch);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new WorktreeError('WORKTREE_FAILED', `Failed to create worktree: ${message}`);
  }

  const source: Source = {
    id,
    branch,
    ...(commit !== undefined ? { commit } : {}),
    worktreePath,
    port,
    status: 'stopped',
  };

  state[id] = source;
  await writeState(state);

  return source;
}

export async function removeSource(id: string): Promise<void> {
  const state = await readState();
  const source = state[id];

  if (!source) {
    return;
  }

  if (source.pid) {
    try {
      process.kill(source.pid, 'SIGTERM');
      await new Promise((resolve) => setTimeout(resolve, 3000));
      try {
        process.kill(source.pid, 'SIGKILL');
      } catch {
        /* already dead */
      }
    } catch {
      /* process already dead */
    }
  }

  try {
    const git = simpleGit(getTargetRepo());
    await git.raw('worktree', 'remove', '--force', source.worktreePath);
  } catch {
    /* worktree might already be gone */
  }

  delete state[id];
  await writeState(state);
}

export async function listSources(): Promise<Source[]> {
  const state = await readState();
  return Object.values(state);
}

export async function getSource(id: string): Promise<Source | null> {
  const state = await readState();
  return state[id] ?? null;
}

export async function cleanupStaleEntries(): Promise<void> {
  const state = await readState();

  if (Object.keys(state).length === 0) {
    return;
  }

  let changed = false;
  const idsToRemove: string[] = [];

  for (const [id, source] of Object.entries(state)) {
    if (source.pid !== undefined) {
      try {
        process.kill(source.pid, 0);
      } catch {
        source.status = 'stopped';
        source.pid = undefined;
        changed = true;
      }
    }

    try {
      await access(source.worktreePath);
    } catch {
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
}
