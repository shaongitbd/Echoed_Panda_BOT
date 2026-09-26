import type { Handler } from './index.js';
import { addWarning, listWarnings, clearWarnings } from '../mod/warnings.js';
import { postModAction } from '../mod/modlog.js';
import { checkModerator } from '../mod/authority.js';
import { applyEscalation } from '../mod/escalation.js';
import { buildEmbed, COLORS } from '../client/embeds.js';
import { resolveUsers } from '../client/names.js';
import { escapeMentions } from '../client/text.js';
import { log } from '../log.js';
// One permission model across the moderation commands: the platform
// permission or a moderator role, and never on a protected member.
import { canActOn, parseUserId, requirePerm } from './mod.js';

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

  // Yourself, the bot, an admin, a protected or moderator role.
  if (!(await canActOn(ctx, svc, targetId, 'warn'))) return;

  const warning = await addWarning({
    serverId: ctx.serverId,
    userId: targetId,
    actorId: ctx.senderId,
    reason,
  });

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    // The reason is free text from the moderator; only the target should
    // be pinged by this message.
    content: `⚠️ Warned <@${targetId}> — ${escapeMentions(reason)} (warning #${warning.id})`,
    mentions: [targetId],
  });
  await postModAction(svc.api, {
    serverId: ctx.serverId,
    action: 'warn',
    targetId,
    actorId: ctx.senderId,
    reason,
  });

  // "At N warnings, do X."
  try {
    const escalated = await applyEscalation(
      svc.api, svc.perms, svc.botUserId, ctx.serverId, targetId, warning.id,
    );
    if (escalated) {
      await svc.api.sendMessage({ serverId: ctx.serverId, channelId: ctx.channelId, content: escalated });
    }
  } catch (err) {
    log.warn({ err, serverId: ctx.serverId, targetId }, 'Escalation check failed');
  }

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
      const ok =
        (await checkModerator(svc.api, svc.perms, ctx.serverId, ctx.senderId, 'KICK_MEMBERS')) === 'granted';
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

  // Header line + one row per warning. Mention tokens are not resolved
  // inside embeds, so names have to be looked up before rendering —
  // otherwise every row shows a raw ID.
  const names = await resolveUsers(svc.api, ctx.serverId, [
    targetId,
    ...warnings.map((w) => w.actorId),
  ]);
  const description: string[] = [`**${names.get(targetId)}**`];
  for (const w of warnings) {
    description.push(
      `\`#${w.id}\` ${fmtAge(w.createdAt)} by ${names.get(w.actorId)} — ${w.reason ?? '_no reason_'}`,
    );
  }
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: '',
    embeds: [
      buildEmbed({
        title: `Warnings · ${warnings.length} shown`,
        description: description.join('\n'),
        color: COLORS.WARNING,
      }),
    ],
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
