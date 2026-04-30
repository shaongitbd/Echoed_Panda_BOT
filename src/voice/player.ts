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
import { VoiceConnection } from './connection.js';
import type { Track } from './source.js';
import { log } from '../log.js';

const SAMPLE_RATE = 48_000;
const BYTES_PER_SAMPLE = 2; // s16le
const CHANNELS = 2;

// 1-second frames. This matches LiveKit's official publish-wav example
// and the `testTone` diagnostic command — both confirmed to play
// cleanly. Earlier 100 ms frames + a queue-depth poll gate caused the
// breakup the user kept hearing: the manual gate fights captureFrame's
// own native backpressure, creating micro-stalls that surface as
// bit-crushed audio. With 1-second frames we trust captureFrame's
// await to block when LiveKit's queue is full; no manual pacing.
const FRAME_BYTES_1S = SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE; // 192 000 bytes

// Pre-allocated 1 s of silence — pushed during pause so LiveKit's
// queue stays primed instead of underrunning (an underrun shows up
// as clicks on resume).
const SILENT_FRAME_1S: Int16Array = new Int16Array(FRAME_BYTES_1S / BYTES_PER_SAMPLE);


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
    if (removed) void removed.cleanup().catch(() => {});
    return removed ?? null;
  }

  clearQueue(): void {
    for (const t of this.queue) {
      void t.cleanup().catch(() => {});
    }
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
        this.emit('trackStart', next);

        // Kick off the next track's download in the background while
        // the current one plays. By the time current ends, the next
        // file is already on disk and open() returns near-instantly.
        // Failures here are silent — open() will retry the download
        // when the track actually becomes current.
        const upcoming = this.queue[0];
        if (upcoming) {
          void upcoming.prefetch().catch((err) => {
            log.debug({ err, title: upcoming.title }, 'Prefetch failed (will retry on play)');
          });
        }

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
        // Delete the downloaded file. For loop=track / loop=queue the
        // next iteration will re-download — cheap relative to the
        // disk-space win of keeping /tmp clean.
        void next.cleanup().catch(() => {});
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
    for (const t of this.queue) {
      void t.cleanup().catch(() => {});
    }
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
  // Pacing model: matches LiveKit's official publish-wav example. We
  // iterate the PCM stream with `for await (chunk of stream)`, which
  // is the canonical way to consume a Node Readable. The async
  // iteration *waits* when the stream's internal buffer is empty —
  // crucially, it does NOT return undefined or null, so we never
  // accidentally feed silence between real audio chunks (the bug
  // that caused the previous "robot voice" symptom).
  //
  // captureFrame() blocks at the FFI level when the native
  // AudioSource queue is full (default 1 second), which is the
  // natural rate limiter. No manual setTimeout / sleep needed.
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

      stream.on('error', (err) => {
        log.warn({ err }, 'PCM stream errored');
        settle('natural');
      });

      void this.runPushLoop(settle);
    });
  }

  // Decode-then-push push loop. Mirrors the working `testTone`
  // diagnostic command exactly:
  //   1. Drain ffmpeg's stdout fully into a Buffer (entire track PCM
  //      in memory). For typical music tracks (3–10 min) this is
  //      ~35–115 MB — fine on any reasonable host. ffmpeg decodes
  //      faster than realtime, so this finishes in 1–3 s.
  //   2. Push 1-second frames, awaiting captureFrame on each. The
  //      native AudioSource has its own queue cap (1 s by default);
  //      captureFrame blocks at the FFI level when the queue is full,
  //      which is the only pacing we need. No manual gate / poll.
  //
  // Why not stream-and-push? The previous design (100 ms frames,
  // for-await over ffmpeg stdout, manual queue gate) caused the
  // breakup the user kept hearing — small frames + bursty stdout +
  // a polling gate fight each other and produce micro-stalls that
  // surface as bit-crushed / robot audio. Buffering up front and
  // pushing in 1 s slices is what LiveKit's own publish-wav example
  // does, and what `testTone` proved works cleanly.
  //
  // Pause handling: push 1 s of silence per frame instead of
  // advancing the buffer, so the queue stays primed.
  private async runPushLoop(
    settle: (cause: 'natural' | 'skipped' | 'stopped') => void,
  ): Promise<void> {
    const stream = this.currentStream;
    if (!stream) {
      settle('natural');
      return;
    }

    // Identity check the loop uses to know "this push loop owns the
    // current track". `this.trackComplete` flips to null on settle, then
    // gets reassigned to the NEXT track's settle when run() advances. A
    // bare truthy check would let the outgoing loop see the new track's
    // settle and keep pushing the OLD PCM — which manifests as "skip
    // does nothing, queued songs never start" because LiveKit's audio
    // queue is serialized and the old loop hogs it until naturally
    // exhausted.
    const stillCurrent = (): boolean => this.trackComplete === settle;

    try {
      const decodeStart = Date.now();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) {
        if (!stillCurrent()) return;
        chunks.push(chunk as Buffer);
      }
      if (!stillCurrent()) return;
      const pcm = Buffer.concat(chunks);
      log.info(
        {
          bytes: pcm.length,
          durationSec: pcm.length / (SAMPLE_RATE * CHANNELS * BYTES_PER_SAMPLE),
          decodeMs: Date.now() - decodeStart,
        },
        'PCM decoded — starting push',
      );

      let written = 0;
      while (written < pcm.length && stillCurrent()) {
        if (this.paused) {
          await this.connection.pushFrame(SILENT_FRAME_1S);
          continue; // don't advance written while paused
        }
        const frameEnd = Math.min(written + FRAME_BYTES_1S, pcm.length);
        const frameBuf = pcm.subarray(written, frameEnd);
        const scaled = applyVolume(frameBuf, this.volume);
        await this.connection.pushFrame(bufToInt16(scaled));
        written = frameEnd;
      }

      // Drain whatever's still in LiveKit's queue before advancing —
      // otherwise we cut off the last ~1s of audio (the queue depth).
      if (stillCurrent()) {
        await this.connection.waitForPlayout();
        settle('natural');
      }
    } catch (err) {
      log.warn({ err }, 'Push loop errored — ending track');
      if (stillCurrent()) settle('natural');
    }
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
  // CRITICAL: allocate a fresh Int16Array whose `.buffer` is exactly
  // the slice's bytes — DO NOT return a view into a larger buffer.
  //
  // LiveKit's AudioFrame.protoInfo() does:
  //   `retrievePtr(new Uint8Array(this.data.buffer))`
  // which discards the Int16Array's byteOffset and points at the
  // start of the underlying ArrayBuffer. With a `subarray` view the
  // underlying ArrayBuffer is the entire concatenated PCM, so every
  // frame reads from offset 0 — meaning every captured frame is the
  // first 1 s of audio. Symptom: a long track plays the first 1–2 s
  // on loop forever, and a short track sounds "fine" only because
  // the loop wraps fast enough to feel continuous.
  //
  // Allocating a brand-new Int16Array means `out.buffer.byteLength`
  // equals `buf.byteLength` and `out.byteOffset` is 0 — LiveKit's
  // pointer points at the actual frame data, full stop.
  const out = new Int16Array(buf.byteLength / 2);
  new Uint8Array(out.buffer).set(
    new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength),
  );
  return out;
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
