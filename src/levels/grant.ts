import { pool } from '../db/pool.js';
import { getLevelSettings } from '../db/levelSettings.js';
import { levelForTotalXp } from './curve.js';
import { log } from '../log.js';

// Per-user-per-channel cooldown lives in memory: a restart hands a
// user one extra grant in the worst case, which is fine. Persisting
// it would mean a write on every message even when no XP is awarded.
//
// Map key: `${serverId}:${userId}:${channelId}` → last-grant epoch ms.
const cooldowns = new Map<string, number>();

// Periodic sweep so the Map can't grow unbounded on a busy server.
// Anything older than the longest plausible cooldown (1h) is dropped.
const SWEEP_INTERVAL_MS = 5 * 60 * 1000;
const SWEEP_OLDER_THAN_MS = 60 * 60 * 1000;
let sweepTimer: NodeJS.Timeout | null = null;

function startSweeper(): void {
  if (sweepTimer) return;
  sweepTimer = setInterval(() => {
    const cutoff = Date.now() - SWEEP_OLDER_THAN_MS;
    for (const [key, ts] of cooldowns) {
      if (ts < cutoff) cooldowns.delete(key);
    }
  }, SWEEP_INTERVAL_MS);
  // Don't keep the process alive just for the sweeper.
  sweepTimer.unref();
}

export interface GrantResult {
  // Whether XP was actually awarded this call.
  awarded: boolean;
  // XP delta. 0 when not awarded.
  amount: number;
  // Level before the grant.
  oldLevel: number;
  // Level after. Equal to oldLevel when no level-up.
  newLevel: number;
  // Total XP after the grant.
  totalXp: number;
  // True iff newLevel > oldLevel — convenience flag for callers.
  leveledUp: boolean;
}

const SKIPPED: GrantResult = {
  awarded: false,
  amount: 0,
  oldLevel: 0,
  newLevel: 0,
  totalXp: 0,
  leveledUp: false,
};

interface GrantInput {
  serverId: string;
  userId: string;
  channelId: string;
}

// awardXp is the single hot-path entry point called once per non-bot
// user message. It coalesces three cheap checks (enabled, no-xp
// channel, cooldown) before touching the DB; the DB write is a single
// row upsert.
export async function awardXp(input: GrantInput): Promise<GrantResult> {
  startSweeper();

  const settings = await getLevelSettings(input.serverId);
  if (!settings.enabled) return SKIPPED;
  if (settings.noXpChannelIds.includes(input.channelId)) return SKIPPED;

  const key = `${input.serverId}:${input.userId}:${input.channelId}`;
  const now = Date.now();
  const last = cooldowns.get(key) ?? 0;
  if (now - last < settings.cooldownSeconds * 1000) {
    return SKIPPED;
  }

  // Inclusive random in [min, max]. The bounds come from settings so
  // a server can tune their XP economy without code changes.
  const range = settings.xpPerMessageMax - settings.xpPerMessageMin + 1;
  const amount = settings.xpPerMessageMin + Math.floor(Math.random() * range);

  // Single upsert returns the updated row. We compute the new level
  // in JS rather than SQL because (a) the curve isn't linear and (b)
  // doing it in SQL would require either a stored function or a long
  // CASE expression that's painful to maintain.
  const upsertRes = await pool.query<{ total_xp: string; level: number }>(
    `INSERT INTO panda.xp (server_id, user_id, total_xp, level, last_msg_at, updated_at)
     VALUES ($1, $2, $3, 0, now(), now())
     ON CONFLICT (server_id, user_id) DO UPDATE
       SET total_xp = panda.xp.total_xp + EXCLUDED.total_xp,
           last_msg_at = now(),
           updated_at = now()
     RETURNING total_xp, level`,
    [input.serverId, input.userId, amount],
  );

  const row = upsertRes.rows[0];
  if (!row) {
    log.warn({ input }, 'xp upsert returned no row — skipping level math');
    return SKIPPED;
  }

  // total_xp comes back as a numeric string from BIGINT; coerce to
  // number. We're well below MAX_SAFE_INTEGER for any realistic user.
  const totalXp = Number(row.total_xp);
  const oldLevel = row.level;
  const newLevel = levelForTotalXp(totalXp);

  if (newLevel !== oldLevel) {
    // Persist the new level so subsequent checks don't recompute it.
    // Conditional update guards against a concurrent write that
    // already advanced the level.
    await pool.query(
      `UPDATE panda.xp
          SET level = $3, updated_at = now()
        WHERE server_id = $1 AND user_id = $2 AND level < $3`,
      [input.serverId, input.userId, newLevel],
    );
  }

  cooldowns.set(key, now);

  return {
    awarded: true,
    amount,
    oldLevel,
    newLevel,
    totalXp,
    leveledUp: newLevel > oldLevel,
  };
}

// Read a user's current XP/level without granting. Used by !rank.
export async function getUserXp(
  serverId: string,
  userId: string,
): Promise<{ totalXp: number; level: number } | null> {
  const res = await pool.query<{ total_xp: string; level: number }>(
    `SELECT total_xp, level FROM panda.xp WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId],
  );
  const row = res.rows[0];
  if (!row) return null;
  return { totalXp: Number(row.total_xp), level: row.level };
}

export interface LeaderboardEntry {
  userId: string;
  totalXp: number;
  level: number;
  rank: number;
}

// Top N for a server. Uses the (server_id, total_xp DESC) index.
export async function getLeaderboard(
  serverId: string,
  limit = 10,
): Promise<LeaderboardEntry[]> {
  const cap = Math.min(Math.max(1, limit), 100);
  const res = await pool.query<{ user_id: string; total_xp: string; level: number }>(
    `SELECT user_id, total_xp, level
       FROM panda.xp
      WHERE server_id = $1
      ORDER BY total_xp DESC
      LIMIT $2`,
    [serverId, cap],
  );
  return res.rows.map((row, i) => ({
    userId: row.user_id,
    totalXp: Number(row.total_xp),
    level: row.level,
    rank: i + 1,
  }));
}

// Resolve a single user's rank within a server (1-indexed). Returns
// null if the user has no XP. Cheap because the leaderboard index
// makes the rank query a partial scan.
export async function getUserRank(
  serverId: string,
  userId: string,
): Promise<number | null> {
  const res = await pool.query<{ rank: string }>(
    `SELECT (SELECT COUNT(*) + 1
               FROM panda.xp x2
              WHERE x2.server_id = $1
                AND x2.total_xp > x1.total_xp) AS rank
       FROM panda.xp x1
      WHERE x1.server_id = $1 AND x1.user_id = $2`,
    [serverId, userId],
  );
  const row = res.rows[0];
  return row ? Number(row.rank) : null;
}
