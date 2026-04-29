// MusicPlayer per server. Owns:
//   - the queue (in-memory; resets on bot restart by design — simpler)
//   - the current track + playback position
//   - paused/playing state, loop mode, volume
//   - an async push loop that feeds PCM frames to the VoiceConnection
//     at the rate LiveKit consumes them (self-pacing via the awaited
//     captureFrame promise)
//
// Decoupled from LiveKit specifics: the player only talks to a
// VoiceConnection.pushFrame() interface.

import { EventEmitter } from 'node:events';
import { Readable } from 'node:stream';
import { VoiceConnection, SAMPLES_PER_FRAME } from './connection.js';
import type { Track } from './source.js';
import { log } from '../log.js';

const BYTES_PER_SAMPLE = 2; // s16le
const CHANNELS = 2;
const FRAME_BYTES = SAMPLES_PER_FRAME * CHANNELS * BYTES_PER_SAMPLE;

// A pre-allocated silence frame. Used during pause + when the source
// stream hasn't delivered its next chunk in time. Created once because
// it's all zeros and we never mutate it; sharing the same Int16Array
// across pushes is safe (LiveKit copies the data in captureFrame).
const SILENT_FRAME: Int16Array = new Int16Array(FRAME_BYTES / BYTES_PER_SAMPLE);

export type LoopMode = 'off' | 'track' | 'queue';

export interface NowPlaying {
  track: Track;
  startedAt: number; // wall clock when current track started
  pausedAt: number | null; // when pause began; null if playing
  positionMs: number; // accumulated playtime (excludes pause time)
}

export class MusicPlayer extends EventEmitter {
  readonly serverId: string;
  private readonly connection: VoiceConnection;

  private queue: Track[] = [];
  private current: Track | null = null;
  private currentStream: Readable | null = null;
  private currentClose: (() => void) | null = null;
  private leftover = Buffer.alloc(0);

  private playing = false;
  private paused = false;
  private loop: LoopMode = 'off';
  private volume = 1.0; // 0..1.5 (above 1 amplifies)

  private startedAt = 0;
  private pausedAt: number | null = null;
  private accumulatedPause = 0;


  // Resolves when end-of-track is reached. Used by the queue runner so
  // we know when to advance.
  private trackComplete: ((cause: 'natural' | 'skipped' | 'stopped') => void) | null = null;

  constructor(serverId: string, connection: VoiceConnection) {
    super();
    this.serverId = serverId;
    this.connection = connection;
  }

  // ─── Queue management ────────────────────────────────────────────────

  enqueue(track: Track): number {
    this.queue.push(track);
    this.emit('enqueue', track);
    return this.queue.length;
  }

  enqueueFront(track: Track): void {
    this.queue.unshift(track);
    this.emit('enqueue', track);
  }

  removeAt(index: number): Track | null {
    if (index < 0 || index >= this.queue.length) return null;
    const [removed] = this.queue.splice(index, 1);
    return removed ?? null;
  }

  clearQueue(): void {
    this.queue = [];
  }

  shuffleQueue(): void {
    for (let i = this.queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const a = this.queue[i];
      const b = this.queue[j];
      if (a && b) {
        this.queue[i] = b;
        this.queue[j] = a;
      }
    }
  }

  list(): readonly Track[] {
    return this.queue;
  }

  // ─── Playback control ────────────────────────────────────────────────

  // Kick off the queue loop. Returns immediately; track playback runs in
  // the background. Subsequent calls while already running are no-ops.
  async run(): Promise<void> {
    if (this.playing) return;
    this.playing = true;

    while (this.playing) {
      const next = this.pickNext();
      if (!next) {
        this.emit('queueEnd');
        this.playing = false;
        break;
      }
      this.current = next;
      try {
        const { pcm, close } = await next.open();
        this.currentStream = pcm;
        this.currentClose = close;
        this.startedAt = Date.now();
        this.accumulatedPause = 0;
        this.pausedAt = null;
        this.leftover = Buffer.alloc(0);
        this.emit('trackStart', next);
        const cause = await this.playCurrent();
        this.emit('trackEnd', { track: next, cause });
        if (cause === 'stopped') {
          this.playing = false;
          break;
        }
      } catch (err) {
        log.warn({ err, track: next.title }, 'Track playback failed — skipping');
        this.emit('trackError', { track: next, err });
      } finally {
        this.cleanupCurrentStream();
        this.current = null;
      }
    }
  }

  pause(): boolean {
    if (!this.current || this.paused) return false;
    this.paused = true;
    this.pausedAt = Date.now();
    return true;
  }

  resume(): boolean {
    if (!this.current || !this.paused) return false;
    if (this.pausedAt) {
      this.accumulatedPause += Date.now() - this.pausedAt;
      this.pausedAt = null;
    }
    this.paused = false;
    return true;
  }

  // Skip current track. The next-track logic in run() will pick up.
  skip(): boolean {
    if (!this.current) return false;
    this.trackComplete?.('skipped');
    return true;
  }

  // Stop everything: clear queue and end current playback.
  stop(): void {
    this.queue = [];
    this.trackComplete?.('stopped');
    this.playing = false;
  }

  setLoop(mode: LoopMode): void {
    this.loop = mode;
  }

  getLoop(): LoopMode {
    return this.loop;
  }

  setVolume(v: number): void {
    // Clamp 0..1.5 — anything above 1.5 is hostile to listeners.
    this.volume = Math.max(0, Math.min(1.5, v));
  }

  getVolume(): number {
    return this.volume;
  }

  isPaused(): boolean {
    return this.paused;
  }

