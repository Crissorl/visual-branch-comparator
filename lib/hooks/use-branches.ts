'use client';

import { useState, useEffect, useCallback } from 'react';

export interface BranchInfo {
  name: string;
  lastCommitMessage: string;
  lastCommitDate: string;
}

export interface CommitInfo {
  hash: string;
  date: string;
  message: string;
  author_name: string;
}

interface UseBranches {
  branches: BranchInfo[];
  isLoading: boolean;
  fetchCommits: (branch: string) => Promise<CommitInfo[]>;
}

export function useBranches(): UseBranches {
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function load(): Promise<void> {
      try {
        const res = await fetch('/api/branches');
        if (res.ok) {
          const data = (await res.json()) as { current: string; branches: BranchInfo[] };
          setBranches(data.branches);
        }
      } catch (error: unknown) {
        console.error('Failed to fetch branches:', error);
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, []);

  const fetchCommits = useCallback(async (branch: string): Promise<CommitInfo[]> => {
    try {
      const res = await fetch(`/api/branches/${encodeURIComponent(branch)}/commits`);
      if (res.ok) {
        const data = (await res.json()) as { commits: CommitInfo[] };
        return data.commits;
      }
    } catch (error: unknown) {
      console.error('Failed to fetch commits:', error);
    }
    return [];
  }, []);

  return { branches, isLoading, fetchCommits };
}
