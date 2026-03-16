'use client';

import { useEffect, useState } from 'react';

interface BuildLogProps {
  sourceId: string;
  branch: string;
  onClose: () => void;
}

export default function BuildLog({ sourceId, branch, onClose }: BuildLogProps) {
  const [logs, setLogs] = useState<string | null>(null);

  useEffect(() => {
    async function fetchLogs(): Promise<void> {
      try {
        const res = await fetch(`/api/sources/${sourceId}/logs`);
        if (res.ok) {
          const data = await res.json();
          setLogs(data.logs ?? '');
        } else {
          setLogs('Failed to fetch logs.');
        }
      } catch {
        setLogs('Failed to fetch logs.');
      }
    }
    void fetchLogs();
  }, [sourceId]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-lg border border-neutral-300 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-300 px-4 py-3 dark:border-neutral-700">
          <h2 className="text-sm font-medium text-neutral-900 dark:text-white">
            Build log: {branch}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-white"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        <div className="max-h-[60vh] overflow-auto p-4">
          {logs === null ? (
            <p className="text-sm text-neutral-500">Loading...</p>
          ) : (
            <pre className="whitespace-pre-wrap font-mono text-xs text-neutral-700 dark:text-neutral-300">
              {logs || 'No logs available.'}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
