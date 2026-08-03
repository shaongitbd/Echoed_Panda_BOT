import type { EchoedClient } from '../client/echoedClient.js';
import { pool } from '../db/pool.js';
import { getLevelSettings } from '../db/levelSettings.js';
import { applyRoleChanges } from './roleWrites.js';
import { resolveRoles, UNKNOWN_ROLE } from '../client/names.js';
import { log } from '../log.js';

export interface LevelRewardRow {
  level: number;
  roleId: string;
}

// Fetch role rewards in a level range, inclusive on both ends. Used by
// level-up to find rewards crossed by a single message and by the
// !levelrewards admin command (with a wide range) to list everything.
export async function getRewardsInRange(
  serverId: string,
  fromLevel: number,
  toLevel: number,
): Promise<LevelRewardRow[]> {
  const res = await pool.query<{ level: number; role_id: string }>(
    `SELECT level, role_id
       FROM panda.level_rewards
      WHERE server_id = $1 AND level BETWEEN $2 AND $3
      ORDER BY level ASC`,
    [serverId, fromLevel, toLevel],
  );
  return res.rows.map((r) => ({ level: r.level, roleId: r.role_id }));
}

export async function setLevelReward(
  serverId: string,
  level: number,
  roleId: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO panda.level_rewards (server_id, level, role_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (server_id, level) DO UPDATE SET role_id = EXCLUDED.role_id`,
    [serverId, level, roleId],
  );
}

export async function deleteLevelReward(serverId: string, level: number): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM panda.level_rewards WHERE server_id = $1 AND level = $2`,
    [serverId, level],
  );
  return (res.rowCount ?? 0) > 0;
}

// Wipe every level-reward mapping for a server. Used by `!setup override` to
// replace an old reward ladder with the new one. Only clears the panda
// reward→level mapping rows — it does NOT delete the underlying Echoed roles
// (members may already hold them; auto-deleting roles members wear is too
// destructive to do silently). The orphaned old roles can be removed by hand.
export async function clearLevelRewards(serverId: string): Promise<number> {
  const res = await pool.query(`DELETE FROM panda.level_rewards WHERE server_id = $1`, [serverId]);
  return res.rowCount ?? 0;
}

// Substitution for level-up message templates. Echoed's plain-text
// mention syntax is `<@userId>`; substituting `{user}` to that turns
// the announcement into a mention. `{level}` → the new level number.
function renderTemplate(
  template: string,
  vars: { userId: string; level: number },
): string {
  return template
    .replace(/\{user\}/g, `<@${vars.userId}>`)
    .replace(/\{level\}/g, String(vars.level));
}

const DEFAULT_LEVEL_UP_MESSAGE = '🎉 GG {user}! You just hit **level {level}**.';

interface AnnounceInput {
  serverId: string;
  userId: string;
  // The channel the triggering message was sent in — used as fallback
  // when no per-server level-up channel is configured.
  fallbackChannelId: string;
  oldLevel: number;
  newLevel: number;
}

// Handle the side-effects of a level-up: assign any role rewards for
// crossed levels, then announce. We fan these out as parallel requests
// where they're independent (different roles to grant) but stay
// sequential for the announcement so a failed message send doesn't
// leave roles half-applied.
export async function handleLevelUp(
  api: EchoedClient,
  input: AnnounceInput,
): Promise<void> {
  const { serverId, userId, fallbackChannelId, oldLevel, newLevel } = input;
  if (newLevel <= oldLevel) return;

  const settings = await getLevelSettings(serverId);

  // Rewards for every level the user crossed. Usually 1, but a config
  // change or first-time grant after a rate change could span more.
  const rewards = await getRewardsInRange(serverId, oldLevel + 1, newLevel);

  if (rewards.length > 0) {
    if (settings.stackRewards) {
      // Stack mode: every tier crossed is kept.
      await applyRoleChanges(api, serverId, userId, {
        grant: rewards.map((r) => r.roleId),
      });
    } else {
      // Replace mode: exactly one badge should be worn — the highest tier
      // reached. Granting every tier crossed and then removing "the ones
      // we didn't just grant" left all of them on whenever someone crossed
      // several at once, which is how members ended up wearing a level 5
      // badge at level 50.
      const highest = rewards.reduce((a, b) => (b.level > a.level ? b : a));
      const ladder = await getRewardsInRange(serverId, 1, newLevel);
      const stale = ladder.map((r) => r.roleId).filter((id) => id !== highest.roleId);
      await applyRoleChanges(api, serverId, userId, {
        grant: [highest.roleId],
        revoke: stale,
      });
    }
  }

  // Name the reward role(s) earned this level-up so the congrats actually
  // tells them what they unlocked (not just the number). Best-effort — skip the
  // mention on lookup failure rather than block the announcement.
  let rewardNote = '';
  if (rewards.length > 0) {
    // Cached per server — this used to fetch the whole role list on every
    // reward level-up purely to pretty-print a name.
    const names = await resolveRoles(api, serverId, rewards.map((r) => r.roleId));
    const earned = rewards
      .map((r) => names.get(r.roleId))
      .filter((n): n is string => !!n && !n.endsWith(UNKNOWN_ROLE))
      // resolveRoles renders roles for display with a leading marker;
      // strip it here since the sentence already reads as a role name.
      .map((n) => n.replace(/^@/, ''));
    if (earned.length > 0) {
      rewardNote = `\n🎁 You unlocked ${earned.map((n) => `**${n}**`).join(', ')}!`;
    }
  }

  const channelId = settings.levelUpChannel ?? fallbackChannelId;
  const template = settings.levelUpMessage ?? DEFAULT_LEVEL_UP_MESSAGE;
  const content = renderTemplate(template, { userId, level: newLevel }) + rewardNote;

  try {
    await api.sendMessage({ serverId, channelId, content, mentions: [userId] });
  } catch (err) {
    // Don't bubble — the XP grant already succeeded; failing here just
    // means a missed announcement and that's a UX paper-cut, not a
    // data-integrity issue.
    log.warn(
      { err, serverId, userId, channelId, newLevel },
      'Level-up announcement failed',
    );
  }
}
