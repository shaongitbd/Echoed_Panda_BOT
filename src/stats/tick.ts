import type { EchoedClient } from '../client/echoedClient.js';
import { listAll, recordValue, type StatCounter } from './store.js';
import { log } from '../log.js';

// Cache server-info responses across counters — multiple counters on
// the same server should only cost one info lookup per tick.
const SERVER_INFO_CACHE_TTL_MS = 60_000;
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

// statTick runs on a longer cadence than other ticks (every minute via
// the multiplier in scheduler.ts) — channel renames burn the rate
// limit if done frequently, and server populations don't shift fast
// enough to need second-level updates.
export async function statTick(api: EchoedClient): Promise<void> {
  const counters = await listAll();
  if (counters.length === 0) return;

  for (const counter of counters) {
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
    } catch (err) {
      log.warn({ err, channelId: counter.channelId }, 'Stat counter rename failed');
    }
  }
}
