export function formatRelativeTime(dateString: string | undefined | null): string {
  if (!dateString) return 'never';
  const date = new Date(dateString);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 60) return `${Math.max(1, diffSec)}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function formatExactTime(dateString: string | undefined | null): string {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    return d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
  } catch {
    return dateString;
  }
}

export function shortenSha(sha: string | undefined | null): string {
  if (!sha) return '';
  return sha.slice(0, 7);
}
