export function timeAgo(date: string | number): string {
  if (!date) return '';
  const timestamp = typeof date === 'string' ? new Date(date).getTime() : date;
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatElapsed(startMs: number): string {
  const elapsed = Math.floor((Date.now() - startMs) / 1000);
  if (elapsed < 60) return `${elapsed}s`;
  return `${Math.floor(elapsed / 60)}m ${elapsed % 60}s`;
}
