import { registry, type Handler, type Services } from './index.js';
import type { CommandContext } from '../types.js';
import { CATEGORY_NAMES, commandsInCategory } from './help.js';
import {
  ALL_SCOPE,
  MAX_COMMAND_COOLDOWN_SECONDS,
  categoryScope,
  getCommandRule,
  getCommandRules,
  resetCommandRule,
  setCommandRule,
} from './settings.js';
import { getCommand as getCustomCommand } from '../customCommands/store.js';
import { parseChannelId, parseRoleId } from '../util/parse.js';
import { buildEmbed, field, COLORS } from '../client/embeds.js';
import {
  channelBelongsTo,
  roleBelongsTo,
  resolveChannels,
  resolveRoles,
} from '../client/names.js';

// `!command` — MEE6's per-command permissions from chat. The same rules are
// editable on the dashboard's Commands page.

const MAX_LIST = 25;

interface Target {
  scope: string;
  // How the reply names it: "`!play`", "the music commands", "every command".
  label: string;
}

async function requireManageServer(ctx: CommandContext, svc: Services): Promise<boolean> {
  const ok = await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_SERVER');
  if (!ok) {
    await reply(ctx, svc, 'You need the **Manage Server** permission to change where commands work.');
  }
  return ok;
}

async function reply(ctx: CommandContext, svc: Services, content: string): Promise<void> {
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    replyToId: ctx.messageId,
    content,
  });
}

const USAGE = (p: string): string =>
  `**Command settings** — limit where and by whom commands work
\`${p}command <name>\` — show the rules for a command, a category (\`music\`, \`moderation\`, …) or \`all\`
\`${p}command <name> enable|disable\`
\`${p}command <name> channel allow|ignore|remove <#channel …>\` · \`channel clear\`
\`${p}command <name> role allow|ignore|remove <@role …>\` · \`role clear\`
\`${p}command <name> cooldown <seconds|default|off>\`
\`${p}command <name> delete on|off\` — delete the command message after it runs
\`${p}command <name> reset\`
An empty allow list means anywhere / anyone; the ignore list always wins. Members with **Manage Server** are never held to channel or role rules.`;

async function resolveTarget(ctx: CommandContext, raw: string): Promise<Target | null> {
  const name = raw.toLowerCase();
  if (name === 'all' || name === '*' || name === 'everything') {
    return { scope: ALL_SCOPE, label: 'every command' };
  }
  if (CATEGORY_NAMES.includes(name)) {
    return { scope: categoryScope(name), label: `the **${name}** commands` };
  }
  const builtIn = registry.find((c) => c.name === name || c.aliases.includes(name));
  if (builtIn) {
    if (builtIn.name === 'command') return null;
    return { scope: builtIn.name, label: `\`${ctx.prefix}${builtIn.name}\`` };
  }
  if (/^[a-z0-9_-]{1,32}$/.test(name) && (await getCustomCommand(ctx.serverId, name))) {
    return { scope: name, label: `\`${ctx.prefix}${name}\`` };
  }
  return null;
}

