import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import {
  ALL_FILTERS,
  type FilterKind,
  getAutomodConfig,
  setAutomodConfig,
} from '../automod/config.js';
import { buildEmbed, field, COLORS } from '../client/embeds.js';

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
      content: 'You need the **Manage Server** permission to change auto-mod.',
    });
  }
  return ok;
}

// Map a user-facing filter name to the canonical kind. Accept several
// aliases so people can type what feels natural.
const FILTER_ALIASES: Record<string, FilterKind> = {
  spam: 'spam',
  badwords: 'bad_words',
  bad_words: 'bad_words',
  bad: 'bad_words',
  caps: 'caps',
  uppercase: 'caps',
  mentions: 'mentions',
  pings: 'mentions',
  mention: 'mentions',
  emoji: 'emoji',
  emojis: 'emoji',
  zalgo: 'zalgo',
  links: 'links',
  link: 'links',
  invites: 'invites',
  invite: 'invites',
};

function parseFilterKind(arg: string | undefined): FilterKind | null {
  if (!arg) return null;
  return FILTER_ALIASES[arg.toLowerCase()] ?? null;
}

function on(b: boolean): string {
  return b ? '🟢 on' : '⚪ off';
}

const FILTER_ENABLED_KEY: Record<FilterKind, keyof Awaited<ReturnType<typeof getAutomodConfig>>> = {
  spam: 'spamEnabled',
  bad_words: 'badWordsEnabled',
  caps: 'capsEnabled',
  mentions: 'mentionsEnabled',
  emoji: 'emojiEnabled',
  zalgo: 'zalgoEnabled',
  links: 'linksEnabled',
  invites: 'invitesEnabled',
};

const FILTER_LABEL: Record<FilterKind, string> = {
  spam: 'Spam (rate)',
  bad_words: 'Bad words',
  caps: 'Excessive caps',
  mentions: 'Mass mentions',
  emoji: 'Emoji spam',
  zalgo: 'Zalgo',
  links: 'External links',
  invites: 'Invite links',
};

// ─── !automod ───────────────────────────────────────────────────────────
//
// Subcommands:
//   (none)         — show status
//   on / off       — master toggle
//   filter <name> on/off
//   exempt channel <#c>   — toggle channel in/out of bypass list
//   exempt role <@r>      — toggle role in/out of bypass list
//                           (currently ignored by pipeline — see TODO)

