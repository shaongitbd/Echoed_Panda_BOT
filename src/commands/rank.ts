import type { Handler } from './index.js';
import { getUserXp, getUserRank } from '../levels/grant.js';
import { progressToNext } from '../levels/curve.js';
import { buildEmbed, field, COLORS } from '../client/embeds.js';
import { log } from '../log.js';

// `<@userId>` is Echoed's mention wire format. We accept either a
// raw mention or a bare ID string so `!rank @someone` and
// `!rank 67e537d200011f5275d2` both work.
const MENTION_RE = /^<@(?<id>[a-zA-Z0-9_-]+)>$/;
const BARE_ID_RE = /^[a-zA-Z0-9_-]{8,}$/;

function parseTargetUserId(arg: string | undefined): string | null {
  if (!arg) return null;
  const m = MENTION_RE.exec(arg);
  if (m?.groups?.id) return m.groups.id;
  if (BARE_ID_RE.test(arg)) return arg;
  return null;
}

// Render an ASCII progress bar for the current level. 20 cells is wide
// enough to show meaningful progress without taking over the embed.
function progressBar(fraction: number, width = 20): string {
  const filled = Math.round(fraction * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function fmtXp(n: number): string {
  return n.toLocaleString('en-US');
}

export const handleRank: Handler = async (ctx, { api }) => {
  const target = parseTargetUserId(ctx.args[0]) ?? ctx.senderId;
  const isSelf = target === ctx.senderId;

  const xp = await getUserXp(ctx.serverId, target);
  if (!xp) {
    await api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: isSelf
        ? "You don't have any XP yet — chat a bit and try again."
        : `<@${target}> hasn't earned any XP yet.`,
    });
    return;
  }

  const progress = progressToNext(xp.totalXp);
  const rank = await getUserRank(ctx.serverId, target);

  // Echoed doesn't resolve `<@id>` mentions inside embed descriptions
  // (only in regular message content), so we have to fetch the
  // displayName ourselves — otherwise the card shows the raw user ID.
  // Best-effort: if the lookup fails, fall back to "Unknown user"
  // rather than leaking the ID.
  let displayName = isSelf ? ctx.senderName : 'Unknown user';
  try {
    const profile = await api.getMemberProfile(ctx.serverId, target);
    displayName = profile.displayName || profile.username || displayName;
  } catch (err) {
    log.debug({ err, target }, 'Rank: getMemberProfile failed, falling back');
  }

  const description = [
    `**${displayName}**`,
    `\`${progressBar(progress.fraction)}\` ${fmtXp(progress.intoLevel)} / ${fmtXp(progress.levelTotal)} XP`,
  ].join('\n');

  const fields = [
    field('Level', `**${progress.level}**`, true),
    field('Total XP', fmtXp(xp.totalXp), true),
    field('Rank', rank ? `#${rank}` : '—', true),
  ];

  await api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: '',
    embeds: [
      buildEmbed({
        title: 'Rank',
        description,
        color: COLORS.ACCENT,
        fields,
        footer: `${fmtXp(progress.remaining)} XP to level ${progress.level + 1}`,
      }),
    ],
  });
};