async function describe(ctx: CommandContext, svc: Services, target: Target): Promise<void> {
  const rule = await getCommandRule(ctx.serverId, target.scope);
  const [channels, roles] = await Promise.all([
    resolveChannels(svc.api, ctx.serverId, [...rule.allowedChannelIds, ...rule.ignoredChannelIds]),
    resolveRoles(svc.api, ctx.serverId, [...rule.allowedRoleIds, ...rule.ignoredRoleIds]),
  ]);
  const list = (ids: string[], names: Map<string, string>, empty: string): string =>
    ids.length === 0 ? empty : ids.map((id) => names.get(id) ?? id).join(', ');

  const fields = [
    field('Status', rule.enabled ? 'On' : '**Off**', true),
    field(
      'Cooldown',
      rule.cooldownSeconds === null
        ? 'Default'
        : rule.cooldownSeconds === 0
          ? 'None'
          : `${rule.cooldownSeconds}s per member`,
      true,
    ),
    field('Delete after use', rule.deleteInvocation ? 'Yes' : 'No', true),
    field('Works in', list(rule.allowedChannelIds, channels, 'Any channel')),
    field('Never in', list(rule.ignoredChannelIds, channels, '—')),
    field('Who can use it', list(rule.allowedRoleIds, roles, 'Everyone')),
    field('Blocked roles', list(rule.ignoredRoleIds, roles, '—')),
  ];

  // Say when a broader rule also applies, so "why doesn't this work here?"
  // has an answer on the same card.
  const all = await getCommandRules(ctx.serverId);
  const broader: string[] = [];
  if (target.scope !== ALL_SCOPE && all.has(ALL_SCOPE)) broader.push('`all`');
  if (!target.scope.startsWith('category:') && target.scope !== ALL_SCOPE) {
    for (const cat of CATEGORY_NAMES) {
      if (commandsInCategory(cat).includes(target.scope) && all.has(categoryScope(cat))) {
        broader.push(`\`${cat}\``);
      }
    }
  }

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: '',
    embeds: [
      buildEmbed({
        title: `Command settings — ${target.scope === ALL_SCOPE ? 'all commands' : target.scope.replace('category:', '')}`,
        color: rule.enabled ? COLORS.ONLINE : COLORS.MUTED,
        description:
          broader.length > 0
            ? `Rules for ${broader.join(' and ')} also apply — a command must pass all of them.`
            : undefined,
        fields,
      }),
    ],
  });
}

// Channel/role ids from the arguments, keeping only ones in this server.
async function collectIds(
  ctx: CommandContext,
  svc: Services,
  args: string[],
  kind: 'channel' | 'role',
): Promise<string[]> {
  const out: string[] = [];
  for (const a of args) {
    const id = kind === 'channel' ? parseChannelId(a) : parseRoleId(a);
    if (!id || out.includes(id)) continue;
    const belongs =
      kind === 'channel'
        ? await channelBelongsTo(svc.api, ctx.serverId, id)
        : await roleBelongsTo(svc.api, ctx.serverId, id);
    if (belongs) out.push(id);
  }
  return out;
}

async function editList(
  ctx: CommandContext,
  svc: Services,
  target: Target,
  kind: 'channel' | 'role',
): Promise<void> {
  const op = ctx.args[2]?.toLowerCase();
  const rule = await getCommandRule(ctx.serverId, target.scope);
  const allowKey = kind === 'channel' ? 'allowedChannelIds' : 'allowedRoleIds';
  const ignoreKey = kind === 'channel' ? 'ignoredChannelIds' : 'ignoredRoleIds';
  const noun = kind === 'channel' ? 'channel' : 'role';
  const lists = (allow: string[], ignore: string[]) =>
    kind === 'channel'
      ? { allowedChannelIds: allow, ignoredChannelIds: ignore }
      : { allowedRoleIds: allow, ignoredRoleIds: ignore };

  if (op === 'clear') {
    await setCommandRule(ctx.serverId, target.scope, lists([], []));
    await reply(ctx, svc, `✅ ${target.label}: no ${noun} rules now.`);
    return;
  }
  if (op !== 'allow' && op !== 'ignore' && op !== 'remove') {
    await reply(ctx, svc, `Usage: \`${ctx.prefix}command ${ctx.args[0]} ${kind} allow|ignore|remove|clear …\``);
    return;
  }

  const ids = await collectIds(ctx, svc, ctx.args.slice(3), kind);
  if (ids.length === 0) {
    await reply(ctx, svc, `Mention at least one ${noun} from this server.`);
    return;
  }

  let allowed = rule[allowKey].filter((id) => !ids.includes(id));
  let ignored = rule[ignoreKey].filter((id) => !ids.includes(id));
  if (op === 'allow') allowed = [...allowed, ...ids];
  if (op === 'ignore') ignored = [...ignored, ...ids];
  if (allowed.length > MAX_LIST || ignored.length > MAX_LIST) {
    await reply(ctx, svc, `That's more than ${MAX_LIST} ${noun}s in one list — trim it first.`);
    return;
  }

  await setCommandRule(ctx.serverId, target.scope, lists(allowed, ignored));
  const mention = (id: string): string => (kind === 'channel' ? `<#${id}>` : `<@&${id}>`);
  const what = ids.map(mention).join(', ');
  const verb =
    op === 'allow'
      ? kind === 'channel'
        ? `now works in ${what}${allowed.length > ids.length ? ' (as well as the others)' : ' only'}`
        : `can now be used by ${what}`
      : op === 'ignore'
        ? kind === 'channel'
          ? `won't respond in ${what}`
          : `can't be used by ${what}`
        : `no longer has a rule for ${what}`;
  await reply(ctx, svc, `✅ ${target.label} ${verb}.`);
}

