// The result of the last save, from the page's `?saved=` / `?error=` query
// (server actions redirect back with one). One shape for every page.

type Query = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function Notice({
  query,
  errors,
  saved = 'Saved. Changes reach the bot within a minute.',
}: {
  query: Query;
  errors: Record<string, string>;
  saved?: string;
}): JSX.Element | null {
  const error = errors[first(query.error) ?? ''];
  if (error) {
    return (
      <p role="alert" className="mb-6 rounded-xl bg-status-danger/10 px-4 py-3 text-sm text-text-primary">
        {error}
      </p>
    );
  }
  if (first(query.saved)) {
    return (
      <p role="status" className="mb-6 rounded-xl bg-bg-card px-4 py-3 text-sm text-text-secondary">
        {saved}
      </p>
    );
  }
  return null;
}

/** "Thu 16 Oct, 12:00 UTC" — schedules here are all UTC. */
export function formatUtc(d: Date | null): string | null {
  if (!d) return null;
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}, ${d
    .toISOString()
    .slice(11, 16)} UTC`;
}
