import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import { getGuildConfig, setGuildConfig } from '../db/guildConfig.js';

async function requireManageServer(ctx: CommandContext, svc: Services): Promise<boolean> {
  const ok = await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_SERVER');
  if (!ok) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'You need the **Manage Server** permission for anti-raid config.',
    });
  }
  return ok;
}

const USAGE = (prefix: string): string =>
  `Usage:
\`${prefix}antiraid\` — show status
\`${prefix}antiraid on|off\` — toggle
\`${prefix}antiraid threshold <n>\` — joins required (default 10)
\`${prefix}antiraid window <seconds>\` — window length (default 30)
\`${prefix}antiraid clear\` — end lockdown immediately`;

export const handleAntiRaid: Handler = async (ctx, svc) => {
  if (!(await requireManageServer(ctx, svc))) return;

  const sub = ctx.args[0]?.toLowerCase();
  const cfg = await getGuildConfig(ctx.serverId);

  if (!sub) {
    const lines = [
      `**Anti-raid** — ${cfg.antiRaidEnabled ? '🟢 enabled' : '⚪ disabled'}`,
      `Threshold: **${cfg.antiRaidThreshold}** joins in **${cfg.antiRaidWindowSeconds}s**`,
    ];
    if (cfg.antiRaidLockdownUntil && cfg.antiRaidLockdownUntil > new Date()) {
      lines.push(`🔒 Lockdown active until ${cfg.antiRaidLockdownUntil.toISOString()}`);
    }
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: lines.join('\n'),
    });
    return;
  }

  if (sub === 'on' || sub === 'enable') {
    await setGuildConfig(ctx.serverId, { antiRaidEnabled: true });
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: `Anti-raid **enabled** at ${cfg.antiRaidThreshold}/${cfg.antiRaidWindowSeconds}s.`,
    });
    return;
  }

  if (sub === 'off' || sub === 'disable') {
    await setGuildConfig(ctx.serverId, { antiRaidEnabled: false });
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: 'Anti-raid **disabled**.',
    });
    return;
  }

  if (sub === 'threshold') {
    const n = ctx.args[1] ? parseInt(ctx.args[1], 10) : NaN;
    if (!Number.isFinite(n) || n < 2 || n > 200) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: 'Threshold must be between 2 and 200.',
      });
      return;
    }
    await setGuildConfig(ctx.serverId, { antiRaidThreshold: n });
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: `Threshold set to ${n} joins.`,
    });
    return;
  }

  if (sub === 'window') {
    const n = ctx.args[1] ? parseInt(ctx.args[1], 10) : NaN;
    if (!Number.isFinite(n) || n < 5 || n > 600) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: 'Window must be between 5 and 600 seconds.',
      });
      return;
    }
    await setGuildConfig(ctx.serverId, { antiRaidWindowSeconds: n });
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: `Window set to ${n} seconds.`,
    });
    return;
  }

  if (sub === 'clear' || sub === 'unlock') {
    await setGuildConfig(ctx.serverId, { antiRaidLockdownUntil: null });
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: 'Lockdown cleared.',
    });
    return;
  }

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    replyToId: ctx.messageId,
    content: USAGE(ctx.prefix),
  });
};
