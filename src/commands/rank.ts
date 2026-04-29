import type { Handler } from './index.js';
import { getUserXp, getUserRank } from '../levels/grant.js';
import { progressToNext } from '../levels/curve.js';

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
// enough to show meaningful progress without taking over the message.
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

  const lines = [
    `**Rank** for <@${target}>`,
    `Level **${progress.level}** · ${fmtXp(xp.totalXp)} total XP${rank ? ` · #${rank} on the server` : ''}`,
    `\`${progressBar(progress.fraction)}\` ${fmtXp(progress.intoLevel)} / ${fmtXp(progress.levelTotal)} XP`,
    `${fmtXp(progress.remaining)} XP to level ${progress.level + 1}`,
  ];

  await api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: lines.join('\n'),
  });
};
