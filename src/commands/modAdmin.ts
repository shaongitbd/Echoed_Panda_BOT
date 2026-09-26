import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import type { EmbedField } from '../client/echoedClient.js';
import { buildEmbed, COLORS, truncate } from '../client/embeds.js';
import { resolveUsers, resolveChannel, roleBelongsTo } from '../client/names.js';
import { escapeMentions } from '../client/text.js';
import { getGuildConfig, setGuildConfig } from '../db/guildConfig.js';
import { parseRoleId } from '../util/parse.js';
import { getCase, listCasesForUser, setCaseReason, MAX_REASON, type ModCase } from '../mod/cases.js';
import { actionVerb, postModAction, renderModlogEntry } from '../mod/modlog.js';
import { checkModerator } from '../mod/authority.js';
import {
  describeRule,
  listEscalations,
  MAX_RULES,
  MAX_WARN_COUNT,
  removeEscalation,
  setEscalation,
  type EscalationAction,
} from '../mod/escalation.js';
import { parseDuration, MAX_TIMEOUT_SECONDS } from '../mod/duration.js';
import { log } from '../log.js';
import { parseUserId } from './mod.js';

// Cases (`!case`, `!reason`, `!modlogs`, `!note`), moderator and protected
// roles (`!modrole`, `!protectedrole`) and warning escalation (`!escalation`).

async function reply(ctx: CommandContext, svc: Services, content: string): Promise<void> {
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    replyToId: ctx.messageId,
    content,
  });
}

// Reading and annotating cases is moderator work: Kick Members, or a
// moderator role.
async function requireModerator(ctx: CommandContext, svc: Services): Promise<boolean> {
  const verdict = await checkModerator(svc.api, svc.perms, ctx.serverId, ctx.senderId, 'KICK_MEMBERS');
  if (verdict === 'granted') return true;
  await reply(
    ctx,
    svc,
    verdict === 'unavailable'
      ? "I couldn't verify your permissions just now — try again in a moment."
      : 'You need **Kick Members** or a moderator role for this command.',
  );
  return false;
}