  isPlaying(): boolean {
    return this.playing;
  }

  nowPlaying(): NowPlaying | null {
    if (!this.current) return null;
    const now = Date.now();
    const pauseTotal = this.accumulatedPause + (this.pausedAt ? now - this.pausedAt : 0);
    return {
      track: this.current,
      startedAt: this.startedAt,
      pausedAt: this.pausedAt,
      positionMs: now - this.startedAt - pauseTotal,
    };
  }

  // ─── Internals ───────────────────────────────────────────────────────

  private pickNext(): Track | null {
    if (this.loop === 'track' && this.current) return this.current;
    const next = this.queue.shift();
    if (!next) return null;
    if (this.loop === 'queue') {
      // Append back to the end for queue-loop mode.
      this.queue.push(next);
    }
    return next;
  }

  // playCurrent runs the awaited push loop until the track finishes,
  // is skipped, or the player is stopped.
  //
  // Pacing model: LiveKit's AudioSource.captureFrame() returns a
  // Promise that resolves once the source's internal queue has space
  // — i.e. once enough audio has been *played out* to make room. That
  // resolution rate IS the playback rate (1 frame / 20 ms at 48 kHz
  // stereo), so awaiting captureFrame is the natural rate limiter.
  //
  // The previous implementation used a setTimeout-based 20 ms ticker
  // AND fired captureFrame as void — racing the bot's manual cadence
  // against LiveKit's self-pacing. Frames piled up in the queue and
  // played back compressed, producing the "robot voice" symptom.
  private playCurrent(): Promise<'natural' | 'skipped' | 'stopped'> {
    return new Promise((resolve) => {
      let resolved = false;
      const settle = (cause: 'natural' | 'skipped' | 'stopped'): void => {
        if (resolved) return;
        resolved = true;
        this.trackComplete = null;
        resolve(cause);
      };
      this.trackComplete = settle;

      const stream = this.currentStream;
      if (!stream) {
        settle('natural');
        return;
      }

      stream.on('end', () => {
        // Natural end — let LiveKit drain its queue before advancing.
        // Without this we'd cut off the last ~2 seconds of audio
        // (whatever is buffered in the source).
        this.connection.waitForPlayout().finally(() => {
          settle('natural');
        });
      });
      stream.on('error', (err) => {
        log.warn({ err }, 'PCM stream errored');
        settle('natural');
      });

      void this.runPushLoop(settle);
    });
  }

  // Tight loop that pulls a frame from the PCM stream and awaits its
  // delivery to LiveKit. captureFrame's promise gates the loop at
  // playback rate. While paused we still push silence so LiveKit
  // doesn't underrun (an underrun mid-track manifests as a clicking
  // gap on resume).
  private async runPushLoop(
    settle: (cause: 'natural' | 'skipped' | 'stopped') => void,
  ): Promise<void> {
    while (this.trackComplete) {
      try {
        if (this.paused) {
          await this.connection.pushFrame(SILENT_FRAME);
          continue;
        }
        const frame = this.readFrame();
        if (!frame) {
          // Stream hasn't delivered the next chunk yet. Push a single
          // silence frame to keep the source fed, then loop. The
          // stream's 'end' event resolves the outer promise when the
          // track is genuinely over.
          await this.connection.pushFrame(SILENT_FRAME);
          continue;
        }
        const scaled = applyVolume(frame, this.volume);
        await this.connection.pushFrame(bufToInt16(scaled));
      } catch (err) {
        log.warn({ err }, 'Push loop errored — ending track');
        settle('natural');
        return;
      }
    }
  }

  // Pull the next FRAME_BYTES from leftover + stream chunks. Returns
  // null when the stream is exhausted and leftover is empty.
  private readFrame(): Buffer | null {
    if (!this.currentStream) return null;
    while (this.leftover.length < FRAME_BYTES) {
      const chunk = this.currentStream.read() as Buffer | null;
      if (!chunk) return this.leftover.length > 0 ? this.padToFrame() : null;
      this.leftover = Buffer.concat([this.leftover, chunk]);
    }
    const frame = this.leftover.subarray(0, FRAME_BYTES);
    this.leftover = this.leftover.subarray(FRAME_BYTES);
    return frame;
  }

  private padToFrame(): Buffer {
    const out = Buffer.alloc(FRAME_BYTES);
    this.leftover.copy(out);
    this.leftover = Buffer.alloc(0);
    return out;
  }

  private cleanupCurrentStream(): void {
    try {
      this.currentClose?.();
    } catch {
      /* best-effort */
    }
    this.currentStream = null;
    this.currentClose = null;
    this.connection.clearAudioBuffer();
  }
}

// ─── Helpers ───────────────────────────────────────────────────────────

function bufToInt16(buf: Buffer): Int16Array {
  // The buffer's underlying ArrayBuffer may be larger than its visible
  // window (Buffer.allocUnsafe uses a pool); slice precisely.
  return new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2);
}

// In-place s16le volume scaling. Avoids cloning by writing back to the
// same Buffer; if the input was a slice of a pooled buffer the caller
// owns the lifetime.
function applyVolume(buf: Buffer, volume: number): Buffer {
  if (volume === 1) return buf;
  const out = Buffer.allocUnsafe(buf.length);
  for (let i = 0; i < buf.length; i += 2) {
    const sample = buf.readInt16LE(i);
    let scaled = Math.round(sample * volume);
    if (scaled > 32767) scaled = 32767;
    else if (scaled < -32768) scaled = -32768;
    out.writeInt16LE(scaled, i);
  }
  return out;
}
