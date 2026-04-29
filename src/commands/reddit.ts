import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import { addSub, removeSub, listForServer } from '../reddit/store.js';

const CHANNEL_MENTION_RE = /^<#(?<id>[a-zA-Z0-9_-]+)>$/;
const BARE_ID_RE = /^[a-zA-Z0-9_-]{8,}$/;
const SUBREDDIT_RE = /^[a-zA-Z0-9_]{2,21}$/;

function parseChannelId(arg: string | undefined): string | null {
  if (!arg) return null;
  const m = CHANNEL_MENTION_RE.exec(arg);
  if (m?.groups?.id) return m.groups.id;
  if (BARE_ID_RE.test(arg)) return arg;
  return null;
}

// Accept "memes", "r/memes", or "/r/memes". Validates against Reddit's
// subreddit naming rules (2-21 chars, alphanumeric + underscore).
function parseSubreddit(arg: string | undefined): string | null {
  if (!arg) return null;
  const stripped = arg.replace(/^\/?r\//i, '').toLowerCase();
  return SUBREDDIT_RE.test(stripped) ? stripped : null;
}

async function requireManageServer(ctx: CommandContext, svc: Services): Promise<boolean> {
  const ok = await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_SERVER');
  if (!ok) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'You need the **Manage Server** permission to manage Reddit subscriptions.',
    });
  }
  return ok;
}

const USAGE = (prefix: string): string =>
  `Usage:
\`${prefix}reddit follow <subreddit> <#channel>\`
\`${prefix}reddit unfollow <subreddit> <#channel>\`
\`${prefix}reddit list\``;

export const handleReddit: Handler = async (ctx, svc) => {
  const sub = ctx.args[0]?.toLowerCase();

  if (!sub || sub === 'list') {
    const all = await listForServer(ctx.serverId);
    if (all.length === 0) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        content: `No Reddit subscriptions yet. Add one with \`${ctx.prefix}reddit follow <subreddit> <#channel>\`.`,
      });
      return;
    }
    const lines = ['**Reddit subscriptions**'];
    for (const s of all) {
      lines.push(`r/${s.subreddit} → <#${s.channelId}>`);
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
    const subreddit = parseSubreddit(ctx.args[1]);
    const channelId = parseChannelId(ctx.args[2]);
    if (!subreddit || !channelId) {
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
      subreddit,
      createdBy: ctx.senderId,
    });
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: `New posts from **r/${subreddit}** will appear in <#${channelId}>. First fetch happens on the next tick (≤5 min).`,
    });
    return;
  }

  if (sub === 'unfollow' || sub === 'remove') {
    const subreddit = parseSubreddit(ctx.args[1]);
    const channelId = parseChannelId(ctx.args[2]);
    if (!subreddit || !channelId) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: USAGE(ctx.prefix),
      });
      return;
    }
    const removed = await removeSub(ctx.serverId, channelId, subreddit);
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: removed
        ? `No more posts from **r/${subreddit}** in <#${channelId}>.`
        : `<#${channelId}> wasn't subscribed to r/${subreddit}.`,
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
