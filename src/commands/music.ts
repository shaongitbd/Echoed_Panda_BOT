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

// musicScopeOk applies the channel + role allow/ignore lists from
// guild_config. Returns true if the command may proceed; false if the
// caller should bail (in which case we've already emitted a short
// reason message). MANAGE_SERVER bypasses everything — the same
// admins who configure the lists shouldn't lock themselves out.
//
// Semantics:
//   - allow list empty → no restriction on that axis.
//   - allow list non-empty + match → ok (so far).
//   - allow list non-empty + no match → reject.
//   - ignore list match → reject regardless of allow list.
async function musicScopeOk(ctx: CommandContext, svc: Services): Promise<boolean> {
  // Admin bypass. Avoids a deadlock-shaped UX where someone shape-shifts
  // the lists incorrectly and locks the music feature out of every
  // channel; staff can still set things back via !djrole / dashboard.
  if (await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_SERVER')) return true;

  const config = await getGuildConfig(ctx.serverId);

  // Channel scope
  if (config.musicExemptChannelIds.includes(ctx.channelId)) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: '🚫 Music commands are disabled in this channel.',
    });
    return false;
  }
  if (
    config.musicAllowedChannelIds.length > 0 &&
    !config.musicAllowedChannelIds.includes(ctx.channelId)
  ) {
    const list = config.musicAllowedChannelIds.map((id) => `<#${id}>`).join(' · ');
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `🎶 Music commands only work in: ${list}`,
    });
    return false;
  }

  // Role scope. Only fetch member roles when there's a list to check
  // against — the API call is cheap but skipping it keeps the
  // unconfigured-server fast path fast.
  const hasRoleScope =
    config.musicAllowedRoleIds.length > 0 || config.musicExemptRoleIds.length > 0;
  if (hasRoleScope) {
    let memberRoles: string[] = [];
    try {
      const res = await svc.api.getMemberRoles(ctx.serverId, ctx.senderId);
      memberRoles = res.roles;
    } catch (err) {
      log.warn({ err, userId: ctx.senderId }, 'Music role-scope lookup failed — denying');
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: 'Couldn\'t verify your roles right now. Try again in a moment.',
      });
      return false;
    }

    const exempt = config.musicExemptRoleIds.find((r) => memberRoles.includes(r));
    if (exempt) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: '🚫 Your role is blocked from using music commands.',
      });
      return false;
    }
    if (
      config.musicAllowedRoleIds.length > 0 &&
      !config.musicAllowedRoleIds.some((r) => memberRoles.includes(r))
    ) {
      const list = config.musicAllowedRoleIds.map((id) => `<@&${id}>`).join(' · ');
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: `🎶 Music commands require one of these roles: ${list}`,
      });
      return false;
    }
  }

  return true;
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

// Resolve the voice channel the bot should play in. Resolution order:
//   1. Explicit <#voice-channel> mention as the first arg.
//   2. Bot's existing voice session for this server, if any.
//   3. The caller's current voice channel (queried via the bot API).
// Returns { channelId, queryStartIdx } so callers can adjust how they
// slice the rest of the message. queryStartIdx is 1 only when the user
// passed an explicit channel mention.
async function resolveVoiceChannel(
  ctx: CommandContext,
  svc: Services,
): Promise<{ channelId: string | null; queryStartIdx: number }> {
  const explicit = parseChannelId(ctx.args[0]);
  if (explicit) {
    return { channelId: explicit, queryStartIdx: 1 };
  }
  const session = svc.voice.get(ctx.serverId);
  if (session) {
    return { channelId: session.channelId, queryStartIdx: 0 };
  }
  // Auto-resolve from the caller's voice state. Cheap (one lookup
  // against active_calls_by_user) and only fires when the bot isn't
  // already in voice.
  try {
    const resolved = await svc.api.getMemberVoiceChannel(ctx.serverId, ctx.senderId);
    if (resolved) {
      return { channelId: resolved, queryStartIdx: 0 };
    }
  } catch (err) {
    log.warn({ err, userId: ctx.senderId }, 'Voice-state lookup failed');
  }
  return { channelId: null, queryStartIdx: 0 };
}

// ─── !play ────────────────────────────────────────────────────────────

export const handlePlay: Handler = async (ctx, svc) => {
  if (!(await musicScopeOk(ctx, svc))) return;
  // Three forms accepted:
  //   !play <#voice-channel> <query>   — explicit channel
  //   !play <query>                    — bot follows the caller, OR
  //                                      uses its current channel if connected
  const { channelId, queryStartIdx } = await resolveVoiceChannel(ctx, svc);

  if (!channelId) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Join a voice channel first, or pick one explicitly with \`${ctx.prefix}play <voice-channel> <url-or-search>\`.`,
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

  // Run yt-dlp resolution + LiveKit join in parallel — they're
  // independent and each costs 1-3s, so overlapping them shaves the
  // slower one off the user-perceived startup time.
  const tracksP = resolveQuery(query, ctx.senderId, ctx.senderName);
  const existing = svc.voice.get(ctx.serverId);
  const sessionP = existing
    ? Promise.resolve(existing)
    : svc.voice.join(ctx.serverId, channelId, ctx.channelId);

  let tracks: Track[];
  let session: Awaited<typeof sessionP>;
  try {
    [tracks, session] = await Promise.all([tracksP, sessionP]);
  } catch (err) {
    log.warn({ err, query, channelId }, 'Play setup failed');
    // Try to disambiguate: if the session promise rejected, it's a
    // join error; otherwise treat as resolution error.
    let isJoinErr = false;
    try {
      await sessionP;
    } catch {
      isJoinErr = true;
    }
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: isJoinErr
        ? '❌ Couldn\'t join the voice channel. Make sure I have **Connect** + **Speak** there.'
        : '❌ Couldn\'t resolve that. Try a YouTube URL or a different search.',
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
  if (!(await musicScopeOk(ctx, svc))) return;
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
  if (!(await musicScopeOk(ctx, svc))) return;
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
  if (!(await musicScopeOk(ctx, svc))) return;
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
  if (!(await musicScopeOk(ctx, svc))) return;
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
  if (!(await musicScopeOk(ctx, svc))) return;
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
  if (!(await musicScopeOk(ctx, svc))) return;
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
  if (!(await musicScopeOk(ctx, svc))) return;
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
  if (!(await musicScopeOk(ctx, svc))) return;
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
  if (!(await musicScopeOk(ctx, svc))) return;
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
  if (!(await musicScopeOk(ctx, svc))) return;
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
  if (!(await musicScopeOk(ctx, svc))) return;
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
