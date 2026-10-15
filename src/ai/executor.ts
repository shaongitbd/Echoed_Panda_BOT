// The one place AI moderation actually DOES anything — for automatic
// moderation and for a moderator's `!panda` command alike.
//
// Every request is re-checked here, whoever made it:
//   - who is acting is passed in by the caller from the BACKEND's identity
//     (the message's or the reaction's senderId/userId) — never from text,
//     and never from anything a model said;
//   - a moderator needs the same permission the matching command needs
//     (or a moderator role — checkModerator), and is held to the same
//     target rules as !kick / !ban / !timeout (canActOn): not themselves,
//     not the bot, not an admin unless they are one, not a protected or
//     moderator role unless they're an admin;
//   - the AI acting on its own never touches an admin, a moderator role or
//     a protected role (isShielded), on top of the pipeline skipping them.
// The model only ever chooses values from a fixed vocabulary; the checks,
// the target and the actor are decided here.

import type { Services } from '../commands/index.js';
import type { Permission } from '../auth/permissions.js';
import { checkModerator, isShielded, roleProtection } from '../mod/authority.js';
import { postModAction } from '../mod/modlog.js';
import { addWarning } from '../mod/warnings.js';
import { applyEscalation } from '../mod/escalation.js';
import { formatDuration, MAX_TIMEOUT_SECONDS } from '../mod/duration.js';
import { EchoedApiError } from '../client/echoedClient.js';
import { getGuildConfig } from '../db/guildConfig.js';
import { log } from '../log.js';
import type { AiAction } from './settings.js';

export type Actor =
  | { kind: 'ai' }
  /** A moderator, identified by the backend (never by message text). */
  | { kind: 'moderator'; userId: string };

export interface ActionRequest {
  serverId: string;
  channelId: string;
  action: AiAction;
  targetId: string;
  /** For `delete`: messages already resolved by the caller, all in channelId. */
  messageIds?: string[];
  /** For `timeout`; clamped to the platform maximum. */
  timeoutMinutes?: number;
  reason: string;
}

export type ActionOutcome = { ok: true; summary: string } | { ok: false; error: string };

/** What each action needs from a moderator — the same as the commands. */
const PERMISSION: Record<Exclude<AiAction, 'flag'>, { perm: Permission; label: string }> = {
  delete: { perm: 'MANAGE_MESSAGES', label: 'Manage Messages' },
  warn: { perm: 'KICK_MEMBERS', label: 'Kick Members' },
  timeout: { perm: 'MUTE_MEMBERS', label: 'Mute Members' },
  kick: { perm: 'KICK_MEMBERS', label: 'Kick Members' },
  ban: { perm: 'BAN_MEMBERS', label: 'Ban Members' },
};

const MEMBER_ACTIONS: ReadonlySet<AiAction> = new Set(['warn', 'timeout', 'kick', 'ban']);

/** Hard ceiling on messages one request may delete. */
export const MAX_DELETE = 500;

/**
 * Why this actor may not take this action, or null when nothing stands in
 * the way. Fails closed: a permission lookup that doesn't answer refuses.
 */
export async function refusalFor(svc: Services, actor: Actor, req: ActionRequest): Promise<string | null> {
  if (req.action === 'flag') return null;
  const { serverId, channelId, targetId } = req;

  if (targetId === svc.botUserId) return "I won't act on myself.";

  if (actor.kind === 'moderator') {
    const need = PERMISSION[req.action];
    // Message deletion is channel-scoped (honours channel overrides), like !purge.
    const verdict = await checkModerator(
      svc.api, svc.perms, serverId, actor.userId, need.perm,
      req.action === 'delete' ? channelId : undefined,
    );
    if (verdict === 'unavailable') return "I couldn't verify your permissions just now — try again in a moment.";
    if (verdict !== 'granted') return `You need **${need.label}** (or a moderator role) for that.`;

    if (MEMBER_ACTIONS.has(req.action)) {
      if (targetId === actor.userId) return "You can't do that to yourself.";
      const [targetIsAdmin, actorIsAdmin] = await Promise.all([
        svc.perms.has(serverId, targetId, 'MANAGE_SERVER'),
        svc.perms.has(serverId, actor.userId, 'MANAGE_SERVER'),
      ]);
      if (targetIsAdmin && !actorIsAdmin) return "You can't act on someone who manages this server.";
      const blocked = await roleProtection(svc.api, serverId, targetId, actorIsAdmin);
      if (blocked) return blocked;
    }
    return null;
  }

  // The AI on its own: never staff, moderator roles or protected roles —
  // for deletes too, so it never removes an admin's message.
  if (await isShielded(svc.api, svc.perms, serverId, targetId)) {
    return 'That member is staff or protected.';
  }
  return null;
}

