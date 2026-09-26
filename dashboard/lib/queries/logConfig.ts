import { pool } from '../db';

// Mirror of the bot's src/logging/config.ts. Event names are stored as the
// ones switched OFF — so every event is on by default — and must be spelled
// exactly as the bot spells them.

export const LOG_EVENTS = [
  { name: 'message_edit', label: 'Message edits', group: 'messages' },
  { name: 'message_delete', label: 'Message deletes', group: 'messages' },
  { name: 'message_bulk_delete', label: 'Bulk deletes (purges)', group: 'messages' },
  { name: 'member_join', label: 'Joins', group: 'members' },
  { name: 'member_leave', label: 'Leaves', group: 'members' },
  { name: 'member_kick', label: 'Kicks', group: 'members' },
  { name: 'member_ban', label: 'Bans', group: 'members' },
  { name: 'member_nickname', label: 'Nickname changes', group: 'members' },
] as const;

export type LogEventName = (typeof LOG_EVENTS)[number]['name'];

const EVENT_NAMES: readonly string[] = LOG_EVENTS.map((e) => e.name);

export function isLogEventName(name: string): name is LogEventName {
  return EVENT_NAMES.includes(name);
}

export interface LogConfig {
  serverId: string;
  messageChannel: string | null;
  memberChannel: string | null;
  disabledEvents: LogEventName[];
  ignoredChannelIds: string[];
  ignoreBots: boolean;
}

interface Row {
  server_id: string;
  message_channel: string | null;
  member_channel: string | null;
  disabled_events: string[] | null;
  ignored_channel_ids: string[] | null;
  ignore_bots: boolean | null;
}

export async function getLogConfig(serverId: string): Promise<LogConfig> {
  const res = await pool.query<Row>(
    `SELECT server_id, message_channel, member_channel, disabled_events,
            ignored_channel_ids, ignore_bots
       FROM log_config WHERE server_id = $1`,
    [serverId],
  );
  const row = res.rows[0];
  if (!row) {
    return {
      serverId,
      messageChannel: null,
      memberChannel: null,
      disabledEvents: [],
      ignoredChannelIds: [],
      ignoreBots: true,
    };
  }
  return {
    serverId: row.server_id,
    messageChannel: row.message_channel,
    memberChannel: row.member_channel,
    disabledEvents: (row.disabled_events ?? []).filter(isLogEventName),
    ignoredChannelIds: row.ignored_channel_ids ?? [],
    ignoreBots: row.ignore_bots ?? true,
  };
}

export async function saveLogConfig(config: LogConfig): Promise<void> {
  await pool.query(
    `INSERT INTO log_config (server_id, message_channel, member_channel,
                             disabled_events, ignored_channel_ids, ignore_bots)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (server_id) DO UPDATE SET
       message_channel     = EXCLUDED.message_channel,
       member_channel      = EXCLUDED.member_channel,
       disabled_events     = EXCLUDED.disabled_events,
       ignored_channel_ids = EXCLUDED.ignored_channel_ids,
       ignore_bots         = EXCLUDED.ignore_bots,
       updated_at          = now()`,
    [
      config.serverId,
      config.messageChannel,
      config.memberChannel,
      config.disabledEvents,
      config.ignoredChannelIds,
      config.ignoreBots,
    ],
  );
}
