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
import { config } from '../config.js';
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

  // Plain text → yt-dlp search, take the top 5. We used to use
  // play-dl for this, but YouTube's anti-scrape now blocks it ("Sign
  // in to confirm you're not a bot"); yt-dlp actively maintains the
  // signature workaround + supports cookies for accounts that hit
  // the prompt anyway.
  const metas = await ytDlpSearch(trimmed, 5);
  return metas.map((m) => youtubeMetaToTrack(m, requestedBy, requestedByName));
}

async function resolveYoutubeUrl(
  url: string,
  requestedBy: string,
  requestedByName: string,
): Promise<Track> {
  const meta = await ytDlpMetadata(url);
  return youtubeMetaToTrack(meta, requestedBy, requestedByName);
}

interface YtDlpMeta {
  title?: string;
  duration?: number;
  webpage_url?: string;
  thumbnail?: string;
  uploader?: string;
  channel?: string;
}

function youtubeMetaToTrack(
  m: YtDlpMeta,
  requestedBy: string,
  requestedByName: string,
): Track {
  const url = m.webpage_url ?? '';
  return {
    kind: 'youtube',
    title: m.title ?? '(untitled)',
    url,
    durationSeconds: typeof m.duration === 'number' ? m.duration : 0,
    thumbnailUrl: m.thumbnail,
    uploader: m.uploader ?? m.channel,
    requestedBy,
    requestedByName,
    open: async () => {
      // Resolve the direct stream URL just-in-time — these expire
      // (~6h) so we can't cache them at queue-time. ffmpeg pulls the
      // resolved URL with reconnect-on-error.
      const directUrl = await ytDlpStreamUrl(url || (m.webpage_url ?? ''));
      return openPcmFromUrl(directUrl);
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

// =============================================================================
// yt-dlp wrapper
// =============================================================================
//
// Three entry points:
//   - ytDlpMetadata(url)  → { title, duration, thumbnail, uploader, … }
//   - ytDlpSearch(q, n)   → up to N metadata objects, ordered by relevance
//   - ytDlpStreamUrl(url) → expiring direct audio URL ffmpeg can pull
//
// Cookies (config.ytDlpCookiesFile) bypass YouTube's "Sign in to
// confirm you're not a bot" wall when the bot is hitting it. Without
// cookies most public videos still work, but anything age-gated /
// region-locked / spam-flagged will fail.

function ytDlpBaseArgs(): string[] {
  // --extractor-args 'youtube:player-client=…': force yt-dlp through
  // YouTube clients that work without a JavaScript runtime. With the
  // default selector + cookies loaded, yt-dlp prefers the `web`
  // client; that client requires deno (or another JS runtime) on the
  // host to deobfuscate signed URLs, and our container only has
  // node. android_vr / tv use a server-side signature flow that
  // doesn't need JS, so they keep working in headless containers.
  // Listing multiple clients lets yt-dlp fall back if YouTube blocks
  // any single one.
  const args: string[] = [
    '--no-playlist',
    '--no-warnings',
    '--extractor-args',
    'youtube:player-client=default,android_vr,tv,android,ios',
  ];
  if (config.ytDlpCookiesFile) {
    args.push('--cookies', config.ytDlpCookiesFile);
  }
  return args;
}

// Run yt-dlp and collect stdout. Rejects if the process exits non-zero
// or outputs nothing on stdout. stderr is logged at debug level so we
// can diagnose YouTube changes without spamming the console.
function runYtDlp(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(config.ytDlpBinary, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    proc.stdout.on('data', (chunk) => {
      out += String(chunk);
    });
    proc.stderr.on('data', (chunk) => {
      err += String(chunk);
    });
    proc.on('error', (e) => {
      // ENOENT means yt-dlp isn't on PATH — surface a clear hint.
      const message =
        (e as NodeJS.ErrnoException).code === 'ENOENT'
          ? `yt-dlp binary not found (looked for "${config.ytDlpBinary}"). Install it (apt: yt-dlp / pip: yt-dlp) or set YTDLP_BINARY.`
          : e.message;
      reject(new Error(message));
    });
    proc.on('close', (code) => {
      if (code === 0 && out.trim()) {
        resolve(out);
      } else {
        const stderrSummary = err.trim().split('\n').slice(-3).join(' | ');
        reject(new Error(`yt-dlp exited ${code}: ${stderrSummary || 'no output'}`));
      }
    });
  });
}

async function ytDlpMetadata(url: string): Promise<YtDlpMeta> {
  // --ignore-no-formats-error: yt-dlp's default format selector is
  // strict (`bv*+ba/b`) and will fail with "Requested format is not
  // available" on videos where YouTube hasn't surfaced the standard
  // adaptive formats — common for newer or region-restricted content.
  // For metadata-only calls we don't actually need a format yet; the
  // real format selection happens in ytDlpStreamUrl at play time.
  const out = await runYtDlp([
    ...ytDlpBaseArgs(),
    '-J',
    '--skip-download',
    '--ignore-no-formats-error',
    url,
  ]);
  return JSON.parse(out) as YtDlpMeta;
}

async function ytDlpSearch(query: string, limit: number): Promise<YtDlpMeta[]> {
  // ytsearch5:<query> returns up to 5 hits. Same format-error
  // suppression as ytDlpMetadata — search hits the same default
  // format selector and would otherwise fail on any single
  // unavailable result, which kills the whole search.
  const out = await runYtDlp([
    ...ytDlpBaseArgs(),
    '-J',
    '--skip-download',
    '--ignore-no-formats-error',
    `ytsearch${limit}:${query}`,
  ]);
  const parsed = JSON.parse(out) as { entries?: (YtDlpMeta | null)[] };
  // --ignore-errors / no-formats-error can leave nulls in entries
  // when a single result fails — drop them.
  return (parsed.entries ?? []).filter((e): e is YtDlpMeta => e !== null);
}

async function ytDlpStreamUrl(url: string): Promise<string> {
  // bestaudio*: matches any format that contains audio, including DASH
  //   segments and combined audio+video. More permissive than
  //   `bestaudio` (which only matches strictly "audio-only" formats),
  //   so it survives YouTube's recent format-list shifts.
  // /best: final fallback — combined progressive stream. Always exists
  //   on every public video.
  const out = await runYtDlp([
    ...ytDlpBaseArgs(),
    '-f',
    'bestaudio*/best',
    '-g',
    url,
  ]);
  // -g prints the chosen format's direct URL; with multi-stream
  // formats it can print 2 lines (audio + video) — we want the
  // audio one, which is usually the last for our format selector.
  const lines = out.trim().split('\n').filter(Boolean);
  const last = lines[lines.length - 1];
  if (!last) throw new Error('yt-dlp returned no stream URL');
  return last;
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
