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

// How much decoded audio to keep ahead of playback. Enough that ffmpeg
// hiccups and network jitter never starve the push loop, small enough
// that a session's memory is a few megabytes rather than the whole track.
// At 192 KB per second of audio, 25 s is about 4.8 MB.
const READAHEAD_HIGH_BYTES = 25 * FRAME_BYTES_1S;
const READAHEAD_LOW_BYTES = 10 * FRAME_BYTES_1S;

// Bounded producer/consumer buffer over the decoder's output.
//
// The decoder runs faster than realtime, so without a bound it races to
// the end of the track and holds all of it in memory. This pauses the
// source once the buffer is full and resumes it as the push loop drains,
// which keeps a session's footprint flat no matter how long the track is.
class PcmReadAhead {
  private chunks: Buffer[] = [];
  private bytes = 0;
  private ended = false;
  private failure: Error | null = null;
  private wake: (() => void) | null = null;
  private paused = false;

  constructor(
    private readonly stream: NodeJS.ReadableStream,
    private readonly high: number,
    private readonly low: number,
  ) {
    stream.on('data', (chunk: Buffer) => {
      this.chunks.push(chunk);
      this.bytes += chunk.length;
      this.signal();
      if (!this.paused && this.bytes >= this.high) {
        this.paused = true;
        stream.pause();
      }
    });
    stream.on('end', () => {
      this.ended = true;
      this.signal();
    });
    stream.on('error', (err: Error) => {
      this.failure = err;
      this.ended = true;
      this.signal();
    });
  }

  private signal(): void {
    const w = this.wake;
    this.wake = null;
    w?.();
  }

  // Resolve with up to `n` bytes. Waits for the decoder when the buffer is
  // short, and returns null once the stream has ended and drained. Only
  // the push loop reads, so a single waiter slot is enough.
  async read(n: number): Promise<Buffer | null> {
    while (this.bytes < n && !this.ended) {
      await new Promise<void>((resolve) => {
        this.wake = resolve;
      });
    }
    if (this.failure) throw this.failure;
    if (this.bytes === 0) return null;

    const want = Math.min(n, this.bytes);
    const out = Buffer.allocUnsafe(want);
    let filled = 0;
    while (filled < want) {
      const head = this.chunks[0]!;
      const take = Math.min(head.length, want - filled);
      head.copy(out, filled, 0, take);
      filled += take;
      if (take === head.length) this.chunks.shift();
      else this.chunks[0] = head.subarray(take);
    }
    this.bytes -= want;

    if (this.paused && this.bytes < this.low) {
      this.paused = false;
      this.stream.resume();
    }
    return out;
  }
}


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
  // The track that just finished naturally, kept so loop=track can
  // repeat it after `current` has been cleared.
  private lastPlayed: Track | null = null;
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
      let endCause: 'natural' | 'skipped' | 'stopped' | 'error' = 'error';
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
        endCause = cause;
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
        // Remember the finished track separately. `current` has to be
        // cleared here, but pickNext() consults it for loop=track on the
        // very next iteration — so reading it there always saw null and
        // looping a single track silently did nothing. Only a natural end
        // repeats; skipping should still advance.
        this.lastPlayed = endCause === 'natural' ? next : null;
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
    // Drop the loop-repeat candidate too, so a stop under loop=track
    // doesn't resurrect the track on the next run().
    this.lastPlayed = null;
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
    const repeat = this.current ?? this.lastPlayed;
    if (this.loop === 'track' && repeat) return repeat;
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

  // Read-ahead push loop:
  //   1. Decode ffmpeg's stdout into a bounded read-ahead buffer. The
  //      producer pauses once the buffer is full and resumes as the push
  //      loop drains it, so memory stays flat regardless of track length.
  //   2. Push 1-second frames, awaiting captureFrame on each. The native
  //      AudioSource has its own queue cap (1 s by default); captureFrame
  //      blocks at the FFI level when the queue is full, which is the only
  //      pacing we need. No manual gate / poll.
  //
  // The frame size and the awaited push are load-bearing and must not
  // change. An earlier design used 100 ms frames, a for-await over
  // ffmpeg stdout, and a manual polling queue gate; small frames plus
  // bursty stdout plus a polling gate fight each other and produce
  // micro-stalls that sound like bit-crushed or robotic audio. What
  // changed here is only how much is held in memory at once: this used
  // to drain the ENTIRE track into one Buffer before pushing a single
  // frame, which is ~11.5 MB per minute of audio — around 46 MB for a
  // four-minute track, transiently double that while concatenating.
  // Across enough servers playing at once that is the whole process, and
  // this bot is one process for every server it serves.
  //
  // Pause handling: push 1 s of silence per frame instead of draining the
  // buffer, so the queue stays primed.
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
      const readAhead = new PcmReadAhead(stream, READAHEAD_HIGH_BYTES, READAHEAD_LOW_BYTES);

      while (stillCurrent()) {
        if (this.paused) {
          await this.connection.pushFrame(SILENT_FRAME_1S);
          continue; // don't consume audio while paused
        }
        const frameBuf = await readAhead.read(FRAME_BYTES_1S);
        if (!frameBuf) break; // decoder finished and the buffer is drained
        if (!stillCurrent()) return;
        const scaled = applyVolume(frameBuf, this.volume);
        await this.connection.pushFrame(bufToInt16(scaled));
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
