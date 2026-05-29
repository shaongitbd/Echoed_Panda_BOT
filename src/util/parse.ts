// Shared argument parsers + daily-schedule math used by the engagement
// commands (QOTD, birthdays, starboard, counting). Kept in one place so the
// channel/role-mention syntax and the "next HH:MM UTC" computation stay
// consistent across features.

const CHANNEL_MENTION_RE = /^<#(?<id>[a-zA-Z0-9_-]+)>$/;
const ROLE_MENTION_RE = /^<@&(?<id>[a-zA-Z0-9_-]+)>$/;
const BARE_ID_RE = /^[a-zA-Z0-9_-]{8,}$/;

// Accepts `<#id>` or a bare id. Returns null if neither.
export function parseChannelId(arg: string | undefined): string | null {
  if (!arg) return null;
  const m = CHANNEL_MENTION_RE.exec(arg);
  if (m?.groups?.id) return m.groups.id;
  if (BARE_ID_RE.test(arg)) return arg;
  return null;
}

// Accepts `<@&id>` or a bare id. Returns null if neither.
export function parseRoleId(arg: string | undefined): string | null {
  if (!arg) return null;
  const m = ROLE_MENTION_RE.exec(arg);
  if (m?.groups?.id) return m.groups.id;
  if (BARE_ID_RE.test(arg)) return arg;
  return null;
}

export const DAILY_TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

// Parse `HH:MM` (24h). Returns {hh,mm} or null.
export function parseDailyTime(arg: string | undefined): { hh: number; mm: number } | null {
  if (!arg) return null;
  const m = DAILY_TIME_RE.exec(arg);
  if (!m) return null;
  return { hh: parseInt(m[1]!, 10), mm: parseInt(m[2]!, 10) };
}

// First fire time for a daily HH:MM (UTC). If the time already passed today,
// schedules for tomorrow. Stored in UTC — per-server timezones are a later
// polish, mirroring the existing scheduled-messages behavior.
export function nextDailyRun(hh: number, mm: number, from: Date = new Date()): Date {
  const next = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate(), hh, mm, 0, 0),
  );
  if (next.getTime() <= from.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}
