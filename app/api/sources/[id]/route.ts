import { NextResponse, NextRequest } from 'next/server';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  await params;
  return NextResponse.json({ todo: true });
}
