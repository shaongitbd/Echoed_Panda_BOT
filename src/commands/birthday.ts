import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import {
  setBirthday,
  removeBirthday,
  getBirthday,
  upcoming,
  getBirthdayConfig,
  setBirthdayConfig,
} from '../birthday/store.js';
import { parseChannelId, parseRoleId, parseDailyTime, nextDailyRun } from '../util/parse.js';
import { buildEmbed, COLORS } from '../client/embeds.js';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const MAX_MESSAGE_LEN = 500;

async function requireManageServer(ctx: CommandContext, svc: Services): Promise<boolean> {
  const ok = await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_SERVER');
  if (!ok) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'You need the **Manage Server** permission for birthday config.',
    });
  }
  return ok;
}

// Parse MM-DD or MM/DD, optionally with a trailing year (MM-DD-YYYY).
// Returns null on any invalid component.
function parseDate(arg: string | undefined): { month: number; day: number; year: number | null } | null {
  if (!arg) return null;
  const parts = arg.split(/[-/.]/).map((s) => s.trim());
  if (parts.length < 2 || parts.length > 3) return null;
  const month = parseInt(parts[0]!, 10);
  const day = parseInt(parts[1]!, 10);
  const year = parts.length === 3 ? parseInt(parts[2]!, 10) : null;
  if (!Number.isFinite(month) || month < 1 || month > 12) return null;
  if (!Number.isFinite(day) || day < 1 || day > DAYS_IN_MONTH[month - 1]!) return null;
  if (year !== null && (!Number.isFinite(year) || year < 1900 || year > 2025)) return null;
  return { month, day, year };
}

function fmtDate(month: number, day: number): string {
  return `${MONTHS[month - 1]} ${day}`;
}

async function reply(ctx: CommandContext, svc: Services, content: string): Promise<void> {
  await svc.api.sendMessage({ serverId: ctx.serverId, channelId: ctx.channelId, content });
}

const USAGE = (p: string): string =>
  `**Birthdays**
\`${p}birthday set <MM-DD>\` — save your birthday (year optional, never shown)
\`${p}birthday remove\` — delete yours
\`${p}birthday list\` — upcoming birthdays
Admin: \`${p}birthday channel <#channel>\` · \`time <HH:MM>\` · \`role <@role|none>\` · \`message <text>\` · \`on|off\``;

