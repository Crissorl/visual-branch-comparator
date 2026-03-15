import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ todo: true });
}

export async function POST() {
  return NextResponse.json({ todo: true });
}
