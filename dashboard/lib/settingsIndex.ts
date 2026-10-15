// What the settings search (components/SettingsSearch) can find: every page
// (from lib/sections.ts) plus the individual settings on them, each pointing
// at its page and the card it lives in. The anchor is the card's title,
// slugged the way FormCard does it (cardAnchor), so a result scrolls
// straight to the setting.

import { SECTIONS } from './sections';

export interface SearchEntry {
  label: string;
  /** Section the setting lives on — its label is shown as context. */
  section: string;
  href: string;
  /** Card title on that page, if the entry is a single setting. */
  card?: string;
  keywords: string[];
}

// [page href, card title, extra keywords]
const SETTINGS: [string, string, string[]][] = [
  ['/general', 'Command prefix', ['prefix', '!', 'commands start with']],
  ['/general', 'Suggestions channel', ['suggest', 'ideas', 'feedback']],

  ['/moderation', 'Mod-log channel', ['modlog', 'mod log', 'log moderation', 'cases']],
  ['/moderation', 'Moderator roles', ['mod role', 'moderators', 'protected roles', 'staff']],
  ['/moderation', 'Warning escalation', ['warnings', 'auto punish', 'strikes', 'escalate']],
  ['/moderation', 'Anti-raid', ['raid', 'lockdown', 'join flood', 'mass join']],

  ['/automod', 'Master switch', ['automod on', 'enable auto-mod']],
  ['/automod', 'Invite links', ['invites', 'advertising', 'server links']],
  ['/automod', 'Bad words', ['swear', 'profanity', 'banned words', 'slurs', 'word filter']],
  ['/automod', 'Mass mentions', ['mention spam', 'ping spam', '@everyone']],
  ['/automod', 'External links', ['links', 'urls', 'allow list', 'whitelist']],
  ['/automod', 'Excessive caps', ['caps lock', 'shouting', 'uppercase']],
  ['/automod', 'Emoji spam', ['emojis']],
  ['/automod', 'Zalgo / combining-mark abuse', ['zalgo', 'glitch text']],
  ['/automod', 'Spam (message rate)', ['spam', 'flood', 'message rate']],
  ['/automod', 'Channel scope', ['automod channels', 'exempt channels']],
  ['/automod', 'Role scope', ['automod roles', 'exempt roles']],

  ['/ai', 'Key and model', ['openrouter', 'api key', 'model', 'daily limit', 'kick ban limit']],
  ['/ai', 'Add a channel', ['ai channel', 'channel rules', 'context']],

  ['/logging', 'Messages', ['edits', 'deletes', 'deleted messages', 'message log']],
  ['/logging', 'Members', ['joins', 'leaves', 'kicks', 'bans', 'nicknames', 'member log']],

  ['/welcome', 'Welcome message', ['greeting', 'join message', 'welcome channel', 'goodbye']],
  ['/welcome', 'Auto-role', ['autorole', 'join role', 'default role']],

  ['/levels', 'System', ['leveling on', 'enable levels']],
  ['/levels', 'XP economy', ['xp per message', 'cooldown', 'xp rate']],
  ['/levels', 'Level-up announcements', ['level up message', 'level channel']],
  ['/levels', 'XP channel scope', ['no xp channels', 'xp channels']],
  ['/levels', 'XP role scope', ['no xp roles', 'xp roles']],
  ['/levels', 'Add a level reward', ['role rewards', 'level roles']],

  ['/giveaways', 'Start a giveaway', ['new giveaway', 'prize']],
  ['/customcommands', 'Add a command', ['new command', 'custom command']],
  ['/keywords', 'Add a rule', ['new keyword', 'auto reply']],
  ['/autoreact', 'Add a rule', ['new auto-react', 'react emoji']],
  ['/schedules', 'Add a schedule', ['new schedule', 'scheduled message']],
  ['/statcounters', 'Add a counter', ['member count channel', 'new counter']],

  ['/notifications', 'Twitch', ['stream', 'live', 'streamer']],
  ['/notifications', 'YouTube', ['uploads', 'video', 'channel']],
  ['/notifications', 'Reddit', ['subreddit', 'posts']],

  ['/music', 'DJ role', ['dj', 'skip', 'stop', 'volume']],
  ['/music', 'Channel scope', ['music channels']],
  ['/music', 'Role scope', ['music roles']],
];

export const SEARCH_INDEX: SearchEntry[] = [
  ...SECTIONS.map((s) => ({ label: s.label, section: s.label, href: s.href, keywords: [s.blurb, ...s.keywords] })),
  ...SETTINGS.map(([href, card, keywords]) => ({
    label: card,
    section: SECTIONS.find((s) => s.href === href)?.label ?? '',
    href,
    card,
    keywords,
  })),
];

/** Best matches first: label starts-with, then label contains, then keywords. */
export function searchSettings(query: string, limit = 8): SearchEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { e: SearchEntry; score: number }[] = [];
  for (const e of SEARCH_INDEX) {
    const label = e.label.toLowerCase();
    let score = 0;
    if (label.startsWith(q)) score = 100;
    else if (label.includes(q)) score = 70;
    else if (e.section.toLowerCase().includes(q)) score = 40;
    else if (e.keywords.some((k) => k.toLowerCase().includes(q))) score = 30;
    if (score > 0) scored.push({ e, score: score + (e.card ? 0 : 5) });
  }
  return scored.sort((a, b) => b.score - a.score).slice(0, limit).map((x) => x.e);
}
