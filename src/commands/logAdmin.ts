import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import { parseChannelId } from '../util/parse.js';
import { channelBelongsTo } from '../client/names.js';
import {
  getLogConfig,
  isLogEvent,
  LOG_EVENTS,
  MESSAGE_EVENTS,
  setLogConfig,
  type LogConfig,
  type LogEvent,
} from '../logging/config.js';

// `!log` — the server log (message edits/deletes, joins, leaves, kicks,
// bans, nickname changes). Manage Server.
//
//   !log                              show what is logged where
//   !log messages <#channel|here|off> where edits and deletes go
//   !log members  <#channel|here|off> where joins, leaves, kicks, bans go
//   !log event <name|all> on|off      switch one event (or every one)
//   !log ignore <#channel>            stop / resume logging messages from a channel
//   !log bots on|off                  include messages written by bots

// Short names for chat; the stored names are the long ones.
const EVENT_ALIASES: Record<string, LogEvent> = {
  edits: 'message_edit',
  edit: 'message_edit',
  deletes: 'message_delete',
  delete: 'message_delete',
  bulkdeletes: 'message_bulk_delete',
  bulkdelete: 'message_bulk_delete',
  purges: 'message_bulk_delete',
  joins: 'member_join',
  join: 'member_join',
  leaves: 'member_leave',
  leave: 'member_leave',
  kicks: 'member_kick',
  kick: 'member_kick',
  bans: 'member_ban',
  ban: 'member_ban',
  nicknames: 'member_nickname',
  nickname: 'member_nickname',
  nicks: 'member_nickname',
};

const EVENT_LABEL: Record<LogEvent, string> = {
  message_edit: 'edits',
  message_delete: 'deletes',
  message_bulk_delete: 'bulkdeletes',
  member_join: 'joins',
  member_leave: 'leaves',
  member_kick: 'kicks',
  member_ban: 'bans',
  member_nickname: 'nicknames',
};

const ON = new Set(['on', 'enable', 'enabled', 'yes', 'true']);
const OFF = new Set(['off', 'disable', 'disabled', 'no', 'false', 'none', 'clear']);

function parseEvent(raw: string | undefined): LogEvent | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  if (isLogEvent(lower)) return lower;
  return EVENT_ALIASES[lower] ?? null;
}

async function reply(ctx: CommandContext, svc: Services, content: string): Promise<void> {
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    replyToId: ctx.messageId,
    content,
  });
}

