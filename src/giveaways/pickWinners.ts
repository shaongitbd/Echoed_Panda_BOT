import type { EchoedClient } from '../client/echoedClient.js';
import type { Giveaway } from './store.js';
import type { PermissionService } from '../auth/permissions.js';
import { recordWinners } from './store.js';
import { getGuildConfig } from '../db/guildConfig.js';
import { log } from '../log.js';

export const GIVEAWAY_EMOJI = '🎉';

// Fisher-Yates partial shuffle — pick `n` distinct items from `pool`
// without mutating the original. We use this rather than `sort`-by-
// random because it's O(n) and unbiased.
function pickRandom<T>(pool: readonly T[], n: number): T[] {
  if (n <= 0 || pool.length === 0) return [];
  const arr = pool.slice();
  const out: T[] = [];
  const want = Math.min(n, arr.length);
  for (let i = 0; i < want; i++) {
    const j = i + Math.floor(Math.random() * (arr.length - i));
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
    out.push(arr[i]!);
  }
  return out;
}

interface PickOptions {
  /** Already-winning users to drop from the pool (re-roll path). */
  excludeUserIds?: string[];
  /** Whether this run is a re-roll — affects the announcement copy. */
  isReroll?: boolean;
  /** The bot's own user ID, dropped so its seed reaction doesn't enter. */
  botUserId?: string;
  /**
   * Permission service — required for the "exclude admins" scope rule.
   * Plumbed in from the caller (scheduler / re-roll command) rather than
   * reached for at module level so this stays unit-testable.
   */
  perms?: PermissionService;
}

// Filter the entrant pool against the per-server giveaway scope rules:
//   - exempt_user_ids: hard drop
//   - exempt_role_ids: hard drop (any one role match)
//   - allowed_role_ids: if non-empty, must hold ≥1
//   - exclude_admins: drop members holding MANAGE_SERVER (owner /
//     additional_admins / role with the bit) — uses the same
//     PermissionService the rest of the bot uses, so the exact
//     definition of "admin" stays consistent across features.
//
// All filtering happens in parallel — N getMemberRoles calls plus N
// permission checks. For typical giveaways (10-500 entrants) this
// finishes in under a second; the perm service has its own cache.
async function applyScope(
  api: EchoedClient,
  serverId: string,
  entrants: string[],
  perms: PermissionService | undefined,
): Promise<string[]> {
  const cfg = await getGuildConfig(serverId);

  // Cheap fast paths first — no API calls needed.
  const exemptUsers = new Set(cfg.giveawayExemptUserIds);
  let pool = entrants.filter((id) => !exemptUsers.has(id));
  if (pool.length === 0) return pool;

  const needsRoleCheck =
    cfg.giveawayAllowedRoleIds.length > 0 || cfg.giveawayExemptRoleIds.length > 0;
  const needsAdminCheck = cfg.giveawayExcludeAdmins && perms != null;

  if (!needsRoleCheck && !needsAdminCheck) return pool;

  const allowedSet = new Set(cfg.giveawayAllowedRoleIds);
  const exemptSet = new Set(cfg.giveawayExemptRoleIds);

  const checks = await Promise.all(
    pool.map(async (userId) => {
      // Admin check first because admins are dropped regardless of
      // the role lists — short-circuit if the user is one.
      if (needsAdminCheck && perms) {
        try {
          if (await perms.has(serverId, userId, 'MANAGE_SERVER')) return null;
        } catch (err) {
          log.debug({ err, userId }, 'Giveaway admin check failed (treating as non-admin)');
        }
      }

      if (!needsRoleCheck) return userId;

      let memberRoles: string[] = [];
      try {
        const res = await api.getMemberRoles(serverId, userId);
        memberRoles = res.roles;
      } catch (err) {
        // If we can't load roles, the safe move depends on which list
        // is configured. With an allowed-list we drop (can't confirm
        // they qualify). With only an exempt-list we keep (can't
        // confirm they're banned). This errs toward letting the
        // unrelated network blip not silently disqualify users.
        log.debug({ err, userId }, 'Giveaway role lookup failed');
        if (allowedSet.size > 0) return null;
        return userId;
      }

      if (exemptSet.size > 0 && memberRoles.some((r) => exemptSet.has(r))) {
        return null;
      }
      if (allowedSet.size > 0 && !memberRoles.some((r) => allowedSet.has(r))) {
        return null;
      }
      return userId;
    }),
  );

  return checks.filter((id): id is string => id !== null);
}

// Select winners by reading the message's reactions, applying the
// server's giveaway scope (exempt users/roles, allowed roles, admin
// exclusion), and picking randomly from what survives.
export async function pickAndAnnounce(
  api: EchoedClient,
  g: Giveaway,
  options: PickOptions = {},
): Promise<string[]> {
  let message;
  try {
    message = await api.getMessage(g.serverId, g.messageId);
  } catch (err) {
    log.warn({ err, giveawayId: g.id }, 'Giveaway message lookup failed');
    await sendNoEntries(api, g, 'the giveaway message is no longer accessible');
    return [];
  }

  const reactors = message.reactions?.[GIVEAWAY_EMOJI] ?? [];
  const excluded = new Set(options.excludeUserIds ?? []);
  if (options.botUserId) excluded.add(options.botUserId);

  // Stage 1: drop excluded (bot seed + prior winners on re-roll).
  const stage1 = reactors.filter((id) => !excluded.has(id));
  if (stage1.length === 0) {
    await sendNoEntries(api, g, options.isReroll ? 'no other entrants left' : 'no entrants');
    return [];
  }

  // Stage 2: apply the per-server scope (admin exclusion, role
  // gating, user-level exemptions).
  const eligible = await applyScope(api, g.serverId, stage1, options.perms);
  if (eligible.length === 0) {
    await sendNoEntries(
      api,
      g,
      'every entrant was filtered out by the giveaway scope settings',
    );
    return [];
  }

  const winners = pickRandom(eligible, g.winnerCount);
  await recordWinners(g.id, winners);

  const mentions = winners.map((id) => `<@${id}>`).join(', ');
  const verb = options.isReroll ? '🎲 Re-rolled winner' : '🏆 Winner';
  const plural = winners.length === 1 ? '' : 's';
  try {
    await api.sendMessage({
      serverId: g.serverId,
      channelId: g.channelId,
      content: `${verb}${plural} of **${g.prize}** — congrats ${mentions}!`,
    });
  } catch (err) {
    log.warn({ err, giveawayId: g.id }, 'Giveaway announcement failed');
  }
  return winners;
}

async function sendNoEntries(
  api: EchoedClient,
  g: Giveaway,
  reason: string,
): Promise<void> {
  try {
    await api.sendMessage({
      serverId: g.serverId,
      channelId: g.channelId,
      content: `🎉 The giveaway for **${g.prize}** has ended — ${reason}.`,
    });
  } catch (err) {
    log.warn({ err, giveawayId: g.id }, 'No-entries announcement failed');
  }
}
