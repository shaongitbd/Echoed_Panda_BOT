import { pool } from '../db/pool.js';
import { DEFAULT_QUESTIONS } from './defaults.js';

export interface QotdConfig {
  serverId: string;
  channelId: string | null;
  enabled: boolean;
  dailyTime: string; // 'HH:MM' UTC
  nextRunAt: Date | null;
  lastQuestion: string | null;
}

interface ConfigRow {
  server_id: string;
  channel_id: string | null;
  enabled: boolean;
  daily_time: string;
  next_run_at: Date | null;
  last_question: string | null;
}

function rowToConfig(row: ConfigRow): QotdConfig {
  return {
    serverId: row.server_id,
    channelId: row.channel_id,
    enabled: row.enabled,
    dailyTime: row.daily_time,
    nextRunAt: row.next_run_at,
    lastQuestion: row.last_question,
  };
}

const DEFAULT_CONFIG = (serverId: string): QotdConfig => ({
  serverId,
  channelId: null,
  enabled: false,
  dailyTime: '12:00',
  nextRunAt: null,
  lastQuestion: null,
});

export async function getQotdConfig(serverId: string): Promise<QotdConfig> {
  const res = await pool.query<ConfigRow>(
    `SELECT server_id, channel_id, enabled, daily_time, next_run_at, last_question
       FROM panda.qotd_config WHERE server_id = $1`,
    [serverId],
  );
  const row = res.rows[0];
  return row ? rowToConfig(row) : DEFAULT_CONFIG(serverId);
}

export interface QotdConfigPatch {
  channelId?: string;
  enabled?: boolean;
  dailyTime?: string;
  nextRunAt?: Date | null;
  lastQuestion?: string | null;
}

const FIELD_TO_COLUMN: Record<keyof QotdConfigPatch, string> = {
  channelId: 'channel_id',
  enabled: 'enabled',
  dailyTime: 'daily_time',
  nextRunAt: 'next_run_at',
  lastQuestion: 'last_question',
};

// Partial upsert — only the columns present in `patch` are written, so a
// `enabled` toggle never clobbers the channel/time and vice versa.
export async function setQotdConfig(
  serverId: string,
  patch: QotdConfigPatch,
): Promise<QotdConfig> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined) as [
    keyof QotdConfigPatch,
    unknown,
  ][];
  if (entries.length === 0) return getQotdConfig(serverId);

  const cols = entries.map(([k]) => FIELD_TO_COLUMN[k]);
  const placeholders = entries.map((_, i) => `$${i + 2}`);
  const values = entries.map(([, v]) => v);
  const updates = cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ');

  const res = await pool.query<ConfigRow>(
    `INSERT INTO panda.qotd_config (server_id, ${cols.join(', ')}, updated_at)
     VALUES ($1, ${placeholders.join(', ')}, now())
     ON CONFLICT (server_id) DO UPDATE SET ${updates}, updated_at = now()
     RETURNING server_id, channel_id, enabled, daily_time, next_run_at, last_question`,
    [serverId, ...values],
  );
  return rowToConfig(res.rows[0]!);
}

export interface QotdQuestion {
  id: number;
  question: string;
}

export async function addQuestion(
  serverId: string,
  question: string,
  createdBy: string,
): Promise<QotdQuestion> {
  const res = await pool.query<{ id: string; question: string }>(
    `INSERT INTO panda.qotd_questions (server_id, question, created_by)
     VALUES ($1, $2, $3) RETURNING id, question`,
    [serverId, question, createdBy],
  );
  const row = res.rows[0]!;
  return { id: Number(row.id), question: row.question };
}

export async function removeQuestion(serverId: string, id: number): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM panda.qotd_questions WHERE server_id = $1 AND id = $2`,
    [serverId, id],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function listQuestions(serverId: string): Promise<QotdQuestion[]> {
  const res = await pool.query<{ id: string; question: string }>(
    `SELECT id, question FROM panda.qotd_questions
      WHERE server_id = $1 ORDER BY id ASC`,
    [serverId],
  );
  return res.rows.map((r) => ({ id: Number(r.id), question: r.question }));
}

// Pick a question to post for a server: prefer the custom bank, fall back to
// the built-in defaults. Avoids repeating `avoid` (the last asked) when more
// than one option exists. Pure selection — caller persists last_question.
export async function pickQuestion(serverId: string, avoid: string | null): Promise<string> {
  const custom = await listQuestions(serverId);
  const pool_: string[] = custom.length > 0 ? custom.map((q) => q.question) : [...DEFAULT_QUESTIONS];
  const candidates = pool_.length > 1 && avoid ? pool_.filter((q) => q !== avoid) : pool_;
  const list = candidates.length > 0 ? candidates : pool_;
  return list[Math.floor(Math.random() * list.length)]!;
}

// Claim due QOTD configs and advance their cursor by one day atomically, so
// concurrent ticks can't double-post. Returns the rows that were due.
export async function claimDueQotd(now: Date, limit = 25): Promise<QotdConfig[]> {
  const res = await pool.query<ConfigRow>(
    `WITH due AS (
       SELECT server_id FROM panda.qotd_config
        WHERE enabled = TRUE AND channel_id IS NOT NULL
          AND next_run_at IS NOT NULL AND next_run_at <= $1
        ORDER BY next_run_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
     )
     UPDATE panda.qotd_config c
        SET next_run_at = c.next_run_at
              + (FLOOR(EXTRACT(EPOCH FROM ($1 - c.next_run_at)) / 86400) + 1) * interval '24 hours',
            updated_at = now()
       FROM due
      WHERE c.server_id = due.server_id
      RETURNING c.server_id, c.channel_id, c.enabled, c.daily_time, c.next_run_at, c.last_question`,
    [now, limit],
  );
  return res.rows.map(rowToConfig);
}
