import { NextRequest, NextResponse } from 'next/server';
import { getGitDiff } from '@/lib/git-diff';
import { describe } from '@/lib/description-engine';
import { readState } from '@/lib/state-store';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    if (
      typeof body !== 'object' ||
      body === null ||
      !('sourceAId' in body) ||
      !('sourceBId' in body)
    ) {
      return NextResponse.json({ error: 'sourceAId and sourceBId are required' }, { status: 400 });
    }

    const { sourceAId, sourceBId } = body as { sourceAId: unknown; sourceBId: unknown };

    if (typeof sourceAId !== 'string' || typeof sourceBId !== 'string') {
      return NextResponse.json(
        { error: 'sourceAId and sourceBId must be strings' },
        { status: 400 },
      );
    }

    const state = await readState();
    const sourceA = Object.values(state).find((s) => s.id === sourceAId);
    const sourceB = Object.values(state).find((s) => s.id === sourceBId);

    if (!sourceA || !sourceB) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    const gitDiff = getGitDiff(sourceA.branch, sourceB.branch);
    const description = await describe(gitDiff, null);

    return NextResponse.json({ description, gitDiff });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Description failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
