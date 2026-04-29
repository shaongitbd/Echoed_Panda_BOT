import { pool } from './pool.js';

export interface LevelSettings {
  serverId: string;
  enabled: boolean;
  levelUpChannel: string | null;
  // null = use built-in default. Supports placeholders {user}, {level},
  // {server} that grant.ts substitutes when announcing.
  levelUpMessage: string | null;
  stackRewards: boolean;
  noXpChannelIds: string[];
  xpPerMessageMin: number;
  xpPerMessageMax: number;
  cooldownSeconds: number;
}

interface SettingsRow {
  server_id: string;
  enabled: boolean;
  level_up_channel: string | null;
  level_up_message: string | null;
  stack_rewards: boolean;
  no_xp_channel_ids: string[];
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
  noXpChannelIds: [],
  xpPerMessageMin: 15,
  xpPerMessageMax: 25,
  cooldownSeconds: 60,
});

function rowToSettings(row: SettingsRow): LevelSettings {
  return {
    serverId: row.server_id,
    enabled: row.enabled,
    levelUpChannel: row.level_up_channel,
    levelUpMessage: row.level_up_message,
    stackRewards: row.stack_rewards,
    noXpChannelIds: row.no_xp_channel_ids,
    xpPerMessageMin: row.xp_per_message_min,
    xpPerMessageMax: row.xp_per_message_max,
    cooldownSeconds: row.cooldown_seconds,
  };
}

// Cache settings in-process. Hit on every grant attempt, so the cache
// matters more here than for guildConfig — TTL chosen to absorb burst
// traffic without making admin changes feel laggy.
const TTL_MS = 60 * 1000;
const cache = new Map<string, { settings: LevelSettings; expiresAt: number }>();

export async function getLevelSettings(serverId: string): Promise<LevelSettings> {
  const cached = cache.get(serverId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.settings;
  }

  const res = await pool.query<SettingsRow>(
    `SELECT server_id, enabled, level_up_channel, level_up_message, stack_rewards,
            no_xp_channel_ids, xp_per_message_min, xp_per_message_max, cooldown_seconds
       FROM panda.level_settings
      WHERE server_id = $1`,
    [serverId],
  );

  const settings = res.rows[0] ? rowToSettings(res.rows[0]) : DEFAULTS(serverId);
  cache.set(serverId, { settings, expiresAt: Date.now() + TTL_MS });
  return settings;
}

type UpsertableFields = Partial<Omit<LevelSettings, 'serverId'>>;

const FIELD_TO_COLUMN: Record<keyof UpsertableFields, string> = {
  enabled: 'enabled',
  levelUpChannel: 'level_up_channel',
  levelUpMessage: 'level_up_message',
  stackRewards: 'stack_rewards',
  noXpChannelIds: 'no_xp_channel_ids',
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
  if (entries.length === 0) {
    return getLevelSettings(serverId);
  }

  const cols = entries.map(([k]) => FIELD_TO_COLUMN[k]);
  const placeholders = entries.map((_, i) => `$${i + 2}`);
  const values = entries.map(([, v]) => v);
  const updates = cols.map((col) => `${col} = EXCLUDED.${col}`).join(', ');

  const res = await pool.query<SettingsRow>(
    `INSERT INTO panda.level_settings (server_id, ${cols.join(', ')})
     VALUES ($1, ${placeholders.join(', ')})
     ON CONFLICT (server_id) DO UPDATE SET ${updates}
     RETURNING server_id, enabled, level_up_channel, level_up_message, stack_rewards,
               no_xp_channel_ids, xp_per_message_min, xp_per_message_max, cooldown_seconds`,
    [serverId, ...values],
  );

  const row = res.rows[0];
  if (!row) {
    throw new Error(`level_settings upsert returned no row for server ${serverId}`);
  }
  const next = rowToSettings(row);
  cache.set(serverId, { settings: next, expiresAt: Date.now() + TTL_MS });
  return next;
}

export function invalidateLevelSettings(serverId: string): void {
  cache.delete(serverId);
}
