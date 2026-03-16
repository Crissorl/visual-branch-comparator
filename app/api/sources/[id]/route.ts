import { NextResponse, NextRequest } from 'next/server';
import { removeSource } from '@/lib/worktree-manager';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;
  await removeSource(id);
  return new NextResponse(null, { status: 204 });
}
