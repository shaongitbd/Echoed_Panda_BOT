import { config } from '../config.js';
import { log } from '../log.js';
import type { EchoedClient } from '../client/echoedClient.js';
import type { PermissionService } from '../auth/permissions.js';
import type { CommandContext } from '../types.js';
import { getGuildConfig } from '../db/guildConfig.js';

import { handlePing } from './ping.js';
import { handleHelp } from './help.js';
import { handleRank } from './rank.js';
import { handleLeaderboard } from './leaderboard.js';
import {
  handleLevelsToggle,
  handleSetLevelChannel,
  handleSetLevelMsg,
  handleAddLevelRole,
  handleRemoveLevelRole,
  handleLevelRewards,
  handleNoXpChannel,
} from './levelAdmin.js';
import { handleSetWelcome, handleWelcomeMsg, handleAutoRole } from './welcomeAdmin.js';
import {
  handleKick,
  handleBan,
  handleUnban,
  handleTimeout,
  handleUntimeout,
  handlePurge,
  handleSetModlog,
} from './mod.js';
import { handleWarn, handleWarnings, handleClearWarnings } from './warn.js';
import { handleAutomod, handleBadWord } from './automodAdmin.js';
import { handleReactRole } from './reactRoleAdmin.js';
import { handleCustomCommand } from './customCmdAdmin.js';
import { getCommand as getCustomCommand, bumpUses } from '../customCommands/store.js';
import { renderCustomCommand } from '../customCommands/render.js';
import { handleAfk } from './afkCmd.js';
import { handlePoll } from './poll.js';
import { handleSetSuggestions, handleSuggest } from './suggestions.js';
import { handleAntiRaid } from './antiRaid.js';
import { handleRemind } from './remind.js';
import {
  handleGiveawayStart,
  handleGiveawayEnd,
  handleGiveawayReroll,
  handleGiveawayList,
} from './giveaway.js';
import { handleStatCounter } from './statsAdmin.js';
import { handleTempChannel } from './tempChannel.js';
import { handleReddit } from './reddit.js';
import { handleTwitch } from './twitch.js';
import { handleYoutube } from './youtube.js';
import { handleAutoReact } from './autoReact.js';
import { handleKeyword } from './keyword.js';
import { handleSchedule } from './scheduleMsg.js';

export interface Services {
  api: EchoedClient;
  perms: PermissionService;
  startedAt: number;
}

export type Handler = (ctx: CommandContext, svc: Services) => Promise<void>;

interface Registered {
  name: string;
  aliases: readonly string[];
  handler: Handler;
  help: string;
}

