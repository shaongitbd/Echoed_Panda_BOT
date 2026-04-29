import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import { registry } from './index.js';
import {
  addCommand,
  removeCommand,
  listCommands,
  isValidName,
  NAME_MAX_LENGTH,
  RESPONSE_MAX_LENGTH,
} from '../customCommands/store.js';

async function requireManageServer(ctx: CommandContext, svc: Services): Promise<boolean> {
  const ok = await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_SERVER');
  if (!ok) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'You need the **Manage Server** permission to manage custom commands.',
    });
  }
  return ok;
}

// Built-in names + their aliases. Custom commands can't shadow these.
function isReservedName(name: string): boolean {
  for (const c of registry) {
    if (c.name === name) return true;
    if (c.aliases.some((a) => a === name)) return true;
  }
  return false;
}

const USAGE = (prefix: string): string =>
  `Usage:
\`${prefix}cmd add <name> <response>\`
\`${prefix}cmd remove <name>\`
\`${prefix}cmd list\`

Placeholders in responses: \`{user}\`, \`{user.name}\`, \`{args}\``;

export const handleCustomCommand: Handler = async (ctx, svc) => {
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

  if (sub === 'list') {
    // List is read-only — no permission gate.
    const all = await listCommands(ctx.serverId);
    if (all.length === 0) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        content: `No custom commands yet. Add one with \`${ctx.prefix}cmd add <name> <response>\`.`,
      });
      return;
    }
    const lines = [`**Custom commands** (${all.length})`];
    for (const c of all) {
      lines.push(`\`${ctx.prefix}${c.name}\` — used ${c.usesCount}×`);
    }
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: lines.join('\n'),
    });
    return;
  }

  if (!(await requireManageServer(ctx, svc))) return;

  if (sub === 'add' || sub === 'set') {
    const name = ctx.args[1]?.toLowerCase();
    // Pull the response from the raw content so multi-word + punctuation
    // arrive intact. Skip the prefix, command name, sub, and command name arg.
    const tail = ctx.rawContent
      .trim()
      .slice(ctx.prefix.length)
      .split(/\s+/)
      .slice(3)
      .join(' ');

    if (!name || !tail) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: `Usage: \`${ctx.prefix}cmd add <name> <response>\`. Name must be lowercase alphanumeric, dash, or underscore (max ${NAME_MAX_LENGTH}).`,
      });
      return;
    }
    if (!isValidName(name)) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: `Invalid name. Must be lowercase a-z, 0-9, dash, or underscore — up to ${NAME_MAX_LENGTH} chars.`,
      });
      return;
    }
    if (isReservedName(name)) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: `\`${name}\` is a built-in command and can't be overridden.`,
      });
      return;
    }
    if (tail.length > RESPONSE_MAX_LENGTH) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: `Response too long — keep it under ${RESPONSE_MAX_LENGTH} chars.`,
      });
      return;
    }

    await addCommand({
      serverId: ctx.serverId,
      name,
      response: tail,
      createdBy: ctx.senderId,
    });
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: `Saved \`${ctx.prefix}${name}\`.`,
    });
    return;
  }

  if (sub === 'remove' || sub === 'delete') {
    const name = ctx.args[1]?.toLowerCase();
    if (!name) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: `Usage: \`${ctx.prefix}cmd remove <name>\`.`,
      });
      return;
    }
    const removed = await removeCommand(ctx.serverId, name);
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: removed ? `Removed \`${name}\`.` : `No custom command named \`${name}\`.`,
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
