import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import { parseDuration, formatDuration } from '../mod/duration.js';
import { recordTemp, listForServer, cancelTemp } from '../tempChannels/store.js';
import { EchoedApiError } from '../client/echoedClient.js';
import { buildEmbed, COLORS } from '../client/embeds.js';

const MIN_DURATION = 5 * 60;          // 5 min
const MAX_DURATION = 30 * 24 * 3600;  // 30 days

async function requireManageChannels(ctx: CommandContext, svc: Services): Promise<boolean> {
  const ok = await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_CHANNELS');
  if (!ok) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'You need the **Manage Channels** permission for this command.',
    });
  }
  return ok;
}

// Per-channel variant — honours channel overrides so a member who has
// Manage Channels granted (or denied) on a specific channel is gated
// correctly when cancelling that channel's auto-delete.
async function requireManageChannelsIn(
  ctx: CommandContext,
  svc: Services,
  targetChannelId: string,
): Promise<boolean> {
  const ok = await svc.perms.hasIn(ctx.serverId, targetChannelId, ctx.senderId, 'MANAGE_CHANNELS');
  if (!ok) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `You need the **Manage Channels** permission in <#${targetChannelId}>.`,
    });
  }
  return ok;
}

const USAGE = (prefix: string): string =>
  `Usage:
\`${prefix}tempchannel <name> <duration>\` — create (e.g. \`30m\`, \`2h\`, \`1d\`)
\`${prefix}tempchannel list\` — show pending expirations
\`${prefix}tempchannel cancel <#channel>\` — keep a channel that was scheduled to delete`;

export const handleTempChannel: Handler = async (ctx, svc) => {
  const sub = ctx.args[0]?.toLowerCase();

  if (sub === 'list') {
    const pending = await listForServer(ctx.serverId);
    if (pending.length === 0) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        content: 'No pending temp-channel expirations.',
      });
      return;
    }
    const description = pending
      .map((t) => {
        const remaining = Math.max(0, Math.floor((t.expiresAt.getTime() - Date.now()) / 1000));
        return `<#${t.channelId}> — expires in ${formatDuration(remaining)}`;
      })
      .join('\n');
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: '',
      embeds: [
        buildEmbed({
          title: 'Pending temp channels',
          description,
          color: COLORS.ACCENT,
          footer: `${pending.length} pending`,
        }),
      ],
    });
    return;
  }

  if (sub === 'cancel') {
    const arg = ctx.args[1];
    const channelMention = arg?.match(/^<#(?<id>[a-zA-Z0-9_-]+)>$/);
    const channelId = channelMention?.groups?.id ?? arg;
    if (!channelId) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: `Usage: \`${ctx.prefix}tempchannel cancel <#channel>\`.`,
      });
      return;
    }
    if (!(await requireManageChannelsIn(ctx, svc, channelId))) return;
    const removed = await cancelTemp(channelId);
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: removed
        ? `<#${channelId}> will no longer auto-delete.`
        : `<#${channelId}> wasn't a scheduled temp channel.`,
    });
    return;
  }

  // Default: !tempchannel <name> <duration> — creating a brand-new
  // channel is a server-level operation, so server-level perms apply.
  if (!(await requireManageChannels(ctx, svc))) return;

  const name = ctx.args[0];
  const durArg = ctx.args[1];
  const duration = durArg ? parseDuration(durArg) : null;

  if (!name || !duration) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: USAGE(ctx.prefix),
    });
    return;
  }
  if (duration < MIN_DURATION || duration > MAX_DURATION) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Duration must be between 5 minutes and 30 days.`,
    });
    return;
  }

  let channelId: string;
  try {
    const created = await svc.api.createChannel({
      serverId: ctx.serverId,
      name,
      type: 'text',
    });
    channelId = created.channel.id;
  } catch (err) {
    const reason = err instanceof EchoedApiError ? err.message : 'unknown error';
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Couldn't create channel: ${reason}`,
    });
    return;
  }

  const expiresAt = new Date(Date.now() + duration * 1000);
  await recordTemp({
    channelId,
    serverId: ctx.serverId,
    expiresAt,
    createdBy: ctx.senderId,
  });

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: `Created <#${channelId}> — auto-deletes in ${formatDuration(duration)}.`,
  });
};
