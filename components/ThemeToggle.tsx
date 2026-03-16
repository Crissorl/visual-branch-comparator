'use client';

import { useTheme } from '@/lib/hooks/use-theme';

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const themes: Array<'light' | 'dark' | 'system'> = ['dark', 'light', 'system'];
  const currentIndex = themes.indexOf(theme);
  const nextTheme = themes[(currentIndex + 1) % themes.length];

  const icons = {
    dark: '🌙',
    light: '☀️',
    system: '◯',
  };

  const labels = {
    dark: 'Dark mode',
    light: 'Light mode',
    system: 'System preference',
  };

  return (
    <button
      onClick={() => setTheme(nextTheme)}
      className="rounded p-2 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
      aria-label={`Switch theme (current: ${labels[theme]})`}
      title={labels[theme]}
    >
      <span className="text-lg">{icons[theme]}</span>
    </button>
  );
}
