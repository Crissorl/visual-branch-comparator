import type { DiffResult } from './diff-engine';

export async function describe(diffResult: DiffResult, context?: string): Promise<string> {
  void diffResult;
  void context;
  throw new Error('Not implemented');
}
