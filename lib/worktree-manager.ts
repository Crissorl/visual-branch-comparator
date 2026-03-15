export interface Source {
  id: string;
  branch: string;
  worktreePath: string;
  port: number;
  status: 'building' | 'running' | 'error' | 'stopped';
}

export async function addSource(branch: string): Promise<Source> {
  void branch;
  throw new Error('Not implemented');
}

export async function removeSource(id: string): Promise<void> {
  void id;
  throw new Error('Not implemented');
}

export async function listSources(): Promise<Source[]> {
  throw new Error('Not implemented');
}
