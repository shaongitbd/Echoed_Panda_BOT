import { pool } from '../db';

// Mirror of the bot's command rules (src/commands/settings.ts). The bot
// caches a server's rules for a minute, so an edit here lands within that.

export interface CommandRule {
  scope: string;
  enabled: boolean;
  allowedChannelIds: string[];
  ignoredChannelIds: string[];
  allowedRoleIds: string[];
  ignoredRoleIds: string[];
  // null = the bot's default cooldown; 0 = none.
  cooldownSeconds: number | null;
  deleteInvocation: boolean;
}

// Matches the bot's MAX_COMMAND_COOLDOWN_SECONDS.
export const MAX_COOLDOWN_SECONDS = 3600;
// Matches the chat command's per-list cap.
export const MAX_LIST = 25;

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

const SELECT = `
  scope, enabled,
  allowed_channel_ids, ignored_channel_ids,
  allowed_role_ids, ignored_role_ids,
  cooldown_seconds, delete_invocation
`;

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

export async function listCommandRules(serverId: string): Promise<Map<string, CommandRule>> {
  const res = await pool.query<Row>(
    `SELECT ${SELECT} FROM command_settings WHERE server_id = $1`,
    [serverId],
  );
  return new Map(res.rows.map((r) => [r.scope, rowToRule(r)]));
}

export async function getCommandRule(serverId: string, scope: string): Promise<CommandRule> {
  const res = await pool.query<Row>(
    `SELECT ${SELECT} FROM command_settings WHERE server_id = $1 AND scope = $2`,
    [serverId, scope],
  );
  return res.rows[0] ? rowToRule(res.rows[0]) : defaultRule(scope);
}

// Writes the whole rule — the dashboard form always submits every field.
export async function saveCommandRule(serverId: string, rule: CommandRule): Promise<void> {
  await pool.query(
    `INSERT INTO command_settings (
       server_id, scope, enabled,
       allowed_channel_ids, ignored_channel_ids,
       allowed_role_ids, ignored_role_ids,
       cooldown_seconds, delete_invocation
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (server_id, scope) DO UPDATE SET
       enabled             = EXCLUDED.enabled,
       allowed_channel_ids = EXCLUDED.allowed_channel_ids,
       ignored_channel_ids = EXCLUDED.ignored_channel_ids,
       allowed_role_ids    = EXCLUDED.allowed_role_ids,
       ignored_role_ids    = EXCLUDED.ignored_role_ids,
       cooldown_seconds    = EXCLUDED.cooldown_seconds,
       delete_invocation   = EXCLUDED.delete_invocation,
       updated_at          = now()`,
    [
      serverId,
      rule.scope,
      rule.enabled,
      rule.allowedChannelIds,
      rule.ignoredChannelIds,
      rule.allowedRoleIds,
      rule.ignoredRoleIds,
      rule.cooldownSeconds,
      rule.deleteInvocation,
    ],
  );
}

// The list page's one-click on/off, which must not touch the other fields.
export async function setCommandEnabled(
  serverId: string,
  scope: string,
  enabled: boolean,
): Promise<void> {
  await pool.query(
    `INSERT INTO command_settings (server_id, scope, enabled)
     VALUES ($1, $2, $3)
     ON CONFLICT (server_id, scope) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now()`,
    [serverId, scope, enabled],
  );
}

export async function deleteCommandRule(serverId: string, scope: string): Promise<void> {
  await pool.query('DELETE FROM command_settings WHERE server_id = $1 AND scope = $2', [
    serverId,
    scope,
  ]);
}
