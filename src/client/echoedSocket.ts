import { io, type Socket } from 'socket.io-client';
import { config } from '../config.js';
import { log } from '../log.js';
import type {
  MessageCreatedData,
  MemberJoinedData,
  ReactionEventData,
  Sequenced,
} from '../types.js';

type MessageHandler = (data: MessageCreatedData) => void | Promise<void>;
type MemberJoinedHandler = (data: MemberJoinedData) => void | Promise<void>;
type ReactionHandler = (data: ReactionEventData) => void | Promise<void>;
type ResumedHandler = (info: { replayed: number; fullSync: boolean }) => void | Promise<void>;
type FatalHandler = (reason: string) => void;

// Echoed emits PERMISSION_UPDATE on role / channel-override changes. Two
// `type` variants share one event name; subscribers branch on `type` to
// decide what to drop from cache.
export type PermissionInvalidatedData =
  | {
      type: 'role_permission_updated';
      serverId: string;
      roleId?: string;
      affectedUserId?: string;
      reason: 'role_created' | 'role_updated' | 'role_deleted' | 'member_roles_updated';
    }
  | {
      type: 'channel_permission_updated';
      serverId: string;
      channelId: string;
      userId?: string;
      roleId?: string;
      reason: 'channel_overrides_bulk' | 'user_channel_override' | 'role_channel_override';
    };

type PermissionInvalidatedHandler = (data: PermissionInvalidatedData) => void | Promise<void>;

// Suppress noise we don't act on. Bits map: TYPING=1, PRESENCE=2,
// REACTIONS=4, VOICE_STATE=8. Reactions stay subscribed because
// reaction-roles need MESSAGE_REACTION_ADD / REMOVE events.
const SUPPRESS_INTENTS = 1 | 2 | 8;

const HEARTBEAT_INTERVAL_MS = 25_000;

// The set of servers whose events we receive is fixed when `authenticate`
// is answered, so a server that invites us later stays silent until we
// authenticate again. Re-auth is cheap but not free (its cost scales with
// how many servers we're in), and a repeat auth soon after the last one can
// be answered from a cached membership list that still predates the new
// install — which would burn the re-auth without fixing anything. So we
// coalesce install bursts and enforce a floor comfortably above that
// caching window.
const REAUTH_DEBOUNCE_MS = 20_000;
const REAUTH_MIN_INTERVAL_MS = 120_000;

// How many consecutive auth rejections we tolerate before giving up. A
// rejection is almost always transient (the socket layer briefly unable to
// reach the API), so exiting on the first one takes every server down for a
// blip. A genuinely bad token fails every time and still trips this.
const MAX_CONSECUTIVE_AUTH_FAILURES = 5;

export class EchoedSocket {
  private socket: Socket | null = null;
  private messageHandler: MessageHandler | null = null;
  private memberJoinedHandler: MemberJoinedHandler | null = null;
  private reactionAddedHandler: ReactionHandler | null = null;
  private reactionRemovedHandler: ReactionHandler | null = null;
  private permissionInvalidatedHandler: PermissionInvalidatedHandler | null = null;
  private resumedHandler: ResumedHandler | null = null;
  private fatalHandler: FatalHandler | null = null;
  private botUserId: string | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

  // Resume state. `sessionId` + `lastSeq` let a reconnect ask for the
  // events it missed instead of silently dropping them.
  private sessionId: string | null = null;
  private lastSeq = 0;
  private authedOnce = false;
  private authFailures = 0;

  // Re-auth coalescing.
  private reauthTimer: NodeJS.Timeout | null = null;
  private lastAuthAt = 0;

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  onMemberJoined(handler: MemberJoinedHandler): void {
    this.memberJoinedHandler = handler;
  }

  onReactionAdded(handler: ReactionHandler): void {
    this.reactionAddedHandler = handler;
  }

  onReactionRemoved(handler: ReactionHandler): void {
    this.reactionRemovedHandler = handler;
  }

  onPermissionInvalidated(handler: PermissionInvalidatedHandler): void {
    this.permissionInvalidatedHandler = handler;
  }

