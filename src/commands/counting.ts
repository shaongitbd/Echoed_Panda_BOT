import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import { getCountingConfig, setCountingConfig, resetCount } from '../counting/store.js';
import { parseChannelId } from '../util/parse.js';
import { buildEmbed, COLORS, field } from '../client/embeds.js';

async function requireManageServer(ctx: CommandContext, svc: Services): Promise<boolean> {
  const ok = await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_SERVER');
  if (!ok) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'You need the **Manage Server** permission to configure counting.',
    });
  }
  return ok;
}

async function reply(ctx: CommandContext, svc: Services, content: string): Promise<void> {
  await svc.api.sendMessage({ serverId: ctx.serverId, channelId: ctx.channelId, content });
}

const USAGE = (p: string): string =>
  `**Counting** — the squad counts up together
\`${p}counting channel <#channel>\` — set the channel (turns it on, starts at 1)
\`${p}counting on|off\` — toggle
\`${p}counting reset\` — start over from 1
\`${p}counting strict on|off\` — reset the chain on a mistake (default on)`;

export const handleCounting: Handler = async (ctx, svc) => {
  const sub = ctx.args[0]?.toLowerCase();

  if (!sub || sub === 'status') {
    const cfg = await getCountingConfig(ctx.serverId);
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: '',
      embeds: [
        buildEmbed({
          title: '🔢 Counting',
          color: cfg.enabled ? COLORS.ONLINE : COLORS.MUTED,
          description: cfg.enabled
            ? `Counting in <#${cfg.channelId}>. Next number is **${cfg.currentCount + 1}**.`
            : `Currently **off**. Turn it on with \`${ctx.prefix}counting channel <#channel>\`.`,
          fields: [
            field('Current', String(cfg.currentCount), true),
            field('High score', String(cfg.highScore), true),
            field('Strict', cfg.resetOnFail ? 'on' : 'off', true),
          ],
        }),
      ],
    });
    return;
  }

  if (!(await requireManageServer(ctx, svc))) return;

  if (sub === 'channel') {
    const channelId = parseChannelId(ctx.args[1]);
    if (!channelId) {
      await reply(ctx, svc, `Usage: \`${ctx.prefix}counting channel <#channel>\`.`);
      return;
    }
    await setCountingConfig(ctx.serverId, { channelId, enabled: true, currentCount: 0, lastUserId: null });
    await reply(ctx, svc, `✅ Counting is **on** in <#${channelId}> — someone start with **1**!`);
    return;
  }

  if (sub === 'on' || sub === 'enable') {
    const cfg = await getCountingConfig(ctx.serverId);
    if (!cfg.channelId) {
      await reply(ctx, svc, `Set a channel first: \`${ctx.prefix}counting channel <#channel>\`.`);
      return;
    }
    await setCountingConfig(ctx.serverId, { enabled: true });
    await reply(ctx, svc, `✅ Counting **on**. Next number is **${cfg.currentCount + 1}**.`);
    return;
  }

  if (sub === 'off' || sub === 'disable') {
    await setCountingConfig(ctx.serverId, { enabled: false });
    await reply(ctx, svc, '💤 Counting **off**.');
    return;
  }

  if (sub === 'reset') {
    await resetCount(ctx.serverId);
    await reply(ctx, svc, '🔄 Count reset — next number is **1**.');
    return;
  }

  if (sub === 'strict') {
    const arg = ctx.args[1]?.toLowerCase();
    if (arg !== 'on' && arg !== 'off') {
      await reply(ctx, svc, `Usage: \`${ctx.prefix}counting strict on|off\`.`);
      return;
    }
    await setCountingConfig(ctx.serverId, { resetOnFail: arg === 'on' });
    await reply(
      ctx,
      svc,
      arg === 'on'
        ? '✅ Strict mode **on** — a wrong number resets the chain.'
        : '✅ Strict mode **off** — wrong numbers just get an ❌, no reset.',
    );
    return;
  }

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    replyToId: ctx.messageId,
    content: USAGE(ctx.prefix),
  });
};
