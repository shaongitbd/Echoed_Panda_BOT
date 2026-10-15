import { spawn } from 'node:child_process';
import type { Handler } from './index.js';
import { log } from '../log.js';

// Diagnostic: has ffmpeg generate a known-good test chord as our
// 48 kHz s16le stereo target, and
// pushes to LiveKit using the publish-wav pattern (1-second frames,
// await captureFrame, no throttling). Bypasses voice/player.ts
// entirely so we isolate "is the LiveKit + ffmpeg path correct?"
// from the YouTube/yt-dlp chain.
//
// What you should hear: a steady 12-second chord.
//
// Diagnostic interpretation:
//   - A clean chord → LiveKit + ffmpeg pipeline is fine. Bug
//     is elsewhere (yt-dlp / HLS handling).
//   - Bit-crushed / breaking → pipeline has a pacing or queue issue
//     (most likely captureFrame backpressure assumption).
//   - Chipmunked / pitch-up → sample rate mismatch somewhere.
//   - Pure noise → endianness or alignment bug.
//   - Silent → bot didn't join voice / track not published.

// The test sound is made by ffmpeg on the spot — a C-major chord for 12 s —
// instead of downloaded. It used to fetch a sample WAV from a third-party
// site; that file went away (404), and a diagnostic that depends on someone
// else's URL fails exactly when you need it. A held chord still shows every
// fault listed above: crackle, pitch, noise or silence.
const TEST_SOURCE = [
  '-f', 'lavfi',
  '-i', 'aevalsrc=0.2*sin(2*PI*261.63*t)+0.2*sin(2*PI*329.63*t)+0.2*sin(2*PI*392*t):s=48000:d=12',
];

const SAMPLE_RATE = 48_000;
const CHANNELS = 2;

export const handleTestAudio: Handler = async (ctx, svc) => {
  // This is a diagnostic, not a member-facing feature: it bypasses every
  // music scope restriction, and can interrupt playback. Gate it like the
  // other server-config commands.
  if (!(await svc.perms.has(ctx.serverId, ctx.senderId, 'MANAGE_SERVER'))) {
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content: 'You need the **Manage Server** permission to run the audio diagnostic.',
    });
    return;
  }

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
  } else if (session.player.nowPlaying() || session.player.list().length > 0) {
    // Refuse rather than interrupt. Running this used to stop playback
    // and clear the queue outright, so a diagnostic wiped whatever the
    // server had lined up with no warning and no way to restore it.
    await svc.api.sendMessage({
      serverId: ctx.serverId,
      channelId: ctx.channelId,
      replyToId: ctx.messageId,
      content:
        "I'm playing something right now — the audio test would stop it and clear the queue. Stop playback first if you really want to run it.",
    });
    return;
  }

  await svc.api.sendMessage({
    serverId: ctx.serverId,
    channelId: ctx.channelId,
    content: `🔊 Playing a 12-second test chord through ffmpeg and into voice (no YouTube involved). You should hear a steady, clean chord.`,
  });

  // Generate via ffmpeg as 48 kHz stereo s16le, captured into memory —
  // ~2.3 MB for 12 seconds, fine to buffer.
  const pcm = await ffmpegToPcm(TEST_SOURCE);
  if (!pcm) {
    await replyError(ctx, svc, 'ffmpeg conversion failed.');
    return;
  }

  log.info(
    {
      bytes: pcm.length,
      durationSec: pcm.length / (SAMPLE_RATE * CHANNELS * 2),
    },
    'Test chord PCM ready',
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
    content: '✓ Test chord done. Did you hear it, and was it clean?',
  });
};

// Run the test source through ffmpeg with our production output args.
function ffmpegToPcm(input: string[]): Promise<Buffer | null> {
  return new Promise((resolve) => {
    const ff = spawn(
      'ffmpeg',
      [
        '-hide_banner',
        '-loglevel', 'error',
        ...input,
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
