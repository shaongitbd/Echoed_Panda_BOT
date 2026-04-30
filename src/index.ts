import { config } from './config.js';
import { log } from './log.js';
import { EchoedClient } from './client/echoedClient.js';
import { EchoedSocket } from './client/echoedSocket.js';
import { PermissionService } from './auth/permissions.js';
import { VoiceManager } from './voice/manager.js';
import { closeDb, pingDb } from './db/pool.js';
import { runMigrations } from './db/migrate.js';
import { dispatch, type Services } from './commands/index.js';
import { awardXp } from './levels/grant.js';
import { handleLevelUp } from './levels/levelUp.js';
import { handleMemberJoined } from './welcome/onJoin.js';
import { processMessage as automodProcess } from './automod/pipeline.js';
import { handleReactionAdded, handleReactionRemoved } from './reactRoles/handler.js';
import { processAfk } from './afk/handler.js';
import { processJoin as antiRaidProcessJoin } from './antiRaid/detector.js';
import { startScheduler, stopScheduler } from './scheduler.js';
import { processAutoReact } from './autoReact/handler.js';
import { processKeywords } from './keywords/handler.js';
import { promises as fs } from 'node:fs';

// One-time boot-time check that the music feature is configured correctly.
// Logs at INFO when good, WARN when something's off — never throws,
// because music is optional and the rest of the bot should boot regardless.
async function checkMusicConfig(): Promise<void> {
  const cookiesPath = config.ytDlpCookiesFile;
  if (!cookiesPath) {
    log.warn(
      'YTDLP_COOKIES_FILE is not set. YouTube playback will fail on most videos with "Sign in to confirm you\'re not a bot." Export Netscape-format cookies from a browser, mount on the host, set the env var.',
    );
    return;
  }
  try {
    const stat = await fs.stat(cookiesPath);
    if (!stat.isFile()) {
      log.warn({ cookiesPath }, 'YTDLP_COOKIES_FILE points at something that is not a regular file');
      return;
    }
    // Sanity-check the format. Netscape cookies files start with a
    // marker line; if we see something else, the file is wrong even
    // if it exists.
    const head = (await fs.readFile(cookiesPath, 'utf8')).slice(0, 200);
    const looksNetscape = head.includes('Netscape HTTP Cookie File') || /\.youtube\.com\s/.test(head);
    if (!looksNetscape) {
      log.warn(
        { cookiesPath, head: head.slice(0, 60) },
        'Cookies file is not Netscape format. Use the "Get cookies.txt LOCALLY" extension, not a JSON exporter.',
      );
      return;
    }
    log.info({ cookiesPath, sizeBytes: stat.size }, 'YouTube cookies loaded');
  } catch (err) {
    log.warn(
      { err, cookiesPath },
      'YTDLP_COOKIES_FILE is set but the file is not readable — yt-dlp will run without cookies and most YouTube videos will fail.',
    );
  }
}

