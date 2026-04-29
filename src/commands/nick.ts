import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import { EchoedApiError } from '../client/echoedClient.js';

const USER_MENTION_RE = /^<@(?<id>[a-zA-Z0-9_-]+)>$/;
const BARE_ID_RE = /^[a-zA-Z0-9_-]{8,}$/;
const NICK_MAX = 32;

function parseUserId(arg: string | undefined): string | null {
  if (!arg) return null;
  const m = USER_MENTION_RE.exec(arg);
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
      content: 'You need the **Manage Server** permission to change nicknames.',
    });
  }
  return ok;
}

// `!nick @user new nickname here` — set a member's per-server nickname.
// Empty nickname clears it (use `!resetnick` for a friendlier alias).
export const handleNick: Handler = async (ctx, svc) => {
  if (!(await requireManageServer(ctx, svc))) return;

  const targetId = parseUserId(ctx.args[0]);
  if (!targetId) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}nick <@user> <nickname>\` — empty nickname resets to default.`,
    });
    return;
  }

  // Pull the nickname from raw content so multi-word names + emoji
  // arrive intact.
  const nickname = ctx.rawContent
    .trim()
    .slice(ctx.prefix.length)
    .split(/\s+/)
    .slice(2)
    .join(' ')
    .trim()
    .slice(0, NICK_MAX);

  try {
    if (nickname === '') {
      await svc.api.clearMemberNickname(ctx.serverId, targetId);
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        content: `Cleared <@${targetId}>'s nickname.`,
      });
      return;
    }
    await svc.api.setMemberNickname(ctx.serverId, targetId, nickname);
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: `Renamed <@${targetId}> to **${nickname}**.`,
    });
  } catch (err) {
    const msg = err instanceof EchoedApiError ? err.message : 'Failed to update nickname.';
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `❌ ${msg}`,
    });
  }
};

// `!resetnick @user` — explicit alias for clearing a nickname.
export const handleResetNick: Handler = async (ctx, svc) => {
  if (!(await requireManageServer(ctx, svc))) return;

  const targetId = parseUserId(ctx.args[0]);
  if (!targetId) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}resetnick <@user>\`.`,
    });
    return;
  }

  try {
    await svc.api.clearMemberNickname(ctx.serverId, targetId);
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: `Cleared <@${targetId}>'s nickname.`,
    });
  } catch (err) {
    const msg = err instanceof EchoedApiError ? err.message : 'Failed to clear nickname.';
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `❌ ${msg}`,
    });
  }
};
