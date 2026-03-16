export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { cleanupStaleEntries } = await import('./lib/worktree-manager');
    await cleanupStaleEntries();
  }
}