  // Fired after a reconnect finishes replaying. Reaction events are not
  // replayable, so anything tracking reaction state should reconcile here.
  onResumed(handler: ResumedHandler): void {
    this.resumedHandler = handler;
  }

  // Called when authentication has failed enough consecutive times that
  // staying up is pointless. The owner decides how to exit.
  onFatal(handler: FatalHandler): void {
    this.fatalHandler = handler;
  }

  setBotUserId(id: string): void {
    this.botUserId = id;
  }

  // Record the sequence number of a replayable event so a resume can pick
  // up exactly where we left off.
  private trackSeq(data: Sequenced | null | undefined): void {
    const seq = data?._seq;
    if (typeof seq === 'number' && seq > this.lastSeq) this.lastSeq = seq;
  }

  // Ask to be re-authenticated so newly-added servers start delivering
  // events. Coalesces bursts and refuses to run more often than the
  // minimum interval, since an early repeat can be answered from a stale
  // membership list and would accomplish nothing.
  requestReauth(reason: string): void {
    if (!this.socket) return;
    if (this.reauthTimer) return;

    const sinceLast = Date.now() - this.lastAuthAt;
    const wait = Math.max(REAUTH_DEBOUNCE_MS, REAUTH_MIN_INTERVAL_MS - sinceLast);
    log.info({ reason, inMs: wait }, 'Scheduling socket re-authenticate');

    this.reauthTimer = setTimeout(() => {
      this.reauthTimer = null;
      const socket = this.socket;
      if (!socket?.connected) return;
      log.info({ reason }, 'Re-authenticating socket');
      this.authenticate(socket);
    }, wait);
    this.reauthTimer.unref();
  }

  private authenticate(socket: Socket): void {
    this.lastAuthAt = Date.now();
    socket.emit('authenticate', {
      botToken: config.botToken,
      suppressIntents: SUPPRESS_INTENTS,
    });
  }

  connect(): void {
    if (this.socket) return;

    const socket = io(config.socketUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30_000,
      timeout: 20_000,
    });
    this.socket = socket;

    socket.on('connect', () => {
      log.info({ id: socket.id }, 'Socket connected — authenticating');
      // Always authenticate first, even when resuming. Authenticating is
      // what (re)subscribes us to our servers' events; resuming only
      // replays what we missed. Resume alone would leave us subscribed to
      // nothing.
      this.authenticate(socket);
    });

    socket.on(
      'authenticated',
      (payload: {
        success?: boolean;
        user?: { id: string; name: string };
        sessionId?: string;
        message?: string;
      }) => {
        if (!payload?.success) {
          this.authFailures++;
          const fatal = this.authFailures >= MAX_CONSECUTIVE_AUTH_FAILURES;
          log.error(
            { message: payload?.message, attempt: this.authFailures, fatal },
            fatal
              ? 'Socket auth failed repeatedly — giving up (check BOT_TOKEN)'
              : 'Socket auth failed — will retry on reconnect',
          );
          if (fatal) {
            this.fatalHandler?.(payload?.message ?? 'socket authentication failed');
          } else {
            // Drop the connection so socket.io's backoff paces the retry
            // for us instead of us spinning on a dead session.
            socket.disconnect().connect();
          }
          return;
        }

        this.authFailures = 0;
        const previousSession = this.sessionId;
        this.sessionId = payload.sessionId ?? null;
        log.info({ user: payload.user }, 'Socket authenticated');

        // Now that we're subscribed again, backfill anything that landed
        // while we were away.
        if (this.authedOnce && previousSession && this.lastSeq > 0) {
          socket.emit('resume', {
            botToken: config.botToken,
            sessionId: previousSession,
            lastSeq: this.lastSeq,
          });
        }
        this.authedOnce = true;
      },
    );

