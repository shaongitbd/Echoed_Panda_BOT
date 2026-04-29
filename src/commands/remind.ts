import type { Handler } from './index.js';
import { parseDuration, formatDuration } from '../mod/duration.js';
import { addReminder, listForUser, cancelReminder } from '../reminders/store.js';
import { buildEmbed, COLORS } from '../client/embeds.js';

const MAX_MESSAGE = 500;
const MAX_FUTURE_DAYS = 365; // refuse silly far-future reminders

export const handleRemind: Handler = async (ctx, { api }) => {
  const sub = ctx.args[0]?.toLowerCase();

  if (sub === 'list') {
    const all = await listForUser(ctx.serverId, ctx.senderId);
    if (all.length === 0) {
      await api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        content: 'You have no pending reminders.',
      });
      return;
    }
    const description = all
      .map((r) => {
        const remaining = Math.max(0, Math.floor((r.dueAt.getTime() - Date.now()) / 1000));
        return `\`#${r.id}\` in ${formatDuration(remaining)} — ${r.message}`;
      })
      .join('\n');
    await api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: '',
      embeds: [
        buildEmbed({
          title: '⏰ Your reminders',
          description,
          color: COLORS.ACCENT,
          footer: `${all.length} pending`,
        }),
      ],
    });
    return;
  }

  if (sub === 'cancel' || sub === 'remove') {
    const id = ctx.args[1] ? parseInt(ctx.args[1], 10) : NaN;
    if (!Number.isFinite(id)) {
      await api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: `Usage: \`${ctx.prefix}remind cancel <id>\`. Find your IDs with \`${ctx.prefix}remind list\`.`,
      });
      return;
    }
    const removed = await cancelReminder(ctx.serverId, ctx.senderId, id);
    await api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: removed
        ? `Cancelled reminder \`#${id}\`.`
        : `No reminder \`#${id}\` for you on this server.`,
    });
    return;
  }

  // `!remind <duration> <message>` — duration is the FIRST arg, the
  // rest is message body. Pull message from raw content so emoji and
  // punctuation aren't munged.
  const duration = ctx.args[0] ? parseDuration(ctx.args[0]) : null;
  const message = ctx.rawContent
    .trim()
    .slice(ctx.prefix.length)
    .split(/\s+/)
    .slice(2)
    .join(' ')
    .trim()
    .slice(0, MAX_MESSAGE);

  if (!duration || !message) {
    await api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}remind <duration> <message>\`. Examples: \`5m\`, \`1h30m\`, \`1d\`. Also: \`${ctx.prefix}remind list\` / \`${ctx.prefix}remind cancel <id>\`.`,
    });
    return;
  }
  if (duration < 30) {
    await api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'Reminder duration must be at least 30 seconds.',
    });
    return;
  }
  if (duration > MAX_FUTURE_DAYS * 86_400) {
    await api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Reminder duration too long — max ${MAX_FUTURE_DAYS} days.`,
    });
    return;
  }

  const dueAt = new Date(Date.now() + duration * 1000);
  const reminder = await addReminder({
    serverId: ctx.serverId,
    userId: ctx.senderId,
    channelId: ctx.channelId,
    message,
    dueAt,
  });

  await api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: `⏰ Got it — I'll remind you in ${formatDuration(duration)} (\`#${reminder.id}\`).`,
  });
};
