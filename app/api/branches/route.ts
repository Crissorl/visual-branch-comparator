import { NextResponse } from 'next/server';
import simpleGit from 'simple-git';

interface BranchInfo {
  name: string;
  lastCommitMessage: string;
  lastCommitDate: string;
}

export async function GET(): Promise<NextResponse> {
  const git = simpleGit();
  const result = await git.branch();
  const branchNames = Object.keys(result.branches);

  const branches: BranchInfo[] = await Promise.all(
    branchNames.map(async (name) => {
      try {
        const log = await git.log([name, '--max-count=1']);
        const latest = log.latest;
        return {
          name,
          lastCommitMessage: latest?.message.slice(0, 60) ?? '',
          lastCommitDate: latest?.date ?? '',
        };
      } catch {
        return { name, lastCommitMessage: '', lastCommitDate: '' };
      }
    }),
  );

  branches.sort((a, b) => {
    if (!a.lastCommitDate || !b.lastCommitDate) return 0;
    return new Date(b.lastCommitDate).getTime() - new Date(a.lastCommitDate).getTime();
  });

  return NextResponse.json({ current: result.current, branches });
}
