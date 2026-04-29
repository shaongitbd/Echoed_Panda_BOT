import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import {
  addMapping,
  removeMapping,
  setMode,
  listForServer,
  parseMode,
} from '../reactRoles/store.js';
import { EchoedApiError } from '../client/echoedClient.js';
import { buildEmbed, field, COLORS } from '../client/embeds.js';

const ROLE_MENTION_RE = /^<@&(?<id>[a-zA-Z0-9_-]+)>$/;
const BARE_ID_RE = /^[a-zA-Z0-9_-]{8,}$/;

function parseRoleId(arg: string | undefined): string | null {
  if (!arg) return null;
  const m = ROLE_MENTION_RE.exec(arg);
  if (m?.groups?.id) return m.groups.id;
  if (BARE_ID_RE.test(arg)) return arg;
  return null;
}

// Message-link parsing: accept either a bare ID or an Echoed-style
// link. We don't fail hard on URL shape — a string that looks
// ID-like is good enough at the command surface.
function parseMessageId(arg: string | undefined): string | null {
  if (!arg) return null;
  const trimmed = arg.trim();
  // Echoed message links end in /<messageId>; pull the trailing path
  // segment. The exact host doesn't matter for parsing.
  const linkMatch = trimmed.match(/\/(?<id>[a-zA-Z0-9_-]+)\/?$/);
  if (linkMatch?.groups?.id && BARE_ID_RE.test(linkMatch.groups.id)) {
    return linkMatch.groups.id;
  }
  if (BARE_ID_RE.test(trimmed)) return trimmed;
  return null;
}

async function requireManageRoles(ctx: CommandContext, svc: Services): Promise<boolean> {
  const ok = await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_ROLES');
  if (!ok) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'You need the **Manage Roles** permission for reaction-role setup.',
    });
  }
  return ok;
}

const USAGE = (prefix: string): string =>
  `Usage:
\`${prefix}reactrole add <messageId|link> <emoji> <@role>\`
\`${prefix}reactrole remove <messageId> <emoji>\`
\`${prefix}reactrole list\`
\`${prefix}reactrole mode <messageId> <normal|unique|verify>\``;

export const handleReactRole: Handler = async (ctx, svc) => {
  if (!(await requireManageRoles(ctx, svc))) return;

  const sub = ctx.args[0]?.toLowerCase();
  if (!sub) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: USAGE(ctx.prefix),
    });
    return;
  }

  if (sub === 'add') {
    const messageId = parseMessageId(ctx.args[1]);
    const emoji = ctx.args[2];
    const roleId = parseRoleId(ctx.args[3]);
    if (!messageId || !emoji || !roleId) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: USAGE(ctx.prefix),
      });
      return;
    }

    // Verify the message exists in this server before persisting — without
    // this guard a typoed ID would silently store a dead row.
    let messageChannelId: string;
    try {
      const msg = await svc.api.getMessage(ctx.serverId, messageId);
      messageChannelId = msg.channelId;
    } catch (err) {
      const reason =
        err instanceof EchoedApiError ? err.message : 'Message lookup failed.';
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: `Couldn't find that message: ${reason}`,
      });
      return;
    }

    await addMapping({
      serverId: ctx.serverId,
      channelId: messageChannelId,
      messageId,
      emoji,
      roleId,
    });

    // Seed the reaction so users have something to click on. If this
    // fails (rate limit, perms), the mapping still works — users just
    // need to add their own first reaction.
    try {
      await svc.api.addReaction(ctx.serverId, messageId, emoji);
    } catch (err) {
      // Don't fail the command — surface a hint and move on.
      const reason =
        err instanceof EchoedApiError ? err.message : 'unknown error';
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        content: `Bound ${emoji} → <@&${roleId}> on \`${messageId}\` — but seeding the reaction failed (${reason}). You can add it manually.`,
      });
      return;
    }

    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: `Reacting with ${emoji} on \`${messageId}\` will now grant <@&${roleId}>.`,
    });
    return;
  }

  if (sub === 'remove' || sub === 'delete') {
    const messageId = parseMessageId(ctx.args[1]);
    const emoji = ctx.args[2];
    if (!messageId || !emoji) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: `Usage: \`${ctx.prefix}reactrole remove <messageId> <emoji>\`.`,
      });
      return;
    }
    const removed = await removeMapping(messageId, emoji);
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: removed
        ? `Removed ${emoji} → role binding from \`${messageId}\`. The bot's seeded reaction stays — clear it manually if you want.`
        : `No mapping for ${emoji} on \`${messageId}\`.`,
    });
    return;
  }

  if (sub === 'list') {
    const all = await listForServer(ctx.serverId);
    if (all.length === 0) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        content: `No reaction-role messages configured. Add one with \`${ctx.prefix}reactrole add\`.`,
      });
      return;
    }
    // One field per reaction-role message — each shows the mode +
    // every emoji→role binding. Inline=false because the bindings
    // list can get long; we want each message on its own row.
    const fields = all.map((entry) => {
      const bindings =
        entry.mappings.length > 0
          ? entry.mappings.map((m) => `${m.emoji} → <@&${m.roleId}>`).join('\n')
          : '_no bindings_';
      return field(
        `\`${entry.messageId}\` · #${entry.channelId} · ${entry.mode}`,
        bindings,
        false,
      );
    });
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: '',
      embeds: [
        buildEmbed({
          title: 'Reaction-role messages',
          color: COLORS.ACCENT,
          fields,
          footer: `${all.length} message${all.length === 1 ? '' : 's'} configured`,
        }),
      ],
    });
    return;
  }

  if (sub === 'mode') {
    const messageId = parseMessageId(ctx.args[1]);
    const modeArg = ctx.args[2];
    const mode = modeArg ? parseMode(modeArg) : null;
    if (!messageId || !mode) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: `Usage: \`${ctx.prefix}reactrole mode <messageId> <normal|unique|verify>\`.`,
      });
      return;
    }
    const ok = await setMode(messageId, mode);
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: ok
        ? `Mode for \`${messageId}\` set to \`${mode}\`.`
        : `No reaction-role message with ID \`${messageId}\`.`,
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
