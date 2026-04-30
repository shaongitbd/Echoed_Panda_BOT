import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import { addSub, removeSub, listForServer } from '../youtube/store.js';
import { buildEmbed, COLORS } from '../client/embeds.js';
import { log } from '../log.js';

const CHANNEL_MENTION_RE = /^<#(?<id>[a-zA-Z0-9_-]+)>$/;
const BARE_ID_RE = /^[a-zA-Z0-9_-]{8,}$/;
// YouTube channel IDs always start with `UC` and are 24 chars total.
const YT_CHANNEL_RE = /^UC[a-zA-Z0-9_-]{22}$/;

function parseChannelId(arg: string | undefined): string | null {
  if (!arg) return null;
  const m = CHANNEL_MENTION_RE.exec(arg);
  if (m?.groups?.id) return m.groups.id;
  if (BARE_ID_RE.test(arg)) return arg;
  return null;
}

// Fast synchronous resolution for inputs we can decode from the
// string alone — bare `UC...` IDs and `youtube.com/channel/UC...`
// URLs. Returns null when network resolution is required (handles
// `@username`, `/c/...`, `/user/...`, video URLs).
function fastParseYoutubeChannelId(arg: string): string | null {
  const trimmed = arg.trim();
  if (YT_CHANNEL_RE.test(trimmed)) return trimmed;
  const m = /\/channel\/(UC[a-zA-Z0-9_-]{22})/.exec(trimmed);
  if (m?.[1]) return m[1];
  return null;
}

// Resolve any common YouTube identifier shape to a `UC...` channel ID.
// Accepts:
//   • Bare `UC...` ID
//   • youtube.com/channel/UC...
//   • youtube.com/@handle (most common form people paste today)
//   • youtube.com/c/CustomName
//   • youtube.com/user/LegacyUsername
//   • A handle by itself: `@MKBHD`
//
// For everything that isn't already a UC ID, we fetch the channel
// page and pull `externalId`/`channelId`/`/channel/UC...` out of the
// embedded JSON. YouTube includes the canonical UC ID on every flavor
// of channel URL, so a single GET is enough — no API key needed.
//
// Network failures are logged and surface as `null` (caller decides
// the user-facing copy). 6 s timeout so a slow CDN doesn't hang the
// command.
async function resolveYoutubeChannelId(arg: string | undefined): Promise<string | null> {
  if (!arg) return null;
  const fast = fastParseYoutubeChannelId(arg);
  if (fast) return fast;

  let url: string | null = null;
  const t = arg.trim();
  if (/^@[\w.-]{1,40}$/.test(t)) {
    url = `https://www.youtube.com/${t}`;
  } else if (/^https?:\/\//i.test(t) && /youtube\.com\//i.test(t)) {
    url = t;
  } else if (/^(?:www\.)?youtube\.com\//i.test(t)) {
    url = `https://${t.replace(/^www\./i, 'www.')}`;
  } else if (/^(?:https?:\/\/)?youtu\.be\//i.test(t)) {
    url = t.startsWith('http') ? t : `https://${t}`;
  }
  if (!url) return null;

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 6000);
    const res = await fetch(url, {
      headers: {
        // YouTube serves a stripped page to bot-shaped UAs; mimic a
        // real browser so the embedded `channelId` stays in the HTML.
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
        'accept-language': 'en-US,en;q=0.7',
      },
      redirect: 'follow',
      signal: ac.signal,
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const html = await res.text();

    const patterns = [
      /"externalId":"(UC[a-zA-Z0-9_-]{22})"/,
      /"channelId":"(UC[a-zA-Z0-9_-]{22})"/,
      /\/channel\/(UC[a-zA-Z0-9_-]{22})/,
    ];
    for (const re of patterns) {
      const m = re.exec(html);
      if (m?.[1]) return m[1];
    }
    return null;
  } catch (err) {
    log.warn({ err, input: t }, 'YouTube channel ID resolution failed');
    return null;
  }
}

async function requireManageServer(ctx: CommandContext, svc: Services): Promise<boolean> {
  const ok = await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_SERVER');
  if (!ok) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'You need the **Manage Server** permission to manage YouTube subscriptions.',
    });
  }
  return ok;
}

const USAGE = (prefix: string): string =>
  `**Usage:** \`${prefix}youtube follow <youtube link> <#channel>\`

Paste any of these — panda figures out the channel ID:
\`${prefix}youtube follow https://youtube.com/@MKBHD #yt-feed\`
\`${prefix}youtube follow youtube.com/channel/UCBJycsmduvYEL83R_U4JriQ #yt-feed\`
\`${prefix}youtube follow @MKBHD #yt-feed\`

Other commands:
\`${prefix}youtube unfollow <youtube link> <#channel>\`
\`${prefix}youtube list\``;

const NOT_RECOGNISED = (prefix: string, input: string | undefined): string =>
  input
    ? `Couldn't figure out a YouTube channel from \`${input}\`. Paste the channel page URL — \`youtube.com/@handle\` or \`youtube.com/channel/UC...\` — or run \`${prefix}help youtube\`.`
    : USAGE(prefix);

export const handleYoutube: Handler = async (ctx, svc) => {
  const sub = ctx.args[0]?.toLowerCase();

  if (!sub || sub === 'list') {
    const all = await listForServer(ctx.serverId);
    if (all.length === 0) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        content: `No YouTube subscriptions yet. Add one by pasting any channel link:
\`${ctx.prefix}youtube follow https://youtube.com/@MKBHD #yt-feed\``,
      });
      return;
    }
    const description = all
      .map((s) => `\`${s.youtubeChannelId}\` → <#${s.channelId}>`)
      .join('\n');
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: '',
      embeds: [
        buildEmbed({
          title: '◉ YouTube subscriptions',
          description,
          color: COLORS.ACCENT,
          footer: `${all.length} active`,
        }),
      ],
    });
    return;
  }

  if (!(await requireManageServer(ctx, svc))) return;

  if (sub === 'follow' || sub === 'add') {
    const channelId = parseChannelId(ctx.args[2]);
    if (!channelId) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: USAGE(ctx.prefix),
      });
      return;
    }
    const ytChannel = await resolveYoutubeChannelId(ctx.args[1]);
    if (!ytChannel) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: NOT_RECOGNISED(ctx.prefix, ctx.args[1]),
      });
      return;
    }
    await addSub({
      serverId: ctx.serverId,
      channelId,
      youtubeChannelId: ytChannel,
      createdBy: ctx.senderId,
    });
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: `Following \`${ytChannel}\` in <#${channelId}>. First check happens on the next tick (≤5 min).`,
    });
    return;
  }

  if (sub === 'unfollow' || sub === 'remove') {
    const channelId = parseChannelId(ctx.args[2]);
    if (!channelId) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: USAGE(ctx.prefix),
      });
      return;
    }
    const ytChannel = await resolveYoutubeChannelId(ctx.args[1]);
    if (!ytChannel) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: NOT_RECOGNISED(ctx.prefix, ctx.args[1]),
      });
      return;
    }
    const removed = await removeSub(ctx.serverId, channelId, ytChannel);
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: removed
        ? `No more notifications from \`${ytChannel}\` in <#${channelId}>.`
        : `<#${channelId}> wasn't following ${ytChannel}.`,
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
