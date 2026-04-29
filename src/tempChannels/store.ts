import { pool } from '../db/pool.js';

export interface TempChannel {
  channelId: string;
  serverId: string;
  expiresAt: Date;
  createdBy: string;
  createdAt: Date;
}

interface Row {
  channel_id: string;
  server_id: string;
  expires_at: Date;
  created_by: string;
  created_at: Date;
}

function rowToTemp(row: Row): TempChannel {
  return {
    channelId: row.channel_id,
    serverId: row.server_id,
    expiresAt: row.expires_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function recordTemp(input: {
  channelId: string;
  serverId: string;
  expiresAt: Date;
  createdBy: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO panda.temp_channels (channel_id, server_id, expires_at, created_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (channel_id) DO UPDATE
       SET expires_at = EXCLUDED.expires_at`,
    [input.channelId, input.serverId, input.expiresAt, input.createdBy],
  );
}

// Claim expired rows in one statement so concurrent ticks don't both
// try to delete the same channel.
export async function claimExpired(now: Date, limit = 25): Promise<TempChannel[]> {
  const res = await pool.query<Row>(
    `DELETE FROM panda.temp_channels
       WHERE channel_id IN (
         SELECT channel_id FROM panda.temp_channels
          WHERE expires_at <= $1
          ORDER BY expires_at ASC
          LIMIT $2
          FOR UPDATE SKIP LOCKED
       )
       RETURNING channel_id, server_id, expires_at, created_by, created_at`,
    [now, limit],
  );
  return res.rows.map(rowToTemp);
}

export async function listForServer(serverId: string): Promise<TempChannel[]> {
  const res = await pool.query<Row>(
    `SELECT channel_id, server_id, expires_at, created_by, created_at
       FROM panda.temp_channels
      WHERE server_id = $1
      ORDER BY expires_at ASC`,
    [serverId],
  );
  return res.rows.map(rowToTemp);
}

export async function cancelTemp(channelId: string): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM panda.temp_channels WHERE channel_id = $1`,
    [channelId],
  );
  return (res.rowCount ?? 0) > 0;
}
