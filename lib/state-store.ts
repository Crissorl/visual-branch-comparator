import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';
import type { Source } from './worktree-manager';
import { WorktreeError } from './worktree-errors';

const COMPARATOR_DIR = '.comparator';
const STATE_FILE = 'state.json';

let cache: Record<string, Source> | null = null;

export async function ensureComparatorDir(): Promise<void> {
  const base = path.join(process.cwd(), COMPARATOR_DIR);
  await mkdir(path.join(base, 'worktrees'), { recursive: true });
  await mkdir(path.join(base, 'logs'), { recursive: true });
}

export async function readState(): Promise<Record<string, Source>> {
  if (cache !== null) return cache;

  const filePath = path.join(process.cwd(), COMPARATOR_DIR, STATE_FILE);
  try {
    const data = await readFile(filePath, 'utf-8');
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new WorktreeError('STATE_CORRUPT', 'State file is not a valid object');
    }
    cache = parsed as Record<string, Source>;
    return cache;
  } catch (error: unknown) {
    if (error instanceof WorktreeError) throw error;
    if (error instanceof SyntaxError) {
      throw new WorktreeError('STATE_CORRUPT', `Failed to parse state file: ${error.message}`);
    }
    // File doesn't exist — that's fine, return empty state
    cache = {};
    return cache;
  }
}

export async function writeState(state: Record<string, Source>): Promise<void> {
  await ensureComparatorDir();
  const filePath = path.join(process.cwd(), COMPARATOR_DIR, STATE_FILE);
  const tmpPath = filePath + '.tmp';
  await writeFile(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
  await rename(tmpPath, filePath);
  cache = state;
}

export function invalidateCache(): void {
  cache = null;
}
