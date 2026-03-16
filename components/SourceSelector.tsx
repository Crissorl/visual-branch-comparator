'use client';

import { useState, useRef, useEffect } from 'react';
import type { Source } from '@/lib/worktree-manager';
import { useBranches, type BranchInfo, type CommitInfo } from '@/lib/hooks/use-branches';
import { timeAgo } from '@/lib/utils/format';
import StatusBadge from '@/components/StatusBadge';

interface SourceSelectorProps {
  label: string;
  source: Source | null;
  onSelect: (branch: string, commit?: string) => void;
  onRemove: () => void;
}

type View = 'closed' | 'branches' | 'commits';

export default function SourceSelector({ label, source, onSelect, onRemove }: SourceSelectorProps) {
  const { branches, isLoading } = useBranches();
  const [view, setView] = useState<View>('closed');
  const [search, setSearch] = useState('');
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [loadingCommits, setLoadingCommits] = useState(false);
  const { fetchCommits } = useBranches();
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setView('closed');
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredBranches = branches.filter((b) =>
    b.name.toLowerCase().includes(search.toLowerCase()),
  );

  async function handleBranchClick(branch: BranchInfo): Promise<void> {
    setSelectedBranch(branch.name);
    setLoadingCommits(true);
    setView('commits');
    setSearch('');
    const result = await fetchCommits(branch.name);
    setCommits(result);
    setLoadingCommits(false);
  }

  function handleLatestClick(): void {
    if (selectedBranch) {
      onSelect(selectedBranch);
      setView('closed');
      setSearch('');
      setSelectedBranch(null);
    }
  }

  function handleCommitClick(commit: CommitInfo): void {
    if (selectedBranch) {
      onSelect(selectedBranch, commit.hash);
      setView('closed');
      setSearch('');
      setSelectedBranch(null);
    }
  }

  if (source) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-neutral-700 bg-neutral-800 px-4 py-3">
        <div className="flex-1">
          <span className="text-xs text-neutral-400">{label}</span>
          <div className="flex items-center gap-2">
            <span className="font-medium text-white">{source.branch}</span>
            {source.commit && (
              <span className="font-mono text-xs text-neutral-400">
                {source.commit.slice(0, 7)}
              </span>
            )}
            <StatusBadge status={source.status} />
          </div>
        </div>
        <button
          onClick={onRemove}
          className="rounded p-1 text-neutral-400 hover:bg-neutral-700 hover:text-white"
          aria-label={`Remove ${label}`}
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => setView(view === 'closed' ? 'branches' : 'closed')}
        className="w-full rounded-lg border border-dashed border-neutral-600 bg-neutral-800/50 px-4 py-3 text-left transition-colors hover:border-neutral-500 hover:bg-neutral-800"
      >
        <span className="text-xs text-neutral-400">{label}</span>
        <div className="text-neutral-500">
          {isLoading ? 'Loading branches...' : 'Select a branch...'}
        </div>
      </button>

      {view === 'branches' && (
        <div className="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800 shadow-xl">
          <div className="border-b border-neutral-700 p-2">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search branches..."
              className="w-full rounded bg-neutral-900 px-3 py-1.5 text-sm text-white placeholder-neutral-500 outline-none focus:ring-1 focus:ring-blue-500"
              autoFocus
            />
          </div>
          <ul className="max-h-64 overflow-y-auto">
            {filteredBranches.length === 0 && (
              <li className="px-4 py-3 text-sm text-neutral-500">No branches found</li>
            )}
            {filteredBranches.map((b) => (
              <li key={b.name}>
                <button
                  onClick={() => void handleBranchClick(b)}
                  className="w-full px-4 py-2 text-left text-sm transition-colors hover:bg-neutral-700"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white">{b.name}</span>
                    <span className="text-xs text-neutral-500">{timeAgo(b.lastCommitDate)}</span>
                  </div>
                  {b.lastCommitMessage && (
                    <div className="mt-0.5 truncate text-xs text-neutral-400">
                      {b.lastCommitMessage}
                    </div>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {view === 'commits' && selectedBranch && (
        <div className="absolute top-full z-10 mt-1 w-full overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800 shadow-xl">
          <div className="flex items-center gap-2 border-b border-neutral-700 px-4 py-2">
            <button
              onClick={() => {
                setView('branches');
                setSelectedBranch(null);
              }}
              className="text-sm text-neutral-400 hover:text-white"
            >
              ← Back
            </button>
            <span className="text-sm font-medium text-white">{selectedBranch}</span>
          </div>
          <ul className="max-h-72 overflow-y-auto">
            <li>
              <button
                onClick={handleLatestClick}
                className="w-full px-4 py-2 text-left text-sm transition-colors hover:bg-neutral-700"
              >
                <span className="font-medium text-blue-400">Latest (HEAD)</span>
              </button>
            </li>
            {loadingCommits && (
              <li className="px-4 py-3 text-sm text-neutral-500">Loading commits...</li>
            )}
            {!loadingCommits &&
              commits.map((c) => (
                <li key={c.hash}>
                  <button
                    onClick={() => handleCommitClick(c)}
                    className="w-full px-4 py-2 text-left text-sm transition-colors hover:bg-neutral-700"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs text-neutral-400">
                        {c.hash.slice(0, 7)}
                      </span>
                      <span className="text-xs text-neutral-500">{timeAgo(c.date)}</span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-neutral-300">
                      {c.message.slice(0, 60)}
                    </div>
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
