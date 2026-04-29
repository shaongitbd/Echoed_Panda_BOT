// Music commands.
//
// Permission model:
//   - !play / !queue / !nowplaying / !search — anyone with CONNECT in
//     the voice channel can use them.
//   - !skip / !stop / !pause / !resume / !volume / !loop / !seek /
//     !shuffle / !remove — DJ powers. By default, MANAGE_SERVER. If the
//     server has configured a "DJ role" via !djrole, members holding
//     that role also pass. The user who queued the currently playing
//     track can always !skip their own track.
//
// The bot first establishes a voice session (joinVoiceChannel) on the
// first !play that targets a channel the requester is in. The bot
// won't follow the user; voice commands resolve the requester's current
// voice channel via Echoed's voice-state subscription. Until that
// subscription lands, callers can pass a channel explicitly:
//   !play <#voice-channel> <query>
//
// For v1 we require an explicit channel mention on the first !play in a
// session to avoid a backend round-trip; subsequent commands inherit
// the bot's current channel.

import type { Handler, Services } from './index.js';
import type { CommandContext } from '../types.js';
import { resolveQuery, type Track } from '../voice/source.js';
import { buildEmbed, COLORS } from '../client/embeds.js';
import { getGuildConfig, setGuildConfig } from '../db/guildConfig.js';
import { log } from '../log.js';

const CHANNEL_MENTION_RE = /^<#(?<id>[a-zA-Z0-9_-]+)>$/;
const PAGE_SIZE = 10;

function parseChannelId(arg: string | undefined): string | null {
  if (!arg) return null;
  const m = CHANNEL_MENTION_RE.exec(arg);
  if (m?.groups?.id) return m.groups.id;
  return null;
}

function formatTime(seconds: number): string {
  if (seconds <= 0 || !Number.isFinite(seconds)) return 'live';
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function progressBar(positionMs: number, durationSeconds: number): string {
  if (durationSeconds <= 0) return '';
  const filled = Math.min(20, Math.max(0, Math.floor((positionMs / 1000 / durationSeconds) * 20)));
  return '▰'.repeat(filled) + '▱'.repeat(20 - filled);
}

// DJ check: MANAGE_SERVER OR holding the configured DJ role. The role
// check is a single Echoed API call cached behind PermissionService's
// own cache (we re-issue per-command for simplicity; the perm path is
// cheap enough). Admins always pass — they hold MANAGE_SERVER.
async function requireDj(ctx: CommandContext, svc: Services): Promise<boolean> {
  if (await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_SERVER')) return true;

  const config = await getGuildConfig(ctx.serverId);
  if (config.djRoleId) {
    try {
      const res = await svc.api.getMemberRoles(ctx.serverId, ctx.senderId);
      if (res.roles.includes(config.djRoleId)) return true;
    } catch (err) {
      log.warn({ err, userId: ctx.senderId }, 'DJ-role lookup failed — falling through to deny');
    }
  }

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    replyToId: ctx.messageId,
    content: config.djRoleId
      ? `You need the **DJ** role (<@&${config.djRoleId}>) or **Manage Server** for this.`
      : 'You need the **Manage Server** permission for this. (Or to be the user who queued the current track for `skip`.)',
  });
  return false;
}

// ─── !play ────────────────────────────────────────────────────────────

export const handlePlay: Handler = async (ctx, svc) => {
  // Two forms:
  //   !play <#voice-channel> <query>     — first call (or to switch channel)
  //   !play <query>                       — bot must already be in a channel
  let channelId: string | null = null;
  let queryStartIdx = 0;
  const channelArg = parseChannelId(ctx.args[0]);
  if (channelArg) {
    channelId = channelArg;
    queryStartIdx = 1;
  } else {
    const session = svc.voice.get(ctx.serverId);
    if (session) {
      channelId = session.channelId;
    }
  }

  if (!channelId) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}play <#voice-channel> <url-or-search>\` for the first track. Once I'm connected, just \`${ctx.prefix}play <query>\`.`,
    });
    return;
  }

  const query = ctx.rawContent
    .trim()
    .slice(ctx.prefix.length)
    .split(/\s+/)
    .slice(1 + queryStartIdx)
    .join(' ')
    .trim();

  if (!query) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}play <url-or-search>\`.`,
    });
    return;
  }

  // Caller needs CONNECT in the target channel — sanity check before
  // we go through the join dance.
  const canConnect = await svc.perms.hasIn(ctx.serverId, channelId, ctx.senderId, 'CONNECT');
  if (!canConnect) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `You don't have permission to connect to <#${channelId}>.`,
    });
    return;
  }

  let tracks: Track[];
  try {
    tracks = await resolveQuery(query, ctx.senderId, ctx.senderName);
  } catch (err) {
    log.warn({ err, query }, 'Source resolution failed');
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: '❌ Couldn\'t resolve that. Try a YouTube URL or a different search.',
    });
    return;
  }
  if (tracks.length === 0) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'No matches.',
    });
    return;
  }

  // For search results we just take the top match. (`!search` provides
  // a picker UX.)
  const track = tracks[0];
  if (!track) return;

  let session = svc.voice.get(ctx.serverId);
  try {
    session = await svc.voice.join(ctx.serverId, channelId, ctx.channelId);
  } catch (err) {
    log.warn({ err, channelId }, 'Voice join failed');
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: '❌ Couldn\'t join the voice channel. Make sure I have **Connect** + **Speak** there.',
    });
    return;
  }

  const position = session.player.enqueue(track);
  const wasIdle = !session.player.nowPlaying();
  // Kick off the run loop if it's not already going.
  void session.player.run();

  // If the queue was empty, the live "Now playing" card will fire from
  // the trackStart hook — no need for a static embed. Just acknowledge
  // the queue add when there's already a track playing.
  if (!wasIdle) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: '',
      embeds: [
        buildEmbed({
          title: `+ Queued (#${position})`,
          description: `**${track.title}**\n${track.uploader ? `by ${track.uploader} · ` : ''}${formatTime(track.durationSeconds)}`,
          color: COLORS.ACCENT,
          thumbnail: track.thumbnailUrl,
          footer: `Requested by ${ctx.senderName}`,
        }),
      ],
    });
  }
};