function status(cfg: LogConfig, prefix: string): string {
  const channel = (id: string | null) => (id ? `<#${id}>` : 'off');
  const events = (group: (e: LogEvent) => boolean) =>
    LOG_EVENTS.filter(group)
      .map((e) => (cfg.disabledEvents.includes(e) ? `~~${EVENT_LABEL[e]}~~` : EVENT_LABEL[e]))
      .join(', ');

  const lines = [
    '**Server log**',
    `Messages → ${channel(cfg.messageChannel)} · ${events((e) => MESSAGE_EVENTS.has(e))}`,
    `Members → ${channel(cfg.memberChannel)} · ${events((e) => !MESSAGE_EVENTS.has(e))}`,
    `Bot messages: ${cfg.ignoreBots ? 'not logged' : 'logged'}`,
  ];
  if (cfg.ignoredChannelIds.length > 0) {
    lines.push(`Not logged: ${cfg.ignoredChannelIds.map((id) => `<#${id}>`).join(', ')}`);
  }
  if (!cfg.messageChannel && !cfg.memberChannel) {
    lines.push(
      `Turn it on with \`${prefix}log messages #channel\` and \`${prefix}log members #channel\`. ` +
        'Deleted messages are shown in full, so pick a channel only moderators can read.',
    );
  }
  return lines.join('\n');
}

// `#channel`, `here`, or off. undefined = couldn't parse (already replied).
async function parseLogChannel(
  ctx: CommandContext,
  svc: Services,
  raw: string | undefined,
): Promise<string | null | undefined> {
  const lower = raw?.toLowerCase();
  if (!lower) {
    await reply(ctx, svc, 'Give a channel, `here`, or `off`.');
    return undefined;
  }
  if (OFF.has(lower)) return null;
  if (lower === 'here' || lower === 'this') return ctx.channelId;
  const id = parseChannelId(raw);
  if (!id) {
    await reply(ctx, svc, `Couldn't parse \`${raw}\` as a channel.`);
    return undefined;
  }
  if (!(await channelBelongsTo(svc.api, ctx.serverId, id))) {
    await reply(ctx, svc, "That channel isn't in this server.");
    return undefined;
  }
  return id;
}

export const handleLog: Handler = async (ctx, svc) => {
  if (!(await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_SERVER'))) {
    await reply(ctx, svc, 'You need the **Manage Server** permission to change the server log.');
    return;
  }

  const sub = ctx.args[0]?.toLowerCase();
  if (!sub || sub === 'status' || sub === 'show') {
    await reply(ctx, svc, status(await getLogConfig(ctx.serverId), ctx.prefix));
    return;
  }

  if (sub === 'messages' || sub === 'message' || sub === 'members' || sub === 'member') {
    const channelId = await parseLogChannel(ctx, svc, ctx.args[1]);
    if (channelId === undefined) return;
    const isMessages = sub.startsWith('message');
    await setLogConfig(ctx.serverId, isMessages ? { messageChannel: channelId } : { memberChannel: channelId });
    const what = isMessages ? 'Message edits and deletes' : 'Joins, leaves, kicks, bans and nicknames';
    await reply(ctx, svc, channelId ? `${what} → <#${channelId}>` : `${what} are no longer logged.`);
    return;
  }

  if (sub === 'event' || sub === 'events') {
    const target = ctx.args[1]?.toLowerCase();
    const state = ctx.args[2]?.toLowerCase();
    const turnOn = state !== undefined && ON.has(state);
    if (!target || state === undefined || (!turnOn && !OFF.has(state))) {
      await reply(
        ctx,
        svc,
        `Usage: \`${ctx.prefix}log event <name|all> on|off\`. Names: ${LOG_EVENTS.map((e) => EVENT_LABEL[e]).join(', ')}.`,
      );
      return;
    }
    const cfg = await getLogConfig(ctx.serverId);
    let disabled: LogEvent[];
    if (target === 'all') {
      disabled = turnOn ? [] : [...LOG_EVENTS];
    } else {
      const event = parseEvent(target);
      if (!event) {
        await reply(ctx, svc, `No event called \`${target}\`. Names: ${LOG_EVENTS.map((e) => EVENT_LABEL[e]).join(', ')}.`);
        return;
      }
      disabled = turnOn
        ? cfg.disabledEvents.filter((e) => e !== event)
        : [...new Set([...cfg.disabledEvents, event])];
    }
    const next = await setLogConfig(ctx.serverId, { disabledEvents: disabled });
    await reply(ctx, svc, status(next, ctx.prefix));
    return;
  }

  if (sub === 'ignore' || sub === 'unignore') {
    const id = parseChannelId(ctx.args[1]);
    if (!id) {
      await reply(ctx, svc, `Usage: \`${ctx.prefix}log ignore #channel\` (again to undo).`);
      return;
    }
    if (!(await channelBelongsTo(svc.api, ctx.serverId, id))) {
      await reply(ctx, svc, "That channel isn't in this server.");
      return;
    }
    const cfg = await getLogConfig(ctx.serverId);
    const ignored = cfg.ignoredChannelIds.includes(id);
    // `ignore` toggles; `unignore` only ever removes.
    const remove = ignored || sub === 'unignore';
    await setLogConfig(ctx.serverId, {
      ignoredChannelIds: remove
        ? cfg.ignoredChannelIds.filter((c) => c !== id)
        : [...cfg.ignoredChannelIds, id],
    });
    await reply(
      ctx,
      svc,
      remove ? `Messages in <#${id}> are logged again.` : `Messages in <#${id}> are no longer logged.`,
    );
    return;
  }

  if (sub === 'bots') {
    const state = ctx.args[1]?.toLowerCase();
    if (!state || (!ON.has(state) && !OFF.has(state))) {
      await reply(ctx, svc, `Usage: \`${ctx.prefix}log bots on|off\` — whether messages written by bots are logged.`);
      return;
    }
    const logBots = ON.has(state);
    await setLogConfig(ctx.serverId, { ignoreBots: !logBots });
    await reply(ctx, svc, logBots ? 'Messages written by bots are logged.' : 'Messages written by bots are no longer logged.');
    return;
  }

  await reply(
    ctx,
    svc,
    `Usage: \`${ctx.prefix}log\` · \`log messages|members <#channel|here|off>\` · \`log event <name|all> on|off\` · \`log ignore #channel\` · \`log bots on|off\``,
  );
};
