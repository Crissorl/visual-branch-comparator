'use client';

interface NavSyncToggleProps {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
}

export default function NavSyncToggle({ enabled, onToggle }: NavSyncToggleProps) {
  return (
    <button
      onClick={() => onToggle(!enabled)}
      className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
        enabled
          ? 'bg-blue-600 text-white hover:bg-blue-700'
          : 'bg-neutral-200 text-neutral-600 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-600'
      }`}
      title={enabled ? 'Navigation sync ON' : 'Navigation sync OFF'}
    >
      {enabled ? 'Sync ON' : 'Sync OFF'}
    </button>
  );
}
