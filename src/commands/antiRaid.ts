import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import { getGuildConfig, setGuildConfig } from '../db/guildConfig.js';
import { buildEmbed, field, COLORS } from '../client/embeds.js';

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
    const lockdownActive =
      cfg.antiRaidLockdownUntil != null && cfg.antiRaidLockdownUntil > new Date();
    // Three states drive the color: lockdown active = danger red,
    // enabled-but-quiet = bamboo green, disabled = muted gray.
    const color = lockdownActive
      ? COLORS.DANGER
      : cfg.antiRaidEnabled
        ? COLORS.ONLINE
        : COLORS.MUTED;

    const fields = [
      field('Status', cfg.antiRaidEnabled ? '🟢 enabled' : '⚪ disabled', true),
      field('Threshold', `${cfg.antiRaidThreshold} joins`, true),
      field('Window', `${cfg.antiRaidWindowSeconds}s`, true),
    ];
    if (lockdownActive && cfg.antiRaidLockdownUntil) {
      fields.push(
        field('🔒 Lockdown until', cfg.antiRaidLockdownUntil.toISOString(), false),
      );
    }

    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: '',
      embeds: [
        buildEmbed({
          title: 'Anti-raid',
          color,
          fields,
        }),
      ],
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
