import type { Source } from '@/lib/worktree-manager';

const styles: Record<Source['status'], string> = {
  building: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400',
  running: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400',
  error: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400',
  stopped: 'bg-neutral-200 text-neutral-700 dark:bg-neutral-500/20 dark:text-neutral-400',
};

export default function StatusBadge({ status }: { status: Source['status'] }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs ${styles[status]}`}>{status}</span>;
}
