import { pool } from '../db';

export interface CustomCommand {
  serverId: string;
  name: string;
  response: string;
  createdBy: string;
  usesCount: number;
  createdAt: Date;
}

interface Row {
  server_id: string;
  name: string;
  response: string;
  created_by: string;
  uses_count: string;
  created_at: Date;
}

function rowToCommand(row: Row): CustomCommand {
  return {
    serverId: row.server_id,
    name: row.name,
    response: row.response,
    createdBy: row.created_by,
    usesCount: Number(row.uses_count),
    createdAt: row.created_at,
  };
}

const VALID_NAME_RE = /^[a-z0-9_-]{1,32}$/;

export function isValidName(name: string): boolean {
  return VALID_NAME_RE.test(name);
}

export async function listCommands(serverId: string): Promise<CustomCommand[]> {
  const res = await pool.query<Row>(
    `SELECT server_id, name, response, created_by, uses_count, created_at
       FROM custom_commands
      WHERE server_id = $1
      ORDER BY name ASC`,
    [serverId],
  );
  return res.rows.map(rowToCommand);
}

export async function addCommand(input: {
  serverId: string;
  name: string;
  response: string;
  createdBy: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO custom_commands (server_id, name, response, created_by)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (server_id, name) DO UPDATE
       SET response = EXCLUDED.response,
           created_by = EXCLUDED.created_by,
           updated_at = now()`,
    [input.serverId, input.name, input.response, input.createdBy],
  );
}

export async function removeCommand(serverId: string, name: string): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM custom_commands WHERE server_id = $1 AND name = $2`,
    [serverId, name],
  );
  return (res.rowCount ?? 0) > 0;
}

// List of names the bot reserves. Kept inline rather than imported
// from the bot's command registry — the bot is its own build target
// and pulling its source into the dashboard's bundle would be more
// trouble than re-listing 50 names. If a new built-in is added in
// the bot, mirror it here too.
const RESERVED_NAMES: ReadonlySet<string> = new Set([
  // Levels (everyone)
  'rank', 'level', 'xp', 'leaderboard', 'lb', 'top', 'levelrewards', 'rewards',
  // Levels admin
  'levels', 'setlevelchannel', 'setlevelmsg', 'levelmsg', 'addlevelrole',
  'removelevelrole', 'noxpchannel',
  // Moderation
  'kick', 'ban', 'unban', 'timeout', 'mute', 'untimeout', 'unmute',
  'purge', 'clear', 'clean', 'warn', 'warnings', 'warns', 'clearwarnings',
  'clearwarns', 'setmodlog', 'modlogchannel',
  // Auto-mod
  'automod', 'badword', 'badwords',
  // Reaction roles
  'reactrole', 'rr', 'reactionrole',
  // Custom commands
  'cmd', 'command', 'customcmd',
  // Utilities
  'afk', 'away', 'poll', 'suggest', 'suggestion', 'setsuggestions',
  'suggestionschannel', 'antiraid',
  // Reminders + giveaways
  'remind', 'reminder', 'remindme',
  'gstart', 'giveaway', 'gcreate', 'gend', 'greroll', 'glist', 'giveaways',
  // Server utilities
  'statcounter', 'stats', 'tempchannel', 'temp',
  'reddit', 'rss', 'twitch', 'youtube', 'yt',
  // Automation primitives
  'autoreact', 'keyword', 'kw', 'schedule', 'sched',
  // Welcome
  'setwelcome', 'welcomechannel', 'welcomemsg', 'setwelcomemsg',
  'autorole', 'joinrole',
  // Meta
  'ping', 'help', 'commands',
]);

export function isReservedName(name: string): boolean {
  return RESERVED_NAMES.has(name.toLowerCase());
}
