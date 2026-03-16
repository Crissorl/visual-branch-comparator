'use client';

import { useState, useReducer, useEffect } from 'react';

interface ChangePanelProps {
  sourceAId: string;
  sourceBId: string;
  visible: boolean;
  onClose: () => void;
}

type Tab = 'diff' | 'ai';

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; gitDiff: string; description: string }
  | { status: 'error'; error: string };

type Action =
  | { type: 'fetch' }
  | { type: 'success'; gitDiff: string; description: string }
  | { type: 'error'; error: string }
  | { type: 'reset' };

function reducer(_state: State, action: Action): State {
  switch (action.type) {
    case 'fetch':
      return { status: 'loading' };
    case 'success':
      return { status: 'success', gitDiff: action.gitDiff, description: action.description };
    case 'error':
      return { status: 'error', error: action.error };
    case 'reset':
      return { status: 'idle' };
  }
}

export default function ChangePanel({ sourceAId, sourceBId, visible, onClose }: ChangePanelProps) {
  const [state, dispatch] = useReducer(reducer, { status: 'idle' });
  const [activeTab, setActiveTab] = useState<Tab>('diff');

  useEffect(() => {
    if (!visible) {
      dispatch({ type: 'reset' });
      return;
    }

    const controller = new AbortController();
    dispatch({ type: 'fetch' });

    void (async () => {
      try {
        const res = await fetch('/api/describe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceAId, sourceBId }),
          signal: controller.signal,
        });
        const data: unknown = await res.json();
        if (
          typeof data === 'object' &&
          data !== null &&
          'error' in data &&
          typeof (data as { error: unknown }).error === 'string'
        ) {
          dispatch({ type: 'error', error: (data as { error: string }).error });
        } else if (
          typeof data === 'object' &&
          data !== null &&
          'gitDiff' in data &&
          'description' in data
        ) {
          const { gitDiff, description } = data as { gitDiff: string; description: string };
          dispatch({ type: 'success', gitDiff, description });
        } else {
          dispatch({ type: 'error', error: 'Unexpected response from server.' });
        }
      } catch (err) {
        if (err instanceof Error && err.name !== 'AbortError') {
          dispatch({ type: 'error', error: err.message });
        }
      }
    })();

    return () => controller.abort();
  }, [visible, sourceAId, sourceBId]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="relative flex h-[80vh] w-[80vw] max-w-4xl flex-col rounded-lg bg-white shadow-2xl dark:bg-neutral-900">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-3 dark:border-neutral-700">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('diff')}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === 'diff'
                  ? 'bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-white'
                  : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
              }`}
            >
              Git Diff
            </button>
            <button
              onClick={() => setActiveTab('ai')}
              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === 'ai'
                  ? 'bg-neutral-200 text-neutral-900 dark:bg-neutral-700 dark:text-white'
                  : 'text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200'
              }`}
            >
              AI Description
            </button>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            &#x2715;
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6">
          {state.status === 'loading' && (
            <div className="flex h-full items-center justify-center text-neutral-500 dark:text-neutral-400">
              Loading changes...
            </div>
          )}

          {state.status === 'error' && (
            <div className="rounded border border-red-300 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
              {state.error}
            </div>
          )}

          {state.status === 'success' && activeTab === 'diff' && (
            <pre className="overflow-auto rounded bg-neutral-50 p-4 font-mono text-sm dark:bg-neutral-950">
              {state.gitDiff.split('\n').map((line, i) => (
                <div
                  key={i}
                  className={
                    line.startsWith('+') && !line.startsWith('+++')
                      ? 'text-green-600 dark:text-green-400'
                      : line.startsWith('-') && !line.startsWith('---')
                        ? 'text-red-600 dark:text-red-400'
                        : line.startsWith('@@')
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-neutral-600 dark:text-neutral-400'
                  }
                >
                  {line}
                </div>
              ))}
            </pre>
          )}

          {state.status === 'success' && activeTab === 'ai' && (
            <div className="prose prose-neutral dark:prose-invert max-w-none whitespace-pre-wrap">
              {state.description}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
