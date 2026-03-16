'use client';

import { useEffect, useState } from 'react';
import type { Source } from '@/lib/worktree-manager';
import { timeAgo, formatElapsed } from '@/lib/utils/format';
import StatusBadge from '@/components/StatusBadge';

interface StatusBarProps {
  sources: Source[];
  onRefresh: (id: string) => void;
  onStop: (id: string) => void;
  onRemove: (id: string) => void;
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
  onStop,
  onRemove,
  onShowLog,
}: {
  source: Source;
  onRefresh: () => void;
  onStop: () => void;
  onRemove: () => void;
  onShowLog: () => void;
}) {
  const elapsed = useElapsedTimer(source.status, source.lastBuildTime);

  return (
    <div className="flex items-center gap-3">
      <span className="truncate font-medium text-white">{source.branch}</span>
      {source.mode === 'dev' && (
        <span className="rounded bg-blue-900/50 px-1.5 py-0.5 text-[10px] font-medium text-blue-400">
          DEV
        </span>
      )}
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

      {(source.status === 'error' || source.status === 'stopped') && (
        <button
          onClick={onRefresh}
          className="ml-1 rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white"
          aria-label={`Retry ${source.branch}`}
          title="Retry"
        >
          ↻
        </button>
      )}

      {(source.status === 'building' || source.status === 'running') && (
        <button
          onClick={onStop}
          className="ml-1 rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-red-400"
          aria-label={`Stop ${source.branch}`}
          title="Stop"
        >
          ⏹
        </button>
      )}

      <button
        onClick={onRemove}
        className="rounded p-1 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-red-400"
        aria-label={`Remove ${source.branch}`}
        title="Remove"
      >
        ✕
      </button>
    </div>
  );
}

export default function StatusBar({
  sources,
  onRefresh,
  onStop,
  onRemove,
  onShowLog,
}: StatusBarProps) {
  if (sources.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 flex items-center gap-8 border-t border-neutral-700 bg-neutral-900 px-6 py-2">
      {sources.map((source) => (
        <SourceStatus
          key={source.id}
          source={source}
          onRefresh={() => onRefresh(source.id)}
          onStop={() => onStop(source.id)}
          onRemove={() => onRemove(source.id)}
          onShowLog={() => onShowLog(source.id)}
        />
      ))}
    </div>
  );
}
