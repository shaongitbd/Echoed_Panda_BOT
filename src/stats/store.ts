import { pool } from '../db/pool.js';

export type StatKind = 'members' | 'channels';
export const VALID_KINDS: ReadonlySet<string> = new Set(['members', 'channels']);

export interface StatCounter {
  serverId: string;
  channelId: string;
  kind: StatKind;
  format: string;
  lastValue: number | null;
  updatedAt: Date;
}

interface Row {
  server_id: string;
  channel_id: string;
  kind: string;
  format: string;
  last_value: number | null;
  updated_at: Date;
}

function rowToCounter(row: Row): StatCounter {
  // Narrow `kind` defensively — anything outside the known set is an
  // ignored counter (the tick will skip).
  const kind = (VALID_KINDS.has(row.kind) ? row.kind : 'members') as StatKind;
  return {
    serverId: row.server_id,
    channelId: row.channel_id,
    kind,
    format: row.format,
    lastValue: row.last_value,
    updatedAt: row.updated_at,
  };
}

export async function addCounter(input: {
  serverId: string;
  channelId: string;
  kind: StatKind;
  format: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO panda.stat_counters (server_id, channel_id, kind, format)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (channel_id) DO UPDATE
       SET kind = EXCLUDED.kind, format = EXCLUDED.format, updated_at = now()`,
    [input.serverId, input.channelId, input.kind, input.format],
  );
}

export async function removeCounter(channelId: string): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM panda.stat_counters WHERE channel_id = $1`,
    [channelId],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function listForServer(serverId: string): Promise<StatCounter[]> {
  const res = await pool.query<Row>(
    `SELECT server_id, channel_id, kind, format, last_value, updated_at
       FROM panda.stat_counters
      WHERE server_id = $1`,
    [serverId],
  );
  return res.rows.map(rowToCounter);
}

// Tick reads ALL counters globally — there's no per-server index here
// because the bot is generally in O(small) servers and the table is
// short. If usage grows we'd partition by server and tick each in
// turn.
export async function listAll(): Promise<StatCounter[]> {
  const res = await pool.query<Row>(
    `SELECT server_id, channel_id, kind, format, last_value, updated_at
       FROM panda.stat_counters
      ORDER BY updated_at ASC`,
  );
  return res.rows.map(rowToCounter);
}

export async function recordValue(channelId: string, value: number): Promise<void> {
  await pool.query(
    `UPDATE panda.stat_counters
        SET last_value = $2, updated_at = now()
      WHERE channel_id = $1`,
    [channelId, value],
  );
}
