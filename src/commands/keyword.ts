import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import { addRule, removeRule, listForServer } from '../keywords/store.js';
import { forgetRule } from '../keywords/handler.js';
import { buildEmbed, COLORS } from '../client/embeds.js';

const CHANNEL_MENTION_RE = /^<#(?<id>[a-zA-Z0-9_-]+)>$/;
const BARE_ID_RE = /^[a-zA-Z0-9_-]{8,}$/;

const MAX_PHRASE_LEN = 80;
const MAX_RESPONSE_LEN = 1900;

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
      content: 'You need the **Manage Server** permission for keyword config.',
    });
  }
  return ok;
}

const USAGE = (prefix: string): string =>
  `Usage:
\`${prefix}keyword add "phrase" "response" [<channel>]\` — quotes required around the two fields
\`${prefix}keyword remove <id>\`
\`${prefix}keyword list\``;

// Parse two quoted strings + optional channel mention. Supports both
// "double" and 'single' quotes; falls back to whitespace splitting if
// no quotes are present.
function parseQuotedArgs(tail: string): { phrase: string; response: string; rest: string } | null {
  const re = /(?:"([^"]+)"|'([^']+)')\s+(?:"([^"]+)"|'([^']+)')(.*)/;
  const m = re.exec(tail);
  if (!m) return null;
  const phrase = m[1] ?? m[2] ?? '';
  const response = m[3] ?? m[4] ?? '';
  if (!phrase || !response) return null;
  return { phrase, response, rest: (m[5] ?? '').trim() };
}

export const handleKeyword: Handler = async (ctx, svc) => {
  // Keyword rules reveal trigger phrases, which a non-admin could use
  // to evade auto-moderation or intentionally spam triggers. Gate
  // every subcommand — including `list` — behind Manage Server.
  if (!(await requireManageServer(ctx, svc))) return;

  const sub = ctx.args[0]?.toLowerCase();

  if (!sub || sub === 'list') {
    const all = await listForServer(ctx.serverId);
    if (all.length === 0) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        content: `No keyword rules yet. Add one with \`${ctx.prefix}keyword add "phrase" "response"\`.`,
      });
      return;
    }
    const description = all
      .map((r) => {
        const scope = r.channelId ? `<#${r.channelId}>` : 'all channels';
        return `\`#${r.id}\` (${scope}) "${r.phrase}" → ${r.response.slice(0, 80)}`;
      })
      .join('\n');
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: '',
      embeds: [
        buildEmbed({
          title: 'Keyword rules',
          description,
          color: COLORS.ACCENT,
          footer: `${all.length} rule${all.length === 1 ? '' : 's'}`,
        }),
      ],
    });
    return;
  }

  if (sub === 'add') {
    // Pull everything after the `add` subcommand from the raw content.
    const tail = ctx.rawContent
      .trim()
      .slice(ctx.prefix.length)
      .split(/\s+/)
      .slice(2)
      .join(' ')
      .trim();
    const parsed = parseQuotedArgs(tail);
    if (!parsed) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: USAGE(ctx.prefix),
      });
      return;
    }
    if (parsed.phrase.length > MAX_PHRASE_LEN) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: `Phrase must be ≤ ${MAX_PHRASE_LEN} chars.`,
      });
      return;
    }
    if (parsed.response.length > MAX_RESPONSE_LEN) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: `Response must be ≤ ${MAX_RESPONSE_LEN} chars.`,
      });
      return;
    }
    const channelId = parsed.rest ? parseChannelId(parsed.rest.split(/\s+/)[0]) : null;
    const rule = await addRule({
      serverId: ctx.serverId,
      phrase: parsed.phrase,
      response: parsed.response,
      channelId,
      createdBy: ctx.senderId,
    });
    const scope = channelId ? `in <#${channelId}>` : 'in any channel';
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: `Saved keyword rule \`#${rule.id}\` ${scope}.`,
    });
    return;
  }

  if (sub === 'remove' || sub === 'delete') {
    const id = ctx.args[1] ? parseInt(ctx.args[1], 10) : NaN;
    if (!Number.isFinite(id)) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: `Usage: \`${ctx.prefix}keyword remove <id>\`. Find IDs with \`${ctx.prefix}keyword list\`.`,
      });
      return;
    }
    const removed = await removeRule(ctx.serverId, id);
    if (removed) forgetRule(id);
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: removed ? `Removed rule \`#${id}\`.` : `No rule \`#${id}\` on this server.`,
    });
    return;
  }

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    replyToId: ctx.messageId,
    content: USAGE(ctx.prefix),
  });
};
