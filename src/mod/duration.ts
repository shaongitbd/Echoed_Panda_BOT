// Parse human duration shorthand into seconds.
//
// Accepted forms:
//   "30s"        →  30
//   "5m"         →  300
//   "2h"         →  7200
//   "1d"         →  86400
//   "1w"         →  604800
//   "1h30m"      →  5400         (multi-component; whitespace optional)
//   "30"         →  30           (bare number = seconds)
//
// Anything we can't parse returns null so callers can show a usage hint.
// Multi-component values are summed; ordering is irrelevant ("5m1h" works).

const UNIT_TO_SECONDS: Record<string, number> = {
  s: 1,
  m: 60,
  h: 60 * 60,
  d: 24 * 60 * 60,
  w: 7 * 24 * 60 * 60,
};

const COMPONENT_RE = /(\d+)\s*([smhdw])/gi;
const PURE_NUMBER_RE = /^\d+$/;

export function parseDuration(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;

  if (PURE_NUMBER_RE.test(trimmed)) {
    const seconds = Number(trimmed);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  }

  let total = 0;
  let matched = false;
  // Reset regex state on every call — `g` flag without manual reset
  // would leak `lastIndex` between invocations.
  COMPONENT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = COMPONENT_RE.exec(trimmed)) !== null) {
    matched = true;
    const value = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(value) || !unit) return null;
    const factor = UNIT_TO_SECONDS[unit];
    if (!factor) return null;
    total += value * factor;
  }

  return matched && total > 0 ? total : null;
}

// Render seconds back to a human-friendly string. Used in mod-log and
// confirmation messages so the bot shows what it actually applied
// (after the 28d cap).
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes && !days) parts.push(`${minutes}m`);
  return parts.join(' ') || '0s';
}

// 28-day cap on timeouts. Anything longer should be a ban.
export const MAX_TIMEOUT_SECONDS = 28 * 24 * 60 * 60;