// Order is the order help prints commands in.
export const registry: readonly Registered[] = [
  // ─── Levels (everyone) ────────────────────────────────────────────
  {
    name: 'rank',
    aliases: ['level', 'xp'],
    handler: handleRank,
    help: 'show your rank and XP — `rank [@user]`',
  },
  {
    name: 'leaderboard',
    aliases: ['lb', 'top'],
    handler: handleLeaderboard,
    help: 'top 10 by XP',
  },
  {
    name: 'levelrewards',
    aliases: ['rewards'],
    handler: handleLevelRewards,
    help: 'list configured role rewards per level',
  },

  // ─── Levels admin (Manage Server) ─────────────────────────────────
  {
    name: 'levels',
    aliases: [],
    handler: handleLevelsToggle,
    help: 'toggle leveling — `levels enable|disable`',
  },
  {
    name: 'setlevelchannel',
    aliases: [],
    handler: handleSetLevelChannel,
    help: 'set level-up announcement channel — `setlevelchannel <#channel|here|none>`',
  },
  {
    name: 'setlevelmsg',
    aliases: ['levelmsg'],
    handler: handleSetLevelMsg,
    help: 'customize level-up message ({user}, {level} placeholders)',
  },
  {
    name: 'addlevelrole',
    aliases: [],
    handler: handleAddLevelRole,
    help: 'reward a role at a level — `addlevelrole <level> <@role>`',
  },
  {
    name: 'removelevelrole',
    aliases: [],
    handler: handleRemoveLevelRole,
    help: 'remove a level reward — `removelevelrole <level>`',
  },
  {
    name: 'noxpchannel',
    aliases: [],
    handler: handleNoXpChannel,
    help: 'toggle a channel in/out of the no-XP list',
  },

  // ─── Moderation ────────────────────────────────────────────────────
  {
    name: 'kick',
    aliases: [],
    handler: handleKick,
    help: 'kick a member — `kick <@user> [reason]`',
  },
  {
    name: 'ban',
    aliases: [],
    handler: handleBan,
    help: 'ban a member — `ban <@user> [reason]`',
  },
  {
    name: 'unban',
    aliases: [],
    handler: handleUnban,
    help: 'unban a user — `unban <userId>`',
  },
  {
    name: 'timeout',
    aliases: ['mute'],
    handler: handleTimeout,
    help: 'timeout — `timeout <@user> <5m|1h|1d> [reason]`',
  },
  {
    name: 'untimeout',
    aliases: ['unmute'],
    handler: handleUntimeout,
    help: 'clear timeout — `untimeout <@user>`',
  },
  {
    name: 'purge',
    aliases: ['clear', 'clean'],
    handler: handlePurge,
    help: 'bulk delete messages — `purge <1-100>`',
  },
  {
    name: 'warn',
    aliases: [],
    handler: handleWarn,
    help: 'warn a user — `warn <@user> <reason>`',
  },
  {
    name: 'warnings',
    aliases: ['warns'],
    handler: handleWarnings,
    help: 'list warnings — `warnings [@user]`',
  },
  {
    name: 'clearwarnings',
    aliases: ['clearwarns'],
    handler: handleClearWarnings,
    help: 'clear all warnings — `clearwarnings <@user>`',
  },
  {
    name: 'setmodlog',
    aliases: ['modlogchannel'],
    handler: handleSetModlog,
    help: 'set mod-log channel — `setmodlog <#channel|here|none>`',
  },

  // ─── Auto-mod (Manage Server) ─────────────────────────────────────
  {
    name: 'automod',
    aliases: [],
    handler: handleAutomod,
    help: 'auto-mod config — `automod [on|off|filter <name> on|off|exempt …]`',
  },
  {
    name: 'badword',
    aliases: ['badwords'],
    handler: handleBadWord,
    help: 'bad-words list — `badword add|remove|list <word>`',
  },

  // ─── Reaction roles (Manage Roles) ────────────────────────────────
  {
    name: 'reactrole',
    aliases: ['rr', 'reactionrole'],
    handler: handleReactRole,
    help: 'reaction-role setup — `reactrole add|remove|list|mode …`',
  },

  // ─── Custom commands (Manage Server for add/remove; list is open) ─
  {
    name: 'cmd',
    aliases: ['command', 'customcmd'],
    handler: handleCustomCommand,
    help: 'custom commands — `cmd add|remove|list`',
  },

  // ─── Utilities ────────────────────────────────────────────────────
  {
    name: 'afk',
    aliases: ['away'],
    handler: handleAfk,
    help: 'go AFK — `afk [reason]`',
  },
  {
    name: 'poll',
    aliases: [],
    handler: handlePoll,
    help: 'create a poll — `poll <q>` or `poll <q> | opt1 | opt2 | …`',
  },
  {
    name: 'suggest',
    aliases: ['suggestion'],
    handler: handleSuggest,
    help: 'submit a suggestion — `suggest <text>`',
  },
  {
    name: 'setsuggestions',
    aliases: ['suggestionschannel'],
    handler: handleSetSuggestions,
    help: 'configure suggestions channel',
  },
  {
    name: 'antiraid',
    aliases: [],
    handler: handleAntiRaid,
    help: 'anti-raid — `antiraid [on|off|threshold|window|clear]`',
  },
  {
    name: 'remind',
    aliases: ['reminder', 'remindme'],
    handler: handleRemind,
    help: 'set a reminder — `remind <duration> <message>` / `remind list|cancel <id>`',
  },
  {
    name: 'gstart',
    aliases: ['giveaway', 'gcreate'],
    handler: handleGiveawayStart,
    help: 'start a giveaway — `gstart <duration> [winners] <prize>`',
  },
  {
    name: 'gend',
    aliases: [],
    handler: handleGiveawayEnd,
    help: 'end a giveaway early — `gend <messageId>`',
  },
  {
    name: 'greroll',
    aliases: [],
    handler: handleGiveawayReroll,
    help: 'pick another winner — `greroll <messageId>`',
  },
  {
    name: 'glist',
    aliases: ['giveaways'],
    handler: handleGiveawayList,
    help: 'list active giveaways',
  },

  // ─── Server utilities ─────────────────────────────────────────────
  {
    name: 'statcounter',
    aliases: ['stats'],
    handler: handleStatCounter,
    help: 'channel-name stat counter — `statcounter add|remove|list`',
  },
  {
    name: 'tempchannel',
    aliases: ['temp'],
    handler: handleTempChannel,
    help: 'time-limited channel — `tempchannel <name> <duration>`',
  },
  {
    name: 'reddit',
    aliases: ['rss'],
    handler: handleReddit,
    help: 'subreddit notifications — `reddit follow|unfollow|list`',
  },
  {
    name: 'twitch',
    aliases: [],
    handler: handleTwitch,
    help: 'Twitch live alerts — `twitch follow|unfollow|list`',
  },
  {
    name: 'youtube',
    aliases: ['yt'],
    handler: handleYoutube,
    help: 'YouTube upload alerts — `youtube follow|unfollow|list`',
  },

  // ─── Automation primitives (Manage Server) ────────────────────────
  {
    name: 'autoreact',
    aliases: [],
    handler: handleAutoReact,
    help: 'auto-react in a channel — `autoreact add|remove|list <#channel> <emoji>`',
  },
  {
    name: 'keyword',
    aliases: ['kw'],
    handler: handleKeyword,
    help: 'keyword auto-response — `keyword add|remove|list "phrase" "response"`',
  },
  {
    name: 'schedule',
    aliases: ['sched'],
    handler: handleSchedule,
    help: 'scheduled messages — `schedule add every|daily … <#channel> <message>`',
  },

  // ─── Welcome admin (Manage Server) ────────────────────────────────
  {
    name: 'setwelcome',
    aliases: ['welcomechannel'],
    handler: handleSetWelcome,
    help: 'set welcome channel — `setwelcome <#channel|none>`',
  },
  {
    name: 'welcomemsg',
    aliases: ['setwelcomemsg'],
    handler: handleWelcomeMsg,
    help: 'customize welcome message ({user}, {server}, {membercount})',
  },
  {
    name: 'autorole',
    aliases: ['joinrole'],
    handler: handleAutoRole,
    help: 'role to assign on join — `autorole <@role|none>`',
  },

  // ─── Meta ─────────────────────────────────────────────────────────
  {
    name: 'ping',
    aliases: [],
    handler: handlePing,
    help: 'health check + uptime',
  },
  {
    name: 'help',
    aliases: ['commands'],
    handler: handleHelp,
    help: 'show this list',
  },
];

