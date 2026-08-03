import { EchoedApiError, type EchoedClient } from '../client/echoedClient.js';
import { claimBatch, recordValue, type StatCounter } from './store.js';
import { log } from '../log.js';

// Per-channel failure backoff. A stat-counter rename that keeps failing —
// almost always because the bot lost (or never had) Manage Channels on that
// channel — must NOT retry every tick: that spams the logs and burns the shared
// bot rate limit indefinitely (the failed rename never advances lastValue, so
// the no-op skip below can't catch it). After a denial we skip the counter for
// a while and log only the first failure at warn; it auto-resumes once the
// backoff expires (so fixing the permission recovers on its own).
const PERM_BACKOFF_MS = 10 * 60_000; // 10 min after a 403 (config issue)
const ERR_BACKOFF_MS = 5 * 60_000; // 5 min after a transient error
const retryAfter = new Map<string, number>(); // channelId → earliest next attempt (epoch ms)

// Counters handled per pass. The sweep rotates least-recently-checked
// first, so a fleet larger than this is covered across successive passes
// rather than one pass running longer than its own interval.
const BATCH_SIZE = 40;

// Cache server-info responses across counters — multiple counters on the
// same server should only cost one info lookup per tick.
//
// This must stay comfortably ABOVE the sweep's own interval. When the two
// were equal, every entry had expired by the time the next sweep looked at
// it, so the cache never produced a hit across passes and the only saving
// was between two counters in the same server. A member count that lags a
// few minutes is fine; a request per counter per pass is not.
const SERVER_INFO_CACHE_TTL_MS = 10 * 60_000;
const serverInfoCache = new Map<
  string,
  { memberCount: number | null; channelCount: number | null; cachedAt: number }
>();

async function getServerStats(
  api: EchoedClient,
  serverId: string,
): Promise<{ memberCount: number | null; channelCount: number | null }> {
  const cached = serverInfoCache.get(serverId);
  if (cached && Date.now() - cached.cachedAt < SERVER_INFO_CACHE_TTL_MS) {
    return cached;
  }
  const info = await api.getServerInfo(serverId);
  const value = {
    memberCount: info.memberCount ?? null,
    channelCount: info.channelCount ?? null,
    cachedAt: Date.now(),
  };
  serverInfoCache.set(serverId, value);
  return value;
}

function valueFor(counter: StatCounter, stats: { memberCount: number | null; channelCount: number | null }): number | null {
  switch (counter.kind) {
    case 'members':
      return stats.memberCount;
    case 'channels':
      return stats.channelCount;
  }
}

function render(format: string, value: number): string {
  return format.replace(/\{count\}/g, String(value));
}

// statTick runs on a longer cadence than the time-sensitive branches —
// channel renames are rate-limited, and server populations don't shift
// fast enough to need finer updates.
export async function statTick(api: EchoedClient): Promise<void> {
  const counters = await claimBatch(BATCH_SIZE);
  if (counters.length === 0) return;

  for (const counter of counters) {
    // Cheap local checks first. The backoff check used to sit *after* the
    // server-info fetch, so a counter we'd already decided to skip — one
    // whose channel we can't rename, say — still cost a request on every
    // pass, forever.
    const next = retryAfter.get(counter.channelId);
    if (next != null && Date.now() < next) continue;

    let stats;
    try {
      stats = await getServerStats(api, counter.serverId);
    } catch (err) {
      log.warn({ err, serverId: counter.serverId }, 'Stat counter: server-info fetch failed');
      continue;
    }
    const value = valueFor(counter, stats);
    if (value == null) continue;
    if (counter.lastValue === value) continue; // no-op rename, save the API call

    const newName = render(counter.format, value);
    try {
      await api.editChannel(counter.serverId, counter.channelId, { name: newName });
      await recordValue(counter.channelId, value);
      retryAfter.delete(counter.channelId); // success — clear any backoff
    } catch (err) {
      const denied = err instanceof EchoedApiError && err.status === 403;
      const firstFailure = !retryAfter.has(counter.channelId);
      retryAfter.set(counter.channelId, Date.now() + (denied ? PERM_BACKOFF_MS : ERR_BACKOFF_MS));
      // Log the first failure loudly so it's discoverable; stay quiet after
      // that so a persistent permission gap doesn't flood the logs.
      if (firstFailure) {
        log.warn(
          { err, channelId: counter.channelId, serverId: counter.serverId },
          denied
            ? 'Stat counter rename denied (bot lacks Manage Channels here) — backing off; grant it and I\'ll resume'
            : 'Stat counter rename failed — backing off',
        );
      } else {
        log.debug({ channelId: counter.channelId }, 'Stat counter still failing — still backed off');
      }
    }
  }
}
