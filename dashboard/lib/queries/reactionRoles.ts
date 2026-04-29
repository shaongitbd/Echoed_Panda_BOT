import { pool } from '../db';

export type ReactRoleMode = 'normal' | 'unique' | 'verify';

export interface ReactRoleMapping {
  emoji: string;
  roleId: string;
}

export interface ReactRoleListing {
  messageId: string;
  channelId: string;
  mode: ReactRoleMode;
  mappings: ReactRoleMapping[];
}

interface MessageRow {
  message_id: string;
  server_id: string;
  channel_id: string;
  mode: string;
}

interface MappingRow {
  message_id: string;
  emoji: string;
  role_id: string;
}

function narrowMode(raw: string): ReactRoleMode {
  return raw === 'unique' || raw === 'verify' ? raw : 'normal';
}

// Two-query fetch — one for the messages, one for the mappings —
// then we merge in JS. Avoids the N+1 we'd get by querying mappings
// per message, and avoids the awkwardness of GROUP BY + json_agg.
export async function listReactionRoles(serverId: string): Promise<ReactRoleListing[]> {
  const msgRes = await pool.query<MessageRow>(
    `SELECT message_id, server_id, channel_id, mode
       FROM reaction_role_messages
      WHERE server_id = $1
      ORDER BY created_at ASC`,
    [serverId],
  );
  if (msgRes.rows.length === 0) return [];

  const ids = msgRes.rows.map((r) => r.message_id);
  const mapRes = await pool.query<MappingRow>(
    `SELECT message_id, emoji, role_id
       FROM reaction_role_mappings
      WHERE message_id = ANY($1::text[])`,
    [ids],
  );

  const byMsg = new Map<string, ReactRoleMapping[]>();
  for (const m of mapRes.rows) {
    const arr = byMsg.get(m.message_id) ?? [];
    arr.push({ emoji: m.emoji, roleId: m.role_id });
    byMsg.set(m.message_id, arr);
  }

  return msgRes.rows.map((r) => ({
    messageId: r.message_id,
    channelId: r.channel_id,
    mode: narrowMode(r.mode),
    mappings: byMsg.get(r.message_id) ?? [],
  }));
}

// Delete a single emoji binding. If it was the last on its message,
// also drop the parent row so the listing stays clean.
export async function removeReactionRole(
  serverId: string,
  messageId: string,
  emoji: string,
): Promise<boolean> {
  // Confirm the message belongs to this server before deleting — a
  // leaked messageId from a different server can't be deleted via
  // this dashboard.
  const owns = await pool.query<{ exists: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM reaction_role_messages
        WHERE message_id = $1 AND server_id = $2
     ) AS exists`,
    [messageId, serverId],
  );
  if (!owns.rows[0]?.exists) return false;

  const del = await pool.query(
    `DELETE FROM reaction_role_mappings WHERE message_id = $1 AND emoji = $2`,
    [messageId, emoji],
  );
  if ((del.rowCount ?? 0) === 0) return false;

  await pool.query(
    `DELETE FROM reaction_role_messages
      WHERE message_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM reaction_role_mappings WHERE message_id = $1
        )`,
    [messageId],
  );
  return true;
}

export async function setMode(
  serverId: string,
  messageId: string,
  mode: ReactRoleMode,
): Promise<boolean> {
  const res = await pool.query(
    `UPDATE reaction_role_messages
        SET mode = $3
      WHERE message_id = $1 AND server_id = $2`,
    [messageId, serverId, mode],
  );
  return (res.rowCount ?? 0) > 0;
}