/**
 * Check, then perform, then record (mod-log case). Never throws; a failure
 * comes back as { ok: false } with a reason fit to show.
 */
export async function performAction(svc: Services, actor: Actor, req: ActionRequest): Promise<ActionOutcome> {
  const refusal = await refusalFor(svc, actor, req);
  if (refusal) return { ok: false, error: refusal };

  const actorId = actor.kind === 'moderator' ? actor.userId : svc.botUserId;
  // Mark everything the model decided on its own, in the case and the log.
  const reason = (actor.kind === 'ai' ? `[AI] ${req.reason}` : req.reason).slice(0, 900);
  const { serverId, channelId, targetId } = req;

  try {
    switch (req.action) {
      case 'flag': {
        await postModAction(svc.api, {
          serverId, action: 'note', targetId, targetChannelId: channelId, actorId, reason,
        });
        // A note is recorded but never posted; a flag must reach a human.
        await postFlag(svc, serverId, channelId, targetId, reason);
        return { ok: true, summary: `flagged <@${targetId}> for a moderator` };
      }
      case 'delete': {
        const ids = [...new Set(req.messageIds ?? [])].slice(0, MAX_DELETE);
        if (ids.length === 0) return { ok: false, error: 'No messages to delete.' };
        let deleted = 0;
        if (ids.length === 1) {
          await svc.api.deleteMessage(serverId, ids[0]!);
          deleted = 1;
        } else {
          for (let i = 0; i < ids.length; i += 100) {
            const chunk = ids.slice(i, i + 100);
            await svc.api.bulkDeleteMessages(serverId, channelId, chunk);
            deleted += chunk.length;
          }
        }
        await postModAction(svc.api, {
          serverId, action: 'purge', targetId, targetChannelId: channelId, actorId, reason,
          extra: `${deleted} message${deleted === 1 ? '' : 's'}`,
        });
        return { ok: true, summary: `deleted ${deleted} message${deleted === 1 ? '' : 's'} from <@${targetId}>` };
      }
      case 'warn': {
        const warning = await addWarning({ serverId, userId: targetId, actorId, reason });
        await postModAction(svc.api, { serverId, action: 'warn', targetId, targetChannelId: channelId, actorId, reason });
        // Warning escalation runs as for any warning (it has its own shield check).
        const escalated = await applyEscalation(svc.api, svc.perms, svc.botUserId, serverId, targetId, warning.id);
        return { ok: true, summary: `warned <@${targetId}>${escalated ? ` — ${escalated}` : ''}` };
      }
      case 'timeout': {
        const minutes = Math.max(1, Math.round(req.timeoutMinutes ?? 10));
        const seconds = Math.min(minutes * 60, MAX_TIMEOUT_SECONDS);
        await svc.api.timeoutMember(serverId, targetId, seconds, reason);
        await postModAction(svc.api, {
          serverId, action: 'timeout', targetId, targetChannelId: channelId, actorId, reason,
          extra: formatDuration(seconds),
        });
        return { ok: true, summary: `timed out <@${targetId}> for ${formatDuration(seconds)}` };
      }
      case 'kick': {
        await svc.api.kickMember(serverId, targetId, reason);
        await postModAction(svc.api, { serverId, action: 'kick', targetId, targetChannelId: channelId, actorId, reason });
        return { ok: true, summary: `kicked <@${targetId}>` };
      }
      case 'ban': {
        await svc.api.banMember(serverId, targetId, reason);
        await postModAction(svc.api, { serverId, action: 'ban', targetId, targetChannelId: channelId, actorId, reason });
        return { ok: true, summary: `banned <@${targetId}>` };
      }
    }
  } catch (err) {
    const message = err instanceof EchoedApiError || err instanceof Error ? err.message : 'unknown error';
    log.warn({ err, serverId, action: req.action, targetId }, 'AI moderation action failed');
    return { ok: false, error: `Couldn't ${req.action}: ${message}` };
  }
}

// A flag goes to the mod-log channel as a visible message (a `note` case is
// recorded but, by design, never posted). ONLY the mod-log: unlike regular
// case entries, a flag never falls back to the welcome channel — that's a
// public channel, and a flag is an unconfirmed suspicion about a member.
// No mod-log → the flag is kept as a case (`!modlogs @member`) and not posted.
async function postFlag(svc: Services, serverId: string, channelId: string, targetId: string, reason: string): Promise<void> {
  const cfg = await getGuildConfig(serverId);
  const target = cfg.modlogChannel;
  if (!target) return;
  try {
    await svc.api.sendMessage(
      {
        serverId,
        channelId: target,
        content: `🚩 **AI flag** in <#${channelId}>: <@${targetId}> — ${reason}`,
      },
      { priority: 'background' },
    );
  } catch (err) {
    log.warn({ err, serverId }, 'AI flag post failed');
  }
}
