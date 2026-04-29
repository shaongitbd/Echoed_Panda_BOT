import type { Handler } from './index.js';
import { getLeaderboard } from '../levels/grant.js';
import { buildEmbed, COLORS } from '../client/embeds.js';

const MAX_ROWS = 10;

function fmtXp(n: number): string {
  return n.toLocaleString('en-US');
}

export const handleLeaderboard: Handler = async (ctx, { api }) => {
  const top = await getLeaderboard(ctx.serverId, MAX_ROWS);

  if (top.length === 0) {
    await api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: 'Nobody has any XP yet — leaderboard is empty.',
    });
    return;
  }

  // Render the leaderboard as a description list rather than fields —
  // a list reads top-to-bottom which matches the "ranking" mental
  // model better than a 3-column grid.
  const lines: string[] = [];
  for (const entry of top) {
    const medal =
      entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : `\`#${entry.rank}\``;
    lines.push(
      `${medal} <@${entry.userId}> · level **${entry.level}** · ${fmtXp(entry.totalXp)} XP`,
    );
  }

  await api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: '',
    embeds: [
      buildEmbed({
        title: '🏆 Leaderboard',
        description: lines.join('\n'),
        color: COLORS.ACCENT,
        footer: `Top ${top.length} by XP`,
      }),
    ],
  });
};
