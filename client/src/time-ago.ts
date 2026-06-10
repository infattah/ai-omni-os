// Shared relative-time display helper. Lives in its own module so the extracted view components
// (and the dashboard shell) can format timestamps without importing from App.
export function timeAgo(timestamp: string): string {
  const elapsed = Date.now() - new Date(timestamp).getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) return 'just now';
  const minutes = Math.floor(elapsed / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
