import { pool } from '../db/pool.js';

export type ScheduleKind = 'every' | 'daily';

export interface ScheduledMessage {
  id: number;
  serverId: string;
  channelId: string;
  message: string;
  kind: ScheduleKind;
  intervalSeconds: number | null;
  dailyTime: string | null;
  nextRunAt: Date;
  createdBy: string;
  createdAt: Date;
}

interface Row {
  id: string;
  server_id: string;
  channel_id: string;
  message: string;
  schedule_kind: string;
  interval_seconds: number | null;
  daily_time: string | null;
  next_run_at: Date;
  created_by: string;
  created_at: Date;
}

function rowToSched(row: Row): ScheduledMessage {
  const kind = row.schedule_kind === 'daily' ? 'daily' : 'every';
  return {
    id: Number(row.id),
    serverId: row.server_id,
    channelId: row.channel_id,
    message: row.message,
    kind,
    intervalSeconds: row.interval_seconds,
    dailyTime: row.daily_time,
    nextRunAt: row.next_run_at,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

export async function addSchedule(input: {
  serverId: string;
  channelId: string;
  message: string;
  kind: ScheduleKind;
  intervalSeconds: number | null;
  dailyTime: string | null;
  nextRunAt: Date;
  createdBy: string;
}): Promise<ScheduledMessage> {
  const res = await pool.query<Row>(
    `INSERT INTO panda.scheduled_messages
       (server_id, channel_id, message, schedule_kind, interval_seconds, daily_time, next_run_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, server_id, channel_id, message, schedule_kind,
               interval_seconds, daily_time, next_run_at, created_by, created_at`,
    [
      input.serverId,
      input.channelId,
      input.message,
      input.kind,
      input.intervalSeconds,
      input.dailyTime,
      input.nextRunAt,
      input.createdBy,
    ],
  );
  const row = res.rows[0];
  if (!row) throw new Error('scheduled_messages insert returned no row');
  return rowToSched(row);
}

export async function removeSchedule(serverId: string, id: number): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM panda.scheduled_messages WHERE server_id = $1 AND id = $2`,
    [serverId, id],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function listForServer(serverId: string): Promise<ScheduledMessage[]> {
  const res = await pool.query<Row>(
    `SELECT id, server_id, channel_id, message, schedule_kind,
            interval_seconds, daily_time, next_run_at, created_by, created_at
       FROM panda.scheduled_messages
      WHERE server_id = $1
      ORDER BY next_run_at ASC`,
    [serverId],
  );
  return res.rows.map(rowToSched);
}

// Tick claim: select due rows + reschedule them in a single query so
// concurrent ticks can't double-fire. Daily schedules advance to the
// same HH:MM tomorrow; interval schedules advance by interval_seconds.
export async function claimDueAndReschedule(now: Date, limit = 25): Promise<ScheduledMessage[]> {
  const res = await pool.query<Row>(
    `WITH due AS (
       SELECT id FROM panda.scheduled_messages
        WHERE next_run_at <= $1
        ORDER BY next_run_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
     )
     UPDATE panda.scheduled_messages s
        SET next_run_at = CASE
              WHEN schedule_kind = 'every'
                THEN s.next_run_at + (s.interval_seconds || ' seconds')::interval
              WHEN schedule_kind = 'daily'
                THEN s.next_run_at + interval '1 day'
              ELSE s.next_run_at
            END
       FROM due
      WHERE s.id = due.id
       RETURNING s.id, s.server_id, s.channel_id, s.message, s.schedule_kind,
                 s.interval_seconds, s.daily_time, s.next_run_at, s.created_by, s.created_at`,
    [now, limit],
  );
  return res.rows.map(rowToSched);
}
