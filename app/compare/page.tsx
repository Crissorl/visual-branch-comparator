'use client';

import { useState, useRef, useCallback, useMemo, type RefObject } from 'react';
import { useSources } from '@/lib/hooks/use-sources';
import { useNavSync } from '@/lib/hooks/use-nav-sync';
import ThemeToggle from '@/components/ThemeToggle';
import NavSyncToggle from '@/components/NavSyncToggle';
import SourceSelector from '@/components/SourceSelector';
import IframePanel from '@/components/IframePanel';
import StatusBar from '@/components/StatusBar';
import BuildLog from '@/components/BuildLog';
import DiffOverlay from '@/components/DiffOverlay';
import ChangePanel from '@/components/ChangePanel';

export default function ComparePage() {
  const { sources, addSource, stopSource, removeSource, refreshSource } = useSources();
  const [showLogFor, setShowLogFor] = useState<string | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [showChanges, setShowChanges] = useState(false);

  const sourceA = sources[0] ?? null;
  const sourceB = sources[1] ?? null;
  const logSource = showLogFor ? sources.find((s) => s.id === showLogFor) : null;

  // Iframe refs for nav sync
  const iframeARef = useRef<HTMLIFrameElement | null>(null);
  const iframeBRef = useRef<HTMLIFrameElement | null>(null);

  // Build a stable ref map keyed by source id.
  // Pass RefObject values (not .current) so useNavSync reads them inside effects,
  // never during render (satisfies react-hooks/refs rule).
  const iframeRefs = useMemo<Record<string, RefObject<HTMLIFrameElement | null>>>(
    () => ({
      ...(sourceA ? { [sourceA.id]: iframeARef } : {}),
      ...(sourceB ? { [sourceB.id]: iframeBRef } : {}),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sourceA?.id, sourceB?.id],
  );

  const { enabled: syncEnabled, setEnabled: setSyncEnabled, paths } = useNavSync(iframeRefs);

  // Stable callback refs so IframePanel can populate the mutable refs
  const setIframeA = useCallback((el: HTMLIFrameElement | null) => {
    iframeARef.current = el;
  }, []);
  const setIframeB = useCallback((el: HTMLIFrameElement | null) => {
    iframeBRef.current = el;
  }, []);

  return (
    <main className="flex h-screen flex-col bg-white text-neutral-900 dark:bg-neutral-950 dark:text-white">
      <header className="flex items-center justify-between border-b border-neutral-300 px-6 py-3 dark:border-neutral-800">
        <h1 className="text-lg font-semibold">Visual Branch Comparator</h1>
        <div className="flex items-center gap-3">
          <NavSyncToggle enabled={syncEnabled} onToggle={setSyncEnabled} />
          {sourceA?.status === 'running' && sourceB?.status === 'running' && (
            <>
              <button
                onClick={() => setShowDiff(true)}
                className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
              >
                Show Diff
              </button>
              <button
                onClick={() => setShowChanges(true)}
                className="rounded bg-neutral-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-neutral-700 dark:bg-neutral-700 dark:hover:bg-neutral-600"
              >
                Changes
              </button>
            </>
          )}
          <ThemeToggle />
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4 px-6 py-4">
        <SourceSelector
          label="Source A"
          source={sourceA}
          onSelect={(branch, commit, mode) => void addSource(branch, commit, mode)}
          onRemove={() => {
            if (sourceA) void removeSource(sourceA.id);
          }}
        />
        <SourceSelector
          label="Source B"
          source={sourceB}
          onSelect={(branch, commit, mode) => void addSource(branch, commit, mode)}
          onRemove={() => {
            if (sourceB) void removeSource(sourceB.id);
          }}
        />
      </div>

      <div className="grid flex-1 grid-cols-2 gap-4 px-6 pb-14">
        <IframePanel
          source={sourceA}
          onRefresh={sourceA ? () => void refreshSource(sourceA.id) : undefined}
          currentPath={sourceA ? paths[sourceA.id] : undefined}
          iframeRef={setIframeA}
        />
        <IframePanel
          source={sourceB}
          onRefresh={sourceB ? () => void refreshSource(sourceB.id) : undefined}
          currentPath={sourceB ? paths[sourceB.id] : undefined}
          iframeRef={setIframeB}
        />
      </div>

      <StatusBar
        sources={sources}
        onRefresh={(id) => void refreshSource(id)}
        onStop={(id) => void stopSource(id)}
        onRemove={(id) => void removeSource(id)}
        onShowLog={(id) => setShowLogFor(id)}
      />

      {logSource && (
        <BuildLog
          sourceId={logSource.id}
          branch={logSource.branch}
          onClose={() => setShowLogFor(null)}
        />
      )}

      {sourceA && sourceB && (
        <DiffOverlay
          sourceAId={sourceA.id}
          sourceBId={sourceB.id}
          visible={showDiff}
          onClose={() => setShowDiff(false)}
        />
      )}

      {sourceA && sourceB && (
        <ChangePanel
          sourceAId={sourceA.id}
          sourceBId={sourceB.id}
          visible={showChanges}
          onClose={() => setShowChanges(false)}
        />
      )}
    </main>
  );
}
