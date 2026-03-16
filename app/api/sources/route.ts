import { NextResponse, NextRequest } from 'next/server';
import { listSources, addSource, cleanupStaleEntries } from '@/lib/worktree-manager';
import { startServer } from '@/lib/server-spawner';
import { WorktreeError } from '@/lib/worktree-errors';

export async function GET(): Promise<NextResponse> {
  await cleanupStaleEntries();
  const sources = await listSources();
  return NextResponse.json(sources);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body: unknown = await request.json();
  console.log('[API] POST /api/sources RECEIVED:', JSON.stringify(body));

  if (typeof body !== 'object' || body === null || !('branch' in body)) {
    console.error('[API] POST /api/sources REJECTED: missing branch field');
    return NextResponse.json({ error: 'Missing required field: branch' }, { status: 400 });
  }

  const { branch, commit, mode } = body as {
    branch: string;
    commit?: string;
    mode?: 'build' | 'dev';
  };

  if (typeof branch !== 'string' || branch.trim() === '') {
    console.error('[API] POST /api/sources REJECTED: empty branch');
    return NextResponse.json({ error: 'branch must be a non-empty string' }, { status: 400 });
  }

  try {
    console.log(
      '[API] POST /api/sources ADDING: branch=%s, commit=%s, mode=%s',
      branch.trim(),
      commit,
      mode ?? 'build',
    );
    const source = await addSource(branch.trim(), commit, mode ?? 'build');
    console.log(
      '[API] POST /api/sources CREATED: id=%s, port=%d, status=%s',
      source.id,
      source.port,
      source.status,
    );
    void startServer(source);
    return NextResponse.json(source, { status: 201 });
  } catch (error: unknown) {
    console.error('[ERROR] POST /api/sources FAILED:', error);
    if (error instanceof WorktreeError) {
      const statusMap: Record<string, number> = {
        BRANCH_NOT_FOUND: 400,
        PORT_EXHAUSTED: 503,
        WORKTREE_FAILED: 500,
        SOURCE_NOT_FOUND: 404,
        STATE_CORRUPT: 500,
      };
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: statusMap[error.code] ?? 500 },
      );
    }
    throw error;
  }
}
