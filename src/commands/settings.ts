import { pool } from '../db/pool.js';
import { registerTtlCache } from '../util/ttlCache.js';

// Per-command permissions (MEE6's "command settings"). See the
// command_settings migration for the scope model: '*' for every command,
// 'category:<name>' for a help category, or one command's canonical name.

export interface CommandRule {
  scope: string;
  enabled: boolean;
  allowedChannelIds: string[];
  ignoredChannelIds: string[];
  allowedRoleIds: string[];
  ignoredRoleIds: string[];
  // null = the bot's default per-user cooldown.
  cooldownSeconds: number | null;
  deleteInvocation: boolean;
}

export const ALL_SCOPE = '*';

// Longest per-command cooldown an admin can set (one hour).
export const MAX_COMMAND_COOLDOWN_SECONDS = 3600;
export const categoryScope = (category: string): string => `category:${category}`;

interface Row {
  scope: string;
  enabled: boolean;
  allowed_channel_ids: string[];
  ignored_channel_ids: string[];
  allowed_role_ids: string[];
  ignored_role_ids: string[];
  cooldown_seconds: number | null;
  delete_invocation: boolean;
}

function rowToRule(row: Row): CommandRule {
  return {
    scope: row.scope,
    enabled: row.enabled,
    allowedChannelIds: row.allowed_channel_ids,
    ignoredChannelIds: row.ignored_channel_ids,
    allowedRoleIds: row.allowed_role_ids,
    ignoredRoleIds: row.ignored_role_ids,
    cooldownSeconds: row.cooldown_seconds,
    deleteInvocation: row.delete_invocation,
  };
}

export function defaultRule(scope: string): CommandRule {
  return {
    scope,
    enabled: true,
    allowedChannelIds: [],
    ignoredChannelIds: [],
    allowedRoleIds: [],
    ignoredRoleIds: [],
    cooldownSeconds: null,
    deleteInvocation: false,
  };
}

// Every command runs through this, so a server's rules are read once and
// cached. The dashboard writes Postgres directly, so its edits land when the
// entry expires — the same one-minute window every other panda setting has.
const TTL_MS = 60 * 1000;
const cache = new Map<string, { rules: Map<string, CommandRule>; expiresAt: number }>();
registerTtlCache('commandSettings', cache, 5_000);

const SELECT = `
  scope, enabled,
  allowed_channel_ids, ignored_channel_ids,
  allowed_role_ids, ignored_role_ids,
  cooldown_seconds, delete_invocation
`;

export async function getCommandRules(serverId: string): Promise<Map<string, CommandRule>> {
  const hit = cache.get(serverId);
  if (hit && hit.expiresAt > Date.now()) return hit.rules;
  const res = await pool.query<Row>(
    `SELECT ${SELECT} FROM panda.command_settings WHERE server_id = $1`,
    [serverId],
  );
  const rules = new Map(res.rows.map((r) => [r.scope, rowToRule(r)]));
  cache.set(serverId, { rules, expiresAt: Date.now() + TTL_MS });
  return rules;
}

export async function getCommandRule(serverId: string, scope: string): Promise<CommandRule> {
  return (await getCommandRules(serverId)).get(scope) ?? defaultRule(scope);
}

type RuleFields = Partial<Omit<CommandRule, 'scope'>>;

const FIELD_TO_COLUMN: Record<keyof RuleFields, string> = {
  enabled: 'enabled',
  allowedChannelIds: 'allowed_channel_ids',
  ignoredChannelIds: 'ignored_channel_ids',
  allowedRoleIds: 'allowed_role_ids',
  ignoredRoleIds: 'ignored_role_ids',
  cooldownSeconds: 'cooldown_seconds',
  deleteInvocation: 'delete_invocation',
};

