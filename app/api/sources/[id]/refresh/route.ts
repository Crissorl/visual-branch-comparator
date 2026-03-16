import { NextResponse, NextRequest } from 'next/server';
import { getSource, removeSource, addSource } from '@/lib/worktree-manager';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const existing = await getSource(id);

  if (!existing) {
    return NextResponse.json({ error: 'Source not found' }, { status: 404 });
  }

  await removeSource(id);
  const source = await addSource(existing.branch, existing.commit);
  return NextResponse.json(source);
}
