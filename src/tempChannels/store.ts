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

const LEASE_SECONDS = 120;
const MAX_ATTEMPTS = 5;

// Claim expired rows by leasing them, so a concurrent tick skips them
// without the row being destroyed before the channel is actually gone.
// Deleting the row up front meant a failed delete left the channel alive
// AND unforgotten — nothing would ever try again.
export async function claimExpired(now: Date, limit = 25): Promise<TempChannel[]> {
  const res = await pool.query<Row>(
    `UPDATE panda.temp_channels t
        SET claimed_at = $1,
            attempts   = t.attempts + 1
       WHERE t.channel_id IN (
         SELECT channel_id FROM panda.temp_channels
          WHERE expires_at <= $1
            AND attempts < $3
            AND (claimed_at IS NULL OR claimed_at < $1 - ($4 || ' seconds')::interval)
          ORDER BY expires_at ASC
          LIMIT $2
          FOR UPDATE SKIP LOCKED
       )
       RETURNING channel_id, server_id, expires_at, created_by, created_at`,
    [now, limit, MAX_ATTEMPTS, LEASE_SECONDS],
  );
  return res.rows.map(rowToTemp);
}

// The channel is gone (we deleted it, or it had already been deleted).
export async function settle(channelId: string): Promise<void> {
  await pool.query(`DELETE FROM panda.temp_channels WHERE channel_id = $1`, [channelId]);
}

// Delete failed for a reason that may clear up — release the lease so a
// later tick retries.
export async function release(channelId: string): Promise<void> {
  await pool.query(`UPDATE panda.temp_channels SET claimed_at = NULL WHERE channel_id = $1`, [
    channelId,
  ]);
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
