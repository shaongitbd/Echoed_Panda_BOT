// Per-server registry of active VoiceConnection + MusicPlayer pairs.
// One concurrent voice session per server (matches Discord and most music
// bots). Idle sessions auto-leave after a grace period.

import { VoiceConnection } from './connection.js';
import { MusicPlayer } from './player.js';
import { LiveCard } from './liveCard.js';
import type { EchoedClient } from '../client/echoedClient.js';
import { log } from '../log.js';

const IDLE_LEAVE_MS = 2 * 60 * 1000; // 2 min after last track ends
// LiveKit can briefly report a participant gone during a network blip
// (the SDK's reconnect logic restores them within a few seconds).
// Without grace, the bot leaves the moment count hits 0 and the user
// returns to find the music gone. 10 s covers typical reconnects
// without delaying real "everyone left" cleanup noticeably.
const EMPTY_LEAVE_GRACE_MS = 10 * 1000;

interface Session {
  connection: VoiceConnection;
  player: MusicPlayer;
  channelId: string;
  liveCard: LiveCard;
  // Timer that fires if the player goes idle. Cancelled when a new track
  // starts.
  idleTimer: NodeJS.Timeout | null;
  // Timer that fires if remote participants stay at 0 for the grace
  // period. Cancelled the moment a participant reappears (e.g. after
  // a network blip + reconnect).
  emptyLeaveTimer: NodeJS.Timeout | null;
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

    const session: Session = {
      connection,
      player,
      channelId,
      liveCard,
      idleTimer: null,
      emptyLeaveTimer: null,
    };
    sessions.set(serverId, session);

    // Wire idle auto-leave: when the queue empties, start a 2-min timer.
    // Any new track starting cancels it.
    player.on('queueEnd', () => {
      this.armIdleLeave(serverId);
    });
    player.on('trackStart', () => {
      this.cancelIdleLeave(serverId);
    });

    // If the bot ends up alone in the channel, leave gracefully —
    // but with a grace window. LiveKit can briefly report count=0
    // during a humans's reconnect (network blip on their end); without
    // grace the bot would leave permanently in the 2-second gap and
    // the user comes back to silence.
    connection.onParticipantCountChange = (count) => {
      const s = sessions.get(serverId);
      if (!s) return;
      if (count === 0) {
        if (s.emptyLeaveTimer) return; // already armed
        log.info({ serverId, channelId, graceMs: EMPTY_LEAVE_GRACE_MS }, 'Voice channel empty — arming leave grace');
        s.emptyLeaveTimer = setTimeout(() => {
          s.emptyLeaveTimer = null;
          // Re-check live count: a participant may have returned
          // after we armed but before the timer fired.
          if (s.connection.remoteParticipantCount() === 0) {
            log.info({ serverId, channelId }, 'Voice channel still empty after grace — leaving');
            void this.leave(serverId);
          }
        }, EMPTY_LEAVE_GRACE_MS);
      } else if (s.emptyLeaveTimer) {
        clearTimeout(s.emptyLeaveTimer);
        s.emptyLeaveTimer = null;
        log.info({ serverId, channelId, count }, 'Participant returned within grace — keeping bot connected');
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
      if (session) {
        if (session.emptyLeaveTimer) {
          clearTimeout(session.emptyLeaveTimer);
          session.emptyLeaveTimer = null;
        }
        session.player.stop();
      }
      sessions.delete(serverId);
    };

    return session;
  }

  async leave(serverId: string): Promise<void> {
    const session = sessions.get(serverId);
    if (!session) return;
    sessions.delete(serverId);
    this.cancelIdleLeave(serverId);
    if (session.emptyLeaveTimer) {
      clearTimeout(session.emptyLeaveTimer);
      session.emptyLeaveTimer = null;
    }
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
