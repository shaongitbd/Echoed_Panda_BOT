import type { EchoedClient } from '../client/echoedClient.js';
import type { MemberJoinedData } from '../types.js';
import { getGuildConfig, setGuildConfig, invalidateGuildConfig } from '../db/guildConfig.js';
import { postModAction } from '../mod/modlog.js';
import { log } from '../log.js';

// ─── Anti-raid detector ───────────────────────────────────────────────
//
// What this does end-to-end:
//
//  1. Tracks join timestamps per server in a rolling in-memory window.
//  2. When the window count crosses the configured threshold, engages
//     a backend-enforced lockdown: calls /v1/bots/:server/lockdown
//     so subsequent joins are rejected at the Echoed API edge, AND
//     bumps the server's verification_level to "Medium" (account ≥
//     5 minutes old, email verified) so already-verified humans can
//     still join while drive-by raid accounts are blocked. The
//     previous verification_level is snapshotted in panda's
//     guild_config so we can restore it cleanly when the lockdown
//     ends.
//
//  3. While a lockdown is active, every join that *does* slip through
//     (pre-existing verified account, race condition, mid-state) is
//     screened by a heuristic check:
//        - account age < 24h AND no avatar set     → ban (sticky)
//        - account age < 7d  AND no avatar         → kick (soft)
//        - everything else                         → allow (legit human
//          joining during a wave)
//     Banning prevents rejoin from the same account; kicking is the
//     polite signal "we're locked, come back later".
//
//  4. The mod-log entry for the lockdown event is attributed to the
//     bot itself (botUserId), not the joiner who tripped it. Without
//     that, the log read like the new user kicked themselves, which
//     was confusing.

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

// Default lockdown duration once a raid is detected. Mirrors the
// `untilSeconds` we send the backend so both sides expire on the
// same clock without needing reconciliation.
const LOCKDOWN_DURATION_MS = 10 * 60 * 1000;
const LOCKDOWN_DURATION_SECONDS = Math.floor(LOCKDOWN_DURATION_MS / 1000);

// Verification level we bump to during lockdown. 2 = "verified email
// + account age ≥ 5 min" — enough to filter newly-minted raid accounts
// without locking out drive-by legitimate users with phone-verified,
// long-lived accounts.
const LOCKDOWN_VERIFICATION_LEVEL = 2;

// Heuristic thresholds for ban-on-join during a lockdown.
const HEURISTIC_BAN_AGE_MS = 24 * 60 * 60 * 1000;
const HEURISTIC_KICK_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// processJoin runs on every SERVER_MEMBER_ADD. Returns true if the
// joiner was kicked or banned (caller skips welcome flow). Anti-raid
// is a best-effort layer on top of welcome — failures shouldn't stop
// legitimate new members from being greeted.
export async function processJoin(
  api: EchoedClient,
  data: MemberJoinedData,
  botUserId: string,
): Promise<boolean> {
  startSweep();

  const cfg = await getGuildConfig(data.serverId);
  if (!cfg.antiRaidEnabled) return false;

  // ── Active lockdown branch ────────────────────────────────────────
  // The backend rejects most joins at the API edge, but not all —
  // accounts that pre-date the verification_level bump still get in.
  // Apply heuristics to those.
  if (cfg.antiRaidLockdownUntil && cfg.antiRaidLockdownUntil > new Date()) {
    return await handleJoinDuringLockdown(api, data, botUserId);
  }

  // ── Threshold tracking ────────────────────────────────────────────
  const now = Date.now();
  const cutoff = now - cfg.antiRaidWindowSeconds * 1000;
  const arr = joinWindows.get(data.serverId) ?? [];
  let idx = 0;
  while (idx < arr.length && arr[idx]! < cutoff) idx++;
  const trimmed = idx > 0 ? arr.slice(idx) : arr;
  trimmed.push(now);
  joinWindows.set(data.serverId, trimmed);

  if (trimmed.length < cfg.antiRaidThreshold) return false;

  // ── Threshold breached → engage lockdown ─────────────────────────
  await engageLockdown(api, data.serverId, botUserId, trimmed.length, cfg.antiRaidWindowSeconds);
  joinWindows.delete(data.serverId);

  // The user who tripped the threshold isn't auto-kicked — they may
  // be a legitimate human. Subsequent joins flow through the
  // lockdown branch above.
  return false;
}

