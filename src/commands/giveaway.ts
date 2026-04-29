import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import { parseDuration, formatDuration } from '../mod/duration.js';
import {
  createGiveaway,
  endNow,
  getByMessage,
  listActive,
} from '../giveaways/store.js';
import { pickAndAnnounce, GIVEAWAY_EMOJI } from '../giveaways/pickWinners.js';
import { log } from '../log.js';
import { buildEmbed, field, COLORS } from '../client/embeds.js';

const MAX_PRIZE_LEN = 200;
const MAX_WINNERS = 20;

const BARE_ID_RE = /^[a-zA-Z0-9_-]{8,}$/;

function parseMessageId(arg: string | undefined): string | null {
  if (!arg) return null;
  const trimmed = arg.trim();
  const linkMatch = trimmed.match(/\/(?<id>[a-zA-Z0-9_-]+)\/?$/);
  if (linkMatch?.groups?.id && BARE_ID_RE.test(linkMatch.groups.id)) {
    return linkMatch.groups.id;
  }
  if (BARE_ID_RE.test(trimmed)) return trimmed;
  return null;
}

async function requireManageServer(ctx: CommandContext, svc: Services): Promise<boolean> {
  const ok = await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_SERVER');
  if (!ok) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'You need the **Manage Server** permission to manage giveaways.',
    });
  }
  return ok;
}

// `!gstart <duration> [winners] <prize>` — winners optional, defaults to 1.
//
// We grammar-match by checking whether arg[1] is a pure integer; if
// so it's the winner count, otherwise it's the start of the prize.
export const handleGiveawayStart: Handler = async (ctx, svc) => {
  if (!(await requireManageServer(ctx, svc))) return;

  const durArg = ctx.args[0];
  if (!durArg) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}gstart <duration> [winners] <prize>\`. Examples: \`${ctx.prefix}gstart 1h Cool prize\`, \`${ctx.prefix}gstart 30m 3 Three winners\`.`,
    });
    return;
  }
  const duration = parseDuration(durArg);
  if (!duration || duration < 30) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'Duration must be ≥ 30 seconds. Examples: `5m`, `1h30m`, `1d`.',
    });
    return;
  }

  // Did the caller specify a winner count? If args[1] is a pure
  // integer in the allowed range, treat it as the winner count.
  let winnerCount = 1;
  let prizeStartIdx = 1;
  if (ctx.args[1] && /^\d+$/.test(ctx.args[1])) {
    const w = parseInt(ctx.args[1], 10);
    if (w >= 1 && w <= MAX_WINNERS) {
      winnerCount = w;
      prizeStartIdx = 2;
    }
  }

  const prize = ctx.rawContent
    .trim()
    .slice(ctx.prefix.length)
    .split(/\s+/)
    .slice(1 + prizeStartIdx)
    .join(' ')
    .trim()
    .slice(0, MAX_PRIZE_LEN);

  if (!prize) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'Prize required. Example: `' + ctx.prefix + 'gstart 1h Steam key`.',
    });
    return;
  }

  const endAt = new Date(Date.now() + duration * 1000);
  const human = formatDuration(duration);

  // Iconic giveaway card. Title carries the prize so it shows in
  // notifications; description gives the call-to-action; fields show
  // the sortable details (winners count, end time). Color is the
  // gold accent so the card pops in chat.
  let messageId: string;
  try {
    const sent = await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: '',
      embeds: [
        buildEmbed({
          title: `🎉 ${prize}`,
          description: `React with ${GIVEAWAY_EMOJI} to enter!`,
          color: COLORS.ACCENT,
          fields: [
            field('Winners', String(winnerCount), true),
            field('Ends in', human, true),
            field('Hosted by', `<@${ctx.senderId}>`, true),
          ],
          footer: 'Giveaway ends',
          // Setting the embed timestamp to the end-time gives clients
          // a "ends at <localized time>" footer rendering for free.
          timestamp: endAt,
        }),
      ],
    });
    messageId = sent.messageId;
  } catch (err) {
    log.warn({ err }, 'Giveaway send failed');
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'Failed to start the giveaway.',
    });
    return;
  }

  // Seed the entry reaction.
  try {
    await svc.api.addReaction(ctx.serverId, messageId, GIVEAWAY_EMOJI);
  } catch (err) {
    log.warn({ err, messageId }, 'Giveaway reaction seed failed');
  }

  await createGiveaway({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    messageId,
    prize,
    winnerCount,
    endAt,
    createdBy: ctx.senderId,
  });
};

// `!gend <messageId>` — end early.
export const handleGiveawayEnd: Handler = async (ctx, svc) => {
  if (!(await requireManageServer(ctx, svc))) return;

  const messageId = parseMessageId(ctx.args[0]);
  if (!messageId) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}gend <messageId|link>\`.`,
    });
    return;
  }
  const ended = await endNow(messageId);
  if (!ended) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: 'No active giveaway with that message ID.',
    });
    return;
  }
  // Pick winners now since we just marked it ended (the tick won't
  // re-pick a giveaway that's already `ended`).
  await pickAndAnnounce(svc.api, ended);
};

// `!greroll <messageId>` — pick another winner from the same pool,
// excluding everyone who has already won.
export const handleGiveawayReroll: Handler = async (ctx, svc) => {
  if (!(await requireManageServer(ctx, svc))) return;

  const messageId = parseMessageId(ctx.args[0]);
  if (!messageId) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}greroll <messageId|link>\`.`,
    });
    return;
  }
  const g = await getByMessage(messageId);
  if (!g) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: 'No giveaway with that message ID.',
    });
    return;
  }
  if (!g.ended) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: 'Giveaway hasn\'t ended yet — use `gend` to end it early first.',
    });
    return;
  }
  // Single-winner reroll regardless of original winnerCount — feels
  // most natural and matches user expectations.
  const single = { ...g, winnerCount: 1 };
  await pickAndAnnounce(svc.api, single, {
    excludeUserIds: g.winners,
    isReroll: true,
  });
};

// `!glist` — show pending giveaways for this server.
export const handleGiveawayList: Handler = async (ctx, svc) => {
  const all = await listActive(ctx.serverId);
  if (all.length === 0) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: 'No active giveaways.',
    });
    return;
  }
  const description = all
    .map((g) => {
      const remaining = Math.max(0, Math.floor((g.endAt.getTime() - Date.now()) / 1000));
      return `\`${g.messageId}\` in <#${g.channelId}> — **${g.prize}** (${g.winnerCount} winner${g.winnerCount === 1 ? '' : 's'}) — ends in ${formatDuration(remaining)}`;
    })
    .join('\n');
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: '',
    embeds: [
      buildEmbed({
        title: '🎉 Active giveaways',
        description,
        color: COLORS.ACCENT,
        footer: `${all.length} active`,
      }),
    ],
  });
};
