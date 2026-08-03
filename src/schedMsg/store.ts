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
// concurrent ticks can't double-fire.
//
// The next run is computed by skipping however many whole periods have
// already elapsed, so it always lands strictly in the future. Advancing by
// exactly one period instead would leave a backlogged row still due: after
// an outage it would sit at the head of the queue and re-fire once per tick
// until it caught up, which for a short interval is hours of the same
// message repeating. Catching up means a missed window is skipped rather
// than replayed.
//
// Interval arithmetic is in seconds, and the daily case uses 24 hours
// rather than a calendar day, so neither shifts under a DST transition in
// whatever timezone the session happens to be in.
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
              WHEN s.schedule_kind = 'every'
                THEN s.next_run_at
                   + (FLOOR(
                        EXTRACT(EPOCH FROM ($1 - s.next_run_at))
                        / GREATEST(COALESCE(s.interval_seconds, 0), 1)
                      ) + 1)
                   * (GREATEST(COALESCE(s.interval_seconds, 0), 1) || ' seconds')::interval
              WHEN s.schedule_kind = 'daily'
                THEN s.next_run_at
                   + (FLOOR(EXTRACT(EPOCH FROM ($1 - s.next_run_at)) / 86400) + 1)
                   * interval '24 hours'
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
