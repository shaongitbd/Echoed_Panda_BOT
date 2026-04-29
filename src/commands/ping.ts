import type { Handler } from './index.js';
import { pingDb } from '../db/pool.js';
import { buildEmbed, field, COLORS } from '../client/embeds.js';

function fmtUptime(ms: number): string {
  const sec = Math.floor(ms / 1000);
  const d = Math.floor(sec / 86_400);
  const h = Math.floor((sec % 86_400) / 3_600);
  const m = Math.floor((sec % 3_600) / 60);
  const s = sec % 60;
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m`;
  if (m) return `${m}m ${s}s`;
  return `${s}s`;
}

export const handlePing: Handler = async (ctx, { api, startedAt }) => {
  const start = Date.now();
  let dbHealthy = true;
  let dbLatency: number | null = null;
  try {
    await pingDb();
    dbLatency = Date.now() - start;
  } catch {
    dbHealthy = false;
  }

  await api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: '',
    embeds: [
      buildEmbed({
        title: '🐼 panda — health',
        // Color flips red if any system is unreachable. Otherwise we
        // stay on the bamboo-green "online" tone.
        color: dbHealthy ? COLORS.ONLINE : COLORS.DANGER,
        fields: [
          field('Uptime', fmtUptime(Date.now() - startedAt), true),
          field(
            'Database',
            dbHealthy ? `🟢 ${dbLatency}ms` : '🔴 unreachable',
            true,
          ),
        ],
      }),
    ],
  });
};
