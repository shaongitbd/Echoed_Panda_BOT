import { pool } from './pool.js';

export interface GuildConfig {
  serverId: string;
  prefix: string | null;
  modlogChannel: string | null;
  welcomeChannel: string | null;
  welcomeMessage: string | null;
  // NOTE: goodbye_channel + goodbye_message columns exist in Postgres
  // (added before we knew the backend wouldn't broadcast member-leave
  // events). They're left in the DB for forward-compat but are not
  // surfaced in the type — nothing reads or writes them. If goodbye
  // support comes back, restore the fields here + add a leave handler.
  autoroleId: string | null;
  suggestionsChannel: string | null;
  antiRaidEnabled: boolean;
  antiRaidThreshold: number;
  antiRaidWindowSeconds: number;
  antiRaidLockdownUntil: Date | null;
  // DJ role for music commands. When set, members with this role can run
  // skip / pause / volume / loop without holding MANAGE_SERVER. null →
  // fall back to MANAGE_SERVER only.
  djRoleId: string | null;
  // Music command scope. Empty array means "no restriction".
  //   - musicAllowedChannelIds: if non-empty, music commands work ONLY
  //     in these text channels.
  //   - musicExemptChannelIds:  music commands NEVER respond in these
  //     channels (overrides allowed list).
  //   - musicAllowedRoleIds:    if non-empty, only members holding
  //     one of these roles can run music commands.
  //   - musicExemptRoleIds:     members with any of these roles are
  //     blocked from music commands (overrides allowed list).
  musicAllowedChannelIds: string[];
  musicExemptChannelIds: string[];
  musicAllowedRoleIds: string[];
  musicExemptRoleIds: string[];
  // Anti-raid: snapshot of the server's verification_level taken at
  // lockdown engage time so we can restore on clear. null = no
  // snapshot pending. See db/migrate.ts: 'pre-lockdown verification
  // level snapshot'.
  preLockdownVerificationLevel: number | null;
  // Giveaway entry scope. Applied at pick time (not at !gstart), so
  // changing the rules affects in-flight giveaways too. See
  // migrate.ts: 'guild_config + giveaway scope'.
  giveawayExcludeAdmins: boolean;
  giveawayAllowedRoleIds: string[];
  giveawayExemptRoleIds: string[];
  giveawayExemptUserIds: string[];
}

interface ConfigRow {
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
  pre_lockdown_verification_level: number | null;
  giveaway_exclude_admins: boolean | null;
  giveaway_allowed_role_ids: string[] | null;
  giveaway_exempt_role_ids: string[] | null;
  giveaway_exempt_user_ids: string[] | null;
}

function rowToConfig(row: ConfigRow): GuildConfig {
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
    preLockdownVerificationLevel: row.pre_lockdown_verification_level ?? null,
    giveawayExcludeAdmins: row.giveaway_exclude_admins ?? true,
    giveawayAllowedRoleIds: row.giveaway_allowed_role_ids ?? [],
    giveawayExemptRoleIds: row.giveaway_exempt_role_ids ?? [],
    giveawayExemptUserIds: row.giveaway_exempt_user_ids ?? [],
  };
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
  preLockdownVerificationLevel: null,
  giveawayExcludeAdmins: true,
  giveawayAllowedRoleIds: [],
  giveawayExemptRoleIds: [],
  giveawayExemptUserIds: [],
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
            autorole_id, suggestions_channel,
            anti_raid_enabled, anti_raid_threshold, anti_raid_window_seconds,
            anti_raid_lockdown_until, dj_role_id,
            music_allowed_channel_ids, music_exempt_channel_ids,
            music_allowed_role_ids,    music_exempt_role_ids,
            pre_lockdown_verification_level,
            giveaway_exclude_admins,
            giveaway_allowed_role_ids, giveaway_exempt_role_ids,
            giveaway_exempt_user_ids
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
  preLockdownVerificationLevel: 'pre_lockdown_verification_level',
  giveawayExcludeAdmins: 'giveaway_exclude_admins',
  giveawayAllowedRoleIds: 'giveaway_allowed_role_ids',
  giveawayExemptRoleIds: 'giveaway_exempt_role_ids',
  giveawayExemptUserIds: 'giveaway_exempt_user_ids',
};

export async function setGuildConfig(
  serverId: string,
  fields: UpsertableFields,
): Promise<GuildConfig> {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined) as [
    keyof UpsertableFields,
    string | number | boolean | Date | null | string[],
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
               autorole_id, suggestions_channel,
               anti_raid_enabled, anti_raid_threshold, anti_raid_window_seconds,
               anti_raid_lockdown_until, dj_role_id,
               music_allowed_channel_ids, music_exempt_channel_ids,
               music_allowed_role_ids,    music_exempt_role_ids,
               pre_lockdown_verification_level,
               giveaway_exclude_admins,
               giveaway_allowed_role_ids, giveaway_exempt_role_ids,
               giveaway_exempt_user_ids`,
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