// ─── !skip ────────────────────────────────────────────────────────────

export const handleSkip: Handler = async (ctx, svc) => {
  const session = svc.voice.get(ctx.serverId);
  const np = session?.player.nowPlaying();
  if (!session || !np) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: 'Nothing playing.',
    });
    return;
  }

  // The user who queued the track can always skip their own.
  const ownsTrack = np.track.requestedBy === ctx.senderId;
  if (!ownsTrack && !(await requireDj(ctx, svc))) return;

  session.player.skip();
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: `⏭ Skipped **${np.track.title}**.`,
  });
};

// ─── !stop ────────────────────────────────────────────────────────────

export const handleStop: Handler = async (ctx, svc) => {
  if (!(await requireDj(ctx, svc))) return;
  const session = svc.voice.get(ctx.serverId);
  if (!session) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: 'Not in voice.',
    });
    return;
  }
  await svc.voice.leave(ctx.serverId);
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: '⏹ Stopped and left the voice channel.',
  });
};

// ─── !pause / !resume ────────────────────────────────────────────────

export const handlePause: Handler = async (ctx, svc) => {
  if (!(await requireDj(ctx, svc))) return;
  const session = svc.voice.get(ctx.serverId);
  if (!session?.player.pause()) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: 'Nothing to pause.',
    });
    return;
  }
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: '⏸ Paused.',
  });
};

export const handleResume: Handler = async (ctx, svc) => {
  if (!(await requireDj(ctx, svc))) return;
  const session = svc.voice.get(ctx.serverId);
  if (!session?.player.resume()) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: 'Nothing is paused.',
    });
    return;
  }
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: '▶ Resumed.',
  });
};

// ─── !queue ──────────────────────────────────────────────────────────

export const handleQueue: Handler = async (ctx, svc) => {
  const session = svc.voice.get(ctx.serverId);
  if (!session) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: 'Queue is empty (and I\'m not in voice).',
    });
    return;
  }

  const np = session.player.nowPlaying();
  const queue = session.player.list();
  const page = Math.max(1, ctx.args[0] ? parseInt(ctx.args[0], 10) || 1 : 1);
  const totalPages = Math.max(1, Math.ceil(queue.length / PAGE_SIZE));
  const slice = queue.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  let description = '';
  if (np) {
    description += `**Now playing** — ${np.track.title}\n${progressBar(np.positionMs, np.track.durationSeconds)} ${formatTime(np.positionMs / 1000)} / ${formatTime(np.track.durationSeconds)}\n\n`;
  }
  if (slice.length === 0) {
    description += '_Queue is empty._';
  } else {
    description += slice
      .map(
        (t, i) =>
          `\`${(page - 1) * PAGE_SIZE + i + 1}.\` **${t.title}** — ${formatTime(t.durationSeconds)} · _${t.requestedByName}_`,
      )
      .join('\n');
  }

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: '',
    embeds: [
      buildEmbed({
        title: '🎵 Queue',
        description,
        color: COLORS.ACCENT,
        footer: `Page ${page}/${totalPages} · ${queue.length} queued · loop: ${session.player.getLoop()} · vol: ${Math.round(session.player.getVolume() * 100)}%`,
      }),
    ],
  });
};

// ─── !nowplaying ─────────────────────────────────────────────────────

export const handleNowPlaying: Handler = async (ctx, svc) => {
  const session = svc.voice.get(ctx.serverId);
  const np = session?.player.nowPlaying();
  if (!session || !np) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: 'Nothing playing.',
    });
    return;
  }

  const description =
    `**${np.track.title}**\n` +
    (np.track.uploader ? `by ${np.track.uploader}\n` : '') +
    `\n${progressBar(np.positionMs, np.track.durationSeconds)}\n` +
    `${formatTime(np.positionMs / 1000)} / ${formatTime(np.track.durationSeconds)}` +
    (session.player.isPaused() ? ' · ⏸ paused' : '');

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: '',
    embeds: [
      buildEmbed({
        title: '🎵 Now playing',
        description,
        color: COLORS.ACCENT,
        thumbnail: np.track.thumbnailUrl,
        footer: `Requested by ${np.track.requestedByName}`,
      }),
    ],
  });
};

