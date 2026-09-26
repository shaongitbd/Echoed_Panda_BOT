// The commands the Commands page can restrict, grouped the way `!help`
// groups them. Mirrors CATEGORIES + the registry in the bot's
// src/commands/help.ts and src/commands/index.ts — the category names are
// rule scopes ('category:music'), so they must match the bot's exactly.
// `command` itself is left out: it is never restricted, so an admin can
// always undo a rule.

export interface CatalogCommand {
  name: string;
  description: string;
}

export interface CatalogCategory {
  name: string;
  label: string;
  blurb: string;
  commands: CatalogCommand[];
}

const c = (name: string, description: string): CatalogCommand => ({ name, description });

export const COMMAND_CATALOG: CatalogCategory[] = [
  {
    name: 'levels',
    label: 'Levels',
    blurb: 'XP, ranks and role rewards',
    commands: [
      c('rank', 'Show your rank and XP'),
      c('leaderboard', 'Top 10 by XP'),
      c('levelrewards', 'List the role rewards per level'),
      c('levels', 'Turn leveling on or off'),
      c('setlevelchannel', 'Set the level-up announcement channel'),
      c('setlevelmsg', 'Customize the level-up message'),
      c('addlevelrole', 'Reward a role at a level'),
      c('removelevelrole', 'Remove a level reward'),
      c('noxpchannel', 'Toggle a channel on the no-XP list'),
    ],
  },
  {
    name: 'moderation',
    label: 'Moderation',
    blurb: 'Kick, ban, timeout, warn, purge, lock, cases, escalation, server log',
    commands: [
      c('kick', 'Kick a member'),
      c('ban', 'Ban a member'),
      c('unban', 'Unban a user'),
      c('timeout', 'Time a member out'),
      c('untimeout', 'Clear a timeout'),
      c('purge', 'Bulk delete messages'),
      c('lock', 'Stop @everyone sending in a channel'),
      c('unlock', 'Let @everyone send again'),
      c('warn', 'Warn a member'),
      c('warnings', 'List warnings'),
      c('clearwarnings', "Clear a member's warnings"),
      c('escalation', 'Act automatically at N warnings'),
      c('case', 'Show a moderation case'),
      c('reason', "Change a case's reason"),
      c('modlogs', "A member's moderation history"),
      c('note', 'Private moderator note'),
      c('modrole', 'Roles that may moderate'),
      c('protectedrole', 'Roles the bot never moderates'),
      c('setmodlog', 'Set the mod-log channel'),
      c('log', 'Set up the server log'),
      c('nick', "Change a member's nickname"),
      c('resetnick', "Clear a member's nickname"),
    ],
  },
  {
    name: 'automod',
    label: 'Auto-mod',
    blurb: 'Filter settings and the bad-words list',
    commands: [c('automod', 'Configure auto-mod'), c('badword', 'Edit the bad-words list')],
  },
  {
    name: 'welcome',
    label: 'Welcome',
    blurb: 'Welcome messages and auto-roles',
    commands: [
      c('setwelcome', 'Set the welcome channel'),
      c('welcomemsg', 'Customize the welcome message'),
      c('autorole', 'Role given on join'),
    ],
  },
  {
    name: 'reactionroles',
    label: 'Reaction roles',
    blurb: 'Self-assignable roles',
    commands: [c('reactrole', 'Set up reaction roles')],
  },
  {
    name: 'commands',
    label: 'Custom commands',
    blurb: 'Managing custom commands',
    commands: [c('cmd', 'Add, remove and list custom commands')],
  },
  {
    name: 'utilities',
    label: 'Utilities',
    blurb: 'Polls, suggestions, AFK, anti-raid, reminders, giveaways',
    commands: [
      c('afk', 'Go AFK'),
      c('poll', 'Create a poll'),
      c('suggest', 'Submit a suggestion'),
      c('setsuggestions', 'Set the suggestions channel'),
      c('antiraid', 'Configure anti-raid'),
      c('remind', 'Set a reminder'),
      c('gstart', 'Start a giveaway'),
      c('gend', 'End a giveaway early'),
      c('greroll', 'Pick another giveaway winner'),
      c('glist', 'List active giveaways'),
    ],
  },
  {
    name: 'server',
    label: 'Server',
    blurb: 'Stat counters and temporary channels',
    commands: [
      c('statcounter', 'Channel-name stat counters'),
      c('tempchannel', 'Time-limited channels'),
    ],
  },
  {
    name: 'notifications',
    label: 'Notifications',
    blurb: 'Reddit, Twitch and YouTube alerts',
    commands: [
      c('reddit', 'Subreddit notifications'),
      c('twitch', 'Twitch live alerts'),
      c('youtube', 'YouTube upload alerts'),
    ],
  },
  {
    name: 'music',
    label: 'Music',
    blurb: 'Music in voice channels',
    commands: [
      c('play', 'Play music'),
      c('skip', 'Skip the current track'),
      c('stop', 'Stop and leave the voice channel'),
      c('pause', 'Pause playback'),
      c('resume', 'Resume playback'),
      c('queue', 'Show the queue'),
      c('nowplaying', 'Show the current track'),
      c('volume', 'Show or set the volume'),
      c('loop', 'Set the loop mode'),
      c('shuffle', 'Shuffle the queue'),
      c('remove', 'Remove a track'),
      c('clearqueue', 'Clear the queue'),
      c('djrole', 'Set the DJ role'),
    ],
  },
  {
    name: 'automation',
    label: 'Automation',
    blurb: 'Auto-react, keyword responses, scheduled messages',
    commands: [
      c('autoreact', 'Auto-react in a channel'),
      c('keyword', 'Keyword auto-responses'),
      c('schedule', 'Scheduled messages'),
    ],
  },
  {
    name: 'engagement',
    label: 'Engagement',
    blurb: 'Setup, question of the day, birthdays, starboard, streaks, counting',
    commands: [
      c('setup', 'One-shot engagement setup'),
      c('qotd', 'Question of the day'),
      c('birthday', 'Birthdays'),
      c('starboard', 'Reaction highlights'),
      c('daily', 'Daily check-in'),
      c('counting', 'Counting game'),
    ],
  },
  {
    name: 'meta',
    label: 'Meta',
    blurb: 'Help, health, permission check',
    commands: [
      c('ping', 'Health check'),
      c('help', 'Command list'),
      c('checkperms', "Audit the bot's permissions"),
    ],
  },
];

export const ALL_SCOPE = '*';
export const categoryScope = (name: string): string => `category:${name}`;

// What a scope in a URL/form means, or null if it isn't one we recognise.
// Custom-command names are checked by the caller against the database.
export function describeScope(scope: string):
  | { kind: 'all'; title: string }
  | { kind: 'category'; title: string; category: CatalogCategory }
  | { kind: 'command'; title: string; category: CatalogCategory; command: CatalogCommand }
  | null {
  if (scope === ALL_SCOPE) return { kind: 'all', title: 'All commands' };
  if (scope.startsWith('category:')) {
    const category = COMMAND_CATALOG.find((cat) => categoryScope(cat.name) === scope);
    return category ? { kind: 'category', title: `${category.label} commands`, category } : null;
  }
  for (const category of COMMAND_CATALOG) {
    const command = category.commands.find((cmd) => cmd.name === scope);
    if (command) return { kind: 'command', title: command.name, category, command };
  }
  return null;
}
