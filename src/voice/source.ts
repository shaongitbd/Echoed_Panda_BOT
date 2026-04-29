// Source resolver: takes a query (URL or search term) and returns a track
// descriptor + a function that produces a 48kHz/16-bit/stereo PCM stream
// (Readable<Buffer>) ready to be chunked into AudioFrames.
//
// Two stages so callers can show "Now playing" cards immediately while
// the actual stream is opened lazily on play (saves a HEAD on queued
// items).

import { spawn } from 'node:child_process';
import { Readable, PassThrough } from 'node:stream';
import play from 'play-dl';
import { log } from '../log.js';

export type SourceKind = 'youtube' | 'soundcloud' | 'url' | 'search';

export interface Track {
  kind: SourceKind;
  title: string;
  url: string;
  durationSeconds: number;
  thumbnailUrl?: string;
  uploader?: string;
  // The user who queued this track — used for "remove your own" rules.
  requestedBy: string;
  requestedByName: string;
  // Open the actual audio stream just-in-time. Returned stream is PCM
  // s16le 48kHz stereo, ready for AudioFrame chunking.
  open: () => Promise<{ pcm: Readable; close: () => void }>;
}

const URL_RE = /^https?:\/\//i;
const YT_RE = /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)/i;
const SC_RE = /(?:soundcloud\.com)/i;

// Resolve a user-typed query into one or more Tracks. Search returns up
// to 5 candidates; URLs return exactly one.
export async function resolveQuery(
  query: string,
  requestedBy: string,
  requestedByName: string,
): Promise<Track[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  if (URL_RE.test(trimmed)) {
    if (YT_RE.test(trimmed)) {
      return [await resolveYoutubeUrl(trimmed, requestedBy, requestedByName)];
    }
    if (SC_RE.test(trimmed)) {
      return [await resolveSoundcloudUrl(trimmed, requestedBy, requestedByName)];
    }
    return [resolveDirectUrl(trimmed, requestedBy, requestedByName)];
  }

  // Plain text → YouTube search, take the top 5.
  const results = await play.search(trimmed, { source: { youtube: 'video' }, limit: 5 });
  return results.map((v) => youtubeVideoToTrack(v, requestedBy, requestedByName));
}

async function resolveYoutubeUrl(
  url: string,
  requestedBy: string,
  requestedByName: string,
): Promise<Track> {
  const info = await play.video_basic_info(url);
  return youtubeVideoToTrack(info.video_details, requestedBy, requestedByName);
}

function youtubeVideoToTrack(
  v: {
    title?: string;
    url: string;
    durationInSec: number;
    thumbnails?: { url: string }[];
    channel?: { name?: string };
  },
  requestedBy: string,
  requestedByName: string,
): Track {
  const url = v.url;
  return {
    kind: 'youtube',
    title: v.title ?? '(untitled)',
    url,
    durationSeconds: v.durationInSec,
    thumbnailUrl: v.thumbnails?.[v.thumbnails.length - 1]?.url,
    uploader: v.channel?.name,
    requestedBy,
    requestedByName,
    open: async () => {
      const stream = await play.stream(url, { quality: 2 });
      return openPcmFromCompressed(stream.stream);
    },
  };
}

async function resolveSoundcloudUrl(
  url: string,
  requestedBy: string,
  requestedByName: string,
): Promise<Track> {
  const info = (await play.soundcloud(url)) as {
    name?: string;
    durationInSec: number;
    thumbnail?: string;
    user?: { name?: string };
    permalink?: string;
  };
  return {
    kind: 'soundcloud',
    title: info.name ?? '(untitled)',
    url,
    durationSeconds: info.durationInSec,
    thumbnailUrl: info.thumbnail,
    uploader: info.user?.name,
    requestedBy,
    requestedByName,
    open: async () => {
      const stream = await play.stream(url);
      return openPcmFromCompressed(stream.stream);
    },
  };
}

// Direct URL — usually a hosted .mp3 / .m4a / .opus / .ogg file. We
// don't know the duration without probing, so we surface 0 and let the
// "now playing" card live without a progress bar.
function resolveDirectUrl(
  url: string,
  requestedBy: string,
  requestedByName: string,
): Track {
  const filename = decodeURIComponent(url.split('/').pop() ?? url).split('?')[0] ?? url;
  return {
    kind: 'url',
    title: filename || '(direct stream)',
    url,
    durationSeconds: 0,
    requestedBy,
    requestedByName,
    open: async () => {
      // ffmpeg can fetch http(s) URLs directly — keeps us off the
      // download → temp-file path entirely.
      return openPcmFromUrl(url);
    },
  };
}

// =============================================================================
// FFmpeg pipelines
// =============================================================================

// Convert a compressed audio stream (opus/webm/mp3/etc.) into 48kHz s16le
// stereo PCM. Spawns one ffmpeg subprocess and pipes input → stdin →
// transcode → stdout. The returned `close()` kills it cleanly.
function openPcmFromCompressed(input: Readable): { pcm: Readable; close: () => void } {
  const ff = spawn(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel', 'error',
      '-i', 'pipe:0',
      '-vn',                  // ignore video tracks
      '-f', 's16le',
      '-acodec', 'pcm_s16le',
      '-ar', '48000',
      '-ac', '2',
      'pipe:1',
    ],
    { stdio: ['pipe', 'pipe', 'pipe'] },
  );

  // Forward source → ffmpeg stdin. Errors on either side terminate both.
  input.pipe(ff.stdin);
  input.on('error', (err) => {
    log.warn({ err }, 'Audio source stream errored');
    ff.kill('SIGKILL');
  });
  ff.stderr.on('data', (chunk) => {
    log.debug({ ffmpeg: chunk.toString() }, 'ffmpeg stderr');
  });

  const out = new PassThrough();
  ff.stdout.pipe(out);

  return {
    pcm: out,
    close: () => {
      try {
        input.destroy();
      } catch {
        /* best-effort */
      }
      try {
        ff.kill('SIGKILL');
      } catch {
        /* best-effort */
      }
    },
  };
}

// Same shape but ffmpeg fetches the URL itself.
function openPcmFromUrl(url: string): { pcm: Readable; close: () => void } {
  const ff = spawn(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel', 'error',
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', url,
      '-vn',
      '-f', 's16le',
      '-acodec', 'pcm_s16le',
      '-ar', '48000',
      '-ac', '2',
      'pipe:1',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  );

  ff.stderr.on('data', (chunk) => {
    log.debug({ ffmpeg: chunk.toString() }, 'ffmpeg stderr');
  });

  const out = new PassThrough();
  ff.stdout.pipe(out);

  return {
    pcm: out,
    close: () => {
      try {
        ff.kill('SIGKILL');
      } catch {
        /* best-effort */
      }
    },
  };
}
