import { pool } from '../db/pool.js';

// Reaction-role modes. We skip "reversed" for v1 because it's both
// rare and confusing — can be added by introducing a fourth string
// value here without a schema change.
export type ReactRoleMode = 'normal' | 'unique' | 'verify';

const VALID_MODES: ReadonlySet<string> = new Set(['normal', 'unique', 'verify']);

export function parseMode(input: string): ReactRoleMode | null {
  const lower = input.toLowerCase();
  return VALID_MODES.has(lower) ? (lower as ReactRoleMode) : null;
}

export interface ReactRoleMessage {
  messageId: string;
  serverId: string;
  channelId: string;
  mode: ReactRoleMode;
}

export interface ReactRoleMapping {
  messageId: string;
  emoji: string;
  roleId: string;
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

function rowToMessage(row: MessageRow): ReactRoleMessage {
  // The DB allows any string, but we narrow to the type union; if a
  // legacy/unknown mode appears, treat it as `normal` so we never
  // silently skip a configured row.
  const mode = parseMode(row.mode) ?? 'normal';
  return {
    messageId: row.message_id,
    serverId: row.server_id,
    channelId: row.channel_id,
    mode,
  };
}

// Lookup hot path — called on every reaction event. Returns null if
// the message isn't a configured reaction-role message.
export async function getMessage(messageId: string): Promise<ReactRoleMessage | null> {
  const res = await pool.query<MessageRow>(
    `SELECT message_id, server_id, channel_id, mode
       FROM panda.reaction_role_messages
      WHERE message_id = $1`,
    [messageId],
  );
  return res.rows[0] ? rowToMessage(res.rows[0]) : null;
}

export async function getMappingsForMessage(messageId: string): Promise<ReactRoleMapping[]> {
  const res = await pool.query<MappingRow>(
    `SELECT message_id, emoji, role_id
       FROM panda.reaction_role_mappings
      WHERE message_id = $1`,
    [messageId],
  );
  return res.rows.map((r) => ({
    messageId: r.message_id,
    emoji: r.emoji,
    roleId: r.role_id,
  }));
}

export async function getMappingForEmoji(
  messageId: string,
  emoji: string,
): Promise<ReactRoleMapping | null> {
  const res = await pool.query<MappingRow>(
    `SELECT message_id, emoji, role_id
       FROM panda.reaction_role_mappings
      WHERE message_id = $1 AND emoji = $2`,
    [messageId, emoji],
  );
  const row = res.rows[0];
  return row ? { messageId: row.message_id, emoji: row.emoji, roleId: row.role_id } : null;
}

// Add or update a mapping. Upserts the parent message row first so the
// caller doesn't need a separate "register message" step.
export async function addMapping(input: {
  serverId: string;
  channelId: string;
  messageId: string;
  emoji: string;
  roleId: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO panda.reaction_role_messages (message_id, server_id, channel_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (message_id) DO NOTHING`,
    [input.messageId, input.serverId, input.channelId],
  );
  await pool.query(
    `INSERT INTO panda.reaction_role_mappings (message_id, emoji, role_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (message_id, emoji) DO UPDATE SET role_id = EXCLUDED.role_id`,
    [input.messageId, input.emoji, input.roleId],
  );
}

// Remove one emoji binding. If that was the last one for a message,
// also remove the message row so listings stay clean.
export async function removeMapping(messageId: string, emoji: string): Promise<boolean> {
  const res = await pool.query(
    `DELETE FROM panda.reaction_role_mappings WHERE message_id = $1 AND emoji = $2`,
    [messageId, emoji],
  );
  if ((res.rowCount ?? 0) === 0) return false;

  // Cleanup: drop the parent if no mappings remain.
  await pool.query(
    `DELETE FROM panda.reaction_role_messages
      WHERE message_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM panda.reaction_role_mappings WHERE message_id = $1
        )`,
    [messageId],
  );
  return true;
}

export async function setMode(messageId: string, mode: ReactRoleMode): Promise<boolean> {
  const res = await pool.query(
    `UPDATE panda.reaction_role_messages SET mode = $2 WHERE message_id = $1`,
    [messageId, mode],
  );
  return (res.rowCount ?? 0) > 0;
}

export interface ReactRoleListing extends ReactRoleMessage {
  mappings: ReactRoleMapping[];
}

// Fetch every reaction-role message in a server, with their mappings,
// in a single round-trip pair (one query for messages, one for all
// mappings). For !reactrole list output.
export async function listForServer(serverId: string): Promise<ReactRoleListing[]> {
  const msgRes = await pool.query<MessageRow>(
    `SELECT message_id, server_id, channel_id, mode
       FROM panda.reaction_role_messages
      WHERE server_id = $1
      ORDER BY created_at ASC`,
    [serverId],
  );
  if (msgRes.rows.length === 0) return [];

  const ids = msgRes.rows.map((r) => r.message_id);
  const mapRes = await pool.query<MappingRow>(
    `SELECT message_id, emoji, role_id
       FROM panda.reaction_role_mappings
      WHERE message_id = ANY($1::text[])`,
    [ids],
  );
  const byMsg = new Map<string, ReactRoleMapping[]>();
  for (const m of mapRes.rows) {
    const arr = byMsg.get(m.message_id) ?? [];
    arr.push({ messageId: m.message_id, emoji: m.emoji, roleId: m.role_id });
    byMsg.set(m.message_id, arr);
  }

  return msgRes.rows.map((r) => ({
    ...rowToMessage(r),
    mappings: byMsg.get(r.message_id) ?? [],
  }));
}
