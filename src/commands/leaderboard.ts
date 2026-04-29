import type { Handler } from './index.js';
import { getLeaderboard } from '../levels/grant.js';

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

  const lines = ['**🏆 Leaderboard** — top by XP'];
  for (const entry of top) {
    // We mention each user by ID rather than resolving names — Echoed
    // turns `<@id>` into a rendered username on the client side, which
    // is faster than a fan-out of profile lookups here.
    const medal = entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : entry.rank === 3 ? '🥉' : ` #${entry.rank}`;
    lines.push(
      `${medal} <@${entry.userId}> · level **${entry.level}** · ${fmtXp(entry.totalXp)} XP`,
    );
  }

  await api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: lines.join('\n'),
  });
};
