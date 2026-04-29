import { pool } from '../db';

export interface AutoReactRow {
  channelId: string;
  emoji: string;
}

interface Row {
  channel_id: string;
  emoji: string;
}

export async function listForServer(serverId: string): Promise<AutoReactRow[]> {
  const res = await pool.query<Row>(
    `SELECT channel_id, emoji
       FROM auto_react
      WHERE server_id = $1
      ORDER BY channel_id, emoji`,
    [serverId],
  );
  return res.rows.map((r) => ({ channelId: r.channel_id, emoji: r.emoji }));
}

export async function addAutoReact(input: {
  serverId: string;
  channelId: string;
  emoji: string;
  createdBy: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO auto_react (server_id, channel_id, emoji, created_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (channel_id, emoji) DO UPDATE SET created_by = EXCLUDED.created_by`,
    [input.serverId, input.channelId, input.emoji, input.createdBy],
  );
}

export async function removeAutoReact(
  serverId: string,
  channelId: string,
  emoji: string,
): Promise<boolean> {
  // Filter by server_id too for safety even though channel_id+emoji
  // is the PK — a leaked channel/emoji combo from another server
  // shouldn't be removable from this dashboard.
  const res = await pool.query(
    `DELETE FROM auto_react
       WHERE server_id = $1 AND channel_id = $2 AND emoji = $3`,
    [serverId, channelId, emoji],
  );
  return (res.rowCount ?? 0) > 0;
}
