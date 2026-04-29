import type { Handler } from './index.js';
import type { Services } from './index.js';
import type { CommandContext } from '../types.js';
import {
  getLevelSettings,
  setLevelSettings,
  invalidateLevelSettings,
} from '../db/levelSettings.js';
import {
  getRewardsInRange,
  setLevelReward,
  deleteLevelReward,
} from '../levels/levelUp.js';

// ─── Mention parsing ────────────────────────────────────────────────────

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

// ─── Permission gate ────────────────────────────────────────────────────
//
// All level-config commands require MANAGE_SERVER. The helper centralizes
// the "you don't have permission" reply so every handler doesn't repeat it.

async function requireManageServer(
  ctx: CommandContext,
  svc: Services,
): Promise<boolean> {
  const ok = await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_SERVER');
  if (!ok) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'You need the **Manage Server** permission to change level settings.',
    });
  }
  return ok;
}

// ─── Handlers ───────────────────────────────────────────────────────────

// `!levels enable` / `!levels disable` / `!levels` (status)
export const handleLevelsToggle: Handler = async (ctx, svc) => {
  if (!(await requireManageServer(ctx, svc))) return;

  const sub = ctx.args[0]?.toLowerCase();
  const settings = await getLevelSettings(ctx.serverId);

  if (!sub) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: `Levels are currently **${settings.enabled ? 'enabled' : 'disabled'}** on this server.`,
    });
    return;
  }

  if (sub !== 'enable' && sub !== 'disable') {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}levels enable\` or \`${ctx.prefix}levels disable\`.`,
    });
    return;
  }

  await setLevelSettings(ctx.serverId, { enabled: sub === 'enable' });
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: `Levels are now **${sub}d**.`,
  });
};

// `!setlevelchannel <#channel|here|none>`
export const handleSetLevelChannel: Handler = async (ctx, svc) => {
  if (!(await requireManageServer(ctx, svc))) return;

  const arg = ctx.args[0]?.toLowerCase();
  if (!arg) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}setlevelchannel <#channel|here|none>\`.\n\`here\` uses the source channel · \`none\` clears the override.`,
    });
    return;
  }

  let channelId: string | null;
  if (arg === 'none' || arg === 'clear') {
    channelId = null;
  } else if (arg === 'here' || arg === 'this') {
    channelId = ctx.channelId;
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

  await setLevelSettings(ctx.serverId, { levelUpChannel: channelId });
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: channelId
      ? `Level-up announcements will go to <#${channelId}>.`
      : 'Level-up announcements will go to the channel where the level-up happened.',
  });
};

// `!setlevelmsg <template>` — accepts {user}, {level} placeholders.
// Special arg `default` resets to the built-in template.
export const handleSetLevelMsg: Handler = async (ctx, svc) => {
  if (!(await requireManageServer(ctx, svc))) return;

  const raw = ctx.rawContent.trim().slice(ctx.prefix.length).split(/\s+/).slice(1).join(' ');
  if (!raw) {
    const settings = await getLevelSettings(ctx.serverId);
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: settings.levelUpMessage
        ? `Current level-up message:\n${settings.levelUpMessage}\n\nReset with \`${ctx.prefix}setlevelmsg default\`. Placeholders: \`{user}\`, \`{level}\`.`
        : `No custom message set — using default. Placeholders: \`{user}\`, \`{level}\`.\nUsage: \`${ctx.prefix}setlevelmsg GG {user}, you hit level {level}!\``,
    });
    return;
  }

  const next = raw.toLowerCase() === 'default' || raw.toLowerCase() === 'reset' ? null : raw;
  await setLevelSettings(ctx.serverId, { levelUpMessage: next });
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: next
      ? `Level-up message updated.\nPreview: ${next.replace(/\{user\}/g, `<@${ctx.senderId}>`).replace(/\{level\}/g, '5')}`
      : 'Level-up message reset to default.',
  });
};

// `!addlevelrole <level> <@role>`
export const handleAddLevelRole: Handler = async (ctx, svc) => {
  if (!(await requireManageServer(ctx, svc))) return;

  const levelArg = ctx.args[0];
  const roleArg = ctx.args[1];
  const level = levelArg ? parseInt(levelArg, 10) : NaN;
  const roleId = parseRoleId(roleArg);

  if (!Number.isFinite(level) || level < 1 || level > 1000 || !roleId) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}addlevelrole <level> <@role>\` (level 1-1000).`,
    });
    return;
  }

  await setLevelReward(ctx.serverId, level, roleId);
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: `Members will get <@&${roleId}> when they hit level **${level}**.`,
  });
};

// `!removelevelrole <level>`
export const handleRemoveLevelRole: Handler = async (ctx, svc) => {
  if (!(await requireManageServer(ctx, svc))) return;

  const level = ctx.args[0] ? parseInt(ctx.args[0], 10) : NaN;
  if (!Number.isFinite(level) || level < 1) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}removelevelrole <level>\`.`,
    });
    return;
  }

  const removed = await deleteLevelReward(ctx.serverId, level);
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: removed
      ? `Removed the reward for level **${level}**.`
      : `No reward configured for level **${level}**.`,
  });
};

// `!levelrewards` — list all configured rewards.
export const handleLevelRewards: Handler = async (ctx, svc) => {
  const rewards = await getRewardsInRange(ctx.serverId, 1, 1000);
  if (rewards.length === 0) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: `No level rewards configured. Add one with \`${ctx.prefix}addlevelrole <level> <@role>\`.`,
    });
    return;
  }

  const lines = ['**Level rewards**'];
  for (const r of rewards) {
    lines.push(`Level **${r.level}** → <@&${r.roleId}>`);
  }
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: lines.join('\n'),
  });
};

// `!noxpchannel <#channel>` — toggles a channel in or out of the
// no-XP list.
export const handleNoXpChannel: Handler = async (ctx, svc) => {
  if (!(await requireManageServer(ctx, svc))) return;

  const channelId = parseChannelId(ctx.args[0]);
  if (!channelId) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}noxpchannel <#channel>\` to toggle XP off/on for that channel.`,
    });
    return;
  }

  const settings = await getLevelSettings(ctx.serverId);
  const had = settings.noXpChannelIds.includes(channelId);
  const next = had
    ? settings.noXpChannelIds.filter((id) => id !== channelId)
    : [...settings.noXpChannelIds, channelId];
  await setLevelSettings(ctx.serverId, { noXpChannelIds: next });
  invalidateLevelSettings(ctx.serverId);

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: had
      ? `<#${channelId}> will now grant XP again.`
      : `<#${channelId}> is now a no-XP channel.`,
  });
};
