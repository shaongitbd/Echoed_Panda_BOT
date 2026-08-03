import { pool } from '../db/pool.js';

export interface Reminder {
  id: number;
  serverId: string;
  userId: string;
  channelId: string;
  message: string;
  dueAt: Date;
  createdAt: Date;
}

interface Row {
  id: string;
  server_id: string;
  user_id: string;
  channel_id: string;
  message: string;
  due_at: Date;
  created_at: Date;
}

function rowToReminder(row: Row): Reminder {
  return {
    id: Number(row.id),
    serverId: row.server_id,
    userId: row.user_id,
    channelId: row.channel_id,
    message: row.message,
    dueAt: row.due_at,
    createdAt: row.created_at,
  };
}

export async function addReminder(input: {
  serverId: string;
  userId: string;
  channelId: string;
  message: string;
  dueAt: Date;
}): Promise<Reminder> {
  const res = await pool.query<Row>(
    `INSERT INTO panda.reminders (server_id, user_id, channel_id, message, due_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, server_id, user_id, channel_id, message, due_at, created_at`,
    [input.serverId, input.userId, input.channelId, input.message, input.dueAt],
  );
  const row = res.rows[0];
  if (!row) throw new Error('reminder insert returned no row');
  return rowToReminder(row);
}

export async function listForUser(
  serverId: string,
  userId: string,
  limit = 25,
): Promise<Reminder[]> {
  const cap = Math.min(Math.max(1, limit), 100);
  const res = await pool.query<Row>(
    `SELECT id, server_id, user_id, channel_id, message, due_at, created_at
       FROM panda.reminders
      WHERE server_id = $1 AND user_id = $2
      ORDER BY due_at ASC
      LIMIT $3`,
    [serverId, userId, cap],
  );
  return res.rows.map(rowToReminder);
}

// Cancel scoped to (server, user, id) so a leaked ID from another
// server can't delete someone else's reminder.
export async function cancelReminder(
  serverId: string,
  userId: string,
  id: number,
): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM panda.reminders WHERE server_id = $1 AND user_id = $2 AND id = $3`,
    [serverId, userId, id],
  );
  return (res.rowCount ?? 0) > 0;
}

// How long a claim is held before another tick may retry it. Long enough
// that a slow send isn't retried underneath itself, short enough that a
// process killed mid-tick doesn't strand the reminder for long.
const LEASE_SECONDS = 120;

// Give up after this many failed attempts rather than retrying forever.
const MAX_ATTEMPTS = 5;

// Tick query: claim due reminders by leasing them, so a concurrent tick
// skips them but a failure doesn't destroy them. The row survives until
// `settle()` confirms the reminder was actually delivered.
export async function claimDue(now: Date, limit = 50): Promise<Reminder[]> {
  const res = await pool.query<Row>(
    `UPDATE panda.reminders r
        SET claimed_at = $1,
            attempts   = r.attempts + 1
       WHERE r.id IN (
         SELECT id FROM panda.reminders
          WHERE due_at <= $1
            AND attempts < $3
            AND (claimed_at IS NULL OR claimed_at < $1 - ($4 || ' seconds')::interval)
          ORDER BY due_at ASC
          LIMIT $2
          FOR UPDATE SKIP LOCKED
       )
       RETURNING id, server_id, user_id, channel_id, message, due_at, created_at`,
    [now, limit, MAX_ATTEMPTS, LEASE_SECONDS],
  );
  return res.rows.map(rowToReminder);
}

// Delivered — the reminder is done, drop it.
export async function settle(id: number): Promise<void> {
  await pool.query(`DELETE FROM panda.reminders WHERE id = $1`, [id]);
}

// Delivery failed in a way that might succeed later. Release the lease so
// the next tick picks it up; `attempts` already advanced at claim time, so
// this can't loop forever.
export async function release(id: number): Promise<void> {
  await pool.query(`UPDATE panda.reminders SET claimed_at = NULL WHERE id = $1`, [id]);
}

// Failed permanently (channel gone, no access). Retrying will never work,
// so stop.
export async function abandon(id: number): Promise<void> {
  await pool.query(`DELETE FROM panda.reminders WHERE id = $1`, [id]);
}
