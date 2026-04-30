import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import { getGuildConfig, setGuildConfig } from '../db/guildConfig.js';

const CHANNEL_MENTION_RE = /^<#(?<id>[a-zA-Z0-9_-]+)>$/;
const ROLE_MENTION_RE = /^<@&(?<id>[a-zA-Z0-9_-]+)>$/;
const BARE_ID_RE = /^[a-zA-Z0-9_-]{8,}$/;

function parseChannelId(arg: string | undefined): string | null {
  if (!arg) return null;
  const m = CHANNEL_MENTION_RE.exec(arg);
  if (m?.groups?.id) return m.groups.id;
  if (BARE_ID_RE.test(arg)) return arg;
  return null;
}

function parseRoleId(arg: string | undefined): string | null {
  if (!arg) return null;
  const m = ROLE_MENTION_RE.exec(arg);
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
      content: 'You need the **Manage Server** permission to change welcome settings.',
    });
  }
  return ok;
}

// `!setwelcome <#channel|none>` — sets where welcome messages go.
// Without a channel set, no message fires (auto-role still works).
export const handleSetWelcome: Handler = async (ctx, svc) => {
  if (!(await requireManageServer(ctx, svc))) return;

  const arg = ctx.args[0]?.toLowerCase();
  if (!arg) {
    const cfg = await getGuildConfig(ctx.serverId);
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: cfg.welcomeChannel
        ? `Welcome channel: <#${cfg.welcomeChannel}>. Clear with \`${ctx.prefix}setwelcome none\`.`
        : `No welcome channel set. Use \`${ctx.prefix}setwelcome <channel>\` to enable.`,
    });
    return;
  }

  let channelId: string | null;
  if (arg === 'none' || arg === 'clear' || arg === 'off') {
    channelId = null;
  } else {
    channelId = parseChannelId(ctx.args[0]);
    if (!channelId) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: `Couldn't parse \`${ctx.args[0]}\` as a channel.`,
      });
      return;
    }
  }

  await setGuildConfig(ctx.serverId, { welcomeChannel: channelId });
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: channelId ? `✅ Welcome → <#${channelId}>` : '✅ Welcome messages disabled.',
  });
};

// `!welcomemsg <template>` — accepts {user}, {server}, {membercount}.
export const handleWelcomeMsg: Handler = async (ctx, svc) => {
  if (!(await requireManageServer(ctx, svc))) return;

  // Pull everything after the command from the raw message so multi-word
  // templates with punctuation arrive intact.
  const raw = ctx.rawContent.trim().slice(ctx.prefix.length).split(/\s+/).slice(1).join(' ');

  if (!raw) {
    const cfg = await getGuildConfig(ctx.serverId);
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: cfg.welcomeMessage
        ? `Current welcome message:\n${cfg.welcomeMessage}\n\nReset with \`${ctx.prefix}welcomemsg default\`. Placeholders: \`{user}\`, \`{server}\`, \`{membercount}\`.`
        : `No custom message — using default. Placeholders: \`{user}\`, \`{server}\`, \`{membercount}\`.\nUsage: \`${ctx.prefix}welcomemsg Hey {user}, welcome aboard!\``,
    });
    return;
  }

  const next = raw.toLowerCase() === 'default' || raw.toLowerCase() === 'reset' ? null : raw;
  await setGuildConfig(ctx.serverId, { welcomeMessage: next });
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: next
      ? `Welcome message updated.\nPreview: ${next.replace(/\{user\}/g, `<@${ctx.senderId}>`).replace(/\{server\}/g, 'your server').replace(/\{membercount\}/g, '42')}`
      : 'Welcome message reset to default.',
  });
};

// `!autorole <@role|none>` — assign on join, or clear it.
export const handleAutoRole: Handler = async (ctx, svc) => {
  if (!(await requireManageServer(ctx, svc))) return;

  const arg = ctx.args[0]?.toLowerCase();
  if (!arg) {
    const cfg = await getGuildConfig(ctx.serverId);
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: cfg.autoroleId
        ? `Auto-role: <@&${cfg.autoroleId}>. Clear with \`${ctx.prefix}autorole none\`.`
        : `No auto-role set. Use \`${ctx.prefix}autorole <@role>\`.`,
    });
    return;
  }

  let roleId: string | null;
  if (arg === 'none' || arg === 'clear' || arg === 'off') {
    roleId = null;
  } else {
    roleId = parseRoleId(ctx.args[0]);
    if (!roleId) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: `Couldn't parse \`${ctx.args[0]}\` as a role.`,
      });
      return;
    }
  }

  await setGuildConfig(ctx.serverId, { autoroleId: roleId });
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: roleId ? `✅ Auto-role → <@&${roleId}>` : '✅ Auto-role disabled.',
  });
};
