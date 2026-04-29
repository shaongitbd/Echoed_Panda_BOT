import { pool } from '../db/pool.js';

export interface Warning {
  id: number;
  serverId: string;
  userId: string;
  actorId: string;
  reason: string | null;
  createdAt: Date;
}

interface WarningRow {
  id: string; // BIGSERIAL — comes back as a numeric string
  server_id: string;
  user_id: string;
  actor_id: string;
  reason: string | null;
  created_at: Date;
}

function rowToWarning(row: WarningRow): Warning {
  return {
    id: Number(row.id),
    serverId: row.server_id,
    userId: row.user_id,
    actorId: row.actor_id,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

export async function addWarning(input: {
  serverId: string;
  userId: string;
  actorId: string;
  reason: string | null;
}): Promise<Warning> {
  const res = await pool.query<WarningRow>(
    `INSERT INTO panda.warnings (server_id, user_id, actor_id, reason)
     VALUES ($1, $2, $3, $4)
     RETURNING id, server_id, user_id, actor_id, reason, created_at`,
    [input.serverId, input.userId, input.actorId, input.reason],
  );
  const row = res.rows[0];
  if (!row) throw new Error('warning insert returned no row');
  return rowToWarning(row);
}

export async function listWarnings(
  serverId: string,
  userId: string,
  limit = 25,
): Promise<Warning[]> {
  const cap = Math.min(Math.max(1, limit), 100);
  const res = await pool.query<WarningRow>(
    `SELECT id, server_id, user_id, actor_id, reason, created_at
       FROM panda.warnings
      WHERE server_id = $1 AND user_id = $2
      ORDER BY created_at DESC
      LIMIT $3`,
    [serverId, userId, cap],
  );
  return res.rows.map(rowToWarning);
}

export async function countWarnings(
  serverId: string,
  userId: string,
): Promise<number> {
  const res = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
       FROM panda.warnings
      WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId],
  );
  return Number(res.rows[0]?.count ?? 0);
}

export async function clearWarnings(serverId: string, userId: string): Promise<number> {
  const res = await pool.query(
    `DELETE FROM panda.warnings WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId],
  );
  return res.rowCount ?? 0;
}

// Delete a single warning by ID (still scoped to the server for safety —
// without this guard, a stale ID from another server could nuke a row).
export async function deleteWarning(serverId: string, warningId: number): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM panda.warnings WHERE server_id = $1 AND id = $2`,
    [serverId, warningId],
  );
  return (res.rowCount ?? 0) > 0;
}