async function main(): Promise<void> {
  // 0. Music config sanity-check. Surface any cookies-file
  // misconfiguration on boot rather than at first !play, so it's
  // visible in deployment logs without anyone having to test the
  // music feature.
  await checkMusicConfig();

  // 1. Database first — if Postgres is unreachable nothing else makes
  //    sense to wire up. Migrations are idempotent and run every boot.
  try {
    await pingDb();
    await runMigrations();
  } catch (err) {
    log.fatal({ err }, 'Database setup failed — exiting');
    process.exit(1);
  }

  // 2. Bot identity. Without this we can't dedup our own outbound
  //    messages on the socket and we'd echo-loop forever.
  const api = new EchoedClient(config.botToken);
  let botUserId: string;
  try {
    const profile = await api.getProfile();
    botUserId = profile.id;
    log.info(
      { id: profile.id, name: profile.name, username: profile.username },
      'Bot identity confirmed',
    );
  } catch (err) {
    log.fatal({ err }, 'Failed to load bot profile — is BOT_TOKEN valid?');
    process.exit(1);
  }

  const services: Services = {
    api,
    perms: new PermissionService(api),
    voice: new VoiceManager(api),
    startedAt: Date.now(),
  };

  // 3. Socket — auto-subscribed to every server room on auth, so we
  //    receive MESSAGE_CREATE for every channel the bot can see.
  const socket = new EchoedSocket();
  socket.setBotUserId(botUserId);
  socket.onMemberJoined(async (data) => {
    // Anti-raid runs first — if it auto-kicks the joiner during a
    // lockdown, the welcome flow has nothing to do. Pass the bot's
    // user ID so mod-log entries are attributed to the bot itself
    // and not to the new joiner who tripped the threshold.
    let kicked = false;
    try {
      kicked = await antiRaidProcessJoin(api, data, botUserId);
    } catch (err) {
      log.error({ err, serverId: data.serverId, userId: data.userId }, 'Anti-raid check failed');
    }
    if (kicked) return;
    try {
      await handleMemberJoined(api, data);
    } catch (err) {
      log.error({ err, serverId: data.serverId, userId: data.userId }, 'Welcome flow failed');
    }
  });

  socket.onReactionAdded(async (data) => {
    try {
      await handleReactionAdded(api, data);
    } catch (err) {
      log.error({ err, msgId: data.messageId }, 'Reaction-add flow failed');
    }
  });

  socket.onReactionRemoved(async (data) => {
    try {
      await handleReactionRemoved(api, data);
    } catch (err) {
      log.error({ err, msgId: data.messageId }, 'Reaction-remove flow failed');
    }
  });

  // Drop perm-cache entries the moment Echoed signals a change. Without
  // this we'd be stale for up to TTL_MS (60s) — fine for read-only ops
  // but a real correctness gap for moderation gating.
  socket.onPermissionInvalidated((data) => {
    if (data.type === 'role_permission_updated') {
      // member_roles_updated is the surgical case: only one user's
      // roleset changed, evict just them. Every other reason
      // (role_created/updated/deleted) potentially affects every member
      // who held the role, so we conservatively flush the whole server.
      if (data.affectedUserId) {
        services.perms.invalidate(data.serverId, data.affectedUserId);
      } else {
        services.perms.invalidateServer(data.serverId);
      }
      return;
    }
    // channel_permission_updated.
    // user_channel_override → just that user's entry on that channel.
    // role_channel_override / channel_overrides_bulk → drop every cached
    // entry for the channel; we don't have role→user mapping locally.
    if (data.userId) {
      services.perms.invalidate(data.serverId, data.userId);
    } else {
      services.perms.invalidateChannel(data.serverId, data.channelId);
    }
  });

  socket.onMessage(async (msg) => {
    if (!msg.content || msg.messageType !== 'user') return;
    if (!msg.serverId || !msg.channelId) return;

    // Auto-mod runs FIRST and synchronously — if it deletes the
    // message we skip XP and dispatch entirely. A user shouldn't earn
    // XP for spam, and shouldn't be able to invoke commands inside a
    // message we're about to nuke.
    let actedOn = false;
    try {
      actedOn = await automodProcess(api, services.perms, msg);
    } catch (err) {
      log.error({ err, msgId: msg.id }, 'Auto-mod pipeline threw');
    }
    if (actedOn) return;

    // AFK side-effects: clear-on-return + mention reply. Best-effort,
    // independent of XP/dispatch.
    void (async () => {
      try {
        await processAfk(api, msg);
      } catch (err) {
        log.error({ err, msgId: msg.id }, 'AFK pipeline failed');
      }
    })();

    // Automation primitives: auto-react + keyword response. Both run
    // in the background — slow API responses shouldn't block dispatch.
    void (async () => {
      try {
        await processAutoReact(api, msg);
      } catch (err) {
        log.error({ err, msgId: msg.id }, 'Auto-react pipeline failed');
      }
    })();
    void (async () => {
      try {
        await processKeywords(api, msg);
      } catch (err) {
        log.error({ err, msgId: msg.id }, 'Keyword pipeline failed');
      }
    })();

    // Award XP independently of command dispatch. We deliberately do
    // BOTH on every message — a `!rank` command should still award
    // XP for the user typing it. Both branches handle their own
    // errors so a fault in one doesn't starve the other.
    void (async () => {
      try {
        const grant = await awardXp({
          serverId: msg.serverId,
          userId: msg.senderId,
          channelId: msg.channelId,
          api,
        });
        if (grant.leveledUp) {
          await handleLevelUp(api, {
            serverId: msg.serverId,
            userId: msg.senderId,
            fallbackChannelId: msg.channelId,
            oldLevel: grant.oldLevel,
            newLevel: grant.newLevel,
          });
        }
      } catch (err) {
        log.error({ err, msgId: msg.id }, 'XP grant pipeline failed');
      }
    })();

    await dispatch(
      msg.content,
      {
        serverId: msg.serverId,
        channelId: msg.channelId,
        senderId: msg.senderId,
        senderName: msg.author?.name ?? 'unknown',
        messageId: msg.id,
      },
      services,
    );
  });
  socket.connect();

  // 4. Background scheduler — fires due reminders + closes finished
  //    giveaways. Started after socket so first ticks can use the
  //    bot identity for self-skip filtering.
  startScheduler(api, botUserId, services.perms);

  const shutdown = async (signal: string): Promise<void> => {
    log.info({ signal }, 'Shutting down');
    stopScheduler();
    socket.disconnect();
    try {
      await closeDb();
    } catch (err) {
      log.warn({ err }, 'Error closing DB pool during shutdown');
    }
    setTimeout(() => process.exit(0), 200);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));

  // Restarting on every async error is expensive — most command-handler
  // errors are already swallowed in the dispatcher. Stay alive and log.
  process.on('uncaughtException', (err) => {
    log.error({ err }, 'Uncaught exception — staying alive');
  });
  process.on('unhandledRejection', (err) => {
    log.error({ err }, 'Unhandled rejection — staying alive');
  });
}

void main();
