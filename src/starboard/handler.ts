import type { EchoedClient } from '../client/echoedClient.js';
import type { ReactionEventData } from '../types.js';
import {
  getStarboardConfig,
  getStarboardPost,
  insertStarboardPost,
  updateStarCount,
} from './store.js';
import { buildEmbed, COLORS, field } from '../client/embeds.js';
import { rememberUser, resolveChannel, resolveUser, renderTokens, UNKNOWN_USER } from '../client/names.js';
import { log } from '../log.js';

const MAX_EXCERPT = 1500;

// Everything here is already resolved to display text: embed bodies are
// delivered verbatim, so any mention token left in one reaches the reader
// as a raw ID. That applies to the excerpt too — it is somebody else's
// message content, which may well contain mentions of its own.
function buildStarEmbed(count: number, emoji: string, msg: {
  body: string;
  authorName: string;
  channelName: string;
}) {
  return buildEmbed({
    title: `${emoji} ${count}`,
    description: msg.body,
    color: COLORS.ACCENT,
    fields: [
      field('Posted by', msg.authorName, true),
      field('Channel', msg.channelName, true),
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
  let authorName: string | undefined;
  try {
    const msg = await api.getMessage(data.serverId, data.messageId);
    count = msg.reactions?.[cfg.emoji]?.length ?? 0;
    content = msg.content ?? '';
    authorId = msg.author?.id;
    authorName = msg.author?.name;
    // The fetched message names its author — cache that so other features
    // don't have to look the same person up again.
    if (authorId) rememberUser(data.serverId, authorId, authorName);
    // Don't let the bot star itself onto the board.
    if (msg.author?.isBot) return;
  } catch (err) {
    log.warn({ err, serverId: data.serverId, messageId: data.messageId }, 'Starboard getMessage failed');
    return;
  }

  const existing = await getStarboardPost(data.serverId, data.messageId);

  // Nothing to render until it either has a board post or crosses the
  // threshold — check before doing any name resolution, since most stars
  // land on messages that will never make the board.
  if (!existing && count < cfg.threshold) return;

  const [body, resolvedAuthor, channelName] = await Promise.all([
    content.trim()
      ? renderTokens(api, data.serverId, content.slice(0, MAX_EXCERPT))
      : Promise.resolve('*(no text — attachment or embed)*'),
    authorName
      ? Promise.resolve(authorName)
      : authorId
        ? resolveUser(api, data.serverId, authorId)
        : Promise.resolve(UNKNOWN_USER),
    resolveChannel(api, data.serverId, data.channelId),
  ]);
  const card = { body, authorName: resolvedAuthor, channelName };

  if (existing) {
    // Keep the existing board post's count in sync.
    try {
      await api.editMessage({
        serverId: data.serverId,
        messageId: existing.starboardMessageId,
        content: '',
        embeds: [buildStarEmbed(count, cfg.emoji, card)],
      });
      await updateStarCount(data.serverId, data.messageId, count);
    } catch (err) {
      log.warn({ err, serverId: data.serverId }, 'Starboard edit failed');
    }
    return;
  }

  // Not on the board yet, and above threshold — post it.
  try {
    const res = await api.sendMessage({
      serverId: data.serverId,
      channelId: cfg.channelId,
      content: '',
      embeds: [buildStarEmbed(count, cfg.emoji, card)],
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
