'use client';

import { useState, useEffect, useCallback } from 'react';

type Theme = 'light' | 'dark' | 'system';

function getThemeFromStorage(): Theme {
  if (typeof window === 'undefined') return 'system';
  try {
    return (localStorage.getItem('vbc-theme') as Theme) || 'system';
  } catch {
    return 'system';
  }
}

function getResolvedTheme(t: Theme): 'light' | 'dark' {
  if (t === 'system') {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return t as 'light' | 'dark';
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => getThemeFromStorage());
  const [resolvedTheme, setResolvedTheme] = useState<'light' | 'dark'>(() =>
    getResolvedTheme(getThemeFromStorage()),
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const current = getThemeFromStorage();
      if (current === 'system') {
        setResolvedTheme(mq.matches ? 'dark' : 'light');
      }
    };

    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem('vbc-theme', t);

    const resolved = getResolvedTheme(t);
    setResolvedTheme(resolved);
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
  }, [resolvedTheme]);

  return { theme, resolvedTheme, setTheme };
}
