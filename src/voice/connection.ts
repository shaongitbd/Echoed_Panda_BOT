// Wraps a single LiveKit Room for a single (server, channel) voice session.
// Owns the AudioSource + LocalAudioTrack so the player can hand it raw PCM
// frames without knowing anything about LiveKit. Cleanly tears down on
// disconnect/leave so a panicked process exits cleanly.

import {
  Room,
  RoomEvent,
  AudioSource,
  LocalAudioTrack,
  TrackPublishOptions,
  TrackSource,
  AudioFrame,
} from '@livekit/rtc-node';
import { log } from '../log.js';

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;
// 100ms frames @ 48kHz stereo = 4800 samples per channel.
//
// LiveKit's official publish-wav example uses 1s frames; 100ms is a
// middle ground that keeps startup latency ~instant while reducing
// FFI call frequency 5× vs the original 20ms (smoother on slow
// hardware, fewer chances for empty-buffer gaps to surface).
export const SAMPLES_PER_FRAME = SAMPLE_RATE / 10;

export interface JoinTokenInput {
  url: string;
  token: string;
  room: string;
  identity: string;
}

export class VoiceConnection {
  readonly serverId: string;
  readonly channelId: string;

  private room: Room | null = null;
  private audioSource: AudioSource | null = null;
  private audioTrack: LocalAudioTrack | null = null;
  private connected = false;

  // Listeners so we can drop them from the registry on disconnect.
  onDisconnect: (() => void) | null = null;
  onParticipantCountChange: ((count: number) => void) | null = null;

  constructor(serverId: string, channelId: string) {
    this.serverId = serverId;
    this.channelId = channelId;
  }

  // Connect to the SFU and publish a microphone track. Returns when the
  // track is published and ready to receive frames.
  async connect(input: JoinTokenInput): Promise<void> {
    if (this.connected) return;

    const room = new Room();
    this.room = room;

    room.on(RoomEvent.Disconnected, () => {
      log.info({ serverId: this.serverId, channelId: this.channelId }, 'Voice room disconnected');
      this.connected = false;
      this.onDisconnect?.();
    });

    room.on(RoomEvent.ParticipantConnected, () => {
      this.emitCount();
    });
    room.on(RoomEvent.ParticipantDisconnected, () => {
      this.emitCount();
    });

    await room.connect(input.url, input.token, {
      autoSubscribe: false, // we don't need to receive other participants' audio
      dynacast: false,
    });

    const source = new AudioSource(SAMPLE_RATE, CHANNELS);
    const track = LocalAudioTrack.createAudioTrack('panda-music', source);
    const opts = new TrackPublishOptions();
    opts.source = TrackSource.SOURCE_MICROPHONE;

    if (!room.localParticipant) {
      throw new Error('LiveKit local participant not available after connect');
    }
    await room.localParticipant.publishTrack(track, opts);

    this.audioSource = source;
    this.audioTrack = track;
    this.connected = true;

    log.info(
      { serverId: this.serverId, channelId: this.channelId, room: input.room },
      'Voice connected and track published',
    );
  }

  // Push one 100ms PCM s16le interleaved frame. The caller paces by
  // checking queuedDurationMs (LiveKit's queue is ~1s by default).
  async pushFrame(pcm: Int16Array): Promise<void> {
    if (!this.audioSource) return;
    const frame = new AudioFrame(pcm, SAMPLE_RATE, CHANNELS, pcm.length / CHANNELS);
    await this.audioSource.captureFrame(frame);
  }

  // Approximate ms of audio currently buffered in LiveKit's native
  // AudioSource. Used by the player loop to gate pushes — feeding past
  // a threshold causes the native side to drop or compress frames,
  // surfacing as bit-crushed / breaking audio.
  queuedDurationMs(): number {
    return this.audioSource?.queuedDuration ?? 0;
  }

  // Wait until LiveKit has played out everything we've queued. Used at
  // end-of-track so we don't cut off the last few hundred ms.
  async waitForPlayout(): Promise<void> {
    if (!this.audioSource) return;
    await this.audioSource.waitForPlayout();
  }

  clearAudioBuffer(): void {
    // Skip the FFI call when we know the room is gone — clearQueue
    // fires a fire-and-forget request whose rejection we can't catch
    // (rtc-node types it as `void` but the underlying FfiClient.request
    // is async). When the room disconnects the source handle is freed,
    // and any clearQueue at that point spits out an "Unhandled
    // rejection — handle not found". Gating on `connected` keeps the
    // log clean.
    if (!this.connected) return;
    try {
      this.audioSource?.clearQueue();
    } catch (err) {
      log.debug({ err }, 'clearAudioBuffer threw (ignored)');
    }
  }

  // Number of remote participants — use to decide if the bot should
  // auto-leave (e.g. if everyone else dropped). The bot itself doesn't
  // count.
  remoteParticipantCount(): number {
    if (!this.room) return 0;
    return this.room.remoteParticipants.size;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async disconnect(): Promise<void> {
    if (!this.connected) return;
    this.connected = false;
    try {
      await this.audioSource?.close();
    } catch {
      // best-effort
    }
    try {
      await this.room?.disconnect();
    } catch {
      // best-effort
    }
    this.audioSource = null;
    this.audioTrack = null;
    this.room = null;
  }

  private emitCount(): void {
    this.onParticipantCountChange?.(this.remoteParticipantCount());
  }
}
