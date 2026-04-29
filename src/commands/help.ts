import { registry, type Handler } from './index.js';

// Categorized help. Top-level just lists categories so the user
// isn't drowned in 52 commands at once. Drill in with
// `!help <category>` to see the commands in that group, or
// `!help <command>` to see one command's usage line.
//
// We keep the category map separate from the registry rather than
// adding a `category` field to every Registered entry — that way
// adding/moving a command is one edit, and the category surface stays
// in this file.

interface Category {
  name: string;
  emoji: string;
  blurb: string;
  commands: readonly string[];
}

const CATEGORIES: readonly Category[] = [
  {
    name: 'levels',
    emoji: '✦',
    blurb: 'XP, ranks, role rewards',
    commands: [
      'rank', 'leaderboard', 'levelrewards',
      'levels', 'setlevelchannel', 'setlevelmsg',
      'addlevelrole', 'removelevelrole', 'noxpchannel',
    ],
  },
  {
    name: 'moderation',
    emoji: '⚒',
    blurb: 'Kick, ban, timeout, warn, purge',
    commands: [
      'kick', 'ban', 'unban', 'timeout', 'untimeout', 'purge',
      'warn', 'warnings', 'clearwarnings', 'setmodlog',
      'nick', 'resetnick',
    ],
  },
  {
    name: 'automod',
    emoji: '⚡',
    blurb: 'Auto-mod filters and bad-words list',
    commands: ['automod', 'badword'],
  },
  {
    name: 'welcome',
    emoji: '✿',
    blurb: 'Welcome messages and auto-roles',
    commands: ['setwelcome', 'welcomemsg', 'autorole'],
  },
  {
    name: 'reactionroles',
    emoji: '✺',
    blurb: 'Self-assignable roles via reactions',
    commands: ['reactrole'],
  },
  {
    name: 'commands',
    emoji: '✎',
    blurb: 'Custom server-defined commands',
    commands: ['cmd'],
  },
  {
    name: 'utilities',
    emoji: '⚙',
    blurb: 'Polls, suggestions, AFK, anti-raid, reminders, giveaways',
    commands: [
      'afk', 'poll', 'suggest', 'setsuggestions', 'antiraid',
      'remind', 'gstart', 'gend', 'greroll', 'glist',
    ],
  },
  {
    name: 'server',
    emoji: '#',
    blurb: 'Stat counters and temporary channels',
    commands: ['statcounter', 'tempchannel'],
  },
  {
    name: 'notifications',
    emoji: '◉',
    blurb: 'Reddit, Twitch, YouTube alerts',
    commands: ['reddit', 'twitch', 'youtube'],
  },
  {
    name: 'music',
    emoji: '🎵',
    blurb: 'Play music in voice channels — YouTube, SoundCloud, direct URLs',
    commands: [
      'play', 'skip', 'stop', 'pause', 'resume',
      'queue', 'nowplaying', 'volume', 'loop',
      'shuffle', 'remove', 'clearqueue', 'djrole',
    ],
  },
  {
    name: 'automation',
    emoji: '✨',
    blurb: 'Auto-react, keyword responses, scheduled messages',
    commands: ['autoreact', 'keyword', 'schedule'],
  },
  {
    name: 'meta',
    emoji: '🐼',
    blurb: 'Help and health',
    commands: ['ping', 'help'],
  },
];

function findRegistered(name: string) {
  const lower = name.toLowerCase();
  return registry.find((c) => c.name === lower || c.aliases.includes(lower));
}

function findCategory(name: string): Category | undefined {
  return CATEGORIES.find((c) => c.name === name.toLowerCase());
}

export const handleHelp: Handler = async (ctx, { api }) => {
  const arg = ctx.args[0]?.toLowerCase();

  // No args: show category index. One line per category.
  if (!arg) {
    const lines = [`🐼 **Panda** — \`${ctx.prefix}help <category>\` for details`];
    for (const cat of CATEGORIES) {
      lines.push(
        `${cat.emoji} \`${cat.name}\` (${cat.commands.length}) — ${cat.blurb}`,
      );
    }
    await api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: lines.join('\n'),
    });
    return;
  }

  // Category lookup first — `!help moderation` lists all mod commands.
  const cat = findCategory(arg);
  if (cat) {
    const lines = [`${cat.emoji} **${cat.name}** — ${cat.blurb}`];
    for (const cmdName of cat.commands) {
      const reg = findRegistered(cmdName);
      if (!reg) continue;
      lines.push(`\`${ctx.prefix}${reg.name}\` — ${reg.help}`);
    }
    await api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: lines.join('\n'),
    });
    return;
  }

  // Single-command lookup — `!help kick` shows just kick's usage.
  const cmd = findRegistered(arg);
  if (cmd) {
    const aliasLine =
      cmd.aliases.length > 0 ? `\nAliases: ${cmd.aliases.map((a) => `\`${a}\``).join(', ')}` : '';
    await api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: `\`${ctx.prefix}${cmd.name}\` — ${cmd.help}${aliasLine}`,
    });
    return;
  }

  await api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    replyToId: ctx.messageId,
    content: `Nothing called \`${arg}\`. Try \`${ctx.prefix}help\` for the category list.`,
  });
};
