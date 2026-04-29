import { registry, type Handler } from './index.js';

export const handleHelp: Handler = async (ctx, { api }) => {
  const lines = [`**Panda — commands** (prefix: \`${ctx.prefix}\`)`];
  for (const c of registry) {
    lines.push(`\`${ctx.prefix}${c.name}\` — ${c.help}`);
  }
  await api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: lines.join('\n'),
  });
};
