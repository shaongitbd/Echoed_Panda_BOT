import type { EchoedClient } from '../client/echoedClient.js';
import { setLevelSettings, getLevelSettings } from '../db/levelSettings.js';
import { setLevelReward, getRewardsInRange } from './levelUp.js';
import { log } from '../log.js';

// Default level ladder auto-created on first install. Hoisted + colored so the
// member's current tier shows as a badge next to their name in chat (the
// "visible level" status hook). Warm gradient gray→green→blue→purple→amber→
// orange→red. Replace-mode (set below) keeps exactly one tier role per member,
// so the badge is always the current level — not a stack.
//
// Lives here (not in welcome/onBotJoin) so both the welcome flow AND the
// engagement auto-setup can provision levels without a circular import.
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
): Promise<boolean> {
  // `force` (from `!setup override`) bypasses BOTH no-clobber guards below and
  // goes straight to creating the ladder. The caller is responsible for having
  // cleared the old rewards first (clearLevelRewards) so this installs a clean
  // set. Without force, the guards make the join/reconcile/self-heal paths safe
  // to call repeatedly.
  if (opts.force) {
    return provisionLadder(api, serverId);
  }

  // Idempotent gate: if any level rewards already exist — because we provisioned
  // before, OR an admin configured their own ladder — do nothing. This lets the
  // startup reconcile and the permission self-heal call this repeatedly without
  // duplicating roles or clobbering an admin's setup.
  try {
    const existing = await getRewardsInRange(serverId, 1, 1000);
    if (existing.length > 0) return true;
  } catch (err) {
    log.warn({ err, serverId }, 'Could not read existing level rewards — skipping provision');
    return false;
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
      return true;
    }
  } catch (err) {
    log.warn({ err, serverId }, 'Could not read level settings — skipping provision to avoid clobbering admin config');
    return false;
  }

  return provisionLadder(api, serverId);
}

// The actual work: enable leveling in replace-mode and create each tier role
// (hoisted + colored) registered as a level reward. Shared by the guarded path
// and the forced (`!setup override`) path. Returns false if a role create fails
// (almost always missing Manage Roles).
async function provisionLadder(api: EchoedClient, serverId: string): Promise<boolean> {
  try {
    await setLevelSettings(serverId, { enabled: true, stackRewards: false });
  } catch (err) {
    log.warn({ err, serverId }, 'Failed to enable leveling during provision');
  }

  for (const tier of LEVEL_LADDER) {
    try {
      const res = await api.createRole(serverId, {
        name: tier.name,
        color: tier.color,
        hoist: true,
        mentionable: false,
        position: 1,
      });
      if (res?.roleId) await setLevelReward(serverId, tier.level, res.roleId);
    } catch (err) {
      log.warn({ err, serverId, level: tier.level }, 'Level-role provision failed (missing Manage Roles?)');
      return false;
    }
  }
  log.info({ serverId, count: LEVEL_LADDER.length }, 'Provisioned level roles');
  return true;
}
