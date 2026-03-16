'use client';

import { useEffect, useState } from 'react';
import type { Source } from '@/lib/worktree-manager';
import { timeAgo, formatElapsed } from '@/lib/utils/format';
import StatusBadge from '@/components/StatusBadge';

interface StatusBarProps {
  sources: Source[];
  onRefresh: (id: string) => void;
  onShowLog: (id: string) => void;
}

function useElapsedTimer(status: Source['status'], startMs: number | undefined): string {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (status !== 'building' || !startMs) return;

    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 1000);

    return () => clearInterval(interval);
  }, [status, startMs]);

  if (status !== 'building' || !startMs) return '';
  // tick is used to force re-render every second
  void tick;
  return formatElapsed(startMs);
}

function SourceStatus({
  source,
  onRefresh,
  onShowLog,
}: {
  source: Source;
  onRefresh: () => void;
  onShowLog: () => void;
}) {
  const elapsed = useElapsedTimer(source.status, source.lastBuildTime);

  return (
    <div className="flex items-center gap-3">
      <span className="truncate font-medium text-white">{source.branch}</span>
      <StatusBadge status={source.status} />

      {source.status === 'building' && (
        <span className="text-xs text-yellow-400">Building... ({elapsed})</span>
      )}

      {source.status === 'running' && (
        <span className="text-xs text-green-400">
          <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-green-400" />
          Running on :{source.port}
        </span>
      )}

      {source.status === 'error' && (
        <button
          onClick={onShowLog}
          className="text-xs text-red-400 underline decoration-dotted hover:text-red-300"
        >
          Build failed
        </button>
      )}

      {source.status === 'stopped' && <span className="text-xs text-neutral-500">Stopped</span>}

      {source.lastBuildTime && source.status !== 'building' && (
        <span className="text-xs text-neutral-500">{timeAgo(source.lastBuildTime)}</span>
      )}

      <button
        onClick={onRefresh}
        className="ml-1 rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white"
        aria-label={`Refresh ${source.branch}`}
        title="Refresh"
      >
        ↻
      </button>
    </div>
  );
}

export default function StatusBar({ sources, onRefresh, onShowLog }: StatusBarProps) {
  if (sources.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 flex items-center gap-8 border-t border-neutral-700 bg-neutral-900 px-6 py-2">
      {sources.map((source) => (
        <SourceStatus
          key={source.id}
          source={source}
          onRefresh={() => onRefresh(source.id)}
          onShowLog={() => onShowLog(source.id)}
        />
      ))}
    </div>
  );
}
