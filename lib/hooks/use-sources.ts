'use client';

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { Source } from '@/lib/worktree-manager';

interface UseSources {
  sources: Source[];
  isPolling: boolean;
  addSource: (branch: string, commit?: string, mode?: 'build' | 'dev') => Promise<void>;
  stopSource: (id: string) => Promise<void>;
  removeSource: (id: string) => Promise<void>;
  refreshSource: (id: string) => Promise<void>;
}

// External store — avoids setState-in-effect lint issues with useSyncExternalStore
let sourcesCache: Source[] = [];
let listeners: Array<() => void> = [];

function emitChange(): void {
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void): () => void {
  listeners = [...listeners, listener];
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function getSnapshot(): Source[] {
  return sourcesCache;
}

async function fetchAndUpdate(): Promise<void> {
  try {
    const res = await fetch('/api/sources');
    if (res.ok) {
      const data: Source[] = await res.json();
      sourcesCache = data;
      emitChange();
    }
  } catch (error: unknown) {
    console.error('Failed to fetch sources:', error);
  }
}

// Module-level initial fetch — runs once when module is imported (client-side only)
if (typeof window !== 'undefined') {
  void fetchAndUpdate();
}

export function useSources(): UseSources {
  const sources = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isPolling = useMemo(() => {
    return sources.some((s) => s.status === 'building');
  }, [sources]);

  // Poll every 2s while building, every 10s while running (detect crashes)
  useEffect(() => {
    const hasBuilding = sources.some((s) => s.status === 'building');
    const hasAny = sources.length > 0;
    const interval = hasBuilding ? 2000 : hasAny ? 10000 : 0;

    if (interval > 0) {
      intervalRef.current = setInterval(() => {
        void fetchAndUpdate();
      }, interval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sources]);

  const addSource = useCallback(async (branch: string, commit?: string, mode?: 'build' | 'dev') => {
    console.log('[API] useSources.ADD_START: branch=%s, commit=%s, mode=%s', branch, commit, mode);
    try {
      const body = JSON.stringify({ branch, commit, mode });
      console.log('[API] useSources.ADD_BODY: %s', body);
      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      console.log('[API] useSources.ADD_RESPONSE: status=%d, ok=%s', res.status, res.ok);
      if (!res.ok) {
        const err = await res.json();
        console.error('[ERROR] useSources.ADD_FAILED:', err);
      }
      await fetchAndUpdate();
      console.log('[API] useSources.ADD_DONE: sources updated');
    } catch (error: unknown) {
      console.error('[ERROR] useSources.ADD_EXCEPTION:', error);
    }
  }, []);

  const stopSource = useCallback(async (id: string) => {
    try {
      await fetch(`/api/sources/${id}/stop`, { method: 'POST' });
      await fetchAndUpdate();
    } catch (error: unknown) {
      console.error('Failed to stop source:', error);
    }
  }, []);

  const removeSource = useCallback(async (id: string) => {
    try {
      await fetch(`/api/sources/${id}`, { method: 'DELETE' });
      await fetchAndUpdate();
    } catch (error: unknown) {
      console.error('Failed to remove source:', error);
    }
  }, []);

  const refreshSource = useCallback(async (id: string) => {
    try {
      await fetch(`/api/sources/${id}/refresh`, { method: 'POST' });
      await fetchAndUpdate();
    } catch (error: unknown) {
      console.error('Failed to refresh source:', error);
    }
  }, []);

  return { sources, isPolling, addSource, stopSource, removeSource, refreshSource };
}
