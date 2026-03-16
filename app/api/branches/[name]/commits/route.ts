import { NextResponse, NextRequest } from 'next/server';
import simpleGit from 'simple-git';
import { getTargetRepo } from '@/lib/target-repo';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
): Promise<NextResponse> {
  const { name } = await params;
  const decodedName = decodeURIComponent(name);
  console.log('[API] GET /api/branches/%s/commits: fetching', decodedName);
  const git = simpleGit(getTargetRepo());
  const branchLog = await git.raw('log', decodedName, '--max-count=50', '--format=%H|%aI|%s|%aN');
  const commits = branchLog
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [hash, date, message, author_name] = line.split('|');
      return { hash, date, message, author_name };
    });
  console.log('[API] GET /api/branches/%s/commits: found %d commits', decodedName, commits.length);
  return NextResponse.json({ commits });
}
