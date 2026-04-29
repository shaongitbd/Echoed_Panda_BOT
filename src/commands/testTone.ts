import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Handler } from './index.js';
import { log } from '../log.js';

// Diagnostic: pulls down a known-good 10 MB sample WAV (music),
// pipes it through ffmpeg to our 48 kHz s16le stereo target, and
// pushes to LiveKit using the publish-wav pattern (1-second frames,
// await captureFrame, no throttling). Bypasses voice/player.ts
// entirely so we isolate "is the LiveKit + ffmpeg path correct?"
// from the YouTube/yt-dlp chain.
//
// What you should hear: ~30+ seconds of music. Resampled from the
// source rate (likely 44.1 kHz) to 48 kHz by ffmpeg.
//
// Diagnostic interpretation:
//   - Crystal clear music → LiveKit + ffmpeg pipeline is fine. Bug
//     is elsewhere (yt-dlp / HLS handling).
//   - Bit-crushed / breaking → pipeline has a pacing or queue issue
//     (most likely captureFrame backpressure assumption).
//   - Chipmunked / pitch-up → sample rate mismatch somewhere.
//   - Pure noise → endianness or alignment bug.
//   - Silent → bot didn't join voice / track not published.

const TEST_WAV_URL =
  'https://file-examples.com/storage/fe1a31b04469f24d3946003/2017/11/file_example_WAV_10MG.wav';

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;

export const handleTestAudio: Handler = async (ctx, svc) => {
  // Resolve voice channel: prefer existing session, else find the
  // caller's current voice channel and join it ourselves.
  let session = svc.voice.get(ctx.serverId);
  if (!session) {
    let channelId: string | null = null;
    try {
      channelId = await svc.api.getMemberVoiceChannel(ctx.serverId, ctx.senderId);
    } catch (err) {
      log.warn({ err, userId: ctx.senderId }, 'Voice-state lookup failed');
    }
    if (!channelId) {
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: 'Join a voice channel first, then run this again.',
      });
      return;
    }
    try {
      session = await svc.voice.join(ctx.serverId, channelId, ctx.channelId);
    } catch (err) {
      log.warn({ err, channelId }, 'Voice join failed');
      await svc.api.sendMessage({
        serverId: ctx.serverId,
        channelId: ctx.channelId,
        replyToId: ctx.messageId,
        content: '❌ Couldn\'t join the voice channel. Make sure I have **Connect** + **Speak** there.',
      });
      return;
    }
  } else {
    // Already in a session — stop any active playback so the test
    // tone isn't mixed/queued behind music.
    session.player.stop();
    session.connection.clearAudioBuffer();
  }

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: `🔊 Fetching test WAV + piping through ffmpeg + pushing using LiveKit's publish-wav pattern. ~30s of music if pipeline is healthy.`,
  });

  // Cache the downloaded WAV so repeat tests don't hammer the host.
  const wavPath = join(tmpdir(), 'panda-test-sample.wav');
  try {
    await fs.access(wavPath);
  } catch {
    log.info({ url: TEST_WAV_URL }, 'Downloading test WAV');
    const res = await fetch(TEST_WAV_URL);
    if (!res.ok) {
      await replyError(ctx, svc, `Couldn't download test WAV: ${res.status}`);
      return;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(wavPath, buf);
  }

  // Convert via ffmpeg to 48 kHz stereo s16le, capture all PCM into
  // memory. ~1 MB for 5 seconds — fine to buffer.
  const pcm = await ffmpegToPcm(wavPath);
  if (!pcm) {
    await replyError(ctx, svc, 'ffmpeg conversion failed.');
    return;
  }

  log.info(
    {
      bytes: pcm.length,
      durationSec: pcm.length / (SAMPLE_RATE * CHANNELS * 2),
    },
    'Test WAV PCM ready',
  );

  // Push 1-second slices, copying each into a fresh Int16Array.
  // CRITICAL: do not pass `int16.subarray(...)` — LiveKit's
  // AudioFrame.protoInfo() reads from `data.buffer` (full ArrayBuffer)
  // ignoring byteOffset, so subarray views all point at offset 0
  // and every frame ends up being the first 1 s of audio on loop.
  // See player.ts:bufToInt16 for the same fix in the production path.
  const FRAME_BYTES = SAMPLE_RATE * CHANNELS * 2; // 192 000
  let written = 0;
  while (written < pcm.length) {
    const frameEnd = Math.min(written + FRAME_BYTES, pcm.length);
    const slice = pcm.subarray(written, frameEnd);
    const owned = new Int16Array(slice.byteLength / 2);
    new Uint8Array(owned.buffer).set(
      new Uint8Array(slice.buffer, slice.byteOffset, slice.byteLength),
    );
    await session.connection.pushFrame(owned);
    written = frameEnd;
  }
  await session.connection.waitForPlayout();

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: '✓ Test WAV done. Did the music sound clean?',
  });
};

// Run the WAV file through ffmpeg with our exact production args.
function ffmpegToPcm(wavPath: string): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const ff = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel', 'error',
        '-i', wavPath,
        '-vn',
        '-f', 's16le',
        '-acodec', 'pcm_s16le',
        '-ar', String(SAMPLE_RATE),
        '-ac', String(CHANNELS),
        'pipe:1',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const chunks: Buffer[] = [];
    ff.stdout.on('data', (c: Buffer) => chunks.push(c));
    ff.stderr.on('data', (c: Buffer) => {
      log.debug({ ffmpeg: c.toString() }, 'ffmpeg test stderr');
    });
    ff.on('error', (err) => {
      log.warn({ err }, 'ffmpeg spawn failed');
      resolve(null);
    });
    ff.on('close', (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

async function replyError(
  ctx: Parameters<Handler>[0],
  svc: Parameters<Handler>[1],
  msg: string,
): Promise<void> {
  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    replyToId: ctx.messageId,
    content: `❌ ${msg}`,
  });
}
