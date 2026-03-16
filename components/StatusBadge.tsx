import type { Source } from '@/lib/worktree-manager';

const styles: Record<Source['status'], string> = {
  building: 'bg-yellow-500/20 text-yellow-400',
  running: 'bg-green-500/20 text-green-400',
  error: 'bg-red-500/20 text-red-400',
  stopped: 'bg-neutral-500/20 text-neutral-400',
};

export default function StatusBadge({ status }: { status: Source['status'] }) {
  return <span className={`rounded-full px-2 py-0.5 text-xs ${styles[status]}`}>{status}</span>;
}
