import { pool } from '../db/pool.js';

export interface AfkEntry {
  serverId: string;
  userId: string;
  message: string | null;
  since: Date;
}

interface Row {
  server_id: string;
  user_id: string;
  message: string | null;
  since: Date;
}

function rowToEntry(row: Row): AfkEntry {
  return {
    serverId: row.server_id,
    userId: row.user_id,
    message: row.message,
    since: row.since,
  };
}

// Hot-path read: every message touches this for the sender (clear-if-AFK
// check) and every mention. Cache by (server, user) with short TTL so
// reads scale; writes invalidate.
const CACHE_TTL_MS = 60 * 1000;
const cache = new Map<string, { entry: AfkEntry | null; expiresAt: number }>();

function cacheKey(serverId: string, userId: string): string {
  return `${serverId}:${userId}`;
}

export async function getAfk(serverId: string, userId: string): Promise<AfkEntry | null> {
  const key = cacheKey(serverId, userId);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.entry;
  }
  const res = await pool.query<Row>(
    `SELECT server_id, user_id, message, since
       FROM panda.afk
      WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId],
  );
  const entry = res.rows[0] ? rowToEntry(res.rows[0]) : null;
  cache.set(key, { entry, expiresAt: Date.now() + CACHE_TTL_MS });
  return entry;
}

export async function setAfk(
  serverId: string,
  userId: string,
  message: string | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO panda.afk (server_id, user_id, message, since)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (server_id, user_id) DO UPDATE
       SET message = EXCLUDED.message, since = EXCLUDED.since`,
    [serverId, userId, message],
  );
  cache.delete(cacheKey(serverId, userId));
}

export async function clearAfk(serverId: string, userId: string): Promise<AfkEntry | null> {
  const res = await pool.query<Row>(
    `DELETE FROM panda.afk
       WHERE server_id = $1 AND user_id = $2
       RETURNING server_id, user_id, message, since`,
    [serverId, userId],
  );
  cache.delete(cacheKey(serverId, userId));
  return res.rows[0] ? rowToEntry(res.rows[0]) : null;
}

// Look up a batch of mentions in a single round-trip. The mention
// detector pulls every `<@id>` out of a message; for messages with
// 5-10 mentions the round-trip savings matter on busy channels.
export async function getAfkBatch(
  serverId: string,
  userIds: string[],
): Promise<Map<string, AfkEntry>> {
  if (userIds.length === 0) return new Map();
  const res = await pool.query<Row>(
    `SELECT server_id, user_id, message, since
       FROM panda.afk
      WHERE server_id = $1 AND user_id = ANY($2::text[])`,
    [serverId, userIds],
  );
  const out = new Map<string, AfkEntry>();
  for (const row of res.rows) {
    out.set(row.user_id, rowToEntry(row));
  }
  return out;
}
