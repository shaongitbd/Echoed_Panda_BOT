import { pool } from '../db';

export type StatKind = 'members' | 'channels';
export const VALID_KINDS: ReadonlySet<string> = new Set(['members', 'channels']);

export interface StatCounter {
  serverId: string;
  channelId: string;
  kind: StatKind;
  format: string;
  lastValue: number | null;
}

interface Row {
  server_id: string;
  channel_id: string;
  kind: string;
  format: string;
  last_value: number | null;
}

function rowToCounter(row: Row): StatCounter {
  const kind = (VALID_KINDS.has(row.kind) ? row.kind : 'members') as StatKind;
  return {
    serverId: row.server_id,
    channelId: row.channel_id,
    kind,
    format: row.format,
    lastValue: row.last_value,
  };
}

export async function listForServer(serverId: string): Promise<StatCounter[]> {
  const res = await pool.query<Row>(
    `SELECT server_id, channel_id, kind, format, last_value
       FROM stat_counters
      WHERE server_id = $1`,
    [serverId],
  );
  return res.rows.map(rowToCounter);
}

export async function addCounter(input: {
  serverId: string;
  channelId: string;
  kind: StatKind;
  format: string;
}): Promise<void> {
  await pool.query(
    // As in the bot's src/stats/store.ts: channel_id is the conflict key, so
    // the guard stops an owner of one server taking over a counter on
    // another server's channel (the row would keep the victim's server_id
    // but take the caller's format, and the bot would rename their channel).
    `INSERT INTO stat_counters (server_id, channel_id, kind, format)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (channel_id) DO UPDATE
       SET kind = EXCLUDED.kind, format = EXCLUDED.format, updated_at = now()
     WHERE stat_counters.server_id = EXCLUDED.server_id`,
    [input.serverId, input.channelId, input.kind, input.format],
  );
}

export async function removeCounter(serverId: string, channelId: string): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM stat_counters WHERE channel_id = $1 AND server_id = $2`,
    [channelId, serverId],
  );
  return (res.rowCount ?? 0) > 0;
}
