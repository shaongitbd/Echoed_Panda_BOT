import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import { runEngagementSetup } from '../engagement/autoSetup.js';
import { buildEmbed, COLORS } from '../client/embeds.js';

async function requireManageServer(ctx: CommandContext, svc: Services): Promise<boolean> {
  const ok = await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_SERVER');
  if (!ok) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'You need the **Manage Server** permission to run setup.',
    });
  }
  return ok;
}

const USAGE = (p: string): string =>
  `**Panda setup** — turn on the whole engagement stack in one go.
\`${p}setup\` — set up everything that isn't already configured (non-destructive)
\`${p}setup override\` — RESET everything to recommended defaults (replaces your existing level rewards + feature settings)
Sets up: levels + reward roles, QOTD, birthdays, starboard, counting, daily check-in.`;

export const handleSetup: Handler = async (ctx, svc) => {
  if (!(await requireManageServer(ctx, svc))) return;

  const sub = ctx.args[0]?.toLowerCase();
  const RUN = new Set(['', 'run', 'go', 'start', 'all', 'auto']);
  const OVERRIDE = new Set(['override', 'force', 'reset', 'replace']);
  const isOverride = sub != null && OVERRIDE.has(sub);
  if (sub != null && !RUN.has(sub) && !isOverride) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: USAGE(ctx.prefix),
    });
    return;
  }

  const lines = await runEngagementSetup(svc.api, ctx.serverId, {
    override: isOverride,
    prefix: ctx.prefix,
    actorId: svc.botUserId,
  });

  const title = isOverride ? '♻️ Setup complete — reset to defaults' : '🎉 Setup complete';
  const footer = isOverride
    ? 'Everything reset to recommended defaults. Times are UTC — tweak per feature, e.g. !qotd time 18:00.'
    : 'Tweak anything per feature (e.g. !qotd time 18:00, !starboard threshold 5). Times are UTC.';

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: '',
    embeds: [buildEmbed({ title, description: lines.join('\n'), color: COLORS.ACCENT, footer })],
  });
};
