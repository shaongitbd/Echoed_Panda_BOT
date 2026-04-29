import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import { parseDuration, formatDuration } from '../mod/duration.js';
import { addSchedule, removeSchedule, listForServer } from '../schedMsg/store.js';

const CHANNEL_MENTION_RE = /^<#(?<id>[a-zA-Z0-9_-]+)>$/;
const BARE_ID_RE = /^[a-zA-Z0-9_-]{8,}$/;
const DAILY_TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

const MIN_INTERVAL_SECONDS = 5 * 60; // 5 min
const MAX_MESSAGE_LEN = 1500;

function parseChannelId(arg: string | undefined): string | null {
  if (!arg) return null;
  const m = CHANNEL_MENTION_RE.exec(arg);
  if (m?.groups?.id) return m.groups.id;
  if (BARE_ID_RE.test(arg)) return arg;
  return null;
}

async function requireManageServer(ctx: CommandContext, svc: Services): Promise<boolean> {
  const ok = await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_SERVER');
  if (!ok) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'You need the **Manage Server** permission to manage scheduled messages.',
    });
  }
  return ok;
}

const USAGE = (prefix: string): string =>
  `Usage:
\`${prefix}schedule add every <duration> <#channel> <message>\` — every 5m, 1h, 1d, …
\`${prefix}schedule add daily <HH:MM> <#channel> <message>\` — daily at HH:MM (UTC)
\`${prefix}schedule remove <id>\`
\`${prefix}schedule list\``;

// Compute the first next_run_at for a daily schedule. If HH:MM has
// already passed today (UTC), schedule for tomorrow. Stored in UTC —
// per-server timezones are a polish for later.
function nextDailyRun(hours: number, minutes: number): Date {
  const now = new Date();
  const next = new Date(
    Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      hours,
      minutes,
      0,
      0,
    ),
  );
  if (next.getTime() <= now.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

export const handleSchedule: Handler = async (ctx, svc) => {
  const sub = ctx.args[0]?.toLowerCase();

  if (!sub || sub === 'list') {
    const all = await listForServer(ctx.serverId);
    if (all.length === 0) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        content: `No scheduled messages. Add one with \`${ctx.prefix}schedule add\`.`,
      });
      return;
    }
    const lines = ['**Scheduled messages**'];
    for (const s of all) {
      const cadence =
        s.kind === 'every'
          ? `every ${formatDuration(s.intervalSeconds ?? 0)}`
          : `daily ${s.dailyTime ?? '?'} UTC`;
      const remaining = Math.max(0, Math.floor((s.nextRunAt.getTime() - Date.now()) / 1000));
      lines.push(
        `\`#${s.id}\` ${cadence} → <#${s.channelId}> (next in ${formatDuration(remaining)})`,
      );
    }
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: lines.join('\n'),
    });
    return;
  }

  if (!(await requireManageServer(ctx, svc))) return;

  if (sub === 'remove' || sub === 'delete') {
    const id = ctx.args[1] ? parseInt(ctx.args[1], 10) : NaN;
    if (!Number.isFinite(id)) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: `Usage: \`${ctx.prefix}schedule remove <id>\`.`,
      });
      return;
    }
    const removed = await removeSchedule(ctx.serverId, id);
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: removed ? `Removed schedule \`#${id}\`.` : `No schedule \`#${id}\`.`,
    });
    return;
  }

  if (sub !== 'add') {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: USAGE(ctx.prefix),
    });
    return;
  }

  // schedule add <every|daily> <duration|HH:MM> <#channel> <message>
  const kind = ctx.args[1]?.toLowerCase();
  const cadenceArg = ctx.args[2];
  const channelId = parseChannelId(ctx.args[3]);
  const message = ctx.rawContent
    .trim()
    .slice(ctx.prefix.length)
    .split(/\s+/)
    .slice(5)
    .join(' ')
    .trim()
    .slice(0, MAX_MESSAGE_LEN);

  if ((kind !== 'every' && kind !== 'daily') || !cadenceArg || !channelId || !message) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: USAGE(ctx.prefix),
    });
    return;
  }

  if (kind === 'every') {
    const interval = parseDuration(cadenceArg);
    if (!interval || interval < MIN_INTERVAL_SECONDS) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: `Interval must be at least ${formatDuration(MIN_INTERVAL_SECONDS)}.`,
      });
      return;
    }
    const nextRunAt = new Date(Date.now() + interval * 1000);
    const sched = await addSchedule({
      serverId: ctx.serverId,
      channelId,
      message,
      kind: 'every',
      intervalSeconds: interval,
      dailyTime: null,
      nextRunAt,
      createdBy: ctx.senderId,
    });
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: `Scheduled \`#${sched.id}\` — every ${formatDuration(interval)} in <#${channelId}>. First run in ${formatDuration(interval)}.`,
    });
    return;
  }

  // daily HH:MM (UTC)
  const m = DAILY_TIME_RE.exec(cadenceArg);
  if (!m) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'Daily time must be `HH:MM` (24h, UTC). Example: `09:00`.',
    });
    return;
  }
  const hh = parseInt(m[1]!, 10);
  const mm = parseInt(m[2]!, 10);
  const nextRunAt = nextDailyRun(hh, mm);
  const sched = await addSchedule({
    serverId: ctx.serverId,
    channelId,
    message,
    kind: 'daily',
    intervalSeconds: null,
    dailyTime: cadenceArg,
    nextRunAt,
    createdBy: ctx.senderId,
  });
  const remaining = Math.max(0, Math.floor((nextRunAt.getTime() - Date.now()) / 1000));
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: `Scheduled \`#${sched.id}\` — daily at ${cadenceArg} UTC in <#${channelId}>. First run in ${formatDuration(remaining)}.`,
  });
};
