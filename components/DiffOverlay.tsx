'use client';

import { useReducer, useEffect } from 'react';

interface DiffOverlayProps {
  sourceAId: string;
  sourceBId: string;
  visible: boolean;
  onClose: () => void;
}

interface DiffData {
  diffImageBase64: string;
  diffPercentage: number;
  changedPixels: number;
  totalPixels: number;
  width: number;
  height: number;
}

type DiffState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: DiffData }
  | { status: 'error'; message: string };

type DiffAction =
  | { type: 'FETCH_START' }
  | { type: 'FETCH_SUCCESS'; data: DiffData }
  | { type: 'FETCH_ERROR'; message: string }
  | { type: 'RESET' };

function reducer(_state: DiffState, action: DiffAction): DiffState {
  switch (action.type) {
    case 'FETCH_START':
      return { status: 'loading' };
    case 'FETCH_SUCCESS':
      return { status: 'success', data: action.data };
    case 'FETCH_ERROR':
      return { status: 'error', message: action.message };
    case 'RESET':
      return { status: 'idle' };
  }
}

export default function DiffOverlay({ sourceAId, sourceBId, visible, onClose }: DiffOverlayProps) {
  const [state, dispatch] = useReducer(reducer, { status: 'idle' });

  useEffect(() => {
    if (!visible) {
      dispatch({ type: 'RESET' });
      return;
    }

    let cancelled = false;

    // Use a microtask so the dispatch is treated as async (avoids synchronous setState-in-effect lint error)
    const controller = new AbortController();

    Promise.resolve()
      .then(() => {
        if (cancelled) return;
        dispatch({ type: 'FETCH_START' });
        return fetch('/api/diff', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sourceAId, sourceBId }),
          signal: controller.signal,
        });
      })
      .then((res) => res?.json())
      .then((data: unknown) => {
        if (cancelled) return;
        if (typeof data === 'object' && data !== null && 'error' in data) {
          dispatch({
            type: 'FETCH_ERROR',
            message: String((data as { error: unknown }).error),
          });
        } else {
          dispatch({ type: 'FETCH_SUCCESS', data: data as DiffData });
        }
      })
      .catch((err: unknown) => {
        if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) return;
        dispatch({
          type: 'FETCH_ERROR',
          message: err instanceof Error ? err.message : 'Unknown error',
        });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [visible, sourceAId, sourceBId]);

  if (!visible) return null;

  const loading = state.status === 'loading' || state.status === 'idle';
  const error = state.status === 'error' ? state.message : null;
  const diff = state.status === 'success' ? state.data : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="relative max-h-[90vh] max-w-[90vw] overflow-auto rounded-lg bg-white p-6 shadow-2xl dark:bg-neutral-900">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">Visual Diff</h2>
            {diff && (
              <p className="text-sm text-neutral-500 dark:text-neutral-400">
                {diff.diffPercentage.toFixed(2)}% changed ({diff.changedPixels.toLocaleString()}{' '}
                pixels)
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        {loading && (
          <div className="flex h-64 items-center justify-center">
            <div className="text-neutral-500 dark:text-neutral-400">
              Capturing screenshots and computing diff...
            </div>
          </div>
        )}

        {error && (
          <div className="rounded border border-red-300 bg-red-50 p-4 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {error}
          </div>
        )}

        {diff && (
          <div className="flex flex-col items-center gap-4">
            {/* Diff percentage badge */}
            <div
              className={`rounded-full px-4 py-1 text-sm font-medium ${
                diff.diffPercentage === 0
                  ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                  : diff.diffPercentage < 5
                    ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
                    : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
              }`}
            >
              {diff.diffPercentage === 0
                ? 'Identical'
                : `${diff.diffPercentage.toFixed(2)}% different`}
            </div>

            {/* Diff image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={diff.diffImageBase64}
              alt="Visual diff"
              className="max-h-[70vh] border border-neutral-200 dark:border-neutral-700"
              style={{ imageRendering: 'pixelated' }}
            />

            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {diff.width}×{diff.height} • Red pixels indicate differences
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
