import 'server-only';
import { pool } from '../db';

// Dashboard side of four features that were command-only: question of the
// day, birthdays, starboard and counting. Mirrors the bot's stores
// (src/qotd, src/birthday, src/starboard, src/counting) and its commands'
// limits, so the dashboard and `!qotd …` / `!birthday …` / `!starboard …` /
// `!counting …` stay interchangeable.

// ── Daily times (UTC), exactly as the bot computes them ────────────────────

const DAILY_TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

/** `HH:MM` (24h) → normalised `HH:MM`, or null. */
export function normaliseDailyTime(raw: string): string | null {
  const m = DAILY_TIME_RE.exec(raw.trim());
  if (!m) return null;
  return `${m[1]!.padStart(2, '0')}:${m[2]}`;
}

/** First fire time for a daily HH:MM in UTC — the bot's util/parse.ts nextDailyRun. */
export function nextDailyRun(time: string, from: Date = new Date()): Date {
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  const next = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), hh, mm, 0, 0));
  if (next.getTime() <= from.getTime()) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

// ── Question of the day ────────────────────────────────────────────────────

export const MAX_QUESTION_LEN = 500;

export interface QotdView {
  enabled: boolean;
  channelId: string | null;
  dailyTime: string;
  nextRunAt: Date | null;
}

export async function getQotd(serverId: string): Promise<QotdView> {
  const res = await pool.query<{ enabled: boolean; channel_id: string | null; daily_time: string; next_run_at: Date | null }>(
    `SELECT enabled, channel_id, daily_time, next_run_at FROM qotd_config WHERE server_id = $1`,
    [serverId],
  );
  const r = res.rows[0];
  return r
    ? { enabled: r.enabled, channelId: r.channel_id, dailyTime: r.daily_time, nextRunAt: r.next_run_at }
    : { enabled: false, channelId: null, dailyTime: '12:00', nextRunAt: null };
}

export async function saveQotd(serverId: string, v: { enabled: boolean; channelId: string | null; dailyTime: string }): Promise<void> {
  // A schedule only exists while it's on and has somewhere to post.
  const next = v.enabled && v.channelId ? nextDailyRun(v.dailyTime) : null;
  await pool.query(
    `INSERT INTO qotd_config (server_id, enabled, channel_id, daily_time, next_run_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (server_id) DO UPDATE SET
       enabled = EXCLUDED.enabled, channel_id = EXCLUDED.channel_id,
       daily_time = EXCLUDED.daily_time, next_run_at = EXCLUDED.next_run_at, updated_at = now()`,
    [serverId, v.enabled, v.channelId, v.dailyTime, next],
  );
}

export interface QotdQuestion { id: number; question: string }

export async function listQotdQuestions(serverId: string): Promise<QotdQuestion[]> {
  const res = await pool.query<{ id: string; question: string }>(
    `SELECT id::TEXT, question FROM qotd_questions WHERE server_id = $1 ORDER BY id DESC LIMIT 200`,
    [serverId],
  );
  return res.rows.map((r) => ({ id: Number(r.id), question: r.question }));
}

export async function addQotdQuestion(serverId: string, question: string, createdBy: string): Promise<void> {
  await pool.query(
    `INSERT INTO qotd_questions (server_id, question, created_by) VALUES ($1, $2, $3)`,
    [serverId, question.slice(0, MAX_QUESTION_LEN), createdBy],
  );
}

export async function removeQotdQuestion(serverId: string, id: number): Promise<void> {
  await pool.query(`DELETE FROM qotd_questions WHERE server_id = $1 AND id = $2`, [serverId, id]);
}

// ── Birthdays ──────────────────────────────────────────────────────────────

export const MAX_BIRTHDAY_MESSAGE = 500;

export interface BirthdayView {
  enabled: boolean;
  channelId: string | null;
  dailyTime: string;
  roleId: string | null;
  message: string | null;
  nextRunAt: Date | null;
  registered: number;
}

