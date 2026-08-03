import { EchoedApiError, type EchoedClient } from '../client/echoedClient.js';
import { setLevelSettings, getLevelSettings } from '../db/levelSettings.js';
import { setLevelReward, getRewardsInRange } from './levelUp.js';
import { invalidateGuild } from '../client/names.js';
import { log } from '../log.js';

// Default level ladder auto-created on first install. Hoisted + colored so the
// member's current tier shows as a badge next to their name in chat (the
// "visible level" status hook). Warm gradient gray→green→blue→purple→amber→
// orange→red. Replace-mode (set below) keeps exactly one tier role per member,
// so the badge is always the current level — not a stack.
//
// Lives here (not in welcome/onBotJoin) so both the welcome flow AND the
// engagement auto-setup can provision levels without a circular import.
// Why a provision run didn't complete. Only a permission denial should
// prompt the server — a rate limit, a blip or a 5xx is our problem, and
// telling an admin to re-invite the bot over one is actively wrong.
export type ProvisionResult = 'ok' | 'denied' | 'failed';

export const LEVEL_LADDER: ReadonlyArray<{ level: number; name: string; color: string }> = [
  { level: 5, name: 'Level 5', color: '#9CA3AF' },
  { level: 10, name: 'Level 10', color: '#34D399' },
  { level: 20, name: 'Level 20', color: '#60A5FA' },
  { level: 35, name: 'Level 35', color: '#A78BFA' },
  { level: 50, name: 'Level 50', color: '#FBBF24' },
  { level: 75, name: 'Level 75', color: '#F97316' },
  { level: 100, name: 'Level 100', color: '#EF4444' },
];

// Auto-provision the level ladder: create each tier role (hoisted + colored)
// and register it as a level reward. Best-effort — if the bot lacks
// MANAGE_ROLES (admin unticked it on the consent screen) createRole 403s; we
// stop and return false so the welcome can nudge them to grant it.
export async function provisionLevelRoles(
  api: EchoedClient,
  serverId: string,
  opts: { force?: boolean } = {},
): Promise<ProvisionResult> {
  // `force` (from `!setup override`) bypasses BOTH no-clobber guards below and
  // goes straight to creating the ladder. The caller is responsible for having
  // cleared the old rewards first (clearLevelRewards) so this installs a clean
  // set. Without force, the guards make the join/reconcile/self-heal paths safe
  // to call repeatedly.
  if (opts.force) {
    return provisionLadder(api, serverId);
  }

  // Idempotent gate. If the server has rewards at levels outside our
  // ladder, an admin built their own — leave it completely alone. If every
  // reward sits on one of our tiers, it's ours (possibly incomplete), and
  // provisionLadder fills in whatever is missing.
  //
  // This used to bail whenever *any* reward existed, which meant a run
  // that failed partway sealed that server's ladder forever: the reconcile
  // and self-heal paths both saw a non-empty set and skipped, so tiers
  // above the failure point were never created.
  try {
    const existing = await getRewardsInRange(serverId, 1, 1000);
    const ourLevels = new Set(LEVEL_LADDER.map((t) => t.level));
    const adminConfigured = existing.some((r) => !ourLevels.has(r.level));
    if (adminConfigured) return 'ok';
    if (existing.length >= LEVEL_LADDER.length) return 'ok';
  } catch (err) {
    log.warn({ err, serverId }, 'Could not read existing level rewards — skipping provision');
    return 'failed';
  }

  // Respect an admin who has already configured leveling themselves — never
  // seed default roles or flip their settings under them. The only fields
  // provisioning ITSELF writes are `enabled` (→true) and `stackRewards`
  // (→false), so any OTHER non-default field can only be a human's doing.
  // `enabled === false` is the explicit `!levels disable` case (the DB default
  // is true, so a false value can't come from us or a fresh row).
  //
  // Deliberately NOT gated on "a level_settings row exists": provisioning
  // creates that row (with the two defaults above) BEFORE the role loop, so a
  // bot that joined without Manage Roles would have a row but no roles — a
  // row-exists bail would then block the permission self-heal from ever
  // finishing once Manage Roles is granted. Checking human-set fields instead
  // keeps self-heal working while honoring real admin config.
  try {
    const settings = await getLevelSettings(serverId);
    const adminConfigured =
      settings.enabled === false ||
      settings.levelUpChannel !== null ||
      settings.levelUpMessage !== null ||
      settings.noXpChannelIds.length > 0 ||
      settings.allowedXpChannelIds.length > 0 ||
      settings.allowedXpRoleIds.length > 0 ||
      settings.ignoredXpRoleIds.length > 0;
    if (adminConfigured) {
      log.info({ serverId }, 'Leveling already configured by an admin — skipping auto-provision');
      return 'ok';
    }
  } catch (err) {
    log.warn({ err, serverId }, 'Could not read level settings — skipping provision to avoid clobbering admin config');
    return 'failed';
  }

  return provisionLadder(api, serverId);
}

// The actual work: enable leveling in replace-mode and create each tier role
// (hoisted + colored) registered as a level reward. Shared by the guarded path
// and the forced (`!setup override`) path. Returns false if a role create fails
// (almost always missing Manage Roles).
async function provisionLadder(api: EchoedClient, serverId: string): Promise<ProvisionResult> {
  try {
    await setLevelSettings(serverId, { enabled: true, stackRewards: false });
  } catch (err) {
    log.warn({ err, serverId }, 'Failed to enable leveling during provision');
  }

  // Which tiers already have a reward role. Provisioning is idempotent per
  // TIER, not per server: a run that failed partway used to leave the
  // remaining tiers missing permanently, because the caller's guard only
  // asked whether *any* reward existed and would then skip forever. Now a
  // later run fills in whatever is still missing.
  let existingLevels: Set<number>;
  try {
    const existing = await getRewardsInRange(serverId, 1, 1000);
    existingLevels = new Set(existing.map((r) => r.level));
  } catch (err) {
    log.warn({ err, serverId }, 'Could not read existing level rewards — skipping provision');
    return 'failed';
  }

  const missing = LEVEL_LADDER.filter((t) => !existingLevels.has(t.level));
  if (missing.length === 0) return 'ok';

  let created = 0;
  for (const tier of missing) {
    try {
      const res = await api.createRole(serverId, {
        name: tier.name,
        color: tier.color,
        hoist: true,
        mentionable: false,
        position: 1,
      });
      if (res?.roleId) {
        await setLevelReward(serverId, tier.level, res.roleId);
        created++;
      }
    } catch (err) {
      const denied = err instanceof EchoedApiError && err.status === 403;
      log.warn(
        { err, serverId, level: tier.level, created, remaining: missing.length - created, denied },
        'Level-role provision failed — the rest will be filled in on a later run',
      );
      // The tiers created so far are recorded, so a retry resumes rather
      // than duplicating them.
      invalidateGuild(serverId);
      return denied ? 'denied' : 'failed';
    }
  }
  invalidateGuild(serverId);
  log.info({ serverId, created }, 'Provisioned level roles');
  return 'ok';
}
