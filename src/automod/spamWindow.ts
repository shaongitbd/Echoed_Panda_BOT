// Sliding-window message-rate tracker. Per-(server, user) ring of
// timestamps; we prune entries outside the window on every check, and
// flag spam when the live count >= threshold.
//
// In-memory only — survives restarts is a non-goal (cooldowns can lapse;
// abuse will re-trigger within seconds anyway). Periodic sweep keeps
// the Map bounded.

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const SWEEP_OLDER_THAN_MS = 60 * 60 * 1000;

type Entry = number[];
const buckets = new Map<string, Entry>();

let sweepTimer: NodeJS.Timeout | null = null;
function startSweeper(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const cutoff = Date.now() - SWEEP_OLDER_THAN_MS;
    for (const [key, ts] of buckets) {
      const last = ts[ts.length - 1] ?? 0;
      if (last < cutoff) buckets.delete(key);
    }
  }, SWEEP_INTERVAL_MS);
  sweepTimer.unref();
}

function key(serverId: string, userId: string): string {
  return `${serverId}:${userId}`;
}

// Records a message and returns the live count within `windowSeconds`.
// Caller compares to `threshold` to decide whether it's spam.
export function recordAndCount(
  serverId: string,
  userId: string,
  windowSeconds: number,
): number {
  startSweeper();
  const k = key(serverId, userId);
  const now = Date.now();
  const cutoff = now - windowSeconds * 1000;

  const arr = buckets.get(k) ?? [];
  // Prune expired entries from the front. We could binary-search but
  // these arrays are tiny (5-20 entries typical) so a linear walk is
  // fine and avoids the off-by-one.
  let idx = 0;
  while (idx < arr.length && arr[idx]! < cutoff) idx++;
  const trimmed = idx > 0 ? arr.slice(idx) : arr;
  trimmed.push(now);
  buckets.set(k, trimmed);
  return trimmed.length;
}

// Reset window for a user — used after they're warned/timed out so the
// next message doesn't immediately re-trip the filter.
export function resetWindow(serverId: string, userId: string): void {
  buckets.delete(key(serverId, userId));
}
