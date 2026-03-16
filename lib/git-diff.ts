import { execSync } from 'node:child_process';

export function getGitDiff(branchA: string, branchB: string, maxChars = 5000): string {
  try {
    const diff = execSync(
      `git diff ${branchA}...${branchB} -- . ':!pnpm-lock.yaml' ':!package-lock.json'`,
      { encoding: 'utf-8', maxBuffer: 1024 * 1024, cwd: process.cwd() },
    );
    if (diff.length > maxChars) {
      return diff.slice(0, maxChars) + '\n\n... (truncated)';
    }
    return diff || 'No differences found.';
  } catch (error) {
    return `Failed to get diff: ${error instanceof Error ? error.message : String(error)}`;
  }
}
