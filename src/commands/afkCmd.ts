import type { Handler } from './index.js';
import { setAfk } from '../afk/store.js';

const MAX_REASON = 200;

export const handleAfk: Handler = async (ctx, { api }) => {
  // Take everything after the command name as the reason. We use the
  // raw content (not args.join) so emoji + punctuation arrive intact.
  const reason = ctx.rawContent
    .trim()
    .slice(ctx.prefix.length)
    .split(/\s+/)
    .slice(1)
    .join(' ')
    .slice(0, MAX_REASON);

  await setAfk(ctx.serverId, ctx.senderId, reason || null);

  const suffix = reason ? `: ${reason}` : '.';
  await api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: `<@${ctx.senderId}> is now AFK${suffix}`,
  });
};
