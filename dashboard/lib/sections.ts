// Every page of a server's dashboard, in one place: the sidebar, the
// Overview and the settings search all read this list, so a new page is
// added here once and shows up everywhere.

export type GroupKey = 'start' | 'moderation' | 'community' | 'automation' | 'extras';

export const GROUPS: { key: GroupKey; label: string | null }[] = [
  { key: 'start', label: null },
  { key: 'moderation', label: 'Moderation' },
  { key: 'community', label: 'Community' },
  { key: 'automation', label: 'Automation' },
  { key: 'extras', label: 'Alerts & extras' },
];

export interface SectionDef {
  /** Path under /dashboard/<serverId>; '' is the Overview. */
  href: string;
  label: string;
  group: GroupKey;
  /** One line: what the page lets you do. Shown on the Overview and in search. */
  blurb: string;
  /** Extra words people might search for that aren't in the label. */
  keywords: string[];
}

export const SECTIONS: SectionDef[] = [
  { href: '', label: 'Overview', group: 'start', blurb: 'What Panda is doing on this server.', keywords: ['home', 'status', 'summary'] },
  { href: '/general', label: 'General', group: 'start', blurb: 'Command prefix and server-wide basics.', keywords: ['prefix', 'settings', 'basics'] },
  { href: '/commands', label: 'Commands', group: 'start', blurb: 'Turn commands off or limit them to channels and roles.', keywords: ['permissions', 'disable', 'restrict', 'channels', 'roles', 'cooldown'] },

  { href: '/moderation', label: 'Moderation', group: 'moderation', blurb: 'Mod-log, moderator and protected roles, warning escalation, anti-raid.', keywords: ['modlog', 'mod log', 'kick', 'ban', 'timeout', 'warn', 'escalation', 'anti-raid', 'raid', 'lockdown', 'moderator role', 'protected role', 'cases'] },
  { href: '/automod', label: 'Auto-mod', group: 'moderation', blurb: 'Eight filters: spam, bad words, caps, links, invites, mentions, emoji, zalgo.', keywords: ['filter', 'spam', 'bad words', 'swear', 'caps', 'links', 'invites', 'mentions', 'emoji', 'zalgo'] },
  { href: '/ai', label: 'AI moderation', group: 'moderation', blurb: 'An AI model on your own OpenRouter key judges messages against each channel’s rules.', keywords: ['ai', 'openrouter', 'model', 'key', 'llm', 'gpt', 'rules', 'context', '!panda'] },
  { href: '/logging', label: 'Server log', group: 'moderation', blurb: 'Edits, deletes, joins, leaves, kicks, bans and nickname changes.', keywords: ['log', 'audit', 'edits', 'deletes', 'joins', 'leaves', 'nicknames'] },

  { href: '/welcome', label: 'Welcome', group: 'community', blurb: 'Greet new members, say goodbye, give a role on join.', keywords: ['greeting', 'join', 'goodbye', 'leave', 'autorole', 'auto role', 'new members'] },
  { href: '/levels', label: 'Levels', group: 'community', blurb: 'XP for chatting, level-up messages and role rewards.', keywords: ['xp', 'rank', 'leaderboard', 'level up', 'rewards', 'experience'] },
  { href: '/reactionroles', label: 'Reaction roles', group: 'community', blurb: 'Members pick their own roles by reacting.', keywords: ['self roles', 'react', 'emoji roles', 'role menu'] },
  { href: '/giveaways', label: 'Giveaways', group: 'community', blurb: 'Run giveaways with winners, requirements and rerolls.', keywords: ['giveaway', 'prize', 'raffle', 'winners', 'reroll'] },
  { href: '/qotd', label: 'Question of the day', group: 'community', blurb: 'A daily conversation starter, from your questions or Panda’s.', keywords: ['qotd', 'daily question', 'conversation', 'prompt'] },
  { href: '/birthdays', label: 'Birthdays', group: 'community', blurb: 'Wish members happy birthday, with an optional birthday role.', keywords: ['birthday', 'bday', 'cake'] },
  { href: '/starboard', label: 'Starboard', group: 'community', blurb: 'Repost messages that get enough reactions to a highlights channel.', keywords: ['stars', 'highlights', 'best of', 'hall of fame'] },
  { href: '/counting', label: 'Counting', group: 'community', blurb: 'A channel where members count up together.', keywords: ['count', 'counting game', 'numbers'] },

  { href: '/customcommands', label: 'Custom commands', group: 'automation', blurb: 'Your own commands that reply with text you write.', keywords: ['custom', 'tags', 'responses', 'shortcuts'] },
  { href: '/keywords', label: 'Keywords', group: 'automation', blurb: 'Reply automatically when someone says a phrase.', keywords: ['auto reply', 'auto response', 'trigger', 'phrase'] },
  { href: '/autoreact', label: 'Auto-react', group: 'automation', blurb: 'React to every message in a channel.', keywords: ['reactions', 'emoji', 'suggestions'] },
  { href: '/schedules', label: 'Schedules', group: 'automation', blurb: 'Post messages on a schedule.', keywords: ['scheduled', 'timer', 'repeat', 'daily', 'announcements'] },

  { href: '/notifications', label: 'Social alerts', group: 'extras', blurb: 'Post when Twitch streamers go live, YouTube uploads or subreddits post.', keywords: ['twitch', 'youtube', 'reddit', 'live', 'stream', 'notifications', 'alerts'] },
  { href: '/statcounters', label: 'Stat counters', group: 'extras', blurb: 'Channel names that show member counts and more.', keywords: ['member count', 'counter', 'stats'] },
  { href: '/music', label: 'Music', group: 'extras', blurb: 'DJ role and where music commands work.', keywords: ['dj', 'play', 'queue', 'voice', 'youtube', 'soundcloud'] },
];
