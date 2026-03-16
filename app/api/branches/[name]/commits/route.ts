import { NextResponse, NextRequest } from 'next/server';
import simpleGit from 'simple-git';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  const { name } = await params;
  const decodedName = decodeURIComponent(name);
  const git = simpleGit();
  const log = await git.log({ from: decodedName, maxCount: 20 });
  return NextResponse.json({ commits: log.all });
}
