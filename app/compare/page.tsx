'use client';

import { useState } from 'react';
import { useSources } from '@/lib/hooks/use-sources';
import ThemeToggle from '@/components/ThemeToggle';
import SourceSelector from '@/components/SourceSelector';
import IframePanel from '@/components/IframePanel';
import StatusBar from '@/components/StatusBar';
import BuildLog from '@/components/BuildLog';

export default function ComparePage() {
  const { sources, addSource, removeSource, refreshSource } = useSources();
  const [showLogFor, setShowLogFor] = useState<string | null>(null);

  const sourceA = sources[0] ?? null;
  const sourceB = sources[1] ?? null;
  const logSource = showLogFor ? sources.find((s) => s.id === showLogFor) : null;

  return (
    <main className="flex h-screen flex-col bg-white text-neutral-900 dark:bg-neutral-950 dark:text-white">
      <header className="flex items-center justify-between border-b border-neutral-300 px-6 py-3 dark:border-neutral-800">
        <h1 className="text-lg font-semibold">Visual Branch Comparator</h1>
        <ThemeToggle />
      </header>

      <div className="grid grid-cols-2 gap-4 px-6 py-4">
        <SourceSelector
          label="Source A"
          source={sourceA}
          onSelect={(branch, commit) => void addSource(branch, commit)}
          onRemove={() => {
            if (sourceA) void removeSource(sourceA.id);
          }}
        />
        <SourceSelector
          label="Source B"
          source={sourceB}
          onSelect={(branch, commit) => void addSource(branch, commit)}
          onRemove={() => {
            if (sourceB) void removeSource(sourceB.id);
          }}
        />
      </div>

      <div className="grid flex-1 grid-cols-2 gap-4 px-6 pb-14">
        <IframePanel
          source={sourceA}
          onRefresh={sourceA ? () => void refreshSource(sourceA.id) : undefined}
        />
        <IframePanel
          source={sourceB}
          onRefresh={sourceB ? () => void refreshSource(sourceB.id) : undefined}
        />
      </div>

      <StatusBar
        sources={sources}
        onRefresh={(id) => void refreshSource(id)}
        onShowLog={(id) => setShowLogFor(id)}
      />

      {logSource && (
        <BuildLog
          sourceId={logSource.id}
          branch={logSource.branch}
          onClose={() => setShowLogFor(null)}
        />
      )}
    </main>
  );
}