async function requireManageServer(ctx: CommandContext, svc: Services): Promise<boolean> {
  if (await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_SERVER')) return true;
  await reply(ctx, svc, 'You need the **Manage Server** permission for this command.');
  return false;
}

function parseCaseNumber(raw: string | undefined): number | null {
  const n = Number((raw ?? '').replace(/^#/, ''));
  return Number.isInteger(n) && n > 0 ? n : null;
}

function ago(date: Date): string {
  const s = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

// ─── !case <n> ──────────────────────────────────────────────────────────

export const handleCase: Handler = async (ctx, svc) => {
  if (!(await requireModerator(ctx, svc))) return;
  const n = parseCaseNumber(ctx.args[0]);
  if (!n) {
    await reply(ctx, svc, `Usage: \`${ctx.prefix}case <number>\`.`);
    return;
  }
  const c = await getCase(ctx.serverId, n);
  if (!c) {
    await reply(ctx, svc, `There is no case #${n}.`);
    return;
  }

  const names = await resolveUsers(
    svc.api,
    ctx.serverId,
    [c.actorId, c.targetId].filter((id): id is string => !!id),
  );
  const fields: EmbedField[] = [];
  if (c.targetId) fields.push({ name: 'Member', value: names.get(c.targetId) ?? 'Unknown user', inline: true });
  if (c.targetChannelId) {
    fields.push({ name: 'Channel', value: await resolveChannel(svc.api, ctx.serverId, c.targetChannelId), inline: true });
  }
  fields.push({ name: 'Moderator', value: names.get(c.actorId) ?? 'Unknown user', inline: true });
  if (c.extra) fields.push({ name: 'Details', value: c.extra, inline: true });
  fields.push({ name: 'Reason', value: c.reason ? truncate(c.reason, 1000) : `*None — add one with \`${ctx.prefix}reason ${n} <text>\`*` });

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: '',
    embeds: [
      buildEmbed({
        title: `Case #${c.caseNumber} · ${actionVerb(c.action)}`,
        color: c.action === 'note' ? COLORS.MUTED : COLORS.WARNING,
        fields,
        footer: c.targetId ? `User ID: ${c.targetId}` : undefined,
        timestamp: c.createdAt,
      }),
    ],
  });
};

// ─── !reason <n> <text> ─────────────────────────────────────────────────

export const handleReason: Handler = async (ctx, svc) => {
  if (!(await requireModerator(ctx, svc))) return;
  const n = parseCaseNumber(ctx.args[0]);
  const reason = ctx.args.slice(1).join(' ').trim();
  if (!n || !reason) {
    await reply(ctx, svc, `Usage: \`${ctx.prefix}reason <case> <text>\`.`);
    return;
  }
  const existing = await getCase(ctx.serverId, n);
  if (!existing) {
    await reply(ctx, svc, `There is no case #${n}.`);
    return;
  }
  // Your own cases, or anyone's if you manage the server. The bot's own
  // (auto-mod, escalation) belong to nobody, so any moderator may annotate.
  const own = existing.actorId === ctx.senderId || existing.actorId === svc.botUserId;
  if (!own && !(await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_SERVER'))) {
    await reply(ctx, svc, 'Only the moderator who made that case, or an admin, can change its reason.');
    return;
  }

  const updated = await setCaseReason(ctx.serverId, n, reason);
  if (!updated) {
    await reply(ctx, svc, `There is no case #${n}.`);
    return;
  }
  // Keep the mod-log post in step, where there is one.
  if (updated.modlogMessageId) {
    await svc.api
      .editMessage({ serverId: ctx.serverId, messageId: updated.modlogMessageId, content: renderModlogEntry(updated) })
      .catch((err: unknown) => log.warn({ err, serverId: ctx.serverId, case: n }, 'Mod-log edit failed'));
  }
  await reply(
    ctx,
    svc,
    `Case #${n} reason updated${reason.length > MAX_REASON ? ` (cut to ${MAX_REASON} characters)` : ''}.`,
  );
};

// ─── !modlogs @user ─────────────────────────────────────────────────────

const MODLOGS_SHOWN = 15;

export const handleModlogs: Handler = async (ctx, svc) => {
  if (!(await requireModerator(ctx, svc))) return;
  const targetId = parseUserId(ctx.args[0]);
  if (!targetId) {
    await reply(ctx, svc, `Usage: \`${ctx.prefix}modlogs <@user>\`.`);
    return;
  }
  const { cases, total } = await listCasesForUser(ctx.serverId, targetId, MODLOGS_SHOWN);
  const names = await resolveUsers(svc.api, ctx.serverId, [targetId, ...cases.map((c) => c.actorId)]);
  if (cases.length === 0) {
    await reply(ctx, svc, `**${escapeMentions(names.get(targetId) ?? 'That member')}** has no cases.`);
    return;
  }

  const line = (c: ModCase) => {
    const reason = c.reason ? ` — ${truncate(c.reason.replace(/\s+/g, ' '), 120)}` : '';
    const extra = c.extra ? ` (${c.extra})` : '';
    return `\`#${c.caseNumber}\` **${actionVerb(c.action)}**${extra} · ${ago(c.createdAt)} by ${names.get(c.actorId)}${reason}`;
  };
  const counts = new Map<string, number>();
  for (const c of cases) counts.set(c.action, (counts.get(c.action) ?? 0) + 1);

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: '',
    embeds: [
      buildEmbed({
        title: `Mod history · ${names.get(targetId)}`,
        description: cases.map(line).join('\n'),
        color: COLORS.WARNING,
        footer:
          total > cases.length
            ? `Newest ${cases.length} of ${total} cases · ${ctx.prefix}case <number> for one in full`
            : `${total} case${total === 1 ? '' : 's'} · ${ctx.prefix}case <number> for one in full`,
      }),
    ],
  });
};

// ─── !note @user <text> ─────────────────────────────────────────────────

export const handleNote: Handler = async (ctx, svc) => {
  if (!(await requireModerator(ctx, svc))) return;
  const targetId = parseUserId(ctx.args[0]);
  const text = ctx.args.slice(1).join(' ').trim();
  if (!targetId || !text) {
    await reply(ctx, svc, `Usage: \`${ctx.prefix}note <@user> <text>\` — a private note, shown in \`${ctx.prefix}modlogs\`.`);
    return;
  }
  const c = await postModAction(svc.api, {
    serverId: ctx.serverId,
    action: 'note',
    targetId,
    actorId: ctx.senderId,
    reason: text,
  });
  if (!c) {
    await reply(ctx, svc, "Couldn't save that note — try again in a moment.");
    return;
  }
  // The note is private, so the command that wrote it shouldn't sit in the
  // channel. Best-effort: needs Manage Messages.
  svc.api.deleteMessage(ctx.serverId, ctx.messageId).catch(() => undefined);
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: `📝 Note saved as case #${c.caseNumber}.`,
  });
};

// ─── !modrole / !protectedrole ──────────────────────────────────────────

