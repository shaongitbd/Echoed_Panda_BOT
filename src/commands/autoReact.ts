import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import { addAutoReact, removeAutoReact, listForServer } from '../autoReact/store.js';
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

async function requireManageServer(ctx: CommandContext, svc: Services): Promise<boolean> {
  const ok = await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_SERVER');
  if (!ok) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'You need the **Manage Server** permission for auto-react config.',
    });
  }
  return ok;
}

const USAGE = (prefix: string): string =>
  `Usage:
\`${prefix}autoreact add #channel <emoji>\`
\`${prefix}autoreact remove #channel <emoji>\`
\`${prefix}autoreact list\``;

export const handleAutoReact: Handler = async (ctx, svc) => {
  const sub = ctx.args[0]?.toLowerCase();

  if (!sub || sub === 'list') {
    const all = await listForServer(ctx.serverId);
    if (all.length === 0) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        content: `No auto-reacts configured. Add one with \`${ctx.prefix}autoreact add #channel <emoji>\`.`,
      });
      return;
    }
    const description = all
      .map((r) => `<#${r.channelId}> → ${r.emoji}`)
      .join('\n');
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: '',
      embeds: [
        buildEmbed({
          title: 'Auto-react rules',
          description,
          color: COLORS.ACCENT,
          footer: `${all.length} rule${all.length === 1 ? '' : 's'}`,
        }),
      ],
    });
    return;
  }

  if (!(await requireManageServer(ctx, svc))) return;

  if (sub === 'add') {
    const channelId = parseChannelId(ctx.args[1]);
    const emoji = ctx.args[2];
    if (!channelId || !emoji) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: USAGE(ctx.prefix),
      });
      return;
    }
    await addAutoReact({
      serverId: ctx.serverId,
      channelId,
      emoji,
      createdBy: ctx.senderId,
    });
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: `Every new message in <#${channelId}> will get ${emoji}.`,
    });
    return;
  }

  if (sub === 'remove' || sub === 'delete') {
    const channelId = parseChannelId(ctx.args[1]);
    const emoji = ctx.args[2];
    if (!channelId || !emoji) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: USAGE(ctx.prefix),
      });
      return;
    }
    const removed = await removeAutoReact(channelId, emoji);
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: removed
        ? `Removed ${emoji} from <#${channelId}>.`
        : `No auto-react ${emoji} on <#${channelId}>.`,
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
