import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import { getStarboardConfig, setStarboardConfig } from '../starboard/store.js';
import { parseChannelId } from '../util/parse.js';
import { buildEmbed, COLORS } from '../client/embeds.js';

async function requireManageServer(ctx: CommandContext, svc: Services): Promise<boolean> {
  const ok = await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_SERVER');
  if (!ok) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'You need the **Manage Server** permission to configure the starboard.',
    });
  }
  return ok;
}

async function reply(ctx: CommandContext, svc: Services, content: string): Promise<void> {
  await svc.api.sendMessage({ serverId: ctx.serverId, channelId: ctx.channelId, content });
}

const USAGE = (p: string): string =>
  `**Starboard** — pin the best messages by reaction
\`${p}starboard channel <#channel>\` — where highlights go (turns it on)
\`${p}starboard emoji <emoji>\` — the star emoji (default ⭐)
\`${p}starboard threshold <n>\` — reactions needed (default 3)
\`${p}starboard on|off\` — toggle`;

export const handleStarboard: Handler = async (ctx, svc) => {
  const sub = ctx.args[0]?.toLowerCase();

  if (!sub || sub === 'status') {
    const cfg = await getStarboardConfig(ctx.serverId);
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: '',
      embeds: [
        buildEmbed({
          title: `${cfg.emoji} Starboard`,
          color: cfg.enabled ? COLORS.ONLINE : COLORS.MUTED,
          description: cfg.enabled
            ? `Highlights post to <#${cfg.channelId}> once a message gets **${cfg.threshold}** ${cfg.emoji}.`
            : `Currently **off**. Turn it on with \`${ctx.prefix}starboard channel <#channel>\`.`,
        }),
      ],
    });
    return;
  }

  if (!(await requireManageServer(ctx, svc))) return;

  if (sub === 'channel') {
    const channelId = parseChannelId(ctx.args[1]);
    if (!channelId) {
      await reply(ctx, svc, `Usage: \`${ctx.prefix}starboard channel <#channel>\`.`);
      return;
    }
    const cfg = await setStarboardConfig(ctx.serverId, { channelId, enabled: true });
    await reply(ctx, svc, `✅ Starboard **on** — ${cfg.threshold}× ${cfg.emoji} sends a message to <#${channelId}>.`);
    return;
  }

  if (sub === 'emoji') {
    const emoji = ctx.args[1]?.trim();
    if (!emoji || emoji.length > 64) {
      await reply(ctx, svc, `Usage: \`${ctx.prefix}starboard emoji <emoji>\`.`);
      return;
    }
    await setStarboardConfig(ctx.serverId, { emoji });
    await reply(ctx, svc, `✅ Star emoji set to ${emoji}.`);
    return;
  }

  if (sub === 'threshold') {
    const n = ctx.args[1] ? parseInt(ctx.args[1], 10) : NaN;
    if (!Number.isFinite(n) || n < 1 || n > 50) {
      await reply(ctx, svc, 'Threshold must be between 1 and 50.');
      return;
    }
    await setStarboardConfig(ctx.serverId, { threshold: n });
    await reply(ctx, svc, `✅ A message now needs **${n}** reactions to hit the starboard.`);
    return;
  }

  if (sub === 'on' || sub === 'enable') {
    const cfg = await getStarboardConfig(ctx.serverId);
    if (!cfg.channelId) {
      await reply(ctx, svc, `Set a channel first: \`${ctx.prefix}starboard channel <#channel>\`.`);
      return;
    }
    await setStarboardConfig(ctx.serverId, { enabled: true });
    await reply(ctx, svc, '✅ Starboard **on**.');
    return;
  }

  if (sub === 'off' || sub === 'disable') {
    await setStarboardConfig(ctx.serverId, { enabled: false });
    await reply(ctx, svc, '💤 Starboard **off**.');
    return;
  }

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    replyToId: ctx.messageId,
    content: USAGE(ctx.prefix),
  });
};