export async function getBirthdays(serverId: string): Promise<BirthdayView> {
  const [cfg, count] = await Promise.all([
    pool.query<{ enabled: boolean; channel_id: string | null; daily_time: string; role_id: string | null; message: string | null; next_run_at: Date | null }>(
      `SELECT enabled, channel_id, daily_time, role_id, message, next_run_at FROM birthday_config WHERE server_id = $1`,
      [serverId],
    ),
    pool.query<{ n: string }>(`SELECT COUNT(*)::TEXT AS n FROM birthdays WHERE server_id = $1`, [serverId]),
  ]);
  const r = cfg.rows[0];
  const registered = Number(count.rows[0]?.n ?? 0);
  return r
    ? { enabled: r.enabled, channelId: r.channel_id, dailyTime: r.daily_time, roleId: r.role_id, message: r.message, nextRunAt: r.next_run_at, registered }
    : { enabled: false, channelId: null, dailyTime: '09:00', roleId: null, message: null, nextRunAt: null, registered };
}

export async function saveBirthdays(
  serverId: string,
  v: { enabled: boolean; channelId: string | null; dailyTime: string; roleId: string | null; message: string | null },
): Promise<void> {
  const next = v.enabled && v.channelId ? nextDailyRun(v.dailyTime) : null;
  await pool.query(
    `INSERT INTO birthday_config (server_id, enabled, channel_id, daily_time, role_id, message, next_run_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (server_id) DO UPDATE SET
       enabled = EXCLUDED.enabled, channel_id = EXCLUDED.channel_id, daily_time = EXCLUDED.daily_time,
       role_id = EXCLUDED.role_id, message = EXCLUDED.message, next_run_at = EXCLUDED.next_run_at, updated_at = now()`,
    [serverId, v.enabled, v.channelId, v.dailyTime, v.roleId, v.message, next],
  );
}

// ── Starboard ──────────────────────────────────────────────────────────────

export interface StarboardView {
  enabled: boolean;
  channelId: string | null;
  emoji: string;
  threshold: number;
}

export async function getStarboard(serverId: string): Promise<StarboardView> {
  const res = await pool.query<{ enabled: boolean; channel_id: string | null; emoji: string; threshold: number }>(
    `SELECT enabled, channel_id, emoji, threshold FROM starboard_config WHERE server_id = $1`,
    [serverId],
  );
  const r = res.rows[0];
  return r
    ? { enabled: r.enabled, channelId: r.channel_id, emoji: r.emoji, threshold: r.threshold }
    : { enabled: false, channelId: null, emoji: '⭐', threshold: 3 };
}

export async function saveStarboard(serverId: string, v: StarboardView): Promise<void> {
  await pool.query(
    `INSERT INTO starboard_config (server_id, enabled, channel_id, emoji, threshold, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (server_id) DO UPDATE SET
       enabled = EXCLUDED.enabled, channel_id = EXCLUDED.channel_id,
       emoji = EXCLUDED.emoji, threshold = EXCLUDED.threshold, updated_at = now()`,
    [serverId, v.enabled, v.channelId, v.emoji, v.threshold],
  );
}

// ── Counting ───────────────────────────────────────────────────────────────

export interface CountingView {
  enabled: boolean;
  channelId: string | null;
  resetOnFail: boolean;
  currentCount: number;
  highScore: number;
}

export async function getCounting(serverId: string): Promise<CountingView> {
  const res = await pool.query<{ enabled: boolean; channel_id: string | null; reset_on_fail: boolean; current_count: number; high_score: number }>(
    `SELECT enabled, channel_id, reset_on_fail, current_count, high_score FROM counting_config WHERE server_id = $1`,
    [serverId],
  );
  const r = res.rows[0];
  return r
    ? { enabled: r.enabled, channelId: r.channel_id, resetOnFail: r.reset_on_fail, currentCount: r.current_count, highScore: r.high_score }
    : { enabled: false, channelId: null, resetOnFail: true, currentCount: 0, highScore: 0 };
}

export async function saveCounting(serverId: string, v: { enabled: boolean; channelId: string | null; resetOnFail: boolean }): Promise<void> {
  await pool.query(
    `INSERT INTO counting_config (server_id, enabled, channel_id, reset_on_fail, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (server_id) DO UPDATE SET
       enabled = EXCLUDED.enabled, channel_id = EXCLUDED.channel_id,
       reset_on_fail = EXCLUDED.reset_on_fail, updated_at = now()`,
    [serverId, v.enabled, v.channelId, v.resetOnFail],
  );
}

/** Start the chain over from 0 (the high score stays) — `!counting reset`. */
export async function resetCounting(serverId: string): Promise<void> {
  await pool.query(
    `UPDATE counting_config SET current_count = 0, last_user_id = NULL, updated_at = now() WHERE server_id = $1`,
    [serverId],
  );
}
