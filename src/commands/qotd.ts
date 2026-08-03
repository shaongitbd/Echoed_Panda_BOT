import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import {
  getQotdConfig,
  setQotdConfig,
  addQuestion,
  removeQuestion,
  listQuestions,
  pickQuestion,
} from '../qotd/store.js';
import { parseChannelId, parseDailyTime, nextDailyRun } from '../util/parse.js';
import { buildEmbed, COLORS } from '../client/embeds.js';
import { resolveChannel } from '../client/names.js';

const MAX_QUESTION_LEN = 500;

async function requireManageServer(ctx: CommandContext, svc: Services): Promise<boolean> {
  const ok = await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_SERVER');
  if (!ok) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'You need the **Manage Server** permission to configure Question of the Day.',
    });
  }
  return ok;
}

const USAGE = (p: string): string =>
  `**Question of the Day**
\`${p}qotd channel <#channel>\` — set the channel & turn it on
\`${p}qotd time <HH:MM>\` — daily post time (UTC)
\`${p}qotd on|off\` — toggle
\`${p}qotd add <question>\` — add to this server's question bank
\`${p}qotd remove <id>\` — remove a question
\`${p}qotd list\` — show the bank
\`${p}qotd now\` — post a question right now`;

async function reply(ctx: CommandContext, svc: Services, content: string): Promise<void> {
  await svc.api.sendMessage({ serverId: ctx.serverId, channelId: ctx.channelId, content });
}

export const handleQotd: Handler = async (ctx, svc) => {
  const sub = ctx.args[0]?.toLowerCase();

  // ── Open (read-only) subcommands ─────────────────────────────────────
  if (!sub || sub === 'status') {
    const cfg = await getQotdConfig(ctx.serverId);
    const bank = await listQuestions(ctx.serverId);
    // Channel name, not a token: embed bodies are delivered verbatim.
    const where =
      cfg.enabled && cfg.channelId
        ? await resolveChannel(svc.api, ctx.serverId, cfg.channelId)
        : null;
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: '',
      embeds: [
        buildEmbed({
          title: '💬 Question of the Day',
          color: cfg.enabled ? COLORS.ONLINE : COLORS.MUTED,
          description: cfg.enabled
            ? `Posting to ${where} daily at **${cfg.dailyTime} UTC**.`
            : `Currently **off**. Turn it on with \`${ctx.prefix}qotd channel <#channel>\`.`,
          footer: `${bank.length} custom question${bank.length === 1 ? '' : 's'} (defaults used when empty)`,
        }),
      ],
    });
    return;
  }

  if (sub === 'list') {
    const bank = await listQuestions(ctx.serverId);
    if (bank.length === 0) {
      await reply(
        ctx,
        svc,
        `No custom questions yet — I'll use my built-in bank. Add one with \`${ctx.prefix}qotd add <question>\`.`,
      );
      return;
    }
    const desc = bank.map((q) => `\`#${q.id}\` ${q.question}`).join('\n').slice(0, 3800);
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: '',
      embeds: [buildEmbed({ title: '💬 QOTD question bank', description: desc, footer: `${bank.length} total` })],
    });
    return;
  }

  // ── Admin subcommands ────────────────────────────────────────────────
  if (!(await requireManageServer(ctx, svc))) return;

  if (sub === 'channel') {
    const channelId = parseChannelId(ctx.args[1]);
    if (!channelId) {
      await reply(ctx, svc, `Usage: \`${ctx.prefix}qotd channel <#channel>\`.`);
      return;
    }
    const cfg = await getQotdConfig(ctx.serverId);
    const { hh, mm } = parseDailyTime(cfg.dailyTime) ?? { hh: 12, mm: 0 };
    await setQotdConfig(ctx.serverId, {
      channelId,
      enabled: true,
      nextRunAt: nextDailyRun(hh, mm),
    });
    await reply(ctx, svc, `✅ Question of the Day is **on** — posting to <#${channelId}> daily at **${cfg.dailyTime} UTC**.`);
    return;
  }

  if (sub === 'time') {
    const t = parseDailyTime(ctx.args[1]);
    if (!t) {
      await reply(ctx, svc, 'Time must be `HH:MM` (24h, UTC). Example: `09:00`.');
      return;
    }
    const time = `${String(t.hh).padStart(2, '0')}:${String(t.mm).padStart(2, '0')}`;
    await setQotdConfig(ctx.serverId, { dailyTime: time, nextRunAt: nextDailyRun(t.hh, t.mm) });
    await reply(ctx, svc, `⏰ QOTD will post daily at **${time} UTC**.`);
    return;
  }

  if (sub === 'on' || sub === 'enable') {
    const cfg = await getQotdConfig(ctx.serverId);
    if (!cfg.channelId) {
      await reply(ctx, svc, `Set a channel first: \`${ctx.prefix}qotd channel <#channel>\`.`);
      return;
    }
    const { hh, mm } = parseDailyTime(cfg.dailyTime) ?? { hh: 12, mm: 0 };
    await setQotdConfig(ctx.serverId, { enabled: true, nextRunAt: nextDailyRun(hh, mm) });
    await reply(ctx, svc, `✅ QOTD **on** — next post around **${cfg.dailyTime} UTC**.`);
    return;
  }

  if (sub === 'off' || sub === 'disable') {
    await setQotdConfig(ctx.serverId, { enabled: false });
    await reply(ctx, svc, '💤 QOTD is now **off**.');
    return;
  }

  if (sub === 'add') {
    const question = ctx.args.slice(1).join(' ').trim().slice(0, MAX_QUESTION_LEN);
    if (!question) {
      await reply(ctx, svc, `Usage: \`${ctx.prefix}qotd add <question>\`.`);
      return;
    }
    const q = await addQuestion(ctx.serverId, question, ctx.senderId);
    await reply(ctx, svc, `✅ Added question \`#${q.id}\` to the bank.`);
    return;
  }

  if (sub === 'remove' || sub === 'delete') {
    const id = ctx.args[1] ? parseInt(ctx.args[1], 10) : NaN;
    if (!Number.isFinite(id)) {
      await reply(ctx, svc, `Usage: \`${ctx.prefix}qotd remove <id>\` (see \`${ctx.prefix}qotd list\`).`);
      return;
    }
    const removed = await removeQuestion(ctx.serverId, id);
    await reply(ctx, svc, removed ? `🗑️ Removed question \`#${id}\`.` : `No question \`#${id}\`.`);
    return;
  }

  if (sub === 'now') {
    const cfg = await getQotdConfig(ctx.serverId);
    const target = cfg.channelId ?? ctx.channelId;
    const question = await pickQuestion(ctx.serverId, cfg.lastQuestion);
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: target,
      content: '',
      embeds: [
        buildEmbed({
          title: '💬 Question of the Day',
          description: question,
          color: COLORS.ACCENT,
          footer: 'Reply below 👇',
        }),
      ],
    });
    await setQotdConfig(ctx.serverId, { lastQuestion: question });
    if (target !== ctx.channelId) await reply(ctx, svc, `Posted to <#${target}>.`);
    return;
  }

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    replyToId: ctx.messageId,
    content: USAGE(ctx.prefix),
  });
};