export const handleAutomod: Handler = async (ctx, svc) => {
  if (!(await requireManageServer(ctx, svc))) return;

  const sub = ctx.args[0]?.toLowerCase();

  if (!sub) {
    const cfg = await getAutomodConfig(ctx.serverId);

    // Filter status as a 2-column field block. Each filter is its own
    // inline field — clients render up to 3 inline fields per row,
    // so 8 filters span 3 rows. Cleaner than a single multi-line
    // description because users can scan at a glance.
    const filterFields = ALL_FILTERS.map((k) =>
      field(FILTER_LABEL[k], on(Boolean(cfg[FILTER_ENABLED_KEY[k]])), true),
    );

    // Exempts + bad-words list go in the description so they wrap
    // naturally if any of them is long.
    const descLines: string[] = [];
    if (cfg.exemptChannelIds.length > 0) {
      descLines.push(
        `**Exempt channels** · ${cfg.exemptChannelIds.map((id) => `<#${id}>`).join(' ')}`,
      );
    }
    if (cfg.exemptRoleIds.length > 0) {
      descLines.push(
        `**Exempt roles** · ${cfg.exemptRoleIds.map((id) => `<@&${id}>`).join(' ')}`,
      );
    }
    if (cfg.badWords.length > 0) {
      descLines.push(
        `**Bad-words list** · ${cfg.badWords.length} word${cfg.badWords.length === 1 ? '' : 's'}`,
      );
    }

    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: '',
      embeds: [
        buildEmbed({
          title: `Auto-mod — master ${on(cfg.enabled)}`,
          description: descLines.length > 0 ? descLines.join('\n') : undefined,
          color: cfg.enabled ? COLORS.ONLINE : COLORS.MUTED,
          fields: filterFields,
          footer: cfg.enabled
            ? 'Toggle filters with `automod filter <name> on|off`'
            : 'Master switch is off — every filter is bypassed',
        }),
      ],
    });
    return;
  }

  if (sub === 'on' || sub === 'enable') {
    await setAutomodConfig(ctx.serverId, { enabled: true });
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: '✅ Auto-mod **on**. Toggle filters individually with `automod filter <name> on`.',
    });
    return;
  }
  if (sub === 'off' || sub === 'disable') {
    await setAutomodConfig(ctx.serverId, { enabled: false });
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: '✅ Auto-mod **off**.',
    });
    return;
  }

  if (sub === 'filter') {
    const filterArg = ctx.args[1];
    const stateArg = ctx.args[2]?.toLowerCase();
    const kind = parseFilterKind(filterArg);
    if (!kind || (stateArg !== 'on' && stateArg !== 'off')) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: `Usage: \`${ctx.prefix}automod filter <spam|badwords|caps|mentions|emoji|zalgo|links|invites> <on|off>\`.`,
      });
      return;
    }
    const enabled = stateArg === 'on';
    await setAutomodConfig(ctx.serverId, { [FILTER_ENABLED_KEY[kind]]: enabled });
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: `${FILTER_LABEL[kind]} filter: ${on(enabled)}`,
    });
    return;
  }

  if (sub === 'exempt') {
    const target = ctx.args[1]?.toLowerCase();
    const idArg = ctx.args[2];

    if (target === 'channel') {
      const channelId = parseChannelId(idArg);
      if (!channelId) {
        await svc.api.sendMessage({
          serverId: ctx.serverId,
          channelId: ctx.channelId,
          replyToId: ctx.messageId,
          content: `Usage: \`${ctx.prefix}automod exempt channel #channel\`.`,
        });
        return;
      }
      const cfg = await getAutomodConfig(ctx.serverId);
      const had = cfg.exemptChannelIds.includes(channelId);
      const next = had
        ? cfg.exemptChannelIds.filter((id) => id !== channelId)
        : [...cfg.exemptChannelIds, channelId];
      await setAutomodConfig(ctx.serverId, { exemptChannelIds: next });
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        content: had
          ? `<#${channelId}> is no longer exempt from auto-mod.`
          : `<#${channelId}> is now exempt from auto-mod.`,
      });
      return;
    }

    if (target === 'role') {
      const roleId = parseRoleId(idArg);
      if (!roleId) {
        await svc.api.sendMessage({
          serverId: ctx.serverId,
          channelId: ctx.channelId,
          replyToId: ctx.messageId,
          content: `Usage: \`${ctx.prefix}automod exempt role <@role>\`.`,
        });
        return;
      }
      const cfg = await getAutomodConfig(ctx.serverId);
      const had = cfg.exemptRoleIds.includes(roleId);
      const next = had
        ? cfg.exemptRoleIds.filter((id) => id !== roleId)
        : [...cfg.exemptRoleIds, roleId];
      await setAutomodConfig(ctx.serverId, { exemptRoleIds: next });
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        content: had
          ? `<@&${roleId}> is no longer exempt from auto-mod.\n_(Note: role-exempt isn't enforced yet — channel-exempt and master-disable both work.)_`
          : `<@&${roleId}> is now exempt from auto-mod.\n_(Note: role-exempt isn't enforced yet — channel-exempt and master-disable both work.)_`,
      });
      return;
    }

    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}automod exempt <channel|role> #channel|@role\`.`,
    });
    return;
  }

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    replyToId: ctx.messageId,
    content: `Unknown subcommand. Try: \`${ctx.prefix}automod\` (status), \`on\`, \`off\`, \`filter <name> on|off\`, or \`exempt <channel|role> <id>\`.`,
  });
};

// ─── !badword add/remove/list ───────────────────────────────────────────

export const handleBadWord: Handler = async (ctx, svc) => {
  if (!(await requireManageServer(ctx, svc))) return;

  const sub = ctx.args[0]?.toLowerCase();
  const cfg = await getAutomodConfig(ctx.serverId);

  if (!sub || sub === 'list') {
    if (cfg.badWords.length === 0) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        content: `No bad words configured. Add one with \`${ctx.prefix}badword add <word>\`.`,
      });
      return;
    }
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: '',
      embeds: [
        buildEmbed({
          title: 'Bad-words list',
          description: cfg.badWords.map((w) => `\`${w}\``).join(' '),
          color: COLORS.WARNING,
          footer: `${cfg.badWords.length} word${cfg.badWords.length === 1 ? '' : 's'}`,
        }),
      ],
    });
    return;
  }

  const word = ctx.args[1]?.toLowerCase();
  if ((sub !== 'add' && sub !== 'remove') || !word) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}badword add <word>\` / \`remove <word>\` / \`list\`.`,
    });
    return;
  }

  const set = new Set(cfg.badWords.map((w) => w.toLowerCase()));
  const had = set.has(word);

  if (sub === 'add') {
    if (had) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        content: `\`${word}\` is already on the list.`,
      });
      return;
    }
    set.add(word);
  } else {
    if (!had) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        content: `\`${word}\` isn't on the list.`,
      });
      return;
    }
    set.delete(word);
  }

  await setAutomodConfig(ctx.serverId, { badWords: Array.from(set) });
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: sub === 'add' ? `Added \`${word}\` to the bad-words list.` : `Removed \`${word}\`.`,
  });
};
