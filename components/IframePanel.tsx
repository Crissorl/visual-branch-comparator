'use client';

import { useState, useEffect, useRef, type RefCallback } from 'react';
import type { Source } from '@/lib/worktree-manager';

interface IframePanelProps {
  source: Source | null;
  onRefresh?: () => void;
  currentPath?: string;
  iframeRef?: RefCallback<HTMLIFrameElement>;
}

function BuildingView({ source }: { source: Source }) {
  const [logLines, setLogLines] = useState<string[]>([]);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;

    async function poll(): Promise<void> {
      try {
        const res = await fetch(`/api/sources/${source.id}/logs`);
        if (res.ok && active) {
          const data = (await res.json()) as { logs: string };
          if (data.logs) {
            setLogLines(data.logs.split('\n'));
          }
        }
      } catch {
        // ignore polling errors
      }
    }

    void poll();
    const interval = setInterval(() => void poll(), 2000);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [source.id]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logLines]);

  return (
    <div className="flex h-full flex-col rounded-lg border border-neutral-700 bg-neutral-900/50">
      <div className="flex items-center gap-3 border-b border-neutral-700 px-4 py-2">
        <div className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-600 border-t-yellow-400" />
        <p className="text-sm text-neutral-300">
          Building <span className="font-medium text-white">{source.branch}</span>
          {source.mode === 'dev' && <span className="ml-1 text-blue-400">(dev)</span>}
        </p>
      </div>
      <div className="flex-1 overflow-auto bg-neutral-950 p-3">
        {logLines.length === 0 ? (
          <p className="text-xs text-neutral-500">Waiting for output...</p>
        ) : (
          <pre className="font-mono text-xs text-neutral-400">
            {logLines.slice(-100).map((line, i) => (
              <div
                key={i}
                className={line.includes('ERR') || line.includes('error') ? 'text-red-400' : ''}
              >
                {line}
              </div>
            ))}
            <div ref={logEndRef} />
          </pre>
        )}
      </div>
    </div>
  );
}

export default function IframePanel({
  source,
  onRefresh,
  currentPath,
  iframeRef,
}: IframePanelProps) {
  // Local draft only used while the user is typing in the URL bar.
  // When not editing, we display the authoritative currentPath from nav sync.
  const [editingUrl, setEditingUrl] = useState<string | null>(null);

  const displayPath = editingUrl ?? currentPath ?? '/';

  if (!source) {
    return (
      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-neutral-700 bg-neutral-900/50">
        <p className="text-sm text-neutral-500">Select a branch to compare</p>
      </div>
    );
  }

  if (source.status === 'building') {
    return <BuildingView source={source} />;
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

  function handleUrlKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      setEditingUrl(null);
      return;
    }
    if (e.key !== 'Enter') return;

    const draft = editingUrl ?? '/';
    const path = draft.startsWith('/') ? draft : `/${draft}`;
    setEditingUrl(null);

    // Navigate the iframe via postMessage (injected nav sync script handles it)
    const iframeEl = document.querySelector<HTMLIFrameElement>(
      `iframe[title="Preview: ${source!.branch}"]`,
    );
    if (iframeEl?.contentWindow) {
      iframeEl.contentWindow.postMessage({ type: 'vbc-nav', path }, '*');
    }
  }

  return (
    <div className="relative flex h-full w-full flex-col">
      {/* URL bar */}
      <div className="flex items-center gap-1 rounded-t-lg border border-b-0 border-neutral-700 bg-neutral-900 px-2 py-1">
        <span className="shrink-0 text-xs text-neutral-500">localhost:{source.port}</span>
        <input
          type="text"
          value={displayPath}
          onChange={(e) => setEditingUrl(e.target.value)}
          onFocus={(e) => setEditingUrl(e.target.value)}
          onBlur={() => setEditingUrl(null)}
          onKeyDown={handleUrlKeyDown}
          className="min-w-0 flex-1 rounded bg-neutral-800 px-2 py-0.5 font-mono text-xs text-neutral-300 outline-none focus:ring-1 focus:ring-blue-500"
          aria-label={`URL for ${source.branch}`}
          placeholder="/"
        />
      </div>

      {/* iframe */}
      <div className="relative min-h-0 flex-1">
        <iframe
          ref={iframeRef}
          src={`http://localhost:${source.port}/`}
          className="h-full w-full rounded-b-lg border border-neutral-700"
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
    </div>
  );
}
