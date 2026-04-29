import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import { addCounter, removeCounter, listForServer, type StatKind } from '../stats/store.js';
import { buildEmbed, COLORS } from '../client/embeds.js';

const CHANNEL_MENTION_RE = /^<#(?<id>[a-zA-Z0-9_-]+)>$/;
const BARE_ID_RE = /^[a-zA-Z0-9_-]{8,}$/;

function parseChannelId(arg: string | undefined): string | null {
  if (!arg) return null;
  const m = CHANNEL_MENTION_RE.exec(arg);
  if (m?.groups?.id) return m.groups.id;
  if (BARE_ID_RE.test(arg)) return arg;
  return null;
}

function parseKind(arg: string | undefined): StatKind | null {
  if (!arg) return null;
  const lower = arg.toLowerCase();
  if (lower === 'members' || lower === 'member') return 'members';
  if (lower === 'channels' || lower === 'channel') return 'channels';
  return null;
}

async function requireManageServer(ctx: CommandContext, svc: Services): Promise<boolean> {
  const ok = await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_SERVER');
  if (!ok) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'You need the **Manage Server** permission to manage stat counters.',
    });
  }
  return ok;
}

const USAGE = (prefix: string): string =>
  `Usage:
\`${prefix}statcounter add <#channel> <members|channels> [format]\`
\`${prefix}statcounter remove <#channel>\`
\`${prefix}statcounter list\`

Format supports \`{count}\`. Default: "Members: {count}".`;

export const handleStatCounter: Handler = async (ctx, svc) => {
  const sub = ctx.args[0]?.toLowerCase();

  if (!sub || sub === 'list') {
    const all = await listForServer(ctx.serverId);
    if (all.length === 0) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        content: `No stat counters configured. Add one with \`${ctx.prefix}statcounter add\`.`,
      });
      return;
    }
    const description = all
      .map((c) => `<#${c.channelId}> · \`${c.kind}\` · format: \`${c.format}\``)
      .join('\n');
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: '',
      embeds: [
        buildEmbed({
          title: '# Stat counters',
          description,
          color: COLORS.ACCENT,
          footer: `${all.length} configured`,
        }),
      ],
    });
    return;
  }

  if (!(await requireManageServer(ctx, svc))) return;

  if (sub === 'add') {
    const channelId = parseChannelId(ctx.args[1]);
    const kind = parseKind(ctx.args[2]);
    if (!channelId || !kind) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: USAGE(ctx.prefix),
      });
      return;
    }
    // Format is everything after kind. If empty, fall back to a sane
    // default per kind so users get useful output without typing one.
    const format = ctx.rawContent
      .trim()
      .slice(ctx.prefix.length)
      .split(/\s+/)
      .slice(4)
      .join(' ')
      .trim()
      .slice(0, 100) ||
      (kind === 'members' ? 'Members: {count}' : 'Channels: {count}');

    await addCounter({
      serverId: ctx.serverId,
      channelId,
      kind,
      format,
    });
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: `<#${channelId}> will track \`${kind}\` with format \`${format}\`. Updates run on the next tick (≤1 min).`,
    });
    return;
  }

  if (sub === 'remove' || sub === 'delete') {
    const channelId = parseChannelId(ctx.args[1]);
    if (!channelId) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: `Usage: \`${ctx.prefix}statcounter remove <#channel>\`.`,
      });
      return;
    }
    const removed = await removeCounter(channelId);
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: removed
        ? `Removed stat counter for <#${channelId}>. The channel name stays as-is.`
        : `No stat counter on <#${channelId}>.`,
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
