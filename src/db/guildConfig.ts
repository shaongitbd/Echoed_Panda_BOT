import { pool } from './pool.js';

export interface GuildConfig {
  serverId: string;
  prefix: string | null;
  modlogChannel: string | null;
  welcomeChannel: string | null;
  welcomeMessage: string | null;
  goodbyeChannel: string | null;
  goodbyeMessage: string | null;
  autoroleId: string | null;
  suggestionsChannel: string | null;
  antiRaidEnabled: boolean;
  antiRaidThreshold: number;
  antiRaidWindowSeconds: number;
  antiRaidLockdownUntil: Date | null;
}

interface ConfigRow {
  server_id: string;
  prefix: string | null;
  modlog_channel: string | null;
  welcome_channel: string | null;
  welcome_message: string | null;
  goodbye_channel: string | null;
  goodbye_message: string | null;
  autorole_id: string | null;
  suggestions_channel: string | null;
  anti_raid_enabled: boolean;
  anti_raid_threshold: number;
  anti_raid_window_seconds: number;
  anti_raid_lockdown_until: Date | null;
}

function rowToConfig(row: ConfigRow): GuildConfig {
  return {
    serverId: row.server_id,
    prefix: row.prefix,
    modlogChannel: row.modlog_channel,
    welcomeChannel: row.welcome_channel,
    welcomeMessage: row.welcome_message,
    goodbyeChannel: row.goodbye_channel,
    goodbyeMessage: row.goodbye_message,
    autoroleId: row.autorole_id,
    suggestionsChannel: row.suggestions_channel,
    antiRaidEnabled: row.anti_raid_enabled ?? false,
    antiRaidThreshold: row.anti_raid_threshold ?? 10,
    antiRaidWindowSeconds: row.anti_raid_window_seconds ?? 30,
    antiRaidLockdownUntil: row.anti_raid_lockdown_until,
  };
}

const EMPTY = (serverId: string): GuildConfig => ({
  serverId,
  prefix: null,
  modlogChannel: null,
  welcomeChannel: null,
  welcomeMessage: null,
  goodbyeChannel: null,
  goodbyeMessage: null,
  autoroleId: null,
  suggestionsChannel: null,
  antiRaidEnabled: false,
  antiRaidThreshold: 10,
  antiRaidWindowSeconds: 30,
  antiRaidLockdownUntil: null,
});

// Cache resolved configs in-process. TTL trades a tiny staleness window
// (after `set`, other instances of the bot — if any — read the old value
// for up to TTL_MS) for absorbing the read traffic from the message
// hot path. Writes invalidate the local entry immediately.
const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { config: GuildConfig; expiresAt: number }>();

export async function getGuildConfig(serverId: string): Promise<GuildConfig> {
  const cached = cache.get(serverId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.config;
  }

  const res = await pool.query<ConfigRow>(
    `SELECT server_id, prefix, modlog_channel, welcome_channel, welcome_message,
            goodbye_channel, goodbye_message, autorole_id, suggestions_channel,
            anti_raid_enabled, anti_raid_threshold, anti_raid_window_seconds,
            anti_raid_lockdown_until
       FROM panda.guild_config
      WHERE server_id = $1`,
    [serverId],
  );

  const config = res.rows[0] ? rowToConfig(res.rows[0]) : EMPTY(serverId);
  cache.set(serverId, { config, expiresAt: Date.now() + TTL_MS });
  return config;
}

// UpsertableFields covers the columns callers can set. server_id is the
// PK and is always part of the where-clause, never updated.
type UpsertableFields = Partial<Omit<GuildConfig, 'serverId'>>;

const FIELD_TO_COLUMN: Record<keyof UpsertableFields, string> = {
  prefix: 'prefix',
  modlogChannel: 'modlog_channel',
  welcomeChannel: 'welcome_channel',
  welcomeMessage: 'welcome_message',
  goodbyeChannel: 'goodbye_channel',
  goodbyeMessage: 'goodbye_message',
  autoroleId: 'autorole_id',
  suggestionsChannel: 'suggestions_channel',
  antiRaidEnabled: 'anti_raid_enabled',
  antiRaidThreshold: 'anti_raid_threshold',
  antiRaidWindowSeconds: 'anti_raid_window_seconds',
  antiRaidLockdownUntil: 'anti_raid_lockdown_until',
};

export async function setGuildConfig(
  serverId: string,
  fields: UpsertableFields,
): Promise<GuildConfig> {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined) as [
    keyof UpsertableFields,
    string | null,
  ][];

  if (entries.length === 0) {
    return getGuildConfig(serverId);
  }

  const cols = entries.map(([k]) => FIELD_TO_COLUMN[k]);
  const placeholders = entries.map((_, i) => `$${i + 2}`);
  const values = entries.map(([, v]) => v);
  const updates = cols.map((col, i) => `${col} = EXCLUDED.${col}`).join(', ');

  const res = await pool.query<ConfigRow>(
    `INSERT INTO panda.guild_config (server_id, ${cols.join(', ')})
     VALUES ($1, ${placeholders.join(', ')})
     ON CONFLICT (server_id) DO UPDATE SET ${updates}
     RETURNING server_id, prefix, modlog_channel, welcome_channel, welcome_message,
               goodbye_channel, goodbye_message, autorole_id, suggestions_channel,
               anti_raid_enabled, anti_raid_threshold, anti_raid_window_seconds,
               anti_raid_lockdown_until`,
    [serverId, ...values],
  );

  const row = res.rows[0];
  if (!row) {
    // Should be unreachable — INSERT … RETURNING always yields a row.
    throw new Error(`guild_config upsert returned no row for server ${serverId}`);
  }
  const next = rowToConfig(row);
  cache.set(serverId, { config: next, expiresAt: Date.now() + TTL_MS });
  return next;
}

// Drop a server's cached entry. Useful on bot leaving a server, or for
// admin tooling that mutates the row out-of-band.
export function invalidateGuildConfig(serverId: string): void {
  cache.delete(serverId);
}