    socket.on(
      'resumed',
      (payload: { replayed?: number; sessionId?: string; fullSync?: boolean }) => {
        if (payload?.sessionId) this.sessionId = payload.sessionId;
        const replayed = payload?.replayed ?? 0;
        const fullSync = !!payload?.fullSync;
        log.info({ replayed, fullSync }, 'Socket resumed');
        Promise.resolve(this.resumedHandler?.({ replayed, fullSync })).catch((err) => {
          log.error({ err }, 'Resume handler threw');
        });
      },
    );

    socket.on('MESSAGE_CREATE', (data: MessageCreatedData) => {
      if (!data || !data.id) return;
      this.trackSeq(data);
      // Skip our own messages — would loop forever otherwise.
      if (this.botUserId && data.senderId === this.botUserId) return;
      Promise.resolve(this.messageHandler?.(data)).catch((err) => {
        log.error({ err }, 'Message handler threw');
      });
    });

    // Member-join: payload is { serverId, userId, memberCount, updatedAt }.
    // We forward the bot's OWN join too — that's the first-install signal,
    // which index.ts routes to handleBotJoinedServer for welcome + level
    // auto-provision. The handler is idempotent, so duplicate or replayed
    // events are safe.
    // There is no corresponding member-leave event on the bot API, so
    // departures can only be noticed by reconciling against the member list.
    socket.on('SERVER_MEMBER_ADD', (data: MemberJoinedData) => {
      if (!data || !data.serverId || !data.userId) return;
      this.trackSeq(data);
      // Our own join means we were just added somewhere. Our event
      // subscription was fixed when we authenticated, so that server would
      // otherwise stay silent — schedule a re-auth to pick it up.
      if (this.botUserId && data.userId === this.botUserId) {
        this.requestReauth(`installed in ${data.serverId}`);
      }
      Promise.resolve(this.memberJoinedHandler?.(data)).catch((err) => {
        log.error({ err }, 'Member-joined handler threw');
      });
    });

    // Reactions: { messageId, channelId, serverId, userId, userName,
    // reactionType, isDirect? }. We skip DM reactions and skip our own
    // reactions (the bot seeds emoji on reaction-role messages).
    socket.on('MESSAGE_REACTION_ADD', (data: ReactionEventData) => {
      if (!data || !data.messageId || !data.userId) return;
      if (data.isDirect) return;
      if (this.botUserId && data.userId === this.botUserId) return;
      Promise.resolve(this.reactionAddedHandler?.(data)).catch((err) => {
        log.error({ err }, 'Reaction-added handler threw');
      });
    });

    socket.on('MESSAGE_REACTION_REMOVE', (data: ReactionEventData) => {
      if (!data || !data.messageId || !data.userId) return;
      if (data.isDirect) return;
      if (this.botUserId && data.userId === this.botUserId) return;
      Promise.resolve(this.reactionRemovedHandler?.(data)).catch((err) => {
        log.error({ err }, 'Reaction-removed handler threw');
      });
    });

    // Permission cache eviction. One event covers both role and
    // channel-override changes, distinguished by `type`. We forward the
    // raw payload — the wiring layer decides how aggressively to evict.
    socket.on('PERMISSION_UPDATE', (data: PermissionInvalidatedData & Sequenced) => {
      if (!data || !data.serverId) return;
      this.trackSeq(data);
      Promise.resolve(this.permissionInvalidatedHandler?.(data)).catch((err) => {
        log.error({ err }, 'Permission-invalidated handler threw');
      });
    });

    socket.on('disconnect', (reason) => {
      log.warn({ reason, lastSeq: this.lastSeq }, 'Socket disconnected');
    });

    socket.on('connect_error', (err) => {
      log.error({ err: err.message }, 'Socket connection error');
    });

    // The heartbeat carries the token — it's what keeps the bot's online
    // state fresh, and it's rejected without one.
    this.heartbeatTimer = setInterval(() => {
      if (socket.connected) {
        socket.emit('heartbeat', { botToken: config.botToken });
      }
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref();
  }

  disconnect(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reauthTimer) {
      clearTimeout(this.reauthTimer);
      this.reauthTimer = null;
    }
    this.socket?.disconnect();
    this.socket = null;
  }
}
