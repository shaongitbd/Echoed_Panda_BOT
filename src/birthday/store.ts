import { pool } from '../db/pool.js';

export interface Birthday {
  userId: string;
  month: number;
  day: number;
  year: number | null;
}

export async function setBirthday(
  serverId: string,
  userId: string,
  month: number,
  day: number,
  year: number | null,
): Promise<void> {
  await pool.query(
    `INSERT INTO panda.birthdays (server_id, user_id, birth_month, birth_day, birth_year)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (server_id, user_id) DO UPDATE
       SET birth_month = EXCLUDED.birth_month,
           birth_day   = EXCLUDED.birth_day,
           birth_year  = EXCLUDED.birth_year`,
    [serverId, userId, month, day, year],
  );
}

export async function removeBirthday(serverId: string, userId: string): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM panda.birthdays WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId],
  );
  return (res.rowCount ?? 0) > 0;
}

export async function getBirthday(serverId: string, userId: string): Promise<Birthday | null> {
  const res = await pool.query<{ user_id: string; birth_month: number; birth_day: number; birth_year: number | null }>(
    `SELECT user_id, birth_month, birth_day, birth_year
       FROM panda.birthdays WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId],
  );
  const row = res.rows[0];
  return row ? { userId: row.user_id, month: row.birth_month, day: row.birth_day, year: row.birth_year } : null;
}

// Whether `year` has a 29 February.
function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

// Everyone in the server with a birthday on this month/day.
//
// On 1 March in a non-leap year this also returns members born on 29
// February. An exact match meant they were never celebrated three years in
// four — and because the rotation now strips from the recorded holder set
// rather than from a re-derived date, including them here can't leave the
// role stuck on them afterwards.
export async function birthdaysOn(
  serverId: string,
  month: number,
  day: number,
  year: number = new Date().getUTCFullYear(),
): Promise<string[]> {
  const includeLeapDay = month === 3 && day === 1 && !isLeapYear(year);
  if (includeLeapDay) {
    const res = await pool.query<{ user_id: string }>(
      `SELECT user_id FROM panda.birthdays
        WHERE server_id = $1
          AND ((birth_month = $2 AND birth_day = $3)
            OR (birth_month = 2 AND birth_day = 29))`,
      [serverId, month, day],
    );
    return res.rows.map((r) => r.user_id);
  }
  const res = await pool.query<{ user_id: string }>(
    `SELECT user_id FROM panda.birthdays
      WHERE server_id = $1 AND birth_month = $2 AND birth_day = $3`,
    [serverId, month, day],
  );
  return res.rows.map((r) => r.user_id);
}

// Upcoming birthdays ordered by how many days away they are (wraps the year),
// computed relative to the given UTC month/day.
export async function upcoming(
  serverId: string,
  fromMonth: number,
  fromDay: number,
  limit = 10,
): Promise<Array<Birthday & { daysAway: number }>> {
  const res = await pool.query<{ user_id: string; birth_month: number; birth_day: number; birth_year: number | null }>(
    `SELECT user_id, birth_month, birth_day, birth_year FROM panda.birthdays WHERE server_id = $1`,
    [serverId],
  );
  // "Day of year" ordinal using a fixed non-leap reference so ordering is
  // stable; good enough for a friendly upcoming list.
  const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const ord = (m: number, d: number): number => CUM[m - 1]! + d;
  const today = ord(fromMonth, fromDay);
  return res.rows
    .map((r) => {
      const o = ord(r.birth_month, r.birth_day);
      const daysAway = (o - today + 365) % 365;
      return { userId: r.user_id, month: r.birth_month, day: r.birth_day, year: r.birth_year, daysAway };
    })
    .sort((a, b) => a.daysAway - b.daysAway)
    .slice(0, limit);
}

export interface BirthdayConfig {
  serverId: string;
  channelId: string | null;
  enabled: boolean;
  dailyTime: string;
  roleId: string | null;
  message: string | null;
  nextRunAt: Date | null;
}

interface ConfigRow {
  server_id: string;
  channel_id: string | null;
  enabled: boolean;
  daily_time: string;
  role_id: string | null;
  message: string | null;
  next_run_at: Date | null;
}

function rowToConfig(row: ConfigRow): BirthdayConfig {
  return {
    serverId: row.server_id,
    channelId: row.channel_id,
    enabled: row.enabled,
    dailyTime: row.daily_time,
    roleId: row.role_id,
    message: row.message,
    nextRunAt: row.next_run_at,
  };
}

const DEFAULT_CONFIG = (serverId: string): BirthdayConfig => ({
  serverId,
  channelId: null,
  enabled: false,
  dailyTime: '09:00',
  roleId: null,
  message: null,
  nextRunAt: null,
});

export async function getBirthdayConfig(serverId: string): Promise<BirthdayConfig> {
  const res = await pool.query<ConfigRow>(
    `SELECT server_id, channel_id, enabled, daily_time, role_id, message, next_run_at
       FROM panda.birthday_config WHERE server_id = $1`,
    [serverId],
  );
  const row = res.rows[0];
  return row ? rowToConfig(row) : DEFAULT_CONFIG(serverId);
}

export interface BirthdayConfigPatch {
  channelId?: string;
  enabled?: boolean;
  dailyTime?: string;
  roleId?: string | null;
  message?: string | null;
  nextRunAt?: Date | null;
}

const FIELD_TO_COLUMN: Record<keyof BirthdayConfigPatch, string> = {
  channelId: 'channel_id',
  enabled: 'enabled',
  dailyTime: 'daily_time',
  roleId: 'role_id',
  message: 'message',
  nextRunAt: 'next_run_at',
};

export async function setBirthdayConfig(
  serverId: string,
  patch: BirthdayConfigPatch,
): Promise<BirthdayConfig> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined) as [
    keyof BirthdayConfigPatch,
    unknown,
  ][];
  if (entries.length === 0) return getBirthdayConfig(serverId);

  const cols = entries.map(([k]) => FIELD_TO_COLUMN[k]);
  const placeholders = entries.map((_, i) => `$${i + 2}`);
  const values = entries.map(([, v]) => v);
  const updates = cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ');

  const res = await pool.query<ConfigRow>(
    `INSERT INTO panda.birthday_config (server_id, ${cols.join(', ')}, updated_at)
     VALUES ($1, ${placeholders.join(', ')}, now())
     ON CONFLICT (server_id) DO UPDATE SET ${updates}, updated_at = now()
     RETURNING server_id, channel_id, enabled, daily_time, role_id, message, next_run_at`,
    [serverId, ...values],
  );
  return rowToConfig(res.rows[0]!);
}

// Claim due birthday configs + advance one day atomically.
export async function claimDueBirthdayConfigs(now: Date, limit = 25): Promise<BirthdayConfig[]> {
  const res = await pool.query<ConfigRow>(
    `WITH due AS (
       SELECT server_id FROM panda.birthday_config
        WHERE enabled = TRUE AND channel_id IS NOT NULL
          AND next_run_at IS NOT NULL AND next_run_at <= $1
        ORDER BY next_run_at ASC
        LIMIT $2
        FOR UPDATE SKIP LOCKED
     )
     UPDATE panda.birthday_config c
        SET next_run_at = c.next_run_at
              + (FLOOR(EXTRACT(EPOCH FROM ($1 - c.next_run_at)) / 86400) + 1) * interval '24 hours',
            updated_at = now()
       FROM due
      WHERE c.server_id = due.server_id
      RETURNING c.server_id, c.channel_id, c.enabled, c.daily_time, c.role_id, c.message, c.next_run_at`,
    [now, limit],
  );
  return res.rows.map(rowToConfig);
}

// ─── Birthday-role bookkeeping ───────────────────────────────────────────
//
// The rotation needs to know who is actually wearing the role, not who we
// would infer should be wearing it. Inferring it from "whose birthday was
// yesterday" breaks the moment anything changes in between — an edited or
// removed birthday, a failed removal, a day the bot missed, or an admin
// switching the configured role — and each of those left somebody wearing
// it forever.

export interface BirthdayRoleHolder {
  userId: string;
  roleId: string;
}

export async function listBirthdayRoleHolders(
  serverId: string,
): Promise<BirthdayRoleHolder[]> {
  const res = await pool.query<{ user_id: string; role_id: string }>(
    `SELECT user_id, role_id FROM panda.birthday_role_holders WHERE server_id = $1`,
    [serverId],
  );
  return res.rows.map((r) => ({ userId: r.user_id, roleId: r.role_id }));
}

export async function recordBirthdayRoleHolder(
  serverId: string,
  userId: string,
  roleId: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO panda.birthday_role_holders (server_id, user_id, role_id, granted_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (server_id, user_id) DO UPDATE
       SET role_id = EXCLUDED.role_id, granted_at = now()`,
    [serverId, userId, roleId],
  );
}

// Only called once the removal actually succeeded — otherwise we'd forget
// a role we never took off, which is the failure this table exists to stop.
export async function clearBirthdayRoleHolder(
  serverId: string,
  userId: string,
): Promise<void> {
  await pool.query(
    `DELETE FROM panda.birthday_role_holders WHERE server_id = $1 AND user_id = $2`,
    [serverId, userId],
  );
}
