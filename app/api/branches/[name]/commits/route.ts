import { NextResponse, NextRequest } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  await params;
  return NextResponse.json({ todo: true });
}