// ─── !volume ─────────────────────────────────────────────────────────

export const handleVolume: Handler = async (ctx, svc) => {
  const session = svc.voice.get(ctx.serverId);
  if (!session) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: 'Not in voice.',
    });
    return;
  }
  const arg = ctx.args[0];
  if (!arg) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: `Volume is **${Math.round(session.player.getVolume() * 100)}%**. Set with \`${ctx.prefix}volume <0-150>\`.`,
    });
    return;
  }
  if (!(await requireDj(ctx, svc))) return;
  const v = parseInt(arg, 10);
  if (!Number.isFinite(v) || v < 0 || v > 150) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'Volume must be between 0 and 150.',
    });
    return;
  }
  session.player.setVolume(v / 100);
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: `🔊 Volume: **${v}%**.`,
  });
};

// ─── !loop ───────────────────────────────────────────────────────────

export const handleLoop: Handler = async (ctx, svc) => {
  if (!(await requireDj(ctx, svc))) return;
  const session = svc.voice.get(ctx.serverId);
  if (!session) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: 'Not in voice.',
    });
    return;
  }
  const mode = (ctx.args[0] ?? '').toLowerCase();
  if (mode !== 'off' && mode !== 'track' && mode !== 'queue') {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}loop <off|track|queue>\`. Currently: **${session.player.getLoop()}**.`,
    });
    return;
  }
  session.player.setLoop(mode);
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: `🔁 Loop: **${mode}**.`,
  });
};

// ─── !shuffle ────────────────────────────────────────────────────────

export const handleShuffle: Handler = async (ctx, svc) => {
  if (!(await requireDj(ctx, svc))) return;
  const session = svc.voice.get(ctx.serverId);
  if (!session) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: 'Not in voice.',
    });
    return;
  }
  session.player.shuffleQueue();
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: '🔀 Queue shuffled.',
  });
};

// ─── !remove ─────────────────────────────────────────────────────────

export const handleRemove: Handler = async (ctx, svc) => {
  const session = svc.voice.get(ctx.serverId);
  if (!session) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: 'Not in voice.',
    });
    return;
  }
  const idx = (parseInt(ctx.args[0] ?? '', 10) || 0) - 1;
  const target = session.player.list()[idx];
  if (!target) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Usage: \`${ctx.prefix}remove <queue-position>\`. See \`${ctx.prefix}queue\`.`,
    });
    return;
  }
  // Owner of the track can always remove; otherwise DJ.
  if (target.requestedBy !== ctx.senderId && !(await requireDj(ctx, svc))) return;
  session.player.removeAt(idx);
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: `🗑 Removed **${target.title}** from the queue.`,
  });
};

// ─── !djrole ─────────────────────────────────────────────────────────

const ROLE_MENTION_RE = /^<@&(?<id>[a-zA-Z0-9_-]+)>$/;
const BARE_ID_RE = /^[a-zA-Z0-9_-]{8,}$/;

function parseRoleId(arg: string | undefined): string | null {
  if (!arg) return null;
  const m = ROLE_MENTION_RE.exec(arg);
  if (m?.groups?.id) return m.groups.id;
  if (BARE_ID_RE.test(arg)) return arg;
  return null;
}

export const handleDjRole: Handler = async (ctx, svc) => {
  // Always require MANAGE_SERVER to manage the DJ role itself — the
  // DJ role can't be self-set by anyone holding it.
  const ok = await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_SERVER');
  if (!ok) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'You need the **Manage Server** permission to configure the DJ role.',
    });
    return;
  }

  const arg = ctx.args[0]?.toLowerCase();
  if (!arg) {
    const cfg = await getGuildConfig(ctx.serverId);
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: cfg.djRoleId
        ? `Current DJ role: <@&${cfg.djRoleId}>. Clear with \`${ctx.prefix}djrole none\`.`
        : `No DJ role set. Members need **Manage Server** for music controls. Set with \`${ctx.prefix}djrole <@role>\`.`,
    });
    return;
  }

  if (arg === 'none' || arg === 'clear' || arg === 'off') {
    await setGuildConfig(ctx.serverId, { djRoleId: null });
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      content: 'DJ role cleared. Music controls now require **Manage Server**.',
    });
    return;
  }

  const roleId = parseRoleId(ctx.args[0]);
  if (!roleId) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Couldn't parse \`${ctx.args[0]}\` as a role. Use a mention like \`<@&role-id>\` or the raw ID.`,
    });
    return;
  }

  await setGuildConfig(ctx.serverId, { djRoleId: roleId });
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: `DJ role set to <@&${roleId}>. Members with this role can now control music without **Manage Server**.`,
  });
};

// ─── !clearqueue ─────────────────────────────────────────────────────

export const handleClearQueue: Handler = async (ctx, svc) => {
  if (!(await requireDj(ctx, svc))) return;
  const session = svc.voice.get(ctx.serverId);
  if (!session) return;
  session.player.clearQueue();
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: '🧹 Queue cleared.',
  });
};
