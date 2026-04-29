import type { EchoedClient } from '../client/echoedClient.js';
import type { MemberJoinedData } from '../types.js';
import { getGuildConfig, setGuildConfig, invalidateGuildConfig } from '../db/guildConfig.js';
import { postModAction } from '../mod/modlog.js';
import { log } from '../log.js';

// In-memory rolling window of join timestamps per server. Bounded by
// the max plausible threshold; we only need the count.
const joinWindows = new Map<string, number[]>();

const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const SWEEP_OLDER_THAN_MS = 30 * 60 * 1000;

let sweepTimer: NodeJS.Timeout | null = null;
function startSweep(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const cutoff = Date.now() - SWEEP_OLDER_THAN_MS;
    for (const [serverId, ts] of joinWindows) {
      const last = ts[ts.length - 1] ?? 0;
      if (last < cutoff) joinWindows.delete(serverId);
    }
  }, SWEEP_INTERVAL_MS);
  sweepTimer.unref();
}

// Default lockdown duration once a raid is detected.
const LOCKDOWN_DURATION_MS = 10 * 60 * 1000;

// processJoin runs on every SERVER_MEMBER_ADD. Returns true if the
// joiner was kicked (caller skips welcome flow). Anti-raid is a
// best-effort layer on top of welcome — failures shouldn't stop
// the new member from being greeted.
export async function processJoin(
  api: EchoedClient,
  data: MemberJoinedData,
): Promise<boolean> {
  startSweep();

  const cfg = await getGuildConfig(data.serverId);
  if (!cfg.antiRaidEnabled) return false;

  // Active lockdown? Auto-kick incoming joins until it expires.
  if (cfg.antiRaidLockdownUntil && cfg.antiRaidLockdownUntil > new Date()) {
    try {
      await api.kickMember(data.serverId, data.userId, 'Anti-raid lockdown active');
      await postModAction(api, {
        serverId: data.serverId,
        action: 'kick',
        targetId: data.userId,
        actorId: data.userId, // automated; we don't have the bot's own ID here
        reason: 'Anti-raid lockdown',
      });
    } catch (err) {
      log.warn({ err, serverId: data.serverId, userId: data.userId }, 'Anti-raid auto-kick failed');
    }
    return true;
  }

  // Track this join in the window. If the count crosses the threshold,
  // open a lockdown.
  const now = Date.now();
  const cutoff = now - cfg.antiRaidWindowSeconds * 1000;
  const arr = joinWindows.get(data.serverId) ?? [];
  let idx = 0;
  while (idx < arr.length && arr[idx]! < cutoff) idx++;
  const trimmed = idx > 0 ? arr.slice(idx) : arr;
  trimmed.push(now);
  joinWindows.set(data.serverId, trimmed);

  if (trimmed.length < cfg.antiRaidThreshold) return false;

  // Threshold breached — engage lockdown. We don't kick the joiner
  // who tripped it because they may be legitimate; the alert is the
  // signal for human moderators to review.
  const until = new Date(now + LOCKDOWN_DURATION_MS);
  try {
    await setGuildConfig(data.serverId, { antiRaidLockdownUntil: until });
    invalidateGuildConfig(data.serverId);
    joinWindows.delete(data.serverId);
  } catch (err) {
    log.warn({ err, serverId: data.serverId }, 'Anti-raid lockdown set failed');
  }

  await postModAction(api, {
    serverId: data.serverId,
    action: 'kick',
    targetId: null,
    actorId: data.userId,
    reason: `🚨 Anti-raid: ${trimmed.length} joins in ${cfg.antiRaidWindowSeconds}s`,
    extra: `Lockdown active until ${until.toISOString()}`,
  });
  return false;
}
