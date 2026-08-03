import type { EchoedClient } from '../client/echoedClient.js';
import type { PermissionService } from '../auth/permissions.js';
import type { MessageCreatedData } from '../types.js';
import type { FilterMatch } from './detect.js';
import { getAutomodConfig } from './config.js';
import { runFilters } from './detect.js';
import { resetWindow } from './spamWindow.js';
import { pool } from '../db/pool.js';
import { addWarning } from '../mod/warnings.js';
import { postModAction } from '../mod/modlog.js';
import { log } from '../log.js';
import { registerTtlCache } from '../util/ttlCache.js';

// Per-user member-role cache. Auto-mod runs on every message, so the
// role lookup needs caching. 60s TTL absorbs admin role changes
// without making the hot path issue a network call per message.
const ROLE_CACHE_TTL_MS = 60 * 1000;
const memberRolesCache = new Map<string, { roles: string[]; expiresAt: number }>();
registerTtlCache('automodMemberRoles', memberRolesCache, 20_000);

async function fetchMemberRoles(
  api: EchoedClient,
  serverId: string,
  userId: string,
): Promise<string[] | null> {
  const key = `${serverId}:${userId}`;
  const cached = memberRolesCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.roles;
  try {
    const res = await api.getMemberRoles(serverId, userId);
    const roles = res.roles ?? [];
    memberRolesCache.set(key, { roles, expiresAt: Date.now() + ROLE_CACHE_TTL_MS });
    return roles;
  } catch (err) {
    log.warn({ err, serverId, userId }, 'Auto-mod role-scope fetch failed');
    return null;
  }
}

// processMessage is the auto-mod entry-point. Returns true if the
// message was acted on (deleted) — caller skips XP grant + dispatch.
//
// Skip conditions (return false fast, no DB hit unless needed):
//   - automod disabled at server level
//   - channel allowed list is non-empty and channel isn't in it
//   - channel is in exempt list (overrides allowed)
//   - sender holds an exempt role (overrides allowed roles)
//   - role allowed list is non-empty and sender holds none of them
export async function processMessage(
  api: EchoedClient,
  perms: PermissionService,
  msg: MessageCreatedData,
  botUserId: string,
): Promise<boolean> {
  const config = await getAutomodConfig(msg.serverId);
  if (!config.enabled) return false;

  // Channel scope.
  if (
    config.allowedChannelIds.length > 0 &&
    !config.allowedChannelIds.includes(msg.channelId)
  ) {
    return false;
  }
  if (config.exemptChannelIds.includes(msg.channelId)) return false;

  // Owner/admin exemption. Never auto-mod someone who can manage the server —
  // staff shouldn't have their messages deleted for caps/spam/etc. MANAGE_SERVER
  // is the canonical "is staff" bit (server owner + additional admins +
  // Administrator all resolve to it server-side). The result is cached by the
  // permission service, so this is cheap on the hot path. Best-effort: a lookup
  // failure falls through to normal filtering rather than silently skipping.
  try {
    if (await perms.has(msg.serverId, msg.senderId, 'MANAGE_SERVER')) return false;
  } catch (err) {
    log.debug({ err, serverId: msg.serverId, userId: msg.senderId }, 'Auto-mod admin-exempt check failed');
  }

  // Role scope. Skip the network call entirely when both lists are
  // empty (the common case for servers that don't configure roles).
  if (config.allowedRoleIds.length > 0 || config.exemptRoleIds.length > 0) {
    const roles = await fetchMemberRoles(api, msg.serverId, msg.senderId);
    if (roles === null) {
      // Fail open on role-lookup failure — we'd rather let messages
      // through than break the server when Echoed's API hiccups. The
      // alternative (fail closed) silently suppresses auto-mod, which
      // is a worse failure mode for moderators.
    } else {
      if (roles.some((r) => config.exemptRoleIds.includes(r))) return false;
      if (
        config.allowedRoleIds.length > 0 &&
        !roles.some((r) => config.allowedRoleIds.includes(r))
      ) {
        return false;
      }
    }
  }

  const match = runFilters(config, {
    serverId: msg.serverId,
    userId: msg.senderId,
    content: msg.content,
  });
  if (!match) return false;

  await applyAction(api, msg, match, botUserId);
  return true;
}

async function applyAction(
  api: EchoedClient,
  msg: MessageCreatedData,
  match: FilterMatch,
  botUserId: string,
): Promise<void> {
  // Reset spam window early so we don't double-flag on the next message
  // (which would still be in the window and over threshold).
  resetWindow(msg.serverId, msg.senderId);

  // Delete the offending message. If the API call fails we still log
  // the offense — the message stays but the user gets a warning. This
  // is the right trade when our delete races a manual delete.
  try {
    await api.deleteMessage(msg.serverId, msg.id);
  } catch (err) {
    log.warn(
      { err, serverId: msg.serverId, msgId: msg.id, kind: match.kind },
      'Auto-mod delete failed — proceeding with warning',
    );
  }

  // Persist the offense. Used by future escalation logic and for an
  // admin-facing offense history command.
  await pool
    .query(
      `INSERT INTO panda.automod_offenses (server_id, user_id, filter_kind, message_id)
       VALUES ($1, $2, $3, $4)`,
      [msg.serverId, msg.senderId, match.kind, msg.id],
    )
    .catch((err: unknown) => {
      log.warn({ err, kind: match.kind }, 'Failed to record automod offense');
    });

  // Add a warning to the user's regular warning history. The actor is
  // the bot itself — we don't know which moderator configured automod.
  const reason = `Auto-mod: ${match.reason}`;
  try {
    await addWarning({
      serverId: msg.serverId,
      userId: msg.senderId,
      // Attributed to the bot, not to the member who tripped the
      // filter — recording the offender as their own moderator made the
      // warning history read as if they had warned themselves.
      actorId: botUserId,
      reason,
    });
  } catch (err) {
    log.warn({ err }, 'Failed to add automod warning');
  }

  // Notify the channel and mod-log. The channel notification is
  // intentionally short — long messages defeat the purpose of cleaning
  // up channel noise.
  try {
    await api.sendMessage({
      serverId: msg.serverId,
      channelId: msg.channelId,
      content: `<@${msg.senderId}> message removed — ${match.reason}.`,
      mentions: [msg.senderId],
    });
  } catch (err) {
    log.warn({ err }, 'Auto-mod channel notice failed');
  }

  await postModAction(api, {
    serverId: msg.serverId,
    action: 'warn',
    targetId: msg.senderId,
    actorId: botUserId,
    reason,
    extra: `Filter: ${match.kind}`,
  });
}
