import { NextResponse, NextRequest } from 'next/server';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { getSource } from '@/lib/worktree-manager';
import { getTargetRepo } from '@/lib/target-repo';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  const source = await getSource(id);

  if (!source) {
    return NextResponse.json({ error: 'Source not found' }, { status: 404 });
  }

  const logPath = path.join(getTargetRepo(), '.comparator', 'logs', `${id}.log`);

  try {
    const logs = await readFile(logPath, 'utf-8');
    return NextResponse.json({ logs });
  } catch {
    return NextResponse.json({ logs: '' });
  }
}
