import { NextRequest, NextResponse } from 'next/server';
import { join } from 'node:path';
import { capture } from '@/lib/screenshot-engine';
import { readState } from '@/lib/state-store';

export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body: unknown = await request.json();

    if (typeof body !== 'object' || body === null || !('sourceId' in body)) {
      return NextResponse.json({ error: 'sourceId is required' }, { status: 400 });
    }

    const { sourceId } = body as { sourceId: unknown };

    if (typeof sourceId !== 'string' || sourceId.trim() === '') {
      return NextResponse.json({ error: 'sourceId must be a non-empty string' }, { status: 400 });
    }

    const state = await readState();
    const source = Object.values(state).find((s) => s.id === sourceId);

    if (!source) {
      return NextResponse.json({ error: 'Source not found' }, { status: 404 });
    }

    if (source.status !== 'running') {
      return NextResponse.json({ error: 'Source is not running' }, { status: 400 });
    }

    const timestamp = Date.now();
    const outputPath = join(
      process.cwd(),
      '.comparator',
      'screenshots',
      `${sourceId}-${timestamp}.png`,
    );

    const result = await capture(`http://localhost:${source.port}`, outputPath);

    return NextResponse.json({ path: result, timestamp });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Screenshot capture failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
