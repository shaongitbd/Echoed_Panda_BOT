import type { EchoedClient } from '../client/echoedClient.js';
import { pool } from '../db/pool.js';
import { getLevelSettings } from '../db/levelSettings.js';
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
    // Best-effort: a missing role (deleted out from under us) shouldn't
    // block the rest of the rewards or the announcement.
    await Promise.allSettled(
      rewards.map((r) =>
        api.addRole(serverId, userId, r.roleId).catch((err: unknown) => {
          log.warn(
            { err, serverId, userId, level: r.level, roleId: r.roleId },
            'Failed to grant level reward role',
          );
          throw err;
        }),
      ),
    );

    // If the server is in replace-mode, drop reward roles for lower
    // levels. We compute these lazily so stack-mode (the default) skips
    // the extra query entirely.
    if (!settings.stackRewards && newLevel > 1) {
      const oldRewards = await getRewardsInRange(serverId, 1, newLevel);
      const keepRoleIds = new Set(rewards.map((r) => r.roleId));
      const toRemove = oldRewards.filter((r) => !keepRoleIds.has(r.roleId));
      await Promise.allSettled(
        toRemove.map((r) =>
          api.removeRole(serverId, userId, r.roleId).catch((err: unknown) => {
            log.warn({ err, roleId: r.roleId }, 'Failed to remove old reward role');
            throw err;
          }),
        ),
      );
    }
  }

  const channelId = settings.levelUpChannel ?? fallbackChannelId;
  const template = settings.levelUpMessage ?? DEFAULT_LEVEL_UP_MESSAGE;
  const content = renderTemplate(template, { userId, level: newLevel });

  try {
    await api.sendMessage({ serverId, channelId, content });
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
