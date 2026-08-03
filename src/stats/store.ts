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
    // A channel belongs to exactly one server, so channel_id stays the
    // conflict key. The guard stops a caller in one server from taking
    // over a counter on another server's channel: without it the row kept
    // its original server_id but took the caller's format, and the tick
    // then renamed a channel the caller has no rights to.
    `INSERT INTO panda.stat_counters (server_id, channel_id, kind, format)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (channel_id) DO UPDATE
       SET kind = EXCLUDED.kind, format = EXCLUDED.format, updated_at = now()
     WHERE panda.stat_counters.server_id = EXCLUDED.server_id`,
    [input.serverId, input.channelId, input.kind, input.format],
  );
}

export async function removeCounter(serverId: string, channelId: string): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM panda.stat_counters WHERE channel_id = $1 AND server_id = $2`,
    [channelId, serverId],
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

// One rotating batch of counters, least-recently-checked first.
//
// This used to select every counter in the fleet with no limit, then walk
// them one at a time with an API call each — so the sweep's wall time grew
// with the whole installed base and could exceed its own interval, which
// meant it never finished a pass. A bounded batch ordered by `checked_at`
// covers everything over successive passes instead.
export async function claimBatch(limit = 40): Promise<StatCounter[]> {
  const res = await pool.query<Row>(
    `UPDATE panda.stat_counters s
        SET checked_at = now()
      WHERE s.channel_id IN (
        SELECT channel_id FROM panda.stat_counters
         ORDER BY checked_at ASC NULLS FIRST
         LIMIT $1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING s.server_id, s.channel_id, s.kind, s.format, s.last_value, s.updated_at`,
    [limit],
  );
  return res.rows.map(rowToCounter);
}

// Every counter for a server. Used by the admin listing, not the sweep.
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