// Partial upsert: only the fields passed are written.
export async function setCommandRule(
  serverId: string,
  scope: string,
  fields: RuleFields,
): Promise<CommandRule> {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined) as [
    keyof RuleFields,
    CommandRule[keyof RuleFields],
  ][];
  cache.delete(serverId);
  if (entries.length === 0) return getCommandRule(serverId, scope);

  const cols = entries.map(([k]) => FIELD_TO_COLUMN[k]);
  const placeholders = entries.map((_, i) => `$${i + 3}`);
  const updates = cols.map((c) => `${c} = EXCLUDED.${c}`).join(', ');
  const res = await pool.query<Row>(
    `INSERT INTO panda.command_settings (server_id, scope, ${cols.join(', ')})
     VALUES ($1, $2, ${placeholders.join(', ')})
     ON CONFLICT (server_id, scope) DO UPDATE SET ${updates}, updated_at = now()
     RETURNING ${SELECT}`,
    [serverId, scope, ...entries.map(([, v]) => v)],
  );
  cache.delete(serverId);
  const row = res.rows[0];
  if (!row) throw new Error(`command_settings upsert returned no row for ${serverId}/${scope}`);
  return rowToRule(row);
}

export async function resetCommandRule(serverId: string, scope: string): Promise<void> {
  cache.delete(serverId);
  await pool.query(
    'DELETE FROM panda.command_settings WHERE server_id = $1 AND scope = $2',
    [serverId, scope],
  );
  cache.delete(serverId);
}

export type Denial =
  | { kind: 'disabled'; scope: string }
  | { kind: 'channel'; scope: string; allowedChannelIds: string[] }
  | { kind: 'role'; scope: string };

// The rules that apply to a command, broadest first.
export function applicableRules(
  rules: Map<string, CommandRule>,
  command: string,
  category: string | null,
): CommandRule[] {
  const scopes = [ALL_SCOPE, category ? categoryScope(category) : null, command];
  return scopes
    .filter((s): s is string => s !== null)
    .map((s) => rules.get(s))
    .filter((r): r is CommandRule => r !== undefined);
}

// Channel and "disabled" checks need nothing but the rules. Roles are only
// fetched (by the caller) when some applicable rule actually lists a role.
export function checkRules(
  applicable: CommandRule[],
  channelId: string,
  memberRoles: string[] | null,
  isManager: boolean,
): Denial | null {
  for (const r of applicable) {
    if (!r.enabled) return { kind: 'disabled', scope: r.scope };
  }
  // Server managers are never held to channel or role rules — otherwise a
  // rule can lock the only people able to change it out of the command.
  if (isManager) return null;
  for (const r of applicable) {
    if (r.ignoredChannelIds.includes(channelId)) {
      return { kind: 'channel', scope: r.scope, allowedChannelIds: r.allowedChannelIds };
    }
    if (r.allowedChannelIds.length > 0 && !r.allowedChannelIds.includes(channelId)) {
      return { kind: 'channel', scope: r.scope, allowedChannelIds: r.allowedChannelIds };
    }
  }
  // A failed role lookup fails open: a flaky API call should not make the
  // bot look broken to everyone.
  if (memberRoles === null) return null;
  for (const r of applicable) {
    if (r.ignoredRoleIds.some((id) => memberRoles.includes(id))) {
      return { kind: 'role', scope: r.scope };
    }
    if (r.allowedRoleIds.length > 0 && !r.allowedRoleIds.some((id) => memberRoles.includes(id))) {
      return { kind: 'role', scope: r.scope };
    }
  }
  return null;
}

export function needsRoles(applicable: CommandRule[]): boolean {
  return applicable.some((r) => r.allowedRoleIds.length > 0 || r.ignoredRoleIds.length > 0);
}

export function hasChannelOrRoleRule(applicable: CommandRule[]): boolean {
  return applicable.some(
    (r) =>
      r.allowedChannelIds.length > 0 ||
      r.ignoredChannelIds.length > 0 ||
      r.allowedRoleIds.length > 0 ||
      r.ignoredRoleIds.length > 0,
  );
}

// The most specific cooldown / delete setting wins.
export function effectiveCooldownMs(applicable: CommandRule[], defaultMs: number): number {
  for (let i = applicable.length - 1; i >= 0; i--) {
    const s = applicable[i]?.cooldownSeconds;
    if (s !== null && s !== undefined) return s * 1000;
  }
  return defaultMs;
}

export function shouldDeleteInvocation(applicable: CommandRule[]): boolean {
  return applicable.some((r) => r.deleteInvocation);
}
