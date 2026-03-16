export type WorktreeErrorCode =
  | 'BRANCH_NOT_FOUND'
  | 'PORT_EXHAUSTED'
  | 'WORKTREE_FAILED'
  | 'SOURCE_NOT_FOUND'
  | 'STATE_CORRUPT';

export class WorktreeError extends Error {
  readonly code: WorktreeErrorCode;

  constructor(code: WorktreeErrorCode, message: string) {
    super(message);
    this.name = 'WorktreeError';
    this.code = code;
  }
}
