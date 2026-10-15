import type { EchoedClient } from '../client/echoedClient.js';
import type { Permission, PermissionService } from '../auth/permissions.js';
import { getGuildConfig } from '../db/guildConfig.js';
import { fetchMemberRoles } from '../util/memberRoles.js';

// Who may moderate through the bot, and whom it may moderate.
//
// A moderation command needs either the platform permission for what it
// does (Kick Members for !kick, …) or one of the server's moderator roles.
// A moderator role is the MEE6/Dyno model: an admin trusts a role with the
// bot's moderation commands without handing out the underlying platform
// permissions — the bot acts with its own.
//
// Protected roles (and, for anyone but an admin, the moderator roles) put a
// member beyond the bot's reach: a moderator cannot use the bot on another
// moderator, and nobody but an admin can use it on a protected member.

export type Verdict = 'granted' | 'denied' | 'unavailable';

export async function checkModerator(
  api: EchoedClient,
  perms: PermissionService,
  serverId: string,
  userId: string,
  perm: Permission,
  channelId?: string,
): Promise<Verdict> {
  const platform = await perms.check(serverId, userId, perm, channelId);
  if (platform === 'granted') return 'granted';

  const cfg = await getGuildConfig(serverId);
  if (cfg.modRoleIds.length === 0) return platform;
  const roles = await fetchMemberRoles(api, serverId, userId);
  if (roles === null) return 'unavailable';
  return roles.some((r) => cfg.modRoleIds.includes(r)) ? 'granted' : platform;
}

// Why `actorId` may not act on `targetId` because of roles, or null when
// nothing stands in the way. `actorIsAdmin` is Manage Server — admins are
// only held back by the platform itself.
//
// Fails CLOSED: if the target's roles can't be read while protection is
// configured, the action is refused rather than possibly hitting someone
// the server said never to touch.
export async function roleProtection(
  api: EchoedClient,
  serverId: string,
  targetId: string,
  actorIsAdmin: boolean,
): Promise<string | null> {
  if (actorIsAdmin) return null;
  const cfg = await getGuildConfig(serverId);
  if (cfg.protectedRoleIds.length === 0 && cfg.modRoleIds.length === 0) return null;

  const roles = await fetchMemberRoles(api, serverId, targetId);
  if (roles === null) return "I couldn't check that member's roles just now — try again in a moment.";
  if (roles.some((r) => cfg.protectedRoleIds.includes(r))) {
    return 'That member has a protected role.';
  }
  if (roles.some((r) => cfg.modRoleIds.includes(r))) {
    return 'That member is a moderator.';
  }
  return null;
}

// For automatic actions (warning escalation): true when the bot must leave
// this member alone — an admin, or a holder of a protected or moderator role.
// Fails closed like roleProtection.
export async function isShielded(
  api: EchoedClient,
  perms: PermissionService,
  serverId: string,
  userId: string,
): Promise<boolean> {
  const admin = await perms.check(serverId, userId, 'MANAGE_SERVER');
  if (admin !== 'denied') return true; // granted, or unknown → leave alone
  return (await roleProtection(api, serverId, userId, false)) !== null;
}

/**
 * Why `userId` may not make Panda hand out `roleId` automatically (auto-role,
 * birthday role, level rewards), or null. Choosing such a role is granting
 * its permissions to whoever qualifies — so it takes Manage Roles (as
 * reaction roles already do), never a moderator or protected role, and a
 * permission lookup that doesn't answer refuses.
 */
export async function roleGrantRefusal(
  svc: { perms: PermissionService },
  serverId: string,
  userId: string,
  roleId: string,
): Promise<string | null> {
  const verdict = await svc.perms.check(serverId, userId, 'MANAGE_ROLES');
  if (verdict === 'unavailable') return "I couldn't verify your permissions just now — try again in a moment.";
  if (verdict !== 'granted') return 'Giving a role out automatically needs the **Manage Roles** permission.';
  const cfg = await getGuildConfig(serverId);
  if (cfg.modRoleIds.includes(roleId) || cfg.protectedRoleIds.includes(roleId)) {
    return "That's a moderator or protected role — I won't hand it out automatically.";
  }
  return null;
}
