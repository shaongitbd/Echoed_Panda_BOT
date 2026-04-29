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

// Tick query: pull all due reminders, claim by deletion in the SAME
// statement so concurrent ticks don't fire the same reminder twice.
// `RETURNING` gives us the rows we just claimed.
export async function claimDue(now: Date, limit = 50): Promise<Reminder[]> {
  const res = await pool.query<Row>(
    `DELETE FROM panda.reminders
       WHERE id IN (
         SELECT id FROM panda.reminders
          WHERE due_at <= $1
          ORDER BY due_at ASC
          LIMIT $2
          FOR UPDATE SKIP LOCKED
       )
       RETURNING id, server_id, user_id, channel_id, message, due_at, created_at`,
    [now, limit],
  );
  return res.rows.map(rowToReminder);
}
