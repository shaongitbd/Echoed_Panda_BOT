import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import { addSub, removeSub, listForServer } from '../twitch/store.js';
import { twitchEnabled } from '../config.js';
import { buildEmbed, COLORS } from '../client/embeds.js';

const CHANNEL_MENTION_RE = /^<#(?<id>[a-zA-Z0-9_-]+)>$/;
const BARE_ID_RE = /^[a-zA-Z0-9_-]{8,}$/;
// Twitch usernames: 4-25 chars, alphanumeric + underscore.
const TWITCH_LOGIN_RE = /^[a-zA-Z0-9_]{4,25}$/;

function parseChannelId(arg: string | undefined): string | null {
  if (!arg) return null;
  const m = CHANNEL_MENTION_RE.exec(arg);
  if (m?.groups?.id) return m.groups.id;
  if (BARE_ID_RE.test(arg)) return arg;
  return null;
}

// Accept the bare username, a twitch.tv URL with or without protocol,
// and tolerate trailing paths / query strings / hashes (e.g. links
// shared from a stream page).
function parseTwitchLogin(arg: string | undefined): string | null {
  if (!arg) return null;
  let t = arg.trim();
  t = t.replace(/^https?:\/\/(?:www\.)?twitch\.tv\//i, '');
  t = t.replace(/^(?:www\.)?twitch\.tv\//i, '');
  t = t.split(/[\/?#]/)[0] ?? '';
  return TWITCH_LOGIN_RE.test(t) ? t.toLowerCase() : null;
}

async function requireManageServer(ctx: CommandContext, svc: Services): Promise<boolean> {
  const ok = await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_SERVER');
  if (!ok) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'You need the **Manage Server** permission to manage Twitch subscriptions.',
    });
  }
  return ok;
}

const USAGE = (prefix: string): string =>
  `**Usage:** \`${prefix}twitch follow <twitch link or username> <#channel>\`

Either of these works:
\`${prefix}twitch follow shroud #live-alerts\`
\`${prefix}twitch follow https://twitch.tv/shroud #live-alerts\`

Other commands:
\`${prefix}twitch unfollow <twitch link or username> <#channel>\`
\`${prefix}twitch list\``;

export const handleTwitch: Handler = async (ctx, svc) => {
  const sub = ctx.args[0]?.toLowerCase();

  if (!sub || sub === 'list') {
    const all = await listForServer(ctx.serverId);
    if (all.length === 0) {
      const config = twitchEnabled()
        ? `No Twitch subscriptions yet. Add one by pasting a Twitch link:
\`${ctx.prefix}twitch follow https://twitch.tv/shroud #live-alerts\``
        : 'Twitch integration isn\'t configured on this bot. Ask the bot operator to set `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`.';
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        content: config,
      });
      return;
    }
    const description = all
      .map((s) => {
        const live = s.lastCheckLive ? ' 🔴' : '';
        return `**${s.twitchLogin}**${live} → <#${s.channelId}>`;
      })
      .join('\n');
    const footer = twitchEnabled()
      ? `${all.length} active`
      : `${all.length} active · credentials missing`;
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: '',
      embeds: [
        buildEmbed({
          title: '◉ Twitch subscriptions',
          description,
          color: COLORS.ACCENT,
          footer,
        }),
      ],
    });
    return;
  }

  if (!(await requireManageServer(ctx, svc))) return;

  if (sub === 'follow' || sub === 'add') {
    const login = parseTwitchLogin(ctx.args[1]);
    const channelId = parseChannelId(ctx.args[2]);
    if (!login || !channelId) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: USAGE(ctx.prefix),
      });
      return;
    }
    await addSub({
      serverId: ctx.serverId,
      channelId,
      twitchLogin: login,
      createdBy: ctx.senderId,
    });
    const note = twitchEnabled()
      ? '. First check happens on the next tick (≤5 min).'
      : '. _Note: bot operator hasn\'t set Twitch credentials — won\'t fire until they do._';
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: `Following **${login}** in <#${channelId}>${note}`,
    });
    return;
  }

  if (sub === 'unfollow' || sub === 'remove') {
    const login = parseTwitchLogin(ctx.args[1]);
    const channelId = parseChannelId(ctx.args[2]);
    if (!login || !channelId) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: USAGE(ctx.prefix),
      });
      return;
    }
    const removed = await removeSub(ctx.serverId, channelId, login);
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: removed
        ? `No more notifications from **${login}** in <#${channelId}>.`
        : `<#${channelId}> wasn't following ${login}.`,
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
