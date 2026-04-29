import { io, type Socket } from 'socket.io-client';
import { config } from '../config.js';
import { log } from '../log.js';
import type {
  MessageCreatedData,
  MemberJoinedData,
  ReactionEventData,
} from '../types.js';

type MessageHandler = (data: MessageCreatedData) => void | Promise<void>;
type MemberJoinedHandler = (data: MemberJoinedData) => void | Promise<void>;
type ReactionHandler = (data: ReactionEventData) => void | Promise<void>;

// Suppress noise we don't act on. Bits map: TYPING=1, PRESENCE=2,
// REACTIONS=4, VOICE_STATE=8. Reactions stay subscribed because
// reaction-roles need MESSAGE_REACTION_ADD / REMOVE events.
const SUPPRESS_INTENTS = 1 | 2 | 8;

const HEARTBEAT_INTERVAL_MS = 25_000;

export class EchoedSocket {
  private socket: Socket | null = null;
  private messageHandler: MessageHandler | null = null;
  private memberJoinedHandler: MemberJoinedHandler | null = null;
  private reactionAddedHandler: ReactionHandler | null = null;
  private reactionRemovedHandler: ReactionHandler | null = null;
  private botUserId: string | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;

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

  setBotUserId(id: string): void {
    this.botUserId = id;
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
      socket.emit('authenticate', {
        botToken: config.botToken,
        suppressIntents: SUPPRESS_INTENTS,
      });
    });

    socket.on(
      'authenticated',
      (payload: { success?: boolean; user?: { id: string; name: string }; message?: string }) => {
        if (payload?.success) {
          log.info({ user: payload.user }, 'Socket authenticated');
        } else {
          log.fatal({ message: payload?.message }, 'Socket auth failed — check BOT_TOKEN');
          process.exit(1);
        }
      },
    );

    socket.on('MESSAGE_CREATE', (data: MessageCreatedData) => {
      if (!data || !data.id) return;
      // Skip our own messages — would loop forever otherwise.
      if (this.botUserId && data.senderId === this.botUserId) return;
      Promise.resolve(this.messageHandler?.(data)).catch((err) => {
        log.error({ err }, 'Message handler threw');
      });
    });

    // Member-join: payload is { serverId, userId, memberCount, updatedAt }.
    // Skip if the joining user is the bot itself (sometimes fires on
    // bot-invite). Goodbye flow is intentionally absent — Echoed
    // currently does not broadcast SERVER_MEMBER_REMOVE to remaining
    // members, so the bot can't reliably observe leaves yet.
    socket.on('SERVER_MEMBER_ADD', (data: MemberJoinedData) => {
      if (!data || !data.serverId || !data.userId) return;
      if (this.botUserId && data.userId === this.botUserId) return;
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

    socket.on('disconnect', (reason) => {
      log.warn({ reason }, 'Socket disconnected');
    });

    socket.on('connect_error', (err) => {
      log.error({ err: err.message }, 'Socket connection error');
    });

    // Echoed's heartbeat handler runs validateToken on every call (TypeError
    // if data is missing) and uses the result to refresh the bot's online
    // state — so the token payload is mandatory.
    this.heartbeatTimer = setInterval(() => {
      if (socket.connected) {
        socket.emit('heartbeat', { botToken: config.botToken });
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  disconnect(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.socket?.disconnect();
    this.socket = null;
  }
}
