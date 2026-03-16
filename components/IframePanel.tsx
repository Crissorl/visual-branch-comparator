'use client';

import type { Source } from '@/lib/worktree-manager';

interface IframePanelProps {
  source: Source | null;
  onRefresh?: () => void;
}

export default function IframePanel({ source, onRefresh }: IframePanelProps) {
  if (!source) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-neutral-700 bg-neutral-900/50">
        <p className="text-sm text-neutral-500">Select a branch to compare</p>
      </div>
    );
  }

  if (source.status === 'building') {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900/50">
        <div className="mb-3 h-6 w-6 animate-spin rounded-full border-2 border-neutral-600 border-t-yellow-400" />
        <p className="text-sm text-neutral-300">
          Building <span className="font-medium text-white">{source.branch}</span>...
        </p>
      </div>
    );
  }

  if (source.status === 'error') {
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-lg border border-red-900/50 bg-neutral-900/50 p-4">
        <p className="mb-2 text-sm font-medium text-red-400">Build failed</p>
        {source.buildError && (
          <pre className="max-h-48 w-full overflow-auto rounded bg-neutral-950 p-3 font-mono text-xs text-neutral-400">
            {source.buildError}
          </pre>
        )}
        {onRefresh && (
          <button
            onClick={onRefresh}
            className="mt-3 rounded bg-neutral-700 px-3 py-1.5 text-xs text-white transition-colors hover:bg-neutral-600"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  if (source.status === 'stopped') {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900/50">
        <p className="text-sm text-neutral-500">Server stopped</p>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      <iframe
        src={`http://localhost:${source.port}/`}
        className="h-full w-full rounded-lg border border-neutral-700"
        sandbox="allow-same-origin allow-scripts allow-forms allow-popups"
        title={`Preview: ${source.branch}`}
      />
      {onRefresh && (
        <button
          onClick={onRefresh}
          className="absolute right-2 top-2 rounded bg-neutral-800/80 p-1.5 text-neutral-400 transition-colors hover:bg-neutral-700 hover:text-white"
          aria-label={`Refresh ${source.branch}`}
          title="Refresh"
        >
          ↻
        </button>
      )}
    </div>
  );
}
