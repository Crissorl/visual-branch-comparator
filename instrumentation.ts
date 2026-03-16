export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { recoverFromCrash, registerShutdownHandlers } = await import('./lib/lifecycle');
    await recoverFromCrash();
    registerShutdownHandlers();
  }
}
