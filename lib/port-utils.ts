import net from 'node:net';
import { WorktreeError } from './worktree-errors';

function djb2(str: string): number {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function hashPort(branch: string): number {
  return 3001 + (djb2(branch) % 99);
}

export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    const timeout = setTimeout(() => {
      server.close();
      resolve(false);
    }, 2000);

    server.once('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });

    server.once('listening', () => {
      clearTimeout(timeout);
      server.close(() => resolve(true));
    });

    server.listen(port, '127.0.0.1');
  });
}

const PORT_MIN = 3001;
const PORT_MAX = 3099;
const MAX_RETRIES = 10;

export async function findFreePort(branch: string): Promise<number> {
  const basePort = hashPort(branch);

  for (let i = 0; i < MAX_RETRIES; i++) {
    const port = PORT_MIN + ((basePort - PORT_MIN + i) % (PORT_MAX - PORT_MIN + 1));
    if (await isPortFree(port)) {
      return port;
    }
  }

  throw new WorktreeError(
    'PORT_EXHAUSTED',
    `No free port found for branch "${branch}" after ${MAX_RETRIES} attempts`,
  );
}
