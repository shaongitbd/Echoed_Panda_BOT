import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import type { ChannelOverride } from '../client/echoedClient.js';
import { EchoedApiError } from '../client/echoedClient.js';
import { postModAction } from '../mod/modlog.js';
import { parseChannelId } from '../util/parse.js';
import { channelBelongsTo } from '../client/names.js';
import { log } from '../log.js';

// `!lock` / `!unlock` — stop @everyone sending in a channel, then give it back.
//
// A lock denies Send Messages on the channel's @everyone override. Everything
// else on that override is carried through exactly (as bit masks — some
// permissions have no name, and a names round trip would drop them), and
// unlock clears only that one deny, so a private channel stays private. Roles
// with their own override allowing Send (a mod role, say) keep talking: Echoed
// resolves @everyone first and role overrides after it, as Discord does.
//
// The bot adds Send to its own override first, so a lock can't silence the bot
// in the channel it just locked (its roles may only get Send via @everyone).

const EVERYONE = { type: 'role' as const, id: 'everyone' };
// Send Messages is bit 8. Masks go up to bit 40, past what JS `|`/`&` handle.
const SEND = 256n;

const bits = (n: number | undefined): bigint => BigInt(n ?? 0);
const num = (b: bigint): number => Number(b);

function everyoneOverride(overrides: ChannelOverride[]): ChannelOverride | undefined {
  return overrides.find((o) => o.targetType === 'role' && o.targetId === '@everyone');
}

function ownOverride(overrides: ChannelOverride[], botUserId: string): ChannelOverride | undefined {
  return overrides.find((o) => o.targetType === 'user' && o.targetId === botUserId);
}

async function reply(ctx: CommandContext, svc: Services, content: string): Promise<void> {
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    replyToId: ctx.messageId,
    content,
  });
}

// `[#channel] [reason…]` — the channel is optional and defaults to here.
async function parseTarget(
  ctx: CommandContext,
  svc: Services,
): Promise<{ channelId: string; reason: string | null } | null> {
  const first = parseChannelId(ctx.args[0]);
  const channelId = first ?? ctx.channelId;
  if (first && !(await channelBelongsTo(svc.api, ctx.serverId, first))) {
    await reply(ctx, svc, "That channel isn't in this server.");
    return null;
  }
  const reason = ctx.args.slice(first ? 1 : 0).join(' ').trim();
  return { channelId, reason: reason.length > 0 ? reason : null };
}

async function requireManageChannels(ctx: CommandContext, svc: Services, channelId: string): Promise<boolean> {
  const ok = await svc.perms.hasIn(ctx.serverId, channelId, ctx.senderId, 'MANAGE_CHANNELS');
  if (!ok) await reply(ctx, svc, 'You need the **Manage Channels** permission to lock or unlock a channel.');
  return ok;
}

async function explainFailure(ctx: CommandContext, svc: Services, err: unknown, verb: string): Promise<void> {
  log.warn({ err, verb }, 'Channel lock change failed');
  if (err instanceof EchoedApiError && err.status === 403) {
    await reply(
      ctx,
      svc,
      `I couldn't ${verb} it — I need **Manage Channels**, and **Send Messages** in that channel myself.`,
    );
    return;
  }
  await reply(ctx, svc, `Something went wrong trying to ${verb} that channel. Try again in a moment.`);
}

export const handleLock: Handler = async (ctx, svc) => {
  const target = await parseTarget(ctx, svc);
  if (!target) return;
  if (!(await requireManageChannels(ctx, svc, target.channelId))) return;

  try {
    const overrides = await svc.api.getChannelOverrides(ctx.serverId, target.channelId);
    const everyone = everyoneOverride(overrides);
    if ((bits(everyone?.denyBits) & SEND) !== 0n) {
      await reply(ctx, svc, `<#${target.channelId}> is already locked.`);
      return;
    }

    // Keep the bot able to post there — merged into whatever its own override
    // already says, not replacing it.
    const own = ownOverride(overrides, svc.botUserId);
    const ownAllow = bits(own?.allowBits);
    const ownDeny = bits(own?.denyBits);
    if ((ownAllow & SEND) === 0n || (ownDeny & SEND) !== 0n) {
      await svc.api.setChannelOverride(ctx.serverId, target.channelId, { type: 'user', id: svc.botUserId }, {
        allowBits: num(ownAllow | SEND),
        denyBits: num(ownDeny & ~SEND),
      });
    }

    await svc.api.setChannelOverride(ctx.serverId, target.channelId, EVERYONE, {
      allowBits: num(bits(everyone?.allowBits) & ~SEND),
      denyBits: num(bits(everyone?.denyBits) | SEND),
    });
  } catch (err) {
    await explainFailure(ctx, svc, err, 'lock');
    return;
  }

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: target.channelId,
    content: `🔒 This channel has been locked${target.reason ? ` — ${target.reason}` : '.'}`,
  });
  if (target.channelId !== ctx.channelId) {
    await reply(ctx, svc, `🔒 Locked <#${target.channelId}>.`);
  }
  await postModAction(svc.api, {
    serverId: ctx.serverId,
    action: 'lock',
    targetId: null,
    targetChannelId: target.channelId,
    actorId: ctx.senderId,
    reason: target.reason,
  });
};

export const handleUnlock: Handler = async (ctx, svc) => {
  const target = await parseTarget(ctx, svc);
  if (!target) return;
  if (!(await requireManageChannels(ctx, svc, target.channelId))) return;

  try {
    const overrides = await svc.api.getChannelOverrides(ctx.serverId, target.channelId);
    const everyone = everyoneOverride(overrides);
    if (!everyone || (bits(everyone.denyBits) & SEND) === 0n) {
      await reply(ctx, svc, `<#${target.channelId}> isn't locked.`);
      return;
    }

    // Take back only the deny the lock added; the rest of the override is
    // written back exactly. An override left empty is removed server-side.
    await svc.api.setChannelOverride(ctx.serverId, target.channelId, EVERYONE, {
      allowBits: num(bits(everyone.allowBits)),
      denyBits: num(bits(everyone.denyBits) & ~SEND),
    });

    // Drop the bot's own allow if the lock is all it was for.
    const own = ownOverride(overrides, svc.botUserId);
    if (own && bits(own.denyBits) === 0n && bits(own.allowBits) === SEND) {
      await svc.api
        .deleteChannelOverride(ctx.serverId, target.channelId, { type: 'user', id: svc.botUserId })
        .catch(() => undefined);
    }
  } catch (err) {
    await explainFailure(ctx, svc, err, 'unlock');
    return;
  }

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: target.channelId,
    content: '🔓 This channel has been unlocked.',
  });
  if (target.channelId !== ctx.channelId) {
    await reply(ctx, svc, `🔓 Unlocked <#${target.channelId}>.`);
  }
  await postModAction(svc.api, {
    serverId: ctx.serverId,
    action: 'unlock',
    targetId: null,
    targetChannelId: target.channelId,
    actorId: ctx.senderId,
    reason: target.reason,
  });
};
