import type { EchoedClient } from '../client/echoedClient.js';
import type { PermissionService } from '../auth/permissions.js';
import { pool } from '../db/pool.js';
import { log } from '../log.js';
import { countWarnings } from './warnings.js';
import { postModAction } from './modlog.js';
import { isShielded } from './authority.js';
import { formatDuration, MAX_TIMEOUT_SECONDS } from './duration.js';

// Warning escalation: "at 3 warnings, time out for 1h; at 5, kick". See
// migrate.ts 'warn_escalations table'. Runs after every warning — a
// moderator's `!warn` and auto-mod's alike — against the member's total.

export type EscalationAction = 'timeout' | 'kick' | 'ban';

export interface EscalationRule {
  warnCount: number;
  action: EscalationAction;
  durationSeconds: number | null;
}

export const MAX_RULES = 10;
export const MAX_WARN_COUNT = 100;

export async function listEscalations(serverId: string): Promise<EscalationRule[]> {
  const res = await pool.query<{ warn_count: number; action: EscalationAction; duration_seconds: number | null }>(
    `SELECT warn_count, action, duration_seconds FROM panda.warn_escalations
      WHERE server_id = $1 ORDER BY warn_count`,
    [serverId],
  );
  return res.rows.map((r) => ({
    warnCount: r.warn_count,
    action: r.action,
    durationSeconds: r.duration_seconds,
  }));
}

export async function setEscalation(serverId: string, rule: EscalationRule): Promise<void> {
  await pool.query(
    `INSERT INTO panda.warn_escalations (server_id, warn_count, action, duration_seconds)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (server_id, warn_count) DO UPDATE
       SET action = EXCLUDED.action, duration_seconds = EXCLUDED.duration_seconds`,
    [serverId, rule.warnCount, rule.action, rule.action === 'timeout' ? rule.durationSeconds : null],
  );
}

export async function removeEscalation(serverId: string, warnCount: number): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM panda.warn_escalations WHERE server_id = $1 AND warn_count = $2`,
    [serverId, warnCount],
  );
  return (res.rowCount ?? 0) > 0;
}

export function describeRule(rule: EscalationRule): string {
  const what =
    rule.action === 'timeout'
      ? `time out for ${formatDuration(Math.min(rule.durationSeconds ?? 3600, MAX_TIMEOUT_SECONDS))}`
      : rule.action;
  return `${rule.warnCount} warning${rule.warnCount === 1 ? '' : 's'} → ${what}`;
}

// After a member receives a warning: if their total now lands exactly on a
// rule, carry it out as the bot and record it as a case. Returns a short
// line to post where the warning was given, or null when nothing happened.
//
// Never touches an admin or a protected/moderator-role holder — escalation
// is the bot acting on its own, so it gets no more reach than a moderator.
export async function applyEscalation(
  api: EchoedClient,
  perms: PermissionService,
  botUserId: string,
  serverId: string,
  userId: string,
  // The warning just given. Its position decides the rule (see
  // countWarnings) — without it, the current total.
  warningId?: number,
): Promise<string | null> {
  const rules = await listEscalations(serverId);
  if (rules.length === 0) return null;
  const total = await countWarnings(serverId, userId, warningId);
  const rule = rules.find((r) => r.warnCount === total);
  if (!rule) return null;

  if (await isShielded(api, perms, serverId, userId)) {
    log.info({ serverId, userId, total }, 'Escalation skipped — member is protected');
    return null;
  }

  const reason = `Reached ${total} warning${total === 1 ? '' : 's'}`;
  try {
    if (rule.action === 'timeout') {
      const seconds = Math.min(rule.durationSeconds ?? 3600, MAX_TIMEOUT_SECONDS);
      await api.timeoutMember(serverId, userId, seconds, reason);
      await postModAction(api, {
        serverId, action: 'timeout', targetId: userId, actorId: botUserId, reason,
        extra: formatDuration(seconds),
      });
      return `🔇 <@${userId}> reached ${total} warnings and is timed out for **${formatDuration(seconds)}**.`;
    }
    if (rule.action === 'kick') {
      await api.kickMember(serverId, userId, reason);
      await postModAction(api, { serverId, action: 'kick', targetId: userId, actorId: botUserId, reason });
      return `👢 <@${userId}> reached ${total} warnings and was kicked.`;
    }
    await api.banMember(serverId, userId, reason);
    await postModAction(api, { serverId, action: 'ban', targetId: userId, actorId: botUserId, reason });
    return `🔨 <@${userId}> reached ${total} warnings and was banned.`;
  } catch (err) {
    log.warn({ err, serverId, userId, action: rule.action }, 'Escalation action failed');
    return `Tried to ${rule.action} <@${userId}> for reaching ${total} warnings, but it failed — check my permissions.`;
  }
}
