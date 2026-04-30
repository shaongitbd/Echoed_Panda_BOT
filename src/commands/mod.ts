import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import type { Permission } from '../auth/permissions.js';
import { setGuildConfig } from '../db/guildConfig.js';
import { postModAction } from '../mod/modlog.js';
import { parseDuration, formatDuration, MAX_TIMEOUT_SECONDS } from '../mod/duration.js';
import { EchoedApiError } from '../client/echoedClient.js';

// ─── Mention parsing ────────────────────────────────────────────────────

const USER_MENTION_RE = /^<@(?<id>[a-zA-Z0-9_-]+)>$/;
const CHANNEL_MENTION_RE = /^<#(?<id>[a-zA-Z0-9_-]+)>$/;
const BARE_ID_RE = /^[a-zA-Z0-9_-]{8,}$/;

function parseUserId(arg: string | undefined): string | null {
  if (!arg) return null;
  const m = USER_MENTION_RE.exec(arg);
  if (m?.groups?.id) return m.groups.id;
  if (BARE_ID_RE.test(arg)) return arg;
  return null;
}

function parseChannelId(arg: string | undefined): string | null {
  if (!arg) return null;
  const m = CHANNEL_MENTION_RE.exec(arg);
  if (m?.groups?.id) return m.groups.id;
  if (BARE_ID_RE.test(arg)) return arg;
  return null;
}

// Pull the reason out of `args[1..]`. Empty → null so the mod-log skips
// the "Reason:" line rather than printing "Reason: ".
function joinReason(args: string[], startIndex: number): string | null {
  const reason = args.slice(startIndex).join(' ').trim();
  return reason.length > 0 ? reason : null;
}

async function requirePerm(
  ctx: CommandContext,
  svc: Services,
  perm: Permission,
  label: string,
): Promise<boolean> {
  const ok = await svc.perms.has(ctx.serverId, ctx.senderId, perm);
  if (!ok) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `You need the **${label}** permission for this command.`,
    });
  }
  return ok;
}

// Channel-scoped variant — honours per-channel role/user overrides so a
// member with a server-level perm that's been revoked on this channel
// (or granted only on this channel) is gated correctly.
async function requirePermInChannel(
  ctx: CommandContext,
  svc: Services,
  perm: Permission,
  label: string,
): Promise<boolean> {
  const ok = await svc.perms.hasIn(ctx.serverId, ctx.channelId, ctx.senderId, perm);
  if (!ok) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `You need the **${label}** permission in this channel.`,
    });
  }
  return ok;
}

// Standard error reply that surfaces the upstream API's message when
// useful (e.g. "Cannot kick the server owner.") but stays generic on
// unexpected shapes.
async function replyError(
  ctx: CommandContext,
  svc: Services,
  err: unknown,
  fallback: string,
): Promise<void> {
  const message =
    err instanceof EchoedApiError ? err.message : err instanceof Error ? err.message : fallback;
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    replyToId: ctx.messageId,
    content: `❌ ${message}`,
  });
}

// ─── kick / ban / unban ─────────────────────────────────────────────────

export const handleKick: Handler = async (ctx, svc) => {
  if (!(await requirePerm(ctx, svc, 'KICK_MEMBERS', 'Kick Members'))) return;

  const targetId = parseUserId(ctx.args[0]);
  if (!targetId) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}kick <@user> [reason]\`.`,
    });
    return;
  }
  const reason = joinReason(ctx.args, 1);

  try {
    await svc.api.kickMember(ctx.serverId, targetId, reason ?? undefined);
  } catch (err) {
    await replyError(ctx, svc, err, 'Failed to kick member.');
    return;
  }

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: `👢 Kicked <@${targetId}>${reason ? ` — ${reason}` : ''}`,
  });
  await postModAction(svc.api, {
    serverId: ctx.serverId,
    action: 'kick',
    targetId,
    actorId: ctx.senderId,
    reason,
  });
};

export const handleBan: Handler = async (ctx, svc) => {
  if (!(await requirePerm(ctx, svc, 'BAN_MEMBERS', 'Ban Members'))) return;

  const targetId = parseUserId(ctx.args[0]);
  if (!targetId) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}ban <@user> [reason]\`.`,
    });
    return;
  }
  const reason = joinReason(ctx.args, 1);

  try {
    await svc.api.banMember(ctx.serverId, targetId, reason ?? undefined);
  } catch (err) {
    await replyError(ctx, svc, err, 'Failed to ban member.');
    return;
  }

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: `🔨 Banned <@${targetId}>${reason ? ` — ${reason}` : ''}`,
  });
  await postModAction(svc.api, {
    serverId: ctx.serverId,
    action: 'ban',
    targetId,
    actorId: ctx.senderId,
    reason,
  });
};

export const handleUnban: Handler = async (ctx, svc) => {
  if (!(await requirePerm(ctx, svc, 'BAN_MEMBERS', 'Ban Members'))) return;

  const targetId = parseUserId(ctx.args[0]);
  if (!targetId) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}unban <userId>\`.`,
    });
    return;
  }

  try {
    await svc.api.unbanMember(ctx.serverId, targetId);
  } catch (err) {
    await replyError(ctx, svc, err, 'Failed to unban member.');
    return;
  }

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: `🕊️ Unbanned <@${targetId}>`,
  });
  await postModAction(svc.api, {
    serverId: ctx.serverId,
    action: 'unban',
    targetId,
    actorId: ctx.senderId,
  });
};

