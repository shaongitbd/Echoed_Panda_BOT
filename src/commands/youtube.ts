import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import { addSub, removeSub, listForServer } from '../youtube/store.js';

const CHANNEL_MENTION_RE = /^<#(?<id>[a-zA-Z0-9_-]+)>$/;
const BARE_ID_RE = /^[a-zA-Z0-9_-]{8,}$/;
// YouTube channel IDs always start with `UC` and are 24 chars total.
const YT_CHANNEL_RE = /^UC[a-zA-Z0-9_-]{22}$/;

function parseChannelId(arg: string | undefined): string | null {
  if (!arg) return null;
  const m = CHANNEL_MENTION_RE.exec(arg);
  if (m?.groups?.id) return m.groups.id;
  if (BARE_ID_RE.test(arg)) return arg;
  return null;
}

// Accept the bare `UC...` ID, or pull it from a /channel/UC... URL.
// Handle-style URLs (@handle) require an API key to resolve, so we
// reject them and ask for the channel ID instead.
function parseYoutubeChannelId(arg: string | undefined): string | null {
  if (!arg) return null;
  const trimmed = arg.trim();
  const fromUrl = /\/channel\/(UC[a-zA-Z0-9_-]{22})/.exec(trimmed);
  if (fromUrl?.[1]) return fromUrl[1];
  return YT_CHANNEL_RE.test(trimmed) ? trimmed : null;
}

async function requireManageServer(ctx: CommandContext, svc: Services): Promise<boolean> {
  const ok = await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_SERVER');
  if (!ok) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'You need the **Manage Server** permission to manage YouTube subscriptions.',
    });
  }
  return ok;
}

const USAGE = (prefix: string): string =>
  `Usage:
\`${prefix}youtube follow <UC...> <#channel>\` (channel ID, not @handle)
\`${prefix}youtube unfollow <UC...> <#channel>\`
\`${prefix}youtube list\`

Find the channel ID at \`youtube.com/channel/UC...\` or via "View source" on the channel page.`;

export const handleYoutube: Handler = async (ctx, svc) => {
  const sub = ctx.args[0]?.toLowerCase();

  if (!sub || sub === 'list') {
    const all = await listForServer(ctx.serverId);
    if (all.length === 0) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        content: `No YouTube subscriptions yet. Add one with \`${ctx.prefix}youtube follow <UC...> <#channel>\`.`,
      });
      return;
    }
    const lines = ['**YouTube subscriptions**'];
    for (const s of all) {
      lines.push(`\`${s.youtubeChannelId}\` → <#${s.channelId}>`);
    }
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: lines.join('\n'),
    });
    return;
  }

  if (!(await requireManageServer(ctx, svc))) return;

  if (sub === 'follow' || sub === 'add') {
    const ytChannel = parseYoutubeChannelId(ctx.args[1]);
    const channelId = parseChannelId(ctx.args[2]);
    if (!ytChannel || !channelId) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: USAGE(ctx.prefix),
      });
      return;
    }
    await addSub({
      serverId: ctx.serverId,
      channelId,
      youtubeChannelId: ytChannel,
      createdBy: ctx.senderId,
    });
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: `Following \`${ytChannel}\` in <#${channelId}>. First check happens on the next tick (≤5 min).`,
    });
    return;
  }

  if (sub === 'unfollow' || sub === 'remove') {
    const ytChannel = parseYoutubeChannelId(ctx.args[1]);
    const channelId = parseChannelId(ctx.args[2]);
    if (!ytChannel || !channelId) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: USAGE(ctx.prefix),
      });
      return;
    }
    const removed = await removeSub(ctx.serverId, channelId, ytChannel);
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: removed
        ? `No more notifications from \`${ytChannel}\` in <#${channelId}>.`
        : `<#${channelId}> wasn't following ${ytChannel}.`,
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
