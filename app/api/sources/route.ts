import { NextResponse, NextRequest } from 'next/server';
import { listSources, addSource } from '@/lib/worktree-manager';
import { WorktreeError } from '@/lib/worktree-errors';

export async function GET(): Promise<NextResponse> {
  const sources = await listSources();
  return NextResponse.json(sources);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const body: unknown = await request.json();

  if (typeof body !== 'object' || body === null || !('branch' in body)) {
    return NextResponse.json({ error: 'Missing required field: branch' }, { status: 400 });
  }

  const { branch, commit } = body as { branch: string; commit?: string };

  if (typeof branch !== 'string' || branch.trim() === '') {
    return NextResponse.json({ error: 'branch must be a non-empty string' }, { status: 400 });
  }

  try {
    const source = await addSource(branch.trim(), commit);
    return NextResponse.json(source, { status: 201 });
  } catch (error: unknown) {
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
