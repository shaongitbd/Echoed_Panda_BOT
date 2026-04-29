import { pool } from '../db';

// Mirror of the bot's GuildConfig row shape. Kept in this file rather
// than imported from the bot so the dashboard stays a self-contained
// build target (Next.js bundler resolution doesn't love reaching out
// of the dashboard root, and a duplicate is cheaper than fighting the
// toolchain).

export interface GuildConfig {
  serverId: string;
  prefix: string | null;
  modlogChannel: string | null;
  welcomeChannel: string | null;
  welcomeMessage: string | null;
  // goodbye_channel + goodbye_message exist in Postgres but are
  // unused — see the bot's guildConfig.ts comment for context.
  autoroleId: string | null;
  suggestionsChannel: string | null;
  antiRaidEnabled: boolean;
  antiRaidThreshold: number;
  antiRaidWindowSeconds: number;
  antiRaidLockdownUntil: Date | null;
}

interface Row {
  server_id: string;
  prefix: string | null;
  modlog_channel: string | null;
  welcome_channel: string | null;
  welcome_message: string | null;
  autorole_id: string | null;
  suggestions_channel: string | null;
  anti_raid_enabled: boolean;
  anti_raid_threshold: number;
  anti_raid_window_seconds: number;
  anti_raid_lockdown_until: Date | null;
}

const EMPTY = (serverId: string): GuildConfig => ({
  serverId,
  prefix: null,
  modlogChannel: null,
  welcomeChannel: null,
  welcomeMessage: null,
  autoroleId: null,
  suggestionsChannel: null,
  antiRaidEnabled: false,
  antiRaidThreshold: 10,
  antiRaidWindowSeconds: 30,
  antiRaidLockdownUntil: null,
});

function rowToConfig(row: Row): GuildConfig {
  return {
    serverId: row.server_id,
    prefix: row.prefix,
    modlogChannel: row.modlog_channel,
    welcomeChannel: row.welcome_channel,
    welcomeMessage: row.welcome_message,
    autoroleId: row.autorole_id,
    suggestionsChannel: row.suggestions_channel,
    antiRaidEnabled: row.anti_raid_enabled ?? false,
    antiRaidThreshold: row.anti_raid_threshold ?? 10,
    antiRaidWindowSeconds: row.anti_raid_window_seconds ?? 30,
    antiRaidLockdownUntil: row.anti_raid_lockdown_until,
  };
}

const SELECT = `
  server_id, prefix, modlog_channel, welcome_channel, welcome_message,
  autorole_id, suggestions_channel,
  anti_raid_enabled, anti_raid_threshold, anti_raid_window_seconds,
  anti_raid_lockdown_until
`;

export async function getGuildConfig(serverId: string): Promise<GuildConfig> {
  const res = await pool.query<Row>(
    `SELECT ${SELECT} FROM guild_config WHERE server_id = $1`,
    [serverId],
  );
  return res.rows[0] ? rowToConfig(res.rows[0]) : EMPTY(serverId);
}

type UpsertableFields = Partial<Omit<GuildConfig, 'serverId'>>;

const FIELD_TO_COLUMN: Record<keyof UpsertableFields, string> = {
  prefix: 'prefix',
  modlogChannel: 'modlog_channel',
  welcomeChannel: 'welcome_channel',
  welcomeMessage: 'welcome_message',
  autoroleId: 'autorole_id',
  suggestionsChannel: 'suggestions_channel',
  antiRaidEnabled: 'anti_raid_enabled',
  antiRaidThreshold: 'anti_raid_threshold',
  antiRaidWindowSeconds: 'anti_raid_window_seconds',
  antiRaidLockdownUntil: 'anti_raid_lockdown_until',
};

// upsert with dynamic column list — only writes the fields the form
// actually changed, so leaving an input untouched doesn't clobber a
// value the bot owns.
export async function setGuildConfig(
  serverId: string,
  fields: UpsertableFields,
): Promise<GuildConfig> {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined) as [
    keyof UpsertableFields,
    GuildConfig[keyof UpsertableFields],
  ][];
  if (entries.length === 0) return getGuildConfig(serverId);

  const cols = entries.map(([k]) => FIELD_TO_COLUMN[k]);
  const placeholders = entries.map((_, i) => `$${i + 2}`);
  const values = entries.map(([, v]) => v);
  const updates = cols.map((col) => `${col} = EXCLUDED.${col}`).join(', ');

  const res = await pool.query<Row>(
    `INSERT INTO guild_config (server_id, ${cols.join(', ')})
     VALUES ($1, ${placeholders.join(', ')})
     ON CONFLICT (server_id) DO UPDATE SET ${updates}
     RETURNING ${SELECT}`,
    [serverId, ...values],
  );

  const row = res.rows[0];
  if (!row) {
    throw new Error(`guild_config upsert returned no row for server ${serverId}`);
  }
  return rowToConfig(row);
}
