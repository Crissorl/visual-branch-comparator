'use client';

import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import type { Source } from '@/lib/worktree-manager';

interface UseSources {
  sources: Source[];
  isPolling: boolean;
  addSource: (branch: string, commit?: string) => Promise<void>;
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

// Module-level initial fetch — runs once when module is imported
void fetchAndUpdate();

export function useSources(): UseSources {
  const sources = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isPolling = useMemo(() => {
    return sources.some((s) => s.status === 'building');
  }, [sources]);

  // Poll every 2s while any source is building
  useEffect(() => {
    const hasBuilding = sources.some((s) => s.status === 'building');

    if (hasBuilding) {
      intervalRef.current = setInterval(() => {
        void fetchAndUpdate();
      }, 2000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sources]);

  const addSource = useCallback(async (branch: string, commit?: string) => {
    try {
      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch, commit }),
      });
      if (!res.ok) {
        const err = await res.json();
        console.error('Failed to add source:', err);
      }
      await fetchAndUpdate();
    } catch (error: unknown) {
      console.error('Failed to add source:', error);
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

  return { sources, isPolling, addSource, removeSource, refreshSource };
}
