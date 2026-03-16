import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { capture } from '@/lib/screenshot-engine';
import { compare } from '@/lib/diff-engine';
import { readState } from '@/lib/state-store';
import { getTargetRepo } from '@/lib/target-repo';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();
    if (typeof body !== 'object' || body === null) {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { sourceAId, sourceBId, threshold } = body as {
      sourceAId?: unknown;
      sourceBId?: unknown;
      threshold?: unknown;
    };

    if (typeof sourceAId !== 'string' || typeof sourceBId !== 'string') {
      return NextResponse.json({ error: 'sourceAId and sourceBId are required' }, { status: 400 });
    }

    const state = await readState();
    const sourceA = Object.values(state).find((s) => s.id === sourceAId);
    const sourceB = Object.values(state).find((s) => s.id === sourceBId);

    if (!sourceA || !sourceB) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    if (sourceA.status !== 'running' || sourceB.status !== 'running') {
      return NextResponse.json({ error: 'Both sources must be running' }, { status: 400 });
    }

    // Capture screenshots
    const timestamp = Date.now();
    const screenshotDir = join(getTargetRepo(), '.comparator', 'screenshots');
    const pathA = join(screenshotDir, `${sourceAId}-diff-${timestamp}.png`);
    const pathB = join(screenshotDir, `${sourceBId}-diff-${timestamp}.png`);

    await Promise.all([
      capture(`http://localhost:${sourceA.port}`, pathA),
      capture(`http://localhost:${sourceB.port}`, pathB),
    ]);

    // Compare
    const parsedThreshold = typeof threshold === 'number' ? threshold : undefined;
    const result = await compare(pathA, pathB, { threshold: parsedThreshold });

    // Read diff image as base64
    const diffImageBase64 = readFileSync(result.diffImagePath).toString('base64');

    return NextResponse.json({
      ...result,
      diffImageBase64: `data:image/png;base64,${diffImageBase64}`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Diff comparison failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
