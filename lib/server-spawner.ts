import type { Source } from './worktree-manager';

export async function startServer(source: Source): Promise<void> {
  void source;
  throw new Error('Not implemented');
}

export async function healthCheck(port: number): Promise<boolean> {
  void port;
  throw new Error('Not implemented');
}

export async function stopServer(source: Source): Promise<void> {
  void source;
  throw new Error('Not implemented');
}
