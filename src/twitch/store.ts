import { pool } from '../db/pool.js';

export interface TwitchSub {
  id: number;
  serverId: string;
  channelId: string;
  twitchLogin: string;
  lastStreamId: string | null;
  lastCheckLive: boolean;
  createdBy: string;
  createdAt: Date;
}

interface Row {
  id: string;
  server_id: string;
  channel_id: string;
  twitch_login: string;
  last_stream_id: string | null;
  last_check_live: boolean;
  created_by: string;
  created_at: Date;
}

function rowToSub(row: Row): TwitchSub {
  return {
    id: Number(row.id),
    serverId: row.server_id,
    channelId: row.channel_id,
    twitchLogin: row.twitch_login,
    lastStreamId: row.last_stream_id,
    lastCheckLive: row.last_check_live,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function addSub(input: {
  serverId: string;
  channelId: string;
  twitchLogin: string;
  createdBy: string;
}): Promise<TwitchSub> {
  const login = input.twitchLogin.toLowerCase();
  const res = await pool.query<Row>(
    `INSERT INTO panda.twitch_subs (server_id, channel_id, twitch_login, created_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (server_id, channel_id, twitch_login) DO UPDATE
       SET created_by = EXCLUDED.created_by
     RETURNING id, server_id, channel_id, twitch_login, last_stream_id, last_check_live, created_by, created_at`,
    [input.serverId, input.channelId, login, input.createdBy],
  );
  const row = res.rows[0];
  if (!row) throw new Error('twitch_subs upsert returned no row');
  return rowToSub(row);
}

export async function removeSub(
  serverId: string,
  channelId: string,
  twitchLogin: string,
): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM panda.twitch_subs
       WHERE server_id = $1 AND channel_id = $2 AND twitch_login = $3`,
    [serverId, channelId, twitchLogin.toLowerCase()],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function listForServer(serverId: string): Promise<TwitchSub[]> {
  const res = await pool.query<Row>(
    `SELECT id, server_id, channel_id, twitch_login, last_stream_id, last_check_live, created_by, created_at
       FROM panda.twitch_subs
      WHERE server_id = $1
      ORDER BY twitch_login ASC`,
    [serverId],
  );
  return res.rows.map(rowToSub);
}

export async function listAll(): Promise<TwitchSub[]> {
  const res = await pool.query<Row>(
    `SELECT id, server_id, channel_id, twitch_login, last_stream_id, last_check_live, created_by, created_at
       FROM panda.twitch_subs`,
  );
  return res.rows.map(rowToSub);
}

export async function recordCheck(input: {
  id: number;
  isLive: boolean;
  streamId: string | null;
}): Promise<void> {
  await pool.query(
    `UPDATE panda.twitch_subs
        SET last_check_live = $2, last_stream_id = $3
      WHERE id = $1`,
    [input.id, input.isLive, input.streamId],
  );
}
