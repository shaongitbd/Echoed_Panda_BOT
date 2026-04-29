import { pool } from '../db';

export interface LevelReward {
  level: number;
  roleId: string;
}

interface Row {
  level: number;
  role_id: string;
}

// All rewards for a server, ordered by level. Used by both the
// dashboard list and (eventually) any other UI that wants to show
// the ladder.
export async function listRewards(serverId: string): Promise<LevelReward[]> {
  const res = await pool.query<Row>(
    `SELECT level, role_id
       FROM level_rewards
      WHERE server_id = $1
      ORDER BY level ASC`,
    [serverId],
  );
  return res.rows.map((r) => ({ level: r.level, roleId: r.role_id }));
}

// Upsert by (server_id, level). The bot's `setLevelReward` does the
// same thing — a single role per level, replacing on conflict.
export async function setReward(
  serverId: string,
  level: number,
  roleId: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO level_rewards (server_id, level, role_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (server_id, level) DO UPDATE SET role_id = EXCLUDED.role_id`,
    [serverId, level, roleId],
  );
}

export async function removeReward(serverId: string, level: number): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM level_rewards WHERE server_id = $1 AND level = $2`,
    [serverId, level],
  );
  return (res.rowCount ?? 0) > 0;
}
