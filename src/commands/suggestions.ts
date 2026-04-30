import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import { getGuildConfig, setGuildConfig } from '../db/guildConfig.js';
import { log } from '../log.js';
import { buildEmbed, COLORS } from '../client/embeds.js';

const CHANNEL_MENTION_RE = /^<#(?<id>[a-zA-Z0-9_-]+)>$/;
const BARE_ID_RE = /^[a-zA-Z0-9_-]{8,}$/;
const THUMBS_UP = '\u{1F44D}';
const THUMBS_DOWN = '\u{1F44E}';
const MAX_LEN = 1500;

function parseChannelId(arg: string | undefined): string | null {
  if (!arg) return null;
  const m = CHANNEL_MENTION_RE.exec(arg);
  if (m?.groups?.id) return m.groups.id;
  if (BARE_ID_RE.test(arg)) return arg;
  return null;
}

async function requireManageServer(ctx: CommandContext, svc: Services): Promise<boolean> {
  const ok = await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_SERVER');
  if (!ok) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'You need the **Manage Server** permission to configure suggestions.',
    });
  }
  return ok;
}

// `!setsuggestions <#channel|none>` — admin command.
export const handleSetSuggestions: Handler = async (ctx, svc) => {
  if (!(await requireManageServer(ctx, svc))) return;

  const arg = ctx.args[0]?.toLowerCase();
  if (!arg) {
    const cfg = await getGuildConfig(ctx.serverId);
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: cfg.suggestionsChannel
        ? `Suggestions go to <#${cfg.suggestionsChannel}>. Clear with \`${ctx.prefix}setsuggestions none\`.`
        : `No suggestions channel set. Use \`${ctx.prefix}setsuggestions <channel>\`.`,
    });
    return;
  }

  let channelId: string | null;
  if (arg === 'none' || arg === 'clear' || arg === 'off') {
    channelId = null;
  } else {
    channelId = parseChannelId(ctx.args[0]);
    if (!channelId) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: `Couldn't parse \`${ctx.args[0]}\` as a channel.`,
      });
      return;
    }
  }

  await setGuildConfig(ctx.serverId, { suggestionsChannel: channelId });
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: channelId
      ? `Suggestions will be posted to <#${channelId}>.`
      : 'Suggestions disabled.',
  });
};

// `!suggest <text>` — open to everyone.
export const handleSuggest: Handler = async (ctx, { api }) => {
  const tail = ctx.rawContent
    .trim()
    .slice(ctx.prefix.length)
    .split(/\s+/)
    .slice(1)
    .join(' ')
    .trim()
    .slice(0, MAX_LEN);

  if (!tail) {
    await api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}suggest <your suggestion>\`.`,
    });
    return;
  }

  const cfg = await getGuildConfig(ctx.serverId);
  if (!cfg.suggestionsChannel) {
    await api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'Suggestions aren\'t configured. An admin can set the channel with `setsuggestions`.',
    });
    return;
  }

  // Post to the configured channel and seed up/down reactions for
  // voting. The mention goes in the description (where mentions
  // parse) — the embed timestamp gives a "submitted at" footer for
  // free.
  let messageId: string;
  try {
    const sent = await api.sendMessage({
      serverId: ctx.serverId,
      channelId: cfg.suggestionsChannel,
      content: '',
      embeds: [
        buildEmbed({
          title: '💡 New suggestion',
          description: `${tail}\n\n— from <@${ctx.senderId}>`,
          color: COLORS.ACCENT,
        }),
      ],
    });
    messageId = sent.messageId;
  } catch (err) {
    log.warn({ err }, 'Suggestion send failed');
    await api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'Failed to post suggestion. Is the channel still accessible?',
    });
    return;
  }

  for (const emoji of [THUMBS_UP, THUMBS_DOWN]) {
    try {
      await api.addReaction(ctx.serverId, messageId, emoji);
    } catch (err) {
      log.warn({ err, emoji }, 'Suggestion reaction seed failed');
    }
  }

  // Confirm in the original channel if it's not the suggestion channel.
  if (cfg.suggestionsChannel !== ctx.channelId) {
    await api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Posted to <#${cfg.suggestionsChannel}>. 🐼`,
    });
  }
};
