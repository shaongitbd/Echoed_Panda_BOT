// Periodic eviction for TTL-keyed Maps.
//
// Several hot-path caches check expiry only on read. That's correct for
// anything read regularly, but these are keyed on (server, member) and
// written on every message — so an entry for someone who spoke once and
// never returned is never read again, and therefore never expires. Across
// a large fleet and a long-lived process those Maps only grow.
//
// Registering a Map here gives it a sweep on a shared unref'd timer, plus
// a hard entry ceiling so a burst can't outrun the sweep interval.

interface Expiring {
  expiresAt: number;
}

interface Registration {
  map: Map<string, Expiring>;
  maxEntries: number;
  name: string;
}

const registry: Registration[] = [];
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;

let timer: NodeJS.Timeout | null = null;

function sweep(): void {
  const now = Date.now();
  for (const reg of registry) {
    for (const [key, value] of reg.map) {
      if (value.expiresAt <= now) reg.map.delete(key);
    }
    // Still over the ceiling after dropping expired entries: evict
    // oldest-first. Insertion order is a good enough proxy here — every
    // one of these is refreshed by re-inserting.
    if (reg.map.size > reg.maxEntries) {
      const excess = reg.map.size - reg.maxEntries;
      let i = 0;
      for (const key of reg.map.keys()) {
        reg.map.delete(key);
        if (++i >= excess) break;
      }
    }
  }
}

// Register a TTL-keyed Map for periodic eviction. Safe to call at module
// scope; the timer is unref'd so it never holds the process open.
export function registerTtlCache(
  name: string,
  map: Map<string, never> | Map<string, Expiring> | Map<string, unknown>,
  maxEntries: number,
): void {
  registry.push({ map: map as Map<string, Expiring>, maxEntries, name });
  if (!timer) {
    timer = setInterval(sweep, SWEEP_INTERVAL_MS);
    timer.unref();
  }
}

// Exposed for the diagnostic log line.
export function ttlCacheSizes(): Record<string, number> {
  const out: Record<string, number> = {};
  for (const reg of registry) out[reg.name] = reg.map.size;
  return out;
}
