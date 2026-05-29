import { pool } from '../db/pool.js';

export interface CountingConfig {
  serverId: string;
  channelId: string | null;
  currentCount: number;
  lastUserId: string | null;
  highScore: number;
  enabled: boolean;
  resetOnFail: boolean;
}

interface ConfigRow {
  server_id: string;
  channel_id: string | null;
  current_count: number;
  last_user_id: string | null;
  high_score: number;
  enabled: boolean;
  reset_on_fail: boolean;
}

function rowToConfig(row: ConfigRow): CountingConfig {
  return {
    serverId: row.server_id,
    channelId: row.channel_id,
    currentCount: row.current_count,
    lastUserId: row.last_user_id,
    highScore: row.high_score,
    enabled: row.enabled,
    resetOnFail: row.reset_on_fail,
  };
}

const DEFAULT_CONFIG = (serverId: string): CountingConfig => ({
  serverId,
  channelId: null,
  currentCount: 0,
  lastUserId: null,
  highScore: 0,
  enabled: false,
  resetOnFail: true,
});

// Routing cache: just "is counting on, and in which channel" — the parts that
// change rarely (only via setCountingConfig). The hot path runs on EVERY
// message, so this must be cached like automod/level config; without it we'd do
// a DB read per message server-wide. The volatile current_count/last_user are
// NOT cached here — those are read fresh only for messages that land in the
// counting channel (low volume), so a stale count can never reject a valid one.
interface Route {
  enabled: boolean;
  channelId: string | null;
}
const ROUTE_TTL_MS = 60 * 1000;
const routeCache = new Map<string, { route: Route; expiresAt: number }>();

export async function getCountingRoute(serverId: string): Promise<Route> {
  const cached = routeCache.get(serverId);
  if (cached && cached.expiresAt > Date.now()) return cached.route;
  const res = await pool.query<{ enabled: boolean; channel_id: string | null }>(
    `SELECT enabled, channel_id FROM panda.counting_config WHERE server_id = $1`,
    [serverId],
  );
  const row = res.rows[0];
  const route: Route = { enabled: row?.enabled ?? false, channelId: row?.channel_id ?? null };
  routeCache.set(serverId, { route, expiresAt: Date.now() + ROUTE_TTL_MS });
  return route;
}

export async function getCountingConfig(serverId: string): Promise<CountingConfig> {
  const res = await pool.query<ConfigRow>(
    `SELECT server_id, channel_id, current_count, last_user_id, high_score, enabled, reset_on_fail
       FROM panda.counting_config WHERE server_id = $1`,
    [serverId],
  );
  const row = res.rows[0];
  return row ? rowToConfig(row) : DEFAULT_CONFIG(serverId);
}

export interface CountingConfigPatch {
  channelId?: string;
  currentCount?: number;
  lastUserId?: string | null;
  enabled?: boolean;
  resetOnFail?: boolean;
}

const FIELD_TO_COLUMN: Record<keyof CountingConfigPatch, string> = {
  channelId: 'channel_id',
  currentCount: 'current_count',
  lastUserId: 'last_user_id',
  enabled: 'enabled',
  resetOnFail: 'reset_on_fail',
};

export async function setCountingConfig(
  serverId: string,
  patch: CountingConfigPatch,
): Promise<CountingConfig> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined) as [
    keyof CountingConfigPatch,
    unknown,
  ][];
  if (entries.length === 0) return getCountingConfig(serverId);

  const cols = entries.map(([k]) => FIELD_TO_COLUMN[k]);
  const placeholders = entries.map((_, i) => `$${i + 2}`);
  const values = entries.map(([, v]) => v);
  const updates = cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ');

  const res = await pool.query<ConfigRow>(
    `INSERT INTO panda.counting_config (server_id, ${cols.join(', ')}, updated_at)
     VALUES ($1, ${placeholders.join(', ')}, now())
     ON CONFLICT (server_id) DO UPDATE SET ${updates}, updated_at = now()
     RETURNING server_id, channel_id, current_count, last_user_id, high_score, enabled, reset_on_fail`,
    [serverId, ...values],
  );
  // Bust the routing cache — enabled/channel may have just changed.
  routeCache.delete(serverId);
  return rowToConfig(res.rows[0]!);
}

// Atomically advance the count IFF the channel is still at `expected - 1` and
// the last counter wasn't this same user. The WHERE guard makes concurrent
// correct counts safe — only one wins, the loser is treated as a (harmless)
// non-advance. Returns the new count + high score, or null if it didn't apply.
export async function advanceCount(
  serverId: string,
  expected: number,
  userId: string,
): Promise<{ count: number; highScore: number } | null> {
  const res = await pool.query<{ current_count: number; high_score: number }>(
    `UPDATE panda.counting_config
        SET current_count = $2,
            last_user_id  = $3,
            high_score    = GREATEST(high_score, $2),
            updated_at    = now()
      WHERE server_id = $1
        AND enabled = TRUE
        AND current_count = $2 - 1
        AND (last_user_id IS DISTINCT FROM $3)
      RETURNING current_count, high_score`,
    [serverId, expected, userId],
  );
  const row = res.rows[0];
  return row ? { count: row.current_count, highScore: row.high_score } : null;
}

export async function resetCount(serverId: string): Promise<void> {
  await pool.query(
    `UPDATE panda.counting_config
        SET current_count = 0, last_user_id = NULL, updated_at = now()
      WHERE server_id = $1`,
    [serverId],
  );
}