const cooldowns = new Map<string, number>();

function isOnCooldown(channelId: string): boolean {
  const last = cooldowns.get(channelId) ?? 0;
  return Date.now() - last < config.perChannelCooldownMs;
}

function markCooldown(channelId: string): void {
  cooldowns.set(channelId, Date.now());
}

function findCommand(token: string): Registered | undefined {
  const lower = token.toLowerCase();
  return registry.find((c) => c.name === lower || c.aliases.includes(lower));
}

interface DispatchInput {
  serverId: string;
  channelId: string;
  senderId: string;
  senderName: string;
  messageId: string;
}

export async function dispatch(
  rawContent: string,
  msg: DispatchInput,
  svc: Services,
): Promise<void> {
  const trimmed = rawContent.trim();
  if (!trimmed) return;

  // Resolve per-guild prefix. An unconfigured guild falls back to the
  // env default, so the bot is usable from the moment it joins.
  const guildConfig = await getGuildConfig(msg.serverId);
  const prefix = guildConfig.prefix ?? config.defaultPrefix;

  if (!trimmed.startsWith(prefix)) return;

  const tokens = trimmed.slice(prefix.length).split(/\s+/);
  const head = tokens.shift();
  if (!head) return;

  const command = findCommand(head);

  // Custom-command fallback. Built-ins win on name conflict; we
  // already block conflicts at insert time but a recent add hasn't
  // updated the registry, so this ordering is the source of truth.
  if (!command) {
    const customName = head.toLowerCase();
    const custom = await getCustomCommand(msg.serverId, customName);
    if (!custom) return;

    if (isOnCooldown(msg.channelId)) {
      log.debug({ channelId: msg.channelId, command: customName }, 'Cooldown — skipping');
      return;
    }
    markCooldown(msg.channelId);

    const rendered = renderCustomCommand(custom.response, {
      userId: msg.senderId,
      userName: msg.senderName,
      args: tokens,
    });

    // Don't let custom responses run other commands — sidesteps any
    // accidental loops (e.g., `!cmd add foo !foo`).
    const safeContent = rendered.startsWith(prefix)
      ? `​${rendered}` // zero-width prefix breaks the dispatcher match
      : rendered;

    bumpUses(msg.serverId, customName);
    try {
      await svc.api.sendMessage({
        serverId: msg.serverId,
        channelId: msg.channelId,
        content: safeContent,
      });
    } catch (err) {
      log.warn({ err, customName }, 'Custom-command send failed');
    }
    return;
  }

  if (isOnCooldown(msg.channelId)) {
    log.debug({ channelId: msg.channelId, command: command.name }, 'Cooldown — skipping');
    return;
  }
  markCooldown(msg.channelId);

  const ctx: CommandContext = {
    serverId: msg.serverId,
    channelId: msg.channelId,
    senderId: msg.senderId,
    senderName: msg.senderName,
    messageId: msg.messageId,
    args: tokens,
    rawContent,
    prefix,
  };

  log.info(
    { command: command.name, args: ctx.args, channelId: ctx.channelId, sender: ctx.senderName },
    'Dispatching',
  );

  try {
    await command.handler(ctx, svc);
  } catch (err) {
    log.error({ err, command: command.name, channelId: ctx.channelId }, 'Command handler threw');
    try {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: `Something broke running \`${prefix}${command.name}\`. Try again in a moment.`,
      });
    } catch {
      // Already in error path — don't cascade.
    }
  }
}
