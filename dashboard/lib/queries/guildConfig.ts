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
  // DJ role for music commands. When set, members holding it can run
  // skip / pause / volume / loop without Manage Server. null → fall
  // back to Manage Server only.
  djRoleId: string | null;
  // Music command scope. Empty array means "no restriction".
  // Allow lists narrow the surface; ignore lists override allow.
  musicAllowedChannelIds: string[];
  musicExemptChannelIds: string[];
  musicAllowedRoleIds: string[];
  musicExemptRoleIds: string[];
  // Giveaway entry scope. Same conventions: empty allow-list = no
  // restriction; exempt overrides allow. excludeAdmins flag is
  // separate because "admin" is computed (MANAGE_SERVER bit), not
  // role-list membership.
  giveawayExcludeAdmins: boolean;
  giveawayAllowedRoleIds: string[];
  giveawayExemptRoleIds: string[];
  giveawayExemptUserIds: string[];
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
  dj_role_id: string | null;
  music_allowed_channel_ids: string[] | null;
  music_exempt_channel_ids: string[] | null;
  music_allowed_role_ids: string[] | null;
  music_exempt_role_ids: string[] | null;
  giveaway_exclude_admins: boolean | null;
  giveaway_allowed_role_ids: string[] | null;
  giveaway_exempt_role_ids: string[] | null;
  giveaway_exempt_user_ids: string[] | null;
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
  djRoleId: null,
  musicAllowedChannelIds: [],
  musicExemptChannelIds: [],
  musicAllowedRoleIds: [],
  musicExemptRoleIds: [],
  giveawayExcludeAdmins: true,
  giveawayAllowedRoleIds: [],
  giveawayExemptRoleIds: [],
  giveawayExemptUserIds: [],
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
    djRoleId: row.dj_role_id,
    musicAllowedChannelIds: row.music_allowed_channel_ids ?? [],
    musicExemptChannelIds: row.music_exempt_channel_ids ?? [],
    musicAllowedRoleIds: row.music_allowed_role_ids ?? [],
    musicExemptRoleIds: row.music_exempt_role_ids ?? [],
    giveawayExcludeAdmins: row.giveaway_exclude_admins ?? true,
    giveawayAllowedRoleIds: row.giveaway_allowed_role_ids ?? [],
    giveawayExemptRoleIds: row.giveaway_exempt_role_ids ?? [],
    giveawayExemptUserIds: row.giveaway_exempt_user_ids ?? [],
  };
}

const SELECT = `
  server_id, prefix, modlog_channel, welcome_channel, welcome_message,
  autorole_id, suggestions_channel,
  anti_raid_enabled, anti_raid_threshold, anti_raid_window_seconds,
  anti_raid_lockdown_until, dj_role_id,
  music_allowed_channel_ids, music_exempt_channel_ids,
  music_allowed_role_ids,    music_exempt_role_ids,
  giveaway_exclude_admins,
  giveaway_allowed_role_ids, giveaway_exempt_role_ids,
  giveaway_exempt_user_ids
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
  djRoleId: 'dj_role_id',
  musicAllowedChannelIds: 'music_allowed_channel_ids',
  musicExemptChannelIds: 'music_exempt_channel_ids',
  musicAllowedRoleIds: 'music_allowed_role_ids',
  musicExemptRoleIds: 'music_exempt_role_ids',
  giveawayExcludeAdmins: 'giveaway_exclude_admins',
  giveawayAllowedRoleIds: 'giveaway_allowed_role_ids',
  giveawayExemptRoleIds: 'giveaway_exempt_role_ids',
  giveawayExemptUserIds: 'giveaway_exempt_user_ids',
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
