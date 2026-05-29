import type { Handler } from './index.js';
import { buildPermissionReport } from '../welcome/onBotJoin.js';

/**
 * `!checkperms` — on-demand version of the permission checklist Panda auto-posts
 * when it's (re-)invited. Lets a server admin re-run the audit any time without
 * removing + re-adding the bot — useful after they tweak a role and want to
 * confirm what Panda can now do.
 *
 * Gated on Manage Server: it reports the *bot's* capabilities, but it's an admin
 * diagnostic, so we don't want any member spamming it. Reuses the exact same
 * buildPermissionReport the invite flow uses — one source of truth.
 */
export const handleCheckPerms: Handler = async (ctx, svc) => {
  const allowed = await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_SERVER');
  if (!allowed) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'You need the **Manage Server** permission to run a permission check.',
    });
    return;
  }

  const report = await buildPermissionReport(svc.perms, svc.botUserId, ctx.serverId);
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: report,
  });
};
