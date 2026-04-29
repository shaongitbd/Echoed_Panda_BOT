import { pool } from '../db';

export type ScheduleKind = 'every' | 'daily';

export interface ScheduledMessage {
  id: number;
  channelId: string;
  message: string;
  kind: ScheduleKind;
  intervalSeconds: number | null;
  dailyTime: string | null;
  nextRunAt: Date;
  createdBy: string;
}

interface Row {
  id: string;
  channel_id: string;
  message: string;
  schedule_kind: string;
  interval_seconds: number | null;
  daily_time: string | null;
  next_run_at: Date;
  created_by: string;
}

function rowToSched(row: Row): ScheduledMessage {
  const kind = row.schedule_kind === 'daily' ? 'daily' : 'every';
  return {
    id: Number(row.id),
    channelId: row.channel_id,
    message: row.message,
    kind,
    intervalSeconds: row.interval_seconds,
    dailyTime: row.daily_time,
    nextRunAt: row.next_run_at,
    createdBy: row.created_by,
  };
}

export async function listForServer(serverId: string): Promise<ScheduledMessage[]> {
  const res = await pool.query<Row>(
    `SELECT id, channel_id, message, schedule_kind,
            interval_seconds, daily_time, next_run_at, created_by
       FROM scheduled_messages
      WHERE server_id = $1
      ORDER BY next_run_at ASC`,
    [serverId],
  );
  return res.rows.map(rowToSched);
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
}): Promise<void> {
  await pool.query(
    `INSERT INTO scheduled_messages
       (server_id, channel_id, message, schedule_kind, interval_seconds, daily_time, next_run_at, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
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
}

export async function removeSchedule(serverId: string, id: number): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM scheduled_messages WHERE server_id = $1 AND id = $2`,
    [serverId, id],
  );
  return (res.rowCount ?? 0) > 0;
}