export const handleBirthday: Handler = async (ctx, svc) => {
  const sub = ctx.args[0]?.toLowerCase();

  // ── Member subcommands ───────────────────────────────────────────────
  if (!sub || sub === 'status') {
    const mine = await getBirthday(ctx.serverId, ctx.senderId);
    const cfg = await getBirthdayConfig(ctx.serverId);
    const lines = [
      mine ? `Your birthday: **${fmtDate(mine.month, mine.day)}**` : `You haven't set a birthday — \`${ctx.prefix}birthday set <MM-DD>\`.`,
      cfg.enabled ? `Announcements: <#${cfg.channelId}> at **${cfg.dailyTime} UTC**` : 'Announcements: **off**',
    ];
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: '',
      embeds: [buildEmbed({ title: '🎂 Birthdays', description: lines.join('\n'), color: cfg.enabled ? COLORS.ONLINE : COLORS.MUTED })],
    });
    return;
  }

  if (sub === 'set') {
    const parsed = parseDate(ctx.args[1]);
    if (!parsed) {
      await reply(ctx, svc, 'Use `MM-DD` (e.g. `07-24`). Year is optional and never displayed.');
      return;
    }
    await setBirthday(ctx.serverId, ctx.senderId, parsed.month, parsed.day, parsed.year);
    await reply(ctx, svc, `🎉 Saved your birthday as **${fmtDate(parsed.month, parsed.day)}**.`);
    return;
  }

  if (sub === 'remove' || sub === 'delete' || sub === 'clear') {
    const removed = await removeBirthday(ctx.serverId, ctx.senderId);
    await reply(ctx, svc, removed ? '🗑️ Removed your birthday.' : "You didn't have one saved.");
    return;
  }

  if (sub === 'list' || sub === 'upcoming') {
    const now = new Date();
    const list = await upcoming(ctx.serverId, now.getUTCMonth() + 1, now.getUTCDate(), 15);
    if (list.length === 0) {
      await reply(ctx, svc, `No birthdays saved yet. Add yours with \`${ctx.prefix}birthday set <MM-DD>\`.`);
      return;
    }
    const desc = list
      .map((b) => {
        const when = b.daysAway === 0 ? '**today!** 🎉' : b.daysAway === 1 ? 'tomorrow' : `in ${b.daysAway} days`;
        return `<@${b.userId}> — ${fmtDate(b.month, b.day)} (${when})`;
      })
      .join('\n');
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: '',
      embeds: [buildEmbed({ title: '🎂 Upcoming birthdays', description: desc })],
    });
    return;
  }

  // ── Admin subcommands ────────────────────────────────────────────────
  if (!(await requireManageServer(ctx, svc))) return;

  if (sub === 'channel') {
    const channelId = parseChannelId(ctx.args[1]);
    if (!channelId) {
      await reply(ctx, svc, `Usage: \`${ctx.prefix}birthday channel <#channel>\`.`);
      return;
    }
    const cfg = await getBirthdayConfig(ctx.serverId);
    const { hh, mm } = parseDailyTime(cfg.dailyTime) ?? { hh: 9, mm: 0 };
    await setBirthdayConfig(ctx.serverId, { channelId, enabled: true, nextRunAt: nextDailyRun(hh, mm) });
    await reply(ctx, svc, `✅ Birthday announcements **on** — posting to <#${channelId}> daily at **${cfg.dailyTime} UTC**.`);
    return;
  }

  if (sub === 'time') {
    const t = parseDailyTime(ctx.args[1]);
    if (!t) {
      await reply(ctx, svc, 'Time must be `HH:MM` (24h, UTC). Example: `09:00`.');
      return;
    }
    const time = `${String(t.hh).padStart(2, '0')}:${String(t.mm).padStart(2, '0')}`;
    await setBirthdayConfig(ctx.serverId, { dailyTime: time, nextRunAt: nextDailyRun(t.hh, t.mm) });
    await reply(ctx, svc, `⏰ Birthday check will run daily at **${time} UTC**.`);
    return;
  }

  if (sub === 'role') {
    const arg = ctx.args[1]?.toLowerCase();
    if (arg === 'none' || arg === 'off') {
      await setBirthdayConfig(ctx.serverId, { roleId: null });
      await reply(ctx, svc, '✅ Birthday role cleared — no role will be assigned.');
      return;
    }
    const roleId = parseRoleId(ctx.args[1]);
    if (!roleId) {
      await reply(ctx, svc, `Usage: \`${ctx.prefix}birthday role <@role|none>\`.`);
      return;
    }
    await setBirthdayConfig(ctx.serverId, { roleId });
    await reply(ctx, svc, `✅ I'll give <@&${roleId}> to members on their birthday (and remove it the next day). Make sure I have **Manage Roles**.`);
    return;
  }

  if (sub === 'message' || sub === 'msg') {
    const template = ctx.args.slice(1).join(' ').trim().slice(0, MAX_MESSAGE_LEN);
    if (!template) {
      await setBirthdayConfig(ctx.serverId, { message: null });
      await reply(ctx, svc, '✅ Reset to the default birthday message.');
      return;
    }
    await setBirthdayConfig(ctx.serverId, { message: template });
    await reply(ctx, svc, `✅ Custom message set. \`{user}\` becomes the birthday mention(s).`);
    return;
  }

  if (sub === 'on' || sub === 'enable') {
    const cfg = await getBirthdayConfig(ctx.serverId);
    if (!cfg.channelId) {
      await reply(ctx, svc, `Set a channel first: \`${ctx.prefix}birthday channel <#channel>\`.`);
      return;
    }
    const { hh, mm } = parseDailyTime(cfg.dailyTime) ?? { hh: 9, mm: 0 };
    await setBirthdayConfig(ctx.serverId, { enabled: true, nextRunAt: nextDailyRun(hh, mm) });
    await reply(ctx, svc, '✅ Birthday announcements **on**.');
    return;
  }

  if (sub === 'off' || sub === 'disable') {
    await setBirthdayConfig(ctx.serverId, { enabled: false });
    await reply(ctx, svc, '💤 Birthday announcements **off**.');
    return;
  }

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    replyToId: ctx.messageId,
    content: USAGE(ctx.prefix),
  });
};
