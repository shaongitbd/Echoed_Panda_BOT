import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import type { Permission } from '../auth/permissions.js';
import { addWarning, listWarnings, clearWarnings } from '../mod/warnings.js';
import { postModAction } from '../mod/modlog.js';

const USER_MENTION_RE = /^<@(?<id>[a-zA-Z0-9_-]+)>$/;
const BARE_ID_RE = /^[a-zA-Z0-9_-]{8,}$/;

function parseUserId(arg: string | undefined): string | null {
  if (!arg) return null;
  const m = USER_MENTION_RE.exec(arg);
  if (m?.groups?.id) return m.groups.id;
  if (BARE_ID_RE.test(arg)) return arg;
  return null;
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

// Format a single warning line for display in `!warnings`.
function fmtAge(date: Date): string {
  const ms = Date.now() - date.getTime();
  const days = Math.floor(ms / 86400000);
  if (days >= 1) return `${days}d ago`;
  const hours = Math.floor(ms / 3600000);
  if (hours >= 1) return `${hours}h ago`;
  const mins = Math.floor(ms / 60000);
  if (mins >= 1) return `${mins}m ago`;
  return 'just now';
}

// ─── !warn @user <reason> ───────────────────────────────────────────────

export const handleWarn: Handler = async (ctx, svc) => {
  if (!(await requirePerm(ctx, svc, 'KICK_MEMBERS', 'Kick Members'))) return;

  const targetId = parseUserId(ctx.args[0]);
  const reason = ctx.args.slice(1).join(' ').trim();
  if (!targetId || !reason) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}warn <@user> <reason>\`. Reason is required.`,
    });
    return;
  }

  if (targetId === ctx.senderId) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'You cannot warn yourself.',
    });
    return;
  }

  const warning = await addWarning({
    serverId: ctx.serverId,
    userId: targetId,
    actorId: ctx.senderId,
    reason,
  });

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: `⚠️ Warned <@${targetId}> — ${reason} (warning #${warning.id})`,
  });
  await postModAction(svc.api, {
    serverId: ctx.serverId,
    action: 'warn',
    targetId,
    actorId: ctx.senderId,
    reason,
  });

  // NOTE: Echoed's bot DM endpoint takes a *username* (not user ID),
  // and we only have the ID from the mention. Once we add a username
  // lookup we can DM the warned user; for now the channel reply +
  // mod-log entry are the only notifications.
};

// ─── !warnings [@user] ──────────────────────────────────────────────────

const MAX_WARNINGS_SHOWN = 10;

export const handleWarnings: Handler = async (ctx, svc) => {
  // No target = view your own warnings (no perm required).
  // With a target, you need Kick Members to read someone else's history.
  const targetArg = ctx.args[0];
  let targetId: string;
  let isSelf: boolean;

  if (!targetArg) {
    targetId = ctx.senderId;
    isSelf = true;
  } else {
    const parsed = parseUserId(targetArg);
    if (!parsed) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: `Usage: \`${ctx.prefix}warnings [@user]\`. Omit the user to see your own.`,
      });
      return;
    }
    targetId = parsed;
    isSelf = parsed === ctx.senderId;
    if (!isSelf) {
      const ok = await svc.perms.has(ctx.serverId, ctx.senderId, 'KICK_MEMBERS');
      if (!ok) {
        await svc.api.sendMessage({
          serverId: ctx.serverId,
          channelId: ctx.channelId,
          replyToId: ctx.messageId,
          content: 'You can only see your own warnings without **Kick Members** permission.',
        });
        return;
      }
    }
  }

  const warnings = await listWarnings(ctx.serverId, targetId, MAX_WARNINGS_SHOWN);
  if (warnings.length === 0) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: isSelf ? 'You have no warnings. 🟢' : `<@${targetId}> has no warnings.`,
    });
    return;
  }

  const lines = [`**Warnings** for <@${targetId}> (${warnings.length} shown)`];
  for (const w of warnings) {
    lines.push(
      `\`#${w.id}\` ${fmtAge(w.createdAt)} by <@${w.actorId}> — ${w.reason ?? '_no reason_'}`,
    );
  }
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: lines.join('\n'),
  });
};

// ─── !clearwarnings @user ───────────────────────────────────────────────

export const handleClearWarnings: Handler = async (ctx, svc) => {
  if (!(await requirePerm(ctx, svc, 'BAN_MEMBERS', 'Ban Members'))) return;

  const targetId = parseUserId(ctx.args[0]);
  if (!targetId) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}clearwarnings <@user>\`.`,
    });
    return;
  }

  const removed = await clearWarnings(ctx.serverId, targetId);
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content:
      removed > 0
        ? `Cleared **${removed}** warning${removed === 1 ? '' : 's'} for <@${targetId}>.`
        : `<@${targetId}> had no warnings to clear.`,
  });
};
