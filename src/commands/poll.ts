import type { Handler } from './index.js';
import { log } from '../log.js';

const NUMBER_EMOJI = [
  '1⃣', '2⃣', '3⃣', '4⃣', '5⃣',
  '6⃣', '7⃣', '8⃣', '9⃣',
];
const THUMBS_UP = '\u{1F44D}';
const THUMBS_DOWN = '\u{1F44E}';

const MAX_OPTIONS = 9;
const MAX_OPTION_LENGTH = 100;

// `!poll <question>`                              → 👍 / 👎 poll
// `!poll <question> | option1 | option2 | …`      → numbered poll
//
// We parse on `|` rather than positional args because most polls have
// multi-word options. The first segment is always the question; the
// rest are options (max 9). A single segment + no pipes = yes/no.
export const handlePoll: Handler = async (ctx, { api }) => {
  // Pull the raw text after the command name to keep emoji intact.
  const tail = ctx.rawContent
    .trim()
    .slice(ctx.prefix.length)
    .split(/\s+/)
    .slice(1)
    .join(' ')
    .trim();

  if (!tail) {
    await api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}poll <question>\` or \`${ctx.prefix}poll <question> | opt1 | opt2 | …\` (up to ${MAX_OPTIONS} options).`,
    });
    return;
  }

  const segments = tail.split('|').map((s) => s.trim()).filter((s) => s.length > 0);
  const question = segments[0];
  const options = segments.slice(1, 1 + MAX_OPTIONS).map((o) => o.slice(0, MAX_OPTION_LENGTH));

  if (!question) {
    await api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'Question is empty.',
    });
    return;
  }

  // Render the poll body and figure out which reactions to seed. For
  // yes/no polls we skip listing the options inline — the thumbs are
  // self-explanatory.
  let body: string;
  let emojis: string[];
  if (options.length === 0) {
    body = `📊 **${question}**\n_Vote with reactions._`;
    emojis = [THUMBS_UP, THUMBS_DOWN];
  } else {
    const lines = [`📊 **${question}**`];
    for (let i = 0; i < options.length; i++) {
      lines.push(`${NUMBER_EMOJI[i]} ${options[i]}`);
    }
    body = lines.join('\n');
    emojis = options.map((_, i) => {
      const e = NUMBER_EMOJI[i];
      if (!e) {
        // unreachable — slice above bounds options to MAX_OPTIONS,
        // and NUMBER_EMOJI has MAX_OPTIONS entries.
        throw new Error('emoji index out of range');
      }
      return e;
    });
  }

  // Send the message first; we need its ID to seed reactions.
  let messageId: string;
  try {
    const sent = await api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: body,
    });
    messageId = sent.messageId;
  } catch (err) {
    log.warn({ err }, 'Poll send failed');
    return;
  }

  // Seed reactions sequentially — running them in parallel would risk
  // hitting the bot rate limit on a busy server, and the strict
  // ordering matches user expectations (1️⃣ before 2️⃣).
  for (const emoji of emojis) {
    try {
      await api.addReaction(ctx.serverId, messageId, emoji);
    } catch (err) {
      log.warn({ err, emoji, messageId }, 'Poll reaction seed failed');
    }
  }
};
