import type { EchoedClient } from '../client/echoedClient.js';
import type { ReactionEventData } from '../types.js';
import {
  getStarboardConfig,
  getStarboardPost,
  insertStarboardPost,
  updateStarCount,
} from './store.js';
import { buildEmbed, COLORS, field } from '../client/embeds.js';
import { log } from '../log.js';

const MAX_EXCERPT = 1500;

function buildStarEmbed(count: number, emoji: string, msg: {
  content: string;
  authorId?: string;
  sourceChannelId: string;
}) {
  const body = msg.content.trim() ? msg.content.slice(0, MAX_EXCERPT) : '*(no text — attachment or embed)*';
  return buildEmbed({
    title: `${emoji} ${count}`,
    description: body,
    color: COLORS.ACCENT,
    fields: [
      field('Posted by', msg.authorId ? `<@${msg.authorId}>` : 'unknown', true),
      field('Channel', `<#${msg.sourceChannelId}>`, true),
    ],
  });
}

// Re-syncs a single source message against the starboard whenever its star
// reaction is added or removed. Idempotent: it reads the CURRENT star count
// from the message itself (reactions map) rather than tracking deltas, so
// add/remove both just reconcile — no drift, no double counts.
//
// Once a message has crossed the threshold and been posted, it stays on the
// starboard (count keeps updating) even if it later dips below — matching the
// familiar Discord-bot behavior of "it earned its place".
export async function processStarboardReaction(
  api: EchoedClient,
  data: ReactionEventData,
): Promise<void> {
  const cfg = await getStarboardConfig(data.serverId);
  if (!cfg.enabled || !cfg.channelId) return;
  if (data.reactionType !== cfg.emoji) return;
  // Never starboard the starboard itself.
  if (data.channelId === cfg.channelId) return;

  let count = 0;
  let content = '';
  let authorId: string | undefined;
  try {
    const msg = await api.getMessage(data.serverId, data.messageId);
    count = msg.reactions?.[cfg.emoji]?.length ?? 0;
    content = msg.content ?? '';
    authorId = msg.author?.id;
    // Don't let the bot star itself onto the board.
    if (msg.author?.isBot) return;
  } catch (err) {
    log.warn({ err, serverId: data.serverId, messageId: data.messageId }, 'Starboard getMessage failed');
    return;
  }

  const existing = await getStarboardPost(data.serverId, data.messageId);

  if (existing) {
    // Keep the existing board post's count in sync.
    try {
      await api.editMessage({
        serverId: data.serverId,
        messageId: existing.starboardMessageId,
        content: '',
        embeds: [buildStarEmbed(count, cfg.emoji, { content, authorId, sourceChannelId: data.channelId })],
      });
      await updateStarCount(data.serverId, data.messageId, count);
    } catch (err) {
      log.warn({ err, serverId: data.serverId }, 'Starboard edit failed');
    }
    return;
  }

  // Not on the board yet — only post once it crosses the threshold.
  if (count < cfg.threshold) return;
  try {
    const res = await api.sendMessage({
      serverId: data.serverId,
      channelId: cfg.channelId,
      content: '',
      embeds: [buildStarEmbed(count, cfg.emoji, { content, authorId, sourceChannelId: data.channelId })],
    });
    await insertStarboardPost({
      serverId: data.serverId,
      sourceMessageId: data.messageId,
      sourceChannelId: data.channelId,
      starboardMessageId: res.messageId,
      starCount: count,
    });
    log.debug({ serverId: data.serverId, messageId: data.messageId, count }, 'Added to starboard');
  } catch (err) {
    log.warn({ err, serverId: data.serverId }, 'Starboard post failed');
  }
}
