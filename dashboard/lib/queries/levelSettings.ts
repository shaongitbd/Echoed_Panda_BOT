import { pool } from '../db';

// Mirror of the bot's LevelSettings shape. See guildConfig.ts for why
// we duplicate rather than import.

export interface LevelSettings {
  serverId: string;
  enabled: boolean;
  levelUpChannel: string | null;
  levelUpMessage: string | null;
  stackRewards: boolean;
  // MEE6-style independent allow/ignore lists. See bot's
  // src/db/levelSettings.ts for the runtime semantics.
  allowedXpChannelIds: string[];
  noXpChannelIds: string[];
  allowedXpRoleIds: string[];
  ignoredXpRoleIds: string[];
  xpPerMessageMin: number;
  xpPerMessageMax: number;
  cooldownSeconds: number;
}

interface Row {
  server_id: string;
  enabled: boolean;
  level_up_channel: string | null;
  level_up_message: string | null;
  stack_rewards: boolean;
  no_xp_channel_ids: string[];
  allowed_xp_channel_ids: string[] | null;
  allowed_xp_role_ids: string[] | null;
  ignored_xp_role_ids: string[] | null;
  xp_per_message_min: number;
  xp_per_message_max: number;
  cooldown_seconds: number;
}

const DEFAULTS = (serverId: string): LevelSettings => ({
  serverId,
  enabled: true,
  levelUpChannel: null,
  levelUpMessage: null,
  stackRewards: true,
  allowedXpChannelIds: [],
  noXpChannelIds: [],
  allowedXpRoleIds: [],
  ignoredXpRoleIds: [],
  xpPerMessageMin: 15,
  xpPerMessageMax: 25,
  cooldownSeconds: 60,
});

function rowToSettings(row: Row): LevelSettings {
  return {
    serverId: row.server_id,
    enabled: row.enabled,
    levelUpChannel: row.level_up_channel,
    levelUpMessage: row.level_up_message,
    stackRewards: row.stack_rewards,
    allowedXpChannelIds: row.allowed_xp_channel_ids ?? [],
    noXpChannelIds: row.no_xp_channel_ids,
    allowedXpRoleIds: row.allowed_xp_role_ids ?? [],
    ignoredXpRoleIds: row.ignored_xp_role_ids ?? [],
    xpPerMessageMin: row.xp_per_message_min,
    xpPerMessageMax: row.xp_per_message_max,
    cooldownSeconds: row.cooldown_seconds,
  };
}

const SELECT = `
  server_id, enabled, level_up_channel, level_up_message, stack_rewards,
  no_xp_channel_ids, allowed_xp_channel_ids,
  allowed_xp_role_ids, ignored_xp_role_ids,
  xp_per_message_min, xp_per_message_max, cooldown_seconds
`;

export async function getLevelSettings(serverId: string): Promise<LevelSettings> {
  const res = await pool.query<Row>(
    `SELECT ${SELECT} FROM level_settings WHERE server_id = $1`,
    [serverId],
  );
  return res.rows[0] ? rowToSettings(res.rows[0]) : DEFAULTS(serverId);
}

type UpsertableFields = Partial<Omit<LevelSettings, 'serverId'>>;

const FIELD_TO_COLUMN: Record<keyof UpsertableFields, string> = {
  enabled: 'enabled',
  levelUpChannel: 'level_up_channel',
  levelUpMessage: 'level_up_message',
  stackRewards: 'stack_rewards',
  noXpChannelIds: 'no_xp_channel_ids',
  allowedXpChannelIds: 'allowed_xp_channel_ids',
  allowedXpRoleIds: 'allowed_xp_role_ids',
  ignoredXpRoleIds: 'ignored_xp_role_ids',
  xpPerMessageMin: 'xp_per_message_min',
  xpPerMessageMax: 'xp_per_message_max',
  cooldownSeconds: 'cooldown_seconds',
};

export async function setLevelSettings(
  serverId: string,
  fields: UpsertableFields,
): Promise<LevelSettings> {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined) as [
    keyof UpsertableFields,
    LevelSettings[keyof UpsertableFields],
  ][];
  if (entries.length === 0) return getLevelSettings(serverId);

  const cols = entries.map(([k]) => FIELD_TO_COLUMN[k]);
  const placeholders = entries.map((_, i) => `$${i + 2}`);
  const values = entries.map(([, v]) => v);
  const updates = cols.map((col) => `${col} = EXCLUDED.${col}`).join(', ');

  const res = await pool.query<Row>(
    `INSERT INTO level_settings (server_id, ${cols.join(', ')})
     VALUES ($1, ${placeholders.join(', ')})
     ON CONFLICT (server_id) DO UPDATE SET ${updates}
     RETURNING ${SELECT}`,
    [serverId, ...values],
  );

  const row = res.rows[0];
  if (!row) {
    throw new Error(`level_settings upsert returned no row for server ${serverId}`);
  }
  return rowToSettings(row);
}
