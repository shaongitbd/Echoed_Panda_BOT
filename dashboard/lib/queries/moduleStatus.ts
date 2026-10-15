import 'server-only';
import { pool } from '../db';

// What each dashboard section is doing on a server, for the sidebar and the
// Overview: on/off for features with a switch, a count for list features.
// One round trip — the sidebar renders on every page.

/** `true`/`false` for a switch; a number for a list (0 = none set up). */
export type SectionStatus = boolean | number;

export type StatusMap = Partial<Record<string, SectionStatus>>;

interface Row {
  levels: boolean | null;
  welcome: boolean | null;
  modlog: boolean | null;
  antiraid: boolean | null;
  logging: boolean | null;
  automod: boolean | null;
  ai: boolean | null;
  qotd: boolean | null;
  birthdays: boolean | null;
  starboard: boolean | null;
  counting: boolean | null;
  reaction_roles: string;
  custom_commands: string;
  auto_react: string;
  keywords: string;
  schedules: string;
  stat_counters: string;
  giveaways: string;
  notifications: string;
}

export async function getModuleStatus(serverId: string): Promise<StatusMap> {
  // Status is decoration on every page; it must never take a page down —
  // e.g. a table the bot hasn't created yet on this database.
  try {
    return await readStatus(serverId);
  } catch (err) {
    console.warn('[moduleStatus] status query failed', err);
    return {};
  }
}

async function readStatus(serverId: string): Promise<StatusMap> {
  const res = await pool.query<Row>(
    `SELECT
       (SELECT enabled FROM level_settings WHERE server_id = $1) AS levels,
       (SELECT welcome_channel IS NOT NULL OR autorole_id IS NOT NULL FROM guild_config WHERE server_id = $1) AS welcome,
       (SELECT modlog_channel IS NOT NULL FROM guild_config WHERE server_id = $1) AS modlog,
       (SELECT anti_raid_enabled FROM guild_config WHERE server_id = $1) AS antiraid,
       (SELECT message_channel IS NOT NULL OR member_channel IS NOT NULL FROM log_config WHERE server_id = $1) AS logging,
       (SELECT enabled FROM automod_config WHERE server_id = $1) AS automod,
       (SELECT enabled FROM ai_mod_settings WHERE server_id = $1) AS ai,
       (SELECT enabled FROM qotd_config WHERE server_id = $1) AS qotd,
       (SELECT enabled FROM birthday_config WHERE server_id = $1) AS birthdays,
       (SELECT enabled FROM starboard_config WHERE server_id = $1) AS starboard,
       (SELECT enabled FROM counting_config WHERE server_id = $1) AS counting,
       (SELECT COUNT(*) FROM reaction_role_messages WHERE server_id = $1)::TEXT AS reaction_roles,
       (SELECT COUNT(*) FROM custom_commands WHERE server_id = $1)::TEXT AS custom_commands,
       (SELECT COUNT(*) FROM auto_react WHERE server_id = $1)::TEXT AS auto_react,
       (SELECT COUNT(*) FROM keyword_responses WHERE server_id = $1)::TEXT AS keywords,
       (SELECT COUNT(*) FROM scheduled_messages WHERE server_id = $1)::TEXT AS schedules,
       (SELECT COUNT(*) FROM stat_counters WHERE server_id = $1)::TEXT AS stat_counters,
       (SELECT COUNT(*) FROM giveaways WHERE server_id = $1 AND NOT ended)::TEXT AS giveaways,
       ((SELECT COUNT(*) FROM twitch_subs WHERE server_id = $1)
        + (SELECT COUNT(*) FROM youtube_subs WHERE server_id = $1)
        + (SELECT COUNT(*) FROM reddit_subs WHERE server_id = $1))::TEXT AS notifications`,
    [serverId],
  );
  const r = res.rows[0];
  if (!r) return {};
  return {
    // Leveling is on by default (the column defaults TRUE; no row = defaults).
    '/levels': r.levels ?? true,
    '/welcome': r.welcome ?? false,
    '/moderation': (r.modlog ?? false) || (r.antiraid ?? false),
    '/logging': r.logging ?? false,
    '/automod': r.automod ?? false,
    '/ai': r.ai ?? false,
    '/qotd': r.qotd ?? false,
    '/birthdays': r.birthdays ?? false,
    '/starboard': r.starboard ?? false,
    '/counting': r.counting ?? false,
    '/reactionroles': Number(r.reaction_roles),
    '/customcommands': Number(r.custom_commands),
    '/autoreact': Number(r.auto_react),
    '/keywords': Number(r.keywords),
    '/schedules': Number(r.schedules),
    '/statcounters': Number(r.stat_counters),
    '/giveaways': Number(r.giveaways),
    '/notifications': Number(r.notifications),
  };
}
