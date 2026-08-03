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

// Spread over this window when a daily time was chosen for the server
// rather than by it.
const JITTER_WINDOW_MS = 45 * 60_000;

// Stable per-server offset in [0, JITTER_WINDOW_MS).
//
// Auto-setup gives every server the same default times, so without this
// they all come due in the same second and the batch-limited daily
// branches drain them over many minutes — the last server posting long
// after its stated time. Derived from the server ID so it's stable across
// restarts and doesn't need storing.
function jitterFor(serverId: string): number {
  let h = 2166136261;
  for (let i = 0; i < serverId.length; i++) {
    h ^= serverId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % JITTER_WINDOW_MS;
}

// Like nextDailyRun, but nudged by a stable per-server offset. Use this
// for times the bot picked; use nextDailyRun for a time an admin typed,
// where the exact minute is the point.
export function nextDailyRunJittered(
  serverId: string,
  hh: number,
  mm: number,
  from: Date = new Date(),
): Date {
  const base = nextDailyRun(hh, mm, from);
  return new Date(base.getTime() + jitterFor(serverId));
}
