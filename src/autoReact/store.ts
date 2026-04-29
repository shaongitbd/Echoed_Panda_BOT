import { pool } from '../db/pool.js';

export interface AutoReact {
  serverId: string;
  channelId: string;
  emoji: string;
  createdBy: string;
}

interface Row {
  server_id: string;
  channel_id: string;
  emoji: string;
  created_by: string;
}

function rowToAutoReact(row: Row): AutoReact {
  return {
    serverId: row.server_id,
    channelId: row.channel_id,
    emoji: row.emoji,
    createdBy: row.created_by,
  };
}

// Hot-path lookup runs on EVERY message — short TTL trades minor
// staleness for a hard cap on DB load. Cache by channel because
// that's the lookup shape from the message handler.
const TTL_MS = 60 * 1000;
const cacheByChannel = new Map<string, { emojis: string[]; expiresAt: number }>();

export async function getEmojisForChannel(channelId: string): Promise<string[]> {
  const cached = cacheByChannel.get(channelId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.emojis;
  }
  const res = await pool.query<{ emoji: string }>(
    `SELECT emoji FROM panda.auto_react WHERE channel_id = $1`,
    [channelId],
  );
  const emojis = res.rows.map((r) => r.emoji);
  cacheByChannel.set(channelId, { emojis, expiresAt: Date.now() + TTL_MS });
  return emojis;
}

export async function addAutoReact(input: AutoReact): Promise<void> {
  await pool.query(
    `INSERT INTO panda.auto_react (server_id, channel_id, emoji, created_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (channel_id, emoji) DO UPDATE SET created_by = EXCLUDED.created_by`,
    [input.serverId, input.channelId, input.emoji, input.createdBy],
  );
  cacheByChannel.delete(input.channelId);
}

export async function removeAutoReact(channelId: string, emoji: string): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM panda.auto_react WHERE channel_id = $1 AND emoji = $2`,
    [channelId, emoji],
  );
  cacheByChannel.delete(channelId);
  return (res.rowCount ?? 0) > 0;
}

export async function listForServer(serverId: string): Promise<AutoReact[]> {
  const res = await pool.query<Row>(
    `SELECT server_id, channel_id, emoji, created_by
       FROM panda.auto_react
      WHERE server_id = $1
      ORDER BY channel_id, emoji`,
    [serverId],
  );
  return res.rows.map(rowToAutoReact);
}