// ─── timeout / untimeout ────────────────────────────────────────────────

export const handleTimeout: Handler = async (ctx, svc) => {
  if (!(await requirePerm(ctx, svc, 'MUTE_MEMBERS', 'Mute Members'))) return;

  const targetId = parseUserId(ctx.args[0]);
  const durArg = ctx.args[1];
  if (!targetId || !durArg) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}timeout <@user> <duration> [reason]\`. Examples: \`5m\`, \`1h30m\`, \`1d\`.`,
    });
    return;
  }

  const seconds = parseDuration(durArg);
  if (!seconds || seconds < 1) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Couldn't parse \`${durArg}\` as a duration. Try \`5m\`, \`1h\`, \`1d\`, etc.`,
    });
    return;
  }

  // Backend caps at 28 days too, but echoing the cap here lets us show
  // "Timed out for 28d" instead of a confusing exact-second value.
  const capped = Math.min(seconds, MAX_TIMEOUT_SECONDS);
  const reason = joinReason(ctx.args, 2);

  try {
    await svc.api.timeoutMember(ctx.serverId, targetId, capped, reason ?? undefined);
  } catch (err) {
    await replyError(ctx, svc, err, 'Failed to time out member.');
    return;
  }

  const human = formatDuration(capped);
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: `🔇 Timed out <@${targetId}> for **${human}**${reason ? ` — ${reason}` : ''}`,
  });
  await postModAction(svc.api, {
    serverId: ctx.serverId,
    action: 'timeout',
    targetId,
    actorId: ctx.senderId,
    reason,
    extra: human,
  });
};

export const handleUntimeout: Handler = async (ctx, svc) => {
  if (!(await requirePerm(ctx, svc, 'MUTE_MEMBERS', 'Mute Members'))) return;

  const targetId = parseUserId(ctx.args[0]);
  if (!targetId) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}untimeout <@user>\`.`,
    });
    return;
  }

  try {
    await svc.api.clearTimeout(ctx.serverId, targetId);
  } catch (err) {
    await replyError(ctx, svc, err, 'Failed to clear timeout.');
    return;
  }

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: `🔊 Cleared timeout for <@${targetId}>`,
  });
  await postModAction(svc.api, {
    serverId: ctx.serverId,
    action: 'untimeout',
    targetId,
    actorId: ctx.senderId,
  });
};

// ─── purge ──────────────────────────────────────────────────────────────

const PURGE_MAX = 100;

export const handlePurge: Handler = async (ctx, svc) => {
  if (!(await requirePermInChannel(ctx, svc, 'MANAGE_MESSAGES', 'Manage Messages'))) return;

  const countArg = ctx.args[0];
  const count = countArg ? parseInt(countArg, 10) : NaN;
  if (!Number.isFinite(count) || count < 1 || count > PURGE_MAX) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}purge <1-${PURGE_MAX}>\`.`,
    });
    return;
  }

  // Fetch count + 1 to include the !purge invocation itself in the
  // sweep. The bulk-delete endpoint is fine with stale IDs (skipped
  // silently), so a small over-fetch is safe.
  let messages;
  try {
    messages = await svc.api.getChannelMessages(ctx.serverId, ctx.channelId, count + 1);
  } catch (err) {
    await replyError(ctx, svc, err, 'Failed to list messages to purge.');
    return;
  }
  if (messages.length === 0) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: 'Nothing to purge.',
    });
    return;
  }

  const ids = messages.map((m) => m.id).slice(0, PURGE_MAX);

  let deleted = 0;
  try {
    const res = await svc.api.bulkDeleteMessages(ctx.serverId, ctx.channelId, ids);
    deleted = res.count;
  } catch (err) {
    await replyError(ctx, svc, err, 'Bulk delete failed.');
    return;
  }

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: `🧹 Purged **${deleted}** message${deleted === 1 ? '' : 's'}.`,
  });
  await postModAction(svc.api, {
    serverId: ctx.serverId,
    action: 'purge',
    targetId: null,
    actorId: ctx.senderId,
    extra: `${deleted} message${deleted === 1 ? '' : 's'} in <#${ctx.channelId}>`,
  });
};

// ─── setmodlog ──────────────────────────────────────────────────────────

export const handleSetModlog: Handler = async (ctx, svc) => {
  if (!(await requirePerm(ctx, svc, 'MANAGE_SERVER', 'Manage Server'))) return;

  const arg = ctx.args[0]?.toLowerCase();
  if (!arg) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}setmodlog <channel|here|none>\`.`,
    });
    return;
  }

  let channelId: string | null;
  if (arg === 'none' || arg === 'clear' || arg === 'off') {
    channelId = null;
  } else if (arg === 'here' || arg === 'this') {
    channelId = ctx.channelId;
  } else {
    channelId = parseChannelId(ctx.args[0]);
    if (!channelId) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: `Couldn't parse \`${ctx.args[0]}\` as a channel.`,
      });
      return;
    }
  }

  await setGuildConfig(ctx.serverId, { modlogChannel: channelId });
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: channelId ? `✅ Mod-log → <#${channelId}>` : '✅ Mod-log disabled.',
  });
};
