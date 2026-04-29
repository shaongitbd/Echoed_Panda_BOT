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
const FRAME_DURATION_SEC = 1; // matches LiveKit's publish-wav example
const FRAME_INTERLEAVED_LEN = SAMPLE_RATE * FRAME_DURATION_SEC * CHANNELS;

export const handleTestAudio: Handler = async (ctx, svc) => {
  const session = svc.voice.get(ctx.serverId);
  if (!session) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: `Bot needs to be in a voice channel first. Join one yourself, then run \`${ctx.prefix}play\` (any URL — even one that fails) so the bot connects, then \`${ctx.prefix}stop\` to clear the queue, then run this command again.`,
    });
    return;
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

  // Wrap as Int16Array view (no copy) for AudioFrame ingestion.
  const int16 = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 2);
  log.info(
    { samples: int16.length, durationSec: int16.length / CHANNELS / SAMPLE_RATE },
    'Test WAV PCM ready',
  );

  // Push exactly like LiveKit's publish-wav: 1-second slices, await,
  // no throttle. If LiveKit's example pattern is correct, this works.
  let written = 0;
  while (written < int16.length) {
    const frameSize = Math.min(FRAME_INTERLEAVED_LEN, int16.length - written);
    const frame = int16.subarray(written, written + frameSize);
    await session.connection.pushFrame(frame);
    written += frameSize;
  }
  await session.connection.waitForPlayout();

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: '✓ Test WAV done. Did it sound like clean speech?',
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