function roleListCommand(kind: 'mod' | 'protected'): Handler {
  const field = kind === 'mod' ? 'modRoleIds' : 'protectedRoleIds';
  const name = kind === 'mod' ? 'modrole' : 'protectedrole';
  const explain =
    kind === 'mod'
      ? 'Members with a moderator role can use the moderation commands without the platform permissions, and can’t be moderated by other moderators.'
      : 'Members with a protected role can’t be moderated through the bot, except by admins, and warning escalation leaves them alone.';

  return async (ctx, svc) => {
    if (!(await requireManageServer(ctx, svc))) return;
    const sub = ctx.args[0]?.toLowerCase();
    const cfg = await getGuildConfig(ctx.serverId);
    const current = cfg[field];

    if (!sub || sub === 'list') {
      await reply(
        ctx,
        svc,
        current.length > 0
          ? `${kind === 'mod' ? 'Moderator' : 'Protected'} roles: ${current.map((id) => `<@&${id}>`).join(', ')}\n${explain}`
          : `No ${kind === 'mod' ? 'moderator' : 'protected'} roles. Add one with \`${ctx.prefix}${name} add @role\`.\n${explain}`,
      );
      return;
    }
    if (sub !== 'add' && sub !== 'remove') {
      await reply(ctx, svc, `Usage: \`${ctx.prefix}${name} add|remove|list @role\`.`);
      return;
    }
    const roleId = parseRoleId(ctx.args[1]);
    if (!roleId || !(await roleBelongsTo(svc.api, ctx.serverId, roleId))) {
      await reply(ctx, svc, 'Mention a role from this server.');
      return;
    }
    if (sub === 'add' && current.includes(roleId)) {
      await reply(ctx, svc, `<@&${roleId}> is already on the list.`);
      return;
    }
    if (sub === 'add' && current.length >= 25) {
      await reply(ctx, svc, 'That list is full (25 roles).');
      return;
    }
    const next = sub === 'add' ? [...current, roleId] : current.filter((id) => id !== roleId);
    await setGuildConfig(ctx.serverId, kind === 'mod' ? { modRoleIds: next } : { protectedRoleIds: next });
    await reply(
      ctx,
      svc,
      sub === 'add' ? `Added <@&${roleId}>.` : current.includes(roleId) ? `Removed <@&${roleId}>.` : `<@&${roleId}> wasn't on the list.`,
    );
  };
}

export const handleModRole = roleListCommand('mod');
export const handleProtectedRole = roleListCommand('protected');

// ─── !escalation ────────────────────────────────────────────────────────

export const handleEscalation: Handler = async (ctx, svc) => {
  const sub = ctx.args[0]?.toLowerCase();

  if (!sub || sub === 'list') {
    if (!(await requireModerator(ctx, svc))) return;
    const rules = await listEscalations(ctx.serverId);
    await reply(
      ctx,
      svc,
      rules.length > 0
        ? `**Warning escalation**\n${rules.map(describeRule).join('\n')}`
        : `No escalation rules. Example: \`${ctx.prefix}escalation add 3 timeout 1h\`, \`${ctx.prefix}escalation add 5 kick\`.`,
    );
    return;
  }

  if (!(await requireManageServer(ctx, svc))) return;

  if (sub === 'remove' || sub === 'delete') {
    const count = Number(ctx.args[1]);
    if (!Number.isInteger(count)) {
      await reply(ctx, svc, `Usage: \`${ctx.prefix}escalation remove <warnings>\`.`);
      return;
    }
    const removed = await removeEscalation(ctx.serverId, count);
    await reply(ctx, svc, removed ? `Removed the rule at ${count} warnings.` : `There's no rule at ${count} warnings.`);
    return;
  }

  if (sub === 'add' || sub === 'set') {
    const count = Number(ctx.args[1]);
    const action = ctx.args[2]?.toLowerCase() as EscalationAction | undefined;
    if (!Number.isInteger(count) || count < 1 || count > MAX_WARN_COUNT || !action || !['timeout', 'kick', 'ban'].includes(action)) {
      await reply(
        ctx,
        svc,
        `Usage: \`${ctx.prefix}escalation add <warnings> timeout <duration>|kick|ban\` — e.g. \`${ctx.prefix}escalation add 3 timeout 1h\`.`,
      );
      return;
    }
    let durationSeconds: number | null = null;
    if (action === 'timeout') {
      durationSeconds = parseDuration(ctx.args[3] ?? '');
      if (!durationSeconds || durationSeconds < 60) {
        await reply(ctx, svc, 'A timeout needs a duration of at least a minute, like `10m`, `1h` or `1d`.');
        return;
      }
      durationSeconds = Math.min(durationSeconds, MAX_TIMEOUT_SECONDS);
    }
    const rules = await listEscalations(ctx.serverId);
    if (!rules.some((r) => r.warnCount === count) && rules.length >= MAX_RULES) {
      await reply(ctx, svc, `That's the most rules a server can have (${MAX_RULES}). Remove one first.`);
      return;
    }
    const rule = { warnCount: count, action, durationSeconds };
    await setEscalation(ctx.serverId, rule);
    await reply(ctx, svc, `Escalation set: ${describeRule(rule)}.`);
    return;
  }

  await reply(ctx, svc, `Usage: \`${ctx.prefix}escalation [list]\` · \`add <warnings> timeout <duration>|kick|ban\` · \`remove <warnings>\`.`);
};
