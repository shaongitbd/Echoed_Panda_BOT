// Per-server registry of active VoiceConnection + MusicPlayer pairs.
// One concurrent voice session per server (matches Discord and most music
// bots). Idle sessions auto-leave after a grace period.

import { VoiceConnection } from './connection.js';
import { MusicPlayer } from './player.js';
import { LiveCard } from './liveCard.js';
import type { EchoedClient } from '../client/echoedClient.js';
import { log } from '../log.js';

const IDLE_LEAVE_MS = 2 * 60 * 1000; // 2 min after last track ends

interface Session {
  connection: VoiceConnection;
  player: MusicPlayer;
  channelId: string;
  liveCard: LiveCard;
  // Timer that fires if the player goes idle. Cancelled when a new track
  // starts.
  idleTimer: NodeJS.Timeout | null;
}

const sessions = new Map<string, Session>();

export class VoiceManager {
  constructor(private readonly api: EchoedClient) {}

  get(serverId: string): Session | undefined {
    return sessions.get(serverId);
  }

  // Connect the bot to a voice channel — minting a fresh LiveKit token
  // via the bot API, opening the WebRTC session, and creating a fresh
  // MusicPlayer. Idempotent if already connected to the same channel.
  // `textChannelId` is where now-playing cards are posted — pass the
  // channel where !play was invoked.
  async join(serverId: string, channelId: string, textChannelId: string): Promise<Session> {
    const existing = sessions.get(serverId);
    if (existing) {
      if (existing.channelId === channelId) {
        existing.liveCard.setTextChannel(textChannelId);
        return existing;
      }
      // Bot was in another channel — leave first.
      await this.leave(serverId);
    }

    const tok = await this.api.joinVoiceChannel(serverId, channelId);

    const connection = new VoiceConnection(serverId, channelId);
    await connection.connect({
      url: tok.url,
      token: tok.token,
      room: tok.room,
      identity: tok.identity,
    });

    const player = new MusicPlayer(serverId, connection);
    const liveCard = new LiveCard({
      api: this.api,
      player,
      serverId,
      textChannelId,
    });

    const session: Session = { connection, player, channelId, liveCard, idleTimer: null };
    sessions.set(serverId, session);

    // Wire idle auto-leave: when the queue empties, start a 2-min timer.
    // Any new track starting cancels it.
    player.on('queueEnd', () => {
      this.armIdleLeave(serverId);
    });
    player.on('trackStart', () => {
      this.cancelIdleLeave(serverId);
    });

    // If the bot ends up alone in the channel, leave gracefully.
    connection.onParticipantCountChange = (count) => {
      if (count === 0) {
        log.info({ serverId, channelId }, 'Voice channel empty — leaving');
        void this.leave(serverId);
      }
    };
    connection.onDisconnect = () => {
      // Halt the player too — without this, run()'s while loop
      // keeps spinning: each track downloads fine but pushFrame
      // fails against the freed source handle, the push loop
      // catches and calls settle('natural'), the next iteration
      // grabs the next queued track, and the queue burns through
      // in milliseconds. Looks like rapid "looping" from outside.
      const session = sessions.get(serverId);
      if (session) session.player.stop();
      sessions.delete(serverId);
    };

    return session;
  }

  async leave(serverId: string): Promise<void> {
    const session = sessions.get(serverId);
    if (!session) return;
    sessions.delete(serverId);
    this.cancelIdleLeave(serverId);
    session.player.stop();
    await session.connection.disconnect();
    try {
      await this.api.leaveVoiceChannel(serverId, session.channelId);
    } catch (err) {
      log.warn({ err, serverId }, 'leaveVoiceChannel call failed (continuing)');
    }
  }

  private armIdleLeave(serverId: string): void {
    const s = sessions.get(serverId);
    if (!s) return;
    this.cancelIdleLeave(serverId);
    s.idleTimer = setTimeout(() => {
      log.info({ serverId }, 'Voice idle — auto-leaving');
      void this.leave(serverId);
    }, IDLE_LEAVE_MS);
  }

  private cancelIdleLeave(serverId: string): void {
    const s = sessions.get(serverId);
    if (s?.idleTimer) {
      clearTimeout(s.idleTimer);
      s.idleTimer = null;
    }
  }
}