// Engage everything in one place so the call sites don't have to
// orchestrate it. Order matters:
//   1. Snapshot current verification_level (call backend, store result)
//   2. Bump verification_level (cuts off the simplest raid accounts)
//   3. Set the platform lockdown (rejects all joins at the API edge)
//   4. Mirror in panda's guild_config (so other instances know the
//      lockdown is active and the snapshot is recoverable)
//   5. Mod-log
async function engageLockdown(
  api: EchoedClient,
  serverId: string,
  botUserId: string,
  joinCount: number,
  windowSeconds: number,
): Promise<void> {
  const until = new Date(Date.now() + LOCKDOWN_DURATION_MS);

  let previousLevel: number | null = null;
  try {
    const res = await api.setVerificationLevel(serverId, LOCKDOWN_VERIFICATION_LEVEL);
    previousLevel = res.previous;
  } catch (err) {
    log.warn({ err, serverId }, 'Anti-raid: verification-level bump failed (continuing)');
  }

  try {
    await api.setLockdown(
      serverId,
      LOCKDOWN_DURATION_SECONDS,
      `${joinCount} joins in ${windowSeconds}s`,
    );
  } catch (err) {
    log.error({ err, serverId }, 'Anti-raid: backend lockdown call failed');
    // Carry on — even without backend lockdown, the verification bump
    // and panda-side state still help.
  }

  try {
    await setGuildConfig(serverId, {
      antiRaidLockdownUntil: until,
      preLockdownVerificationLevel: previousLevel,
    });
    invalidateGuildConfig(serverId);
  } catch (err) {
    log.warn({ err, serverId }, 'Anti-raid: panda-side lockdown state write failed');
  }

  await postModAction(api, {
    serverId,
    action: 'kick',
    targetId: null,
    actorId: botUserId,
    reason: `🚨 Anti-raid: ${joinCount} joins in ${windowSeconds}s — lockdown engaged`,
    extra: `Verification level bumped to ${LOCKDOWN_VERIFICATION_LEVEL} (was ${
      previousLevel ?? '?'
    }). Lockdown until ${until.toISOString()}.`,
  });
}

// During a lockdown we still see SERVER_MEMBER_ADD for any join that
// snuck through (e.g. accounts that pass the bumped verification
// level). Apply the ban / kick heuristic.
async function handleJoinDuringLockdown(
  api: EchoedClient,
  data: MemberJoinedData,
  botUserId: string,
): Promise<boolean> {
  let profile;
  try {
    profile = await api.getMemberProfile(data.serverId, data.userId);
  } catch (err) {
    log.warn({ err, userId: data.userId }, 'Anti-raid: profile fetch failed — defaulting to kick');
    return await kickJoinerInLockdown(api, data, botUserId, 'profile_unavailable');
  }

  const ageMs = profile.accountAgeSeconds * 1000;
  const noAvatar = !profile.hasAvatar;

  // Ban tier: very fresh + no avatar → almost certainly raid account.
  // Use a sticky ban so the same account can't rejoin once the
  // lockdown ends.
  if (ageMs < HEURISTIC_BAN_AGE_MS && noAvatar) {
    try {
      await api.banMember(
        data.serverId,
        data.userId,
        `Anti-raid: account < 24h old, no avatar (heuristic)`,
      );
      await postModAction(api, {
        serverId: data.serverId,
        action: 'ban',
        targetId: data.userId,
        actorId: botUserId,
        reason: 'Anti-raid heuristic: <24h account, no avatar',
      });
      return true;
    } catch (err) {
      log.warn({ err, userId: data.userId }, 'Anti-raid: heuristic ban failed — falling back to kick');
    }
  }

  // Kick tier: weeks-old account but no avatar (still suspicious),
  // OR ban-tier above failed. Soft signal — they can rejoin after
  // lockdown ends.
  if (ageMs < HEURISTIC_KICK_AGE_MS && noAvatar) {
    return await kickJoinerInLockdown(api, data, botUserId, 'fresh_no_avatar');
  }

  // Looks like a real human caught in the lockdown wave. Kick them
  // softly so they know to come back later (matches the prior
  // behavior — better than letting raids bleed through).
  return await kickJoinerInLockdown(api, data, botUserId, 'lockdown_active');
}

async function kickJoinerInLockdown(
  api: EchoedClient,
  data: MemberJoinedData,
  botUserId: string,
  reasonCode: string,
): Promise<boolean> {
  try {
    await api.kickMember(data.serverId, data.userId, `Anti-raid lockdown (${reasonCode})`);
    await postModAction(api, {
      serverId: data.serverId,
      action: 'kick',
      targetId: data.userId,
      actorId: botUserId,
      reason: `Anti-raid lockdown (${reasonCode})`,
    });
  } catch (err) {
    log.warn({ err, serverId: data.serverId, userId: data.userId }, 'Anti-raid auto-kick failed');
  }
  return true;
}

// liftLockdown is called by the !antiraid clear command. Restores
// verification_level to its pre-lockdown value (if we have a
// snapshot) and clears the panda-side flag. The platform lockdown
// would have expired on its own via the backend's `lockdown_until`
// timestamp, but we proactively clear it too so an admin override
// is consistent across both sides.
export async function liftLockdown(
  api: EchoedClient,
  serverId: string,
): Promise<void> {
  const cfg = await getGuildConfig(serverId);
  try {
    await api.clearLockdown(serverId);
  } catch (err) {
    log.warn({ err, serverId }, 'Anti-raid: clearLockdown call failed');
  }
  if (cfg.preLockdownVerificationLevel != null) {
    try {
      await api.setVerificationLevel(
        serverId,
        cfg.preLockdownVerificationLevel as 0 | 1 | 2 | 3,
      );
    } catch (err) {
      log.warn({ err, serverId }, 'Anti-raid: verification-level restore failed');
    }
  }
  try {
    await setGuildConfig(serverId, {
      antiRaidLockdownUntil: null,
      preLockdownVerificationLevel: null,
    });
    invalidateGuildConfig(serverId);
  } catch (err) {
    log.warn({ err, serverId }, 'Anti-raid: panda-side state clear failed');
  }
}