export const handleCommandSettings: Handler = async (ctx, svc) => {
  const rawTarget = ctx.args[0];
  if (!rawTarget || rawTarget.toLowerCase() === 'help') {
    await reply(ctx, svc, USAGE(ctx.prefix));
    return;
  }

  const target = await resolveTarget(ctx, rawTarget);
  if (!target) {
    await reply(
      ctx,
      svc,
      `No command or category called \`${rawTarget}\`. Categories: ${CATEGORY_NAMES.map((c) => `\`${c}\``).join(', ')}, or \`all\`.`,
    );
    return;
  }

  const sub = ctx.args[1]?.toLowerCase();
  if (!sub || sub === 'show' || sub === 'status') {
    await describe(ctx, svc, target);
    return;
  }

  if (!(await requireManageServer(ctx, svc))) return;

  if (sub === 'enable' || sub === 'on' || sub === 'disable' || sub === 'off') {
    const enabled = sub === 'enable' || sub === 'on';
    await setCommandRule(ctx.serverId, target.scope, { enabled });
    const note =
      !enabled && target.scope === ALL_SCOPE
        ? ` \`${ctx.prefix}command\` itself keeps working, so you can turn things back on.`
        : '';
    await reply(ctx, svc, `✅ ${target.label} ${enabled ? 'turned on' : 'turned off'}.${note}`);
    return;
  }

  if (sub === 'channel' || sub === 'channels') {
    await editList(ctx, svc, target, 'channel');
    return;
  }
  if (sub === 'role' || sub === 'roles') {
    await editList(ctx, svc, target, 'role');
    return;
  }

  if (sub === 'cooldown') {
    const arg = ctx.args[2]?.toLowerCase();
    let cooldownSeconds: number | null;
    if (arg === 'default' || arg === 'reset') cooldownSeconds = null;
    else if (arg === 'off' || arg === 'none') cooldownSeconds = 0;
    else {
      const n = Number.parseInt(arg ?? '', 10);
      if (!Number.isFinite(n) || n < 0 || n > MAX_COMMAND_COOLDOWN_SECONDS) {
        await reply(
          ctx,
          svc,
          `Usage: \`${ctx.prefix}command ${ctx.args[0]} cooldown <0-${MAX_COMMAND_COOLDOWN_SECONDS}|default|off>\` (seconds, per member).`,
        );
        return;
      }
      cooldownSeconds = n;
    }
    await setCommandRule(ctx.serverId, target.scope, { cooldownSeconds });
    await reply(
      ctx,
      svc,
      `✅ ${target.label}: ${
        cooldownSeconds === null
          ? 'default cooldown'
          : cooldownSeconds === 0
            ? 'no cooldown'
            : `${cooldownSeconds}s cooldown per member`
      }.`,
    );
    return;
  }

  if (sub === 'delete') {
    const arg = ctx.args[2]?.toLowerCase();
    if (arg !== 'on' && arg !== 'off') {
      await reply(ctx, svc, `Usage: \`${ctx.prefix}command ${ctx.args[0]} delete on|off\`.`);
      return;
    }
    await setCommandRule(ctx.serverId, target.scope, { deleteInvocation: arg === 'on' });
    await reply(
      ctx,
      svc,
      arg === 'on'
        ? `✅ ${target.label}: I'll delete the command message after it runs (needs **Manage Messages**).`
        : `✅ ${target.label}: command messages stay.`,
    );
    return;
  }

  if (sub === 'reset' || sub === 'clear') {
    await resetCommandRule(ctx.serverId, target.scope);
    await reply(ctx, svc, `✅ ${target.label}: back to defaults — on, anywhere, anyone.`);
    return;
  }

  await reply(ctx, svc, USAGE(ctx.prefix));
};
