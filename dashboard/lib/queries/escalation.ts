import { pool } from '../db';

// Warning escalation rules — mirror of the bot's src/mod/escalation.ts and
// the warn_escalations table. "At N warnings, time out / kick / ban."

export type EscalationAction = 'timeout' | 'kick' | 'ban';

export interface EscalationRule {
  warnCount: number;
  action: EscalationAction;
  durationSeconds: number | null;
}

export const MAX_RULES = 10;
export const MAX_WARN_COUNT = 100;
// The platform's own timeout ceiling.
export const MAX_TIMEOUT_SECONDS = 28 * 24 * 60 * 60;

export async function listEscalations(serverId: string): Promise<EscalationRule[]> {
  const res = await pool.query<{ warn_count: number; action: EscalationAction; duration_seconds: number | null }>(
    `SELECT warn_count, action, duration_seconds FROM warn_escalations
      WHERE server_id = $1 ORDER BY warn_count`,
    [serverId],
  );
  return res.rows.map((r) => ({
    warnCount: r.warn_count,
    action: r.action,
    durationSeconds: r.duration_seconds,
  }));
}

// The form edits the whole list, so saving replaces it — in one transaction,
// so the bot never reads a half-saved set.
export async function replaceEscalations(serverId: string, rules: EscalationRule[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM warn_escalations WHERE server_id = $1', [serverId]);
    for (const r of rules) {
      await client.query(
        `INSERT INTO warn_escalations (server_id, warn_count, action, duration_seconds)
         VALUES ($1, $2, $3, $4)`,
        [serverId, r.warnCount, r.action, r.action === 'timeout' ? r.durationSeconds : null],
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

// Same shorthand the bot's `!timeout` takes: 30s, 10m, 1h30m, 1d, 1w; a bare
// number is seconds.
const UNIT_TO_SECONDS: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };

export function parseDuration(input: string): number | null {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed);
    return n > 0 ? n : null;
  }
  let total = 0;
  let matched = false;
  for (const m of trimmed.matchAll(/(\d+)\s*([smhdw])/g)) {
    matched = true;
    total += Number(m[1]) * (UNIT_TO_SECONDS[m[2]!] ?? 0);
  }
  return matched && total > 0 ? total : null;
}

export function formatDuration(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (m && !d) parts.push(`${m}m`);
  return parts.join('') || `${seconds}s`;
}
