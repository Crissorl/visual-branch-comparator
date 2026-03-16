import { NextResponse } from 'next/server';
import simpleGit from 'simple-git';

export async function GET(): Promise<NextResponse> {
  const git = simpleGit();
  const result = await git.branch();
  return NextResponse.json({
    current: result.current,
    branches: Object.keys(result.branches),
  });
}
