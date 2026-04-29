// Source resolver: takes a query (URL or search term) and returns Track
// descriptors. Each track downloads its audio to a local file (via yt-dlp,
// play-dl, or fetch), then ffmpeg reads from that file to produce 48kHz
// 16-bit stereo PCM frames.
//
// Why download-first instead of streaming:
//   - YouTube signs URLs that expire and serves HLS/segmented audio for
//     several player clients — both fragile under real-time PCM streaming.
//   - Short tracks (≈5-10 MB at opus quality) download in 2-5s on a
//     decent connection, often faster than streaming startup once you
//     factor in TLS handshakes + first-byte latency.
//   - Once the file is on disk, playback is rock-solid: no mid-stream
//     network blips, no URL expiry, no reconnect logic.
//   - Queue prefetch (player downloads the next track during current
//     playback) hides the download cost on every track after the first.
//
// Lifecycle: every Track exposes prefetch / open / cleanup. The player
// calls prefetch on lookahead, open when the track becomes current, and
// cleanup once the track is done (or removed from the queue).

import { spawn } from 'node:child_process';
import { Readable, PassThrough } from 'node:stream';
import { promises as fs } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
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
  // Eagerly download the audio to disk. Idempotent — calling multiple
  // times returns the same result. The player invokes this on the
  // next queued track during current playback so the next track's
  // file is already local by the time it becomes current.
  prefetch: () => Promise<void>;
  // Open a PCM s16le 48kHz stereo stream. Awaits the download if it
  // hasn't started or hasn't finished yet.
  open: () => Promise<{ pcm: Readable; close: () => void }>;
  // Best-effort delete of the downloaded file. Called when the track
  // is removed from the queue or finishes playback.
  cleanup: () => Promise<void>;
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

interface TrackMetadata {
  title: string;
  url: string;
  durationSeconds: number;
  thumbnailUrl?: string;
  uploader?: string;
  requestedBy: string;
  requestedByName: string;
}

// Wraps a download function in the prefetch / open / cleanup lifecycle.
// The download is memoized: prefetch and open share the same in-flight
// promise. On failure the cache is reset so a follow-up call retries
// (matters when a prefetch fails before play and we want open() to
// give it another shot).
function buildTrack(
  kind: SourceKind,
  meta: TrackMetadata,
  download: () => Promise<string>,
): Track {
  let downloadPromise: Promise<string> | null = null;
  let downloadedPath: string | null = null;

  function ensureDownloaded(): Promise<string> {
    if (!downloadPromise) {
      downloadPromise = download()
        .then((path) => {
          downloadedPath = path;
          return path;
        })
        .catch((err) => {
          downloadPromise = null;
          throw err;
        });
    }
    return downloadPromise;
  }

  return {
    kind,
    title: meta.title,
    url: meta.url,
    durationSeconds: meta.durationSeconds,
    thumbnailUrl: meta.thumbnailUrl,
    uploader: meta.uploader,
    requestedBy: meta.requestedBy,
    requestedByName: meta.requestedByName,
    prefetch: async () => {
      await ensureDownloaded();
    },
    open: async () => {
      const path = await ensureDownloaded();
      return openPcmFromFile(path);
    },
    cleanup: async () => {
      // Snapshot then reset state so a follow-up open() (e.g.
      // loop=track replaying the same Track) triggers a fresh
      // download instead of pointing at a now-deleted file.
      const promise = downloadPromise;
      const path = downloadedPath;
      downloadPromise = null;
      downloadedPath = null;
      if (!promise && !path) return;
      const finalPath = path ?? (await promise!.catch(() => null));
      if (finalPath) {
        await fs.unlink(finalPath).catch(() => {
          /* best-effort: tmpfs cleared on reboot anyway */
        });
      }
    },
  };
}

function youtubeMetaToTrack(
  m: YtDlpMeta,
  requestedBy: string,
  requestedByName: string,
): Track {
  const url = m.webpage_url ?? '';
  return buildTrack(
    'youtube',
    {
      title: m.title ?? '(untitled)',
      url,
      durationSeconds: typeof m.duration === 'number' ? m.duration : 0,
      thumbnailUrl: m.thumbnail,
      uploader: m.uploader ?? m.channel,
      requestedBy,
      requestedByName,
    },
    () => ytDlpDownload(url),
  );
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
  return buildTrack(
    'soundcloud',
    {
      title: info.name ?? '(untitled)',
      url,
      durationSeconds: info.durationInSec,
      thumbnailUrl: info.thumbnail,
      uploader: info.user?.name,
      requestedBy,
      requestedByName,
    },
    () => soundcloudDownload(url),
  );
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
  return buildTrack(
    'url',
    {
      title: filename || '(direct stream)',
      url,
      durationSeconds: 0,
      requestedBy,
      requestedByName,
    },
    () => httpDownload(url),
  );
}

// =============================================================================
// Downloaders
// =============================================================================

// Run yt-dlp's downloader and return the final path on disk. yt-dlp
// handles all the format selection, signature workarounds, HLS
// segmenting, etc. — we just point ffmpeg at the resulting file later.
async function ytDlpDownload(url: string): Promise<string> {
  const id = randomBytes(8).toString('hex');
  // %(ext)s lets yt-dlp pick the right extension (m4a / webm / opus).
  // We capture the final path via --print after_move:filepath so we
  // don't have to glob the directory.
  const outputTemplate = join(tmpdir(), `panda-yt-${id}.%(ext)s`);

  const startedAt = Date.now();
  log.info({ url }, 'Starting yt-dlp download');

  const out = await runYtDlp([
    ...ytDlpBaseArgs(),
    '-f',
    'bestaudio*/best',
    '-o',
    outputTemplate,
    '--no-progress',
    '--print',
    'after_move:filepath',
    url,
  ]);

  const path = out.trim().split('\n').pop()?.trim();
  if (!path) throw new Error('yt-dlp download produced no file path');

  const sizeBytes = await fs.stat(path).then((s) => s.size).catch(() => 0);
  log.info(
    { path, url, ms: Date.now() - startedAt, sizeKB: Math.round(sizeBytes / 1024) },
    'yt-dlp download complete',
  );
  return path;
}

// Pull a SoundCloud track via play-dl and write the bytes to a temp
// file. Same shape as ytDlpDownload — caller gets a local path.
async function soundcloudDownload(url: string): Promise<string> {
  const id = randomBytes(8).toString('hex');
  const filePath = join(tmpdir(), `panda-sc-${id}.audio`);
  const startedAt = Date.now();

  const stream = await play.stream(url);
  await new Promise<void>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.stream.on('error', reject);
    stream.stream.on('end', async () => {
      try {
        await fs.writeFile(filePath, Buffer.concat(chunks));
        resolve();
      } catch (err) {
        reject(err as Error);
      }
    });
  });

  const sizeBytes = await fs.stat(filePath).then((s) => s.size).catch(() => 0);
  log.info(
    { path: filePath, url, ms: Date.now() - startedAt, sizeKB: Math.round(sizeBytes / 1024) },
    'SoundCloud download complete',
  );
  return filePath;
}

// Direct HTTP fetch to a temp file. Used for hosted .mp3 / .m4a /
// .ogg URLs that aren't YouTube or SoundCloud.
async function httpDownload(url: string): Promise<string> {
  const id = randomBytes(8).toString('hex');
  const filePath = join(tmpdir(), `panda-http-${id}.audio`);
  const startedAt = Date.now();

  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fs.writeFile(filePath, buf);

  log.info(
    { path: filePath, url, ms: Date.now() - startedAt, sizeKB: Math.round(buf.length / 1024) },
    'Direct URL download complete',
  );
  return filePath;
}

// =============================================================================
// FFmpeg pipeline
// =============================================================================

// Read a local audio file and emit 48kHz s16le stereo PCM. ffmpeg
// auto-detects the input format. No HTTP, no reconnect, no segmenting
// — just file → pcm.
function openPcmFromFile(filePath: string): { pcm: Readable; close: () => void } {
  const ff = spawn(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      filePath,
      '-vn',
      '-f',
      's16le',
      '-acodec',
      'pcm_s16le',
      '-ar',
      '48000',
      '-ac',
      '2',
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

// =============================================================================
// yt-dlp wrapper
// =============================================================================
//
// Three entry points:
//   - ytDlpMetadata(url)  → { title, duration, thumbnail, uploader, … }
//   - ytDlpSearch(q, n)   → up to N metadata objects, ordered by relevance
//   - ytDlpDownload(url)  → local file path with the downloaded audio
//
// Cookies (config.ytDlpCookiesFile) bypass YouTube's "Sign in to
// confirm you're not a bot" wall when the bot is hitting it. Without
// cookies most public videos still work, but anything age-gated /
// region-locked / spam-flagged will fail.

function ytDlpBaseArgs(): string[] {
  // --extractor-args 'youtube:player-client=…': we still prefer mobile
  // clients (android / ios) because they tend to surface progressive
  // m4a/opus formats with smaller download sizes than the HLS
  // variants from web/tv. This matters less now that we download
  // before playback (HLS would still complete fine), but it's a free
  // bandwidth win.
  return [
    '--no-playlist',
    '--no-warnings',
    '--extractor-args',
    'youtube:player-client=android,ios,android_vr,tv,default',
  ];
  // NOTE: cookies are NOT added here — they're added per-call via a
  // throwaway temp copy. See runYtDlp for why.
}

// Run yt-dlp and collect stdout. Rejects if the process exits non-zero
// or outputs nothing on stdout.
//
// Cookies handling: yt-dlp writes back to its `--cookies` file by
// default (Netscape spec — Set-Cookie headers from the server replace
// the file on disk). When YouTube's anti-bot flags a datacenter IP
// it nukes the session by responding with Set-Cookie: SID=; max-age=0
// and we'd lose our authenticated state on the very first request.
// The fix: copy the source cookies file to a temp path per call,
// point yt-dlp at the temp copy, throw the temp copy away after.
// Source file stays pristine; yt-dlp can scribble all it wants on
// the disposable copy.
async function runYtDlp(args: string[]): Promise<string> {
  const cookiesTemp = await prepareCookiesFile();
  const fullArgs = cookiesTemp ? [...args, '--cookies', cookiesTemp] : args;

  try {
    return await new Promise<string>((resolve, reject) => {
      const proc = spawn(config.ytDlpBinary, fullArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
      let out = '';
      let err = '';
      proc.stdout.on('data', (chunk) => {
        out += String(chunk);
      });
      proc.stderr.on('data', (chunk) => {
        err += String(chunk);
      });
      proc.on('error', (e) => {
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
  } finally {
    if (cookiesTemp) {
      // Best-effort cleanup. If the unlink fails (concurrent call,
      // tmpfs full, whatever) we'd just leave a small file behind —
      // not worth surfacing as an error.
      void fs.unlink(cookiesTemp).catch(() => {});
    }
  }
}

// Build a throwaway copy of the cookies file. Returns null when no
// cookies are configured.
async function prepareCookiesFile(): Promise<string | null> {
  const src = config.ytDlpCookiesFile;
  if (!src) return null;
  try {
    const dest = join(tmpdir(), `panda-cookies-${randomBytes(6).toString('hex')}.txt`);
    await fs.copyFile(src, dest);
    return dest;
  } catch (err) {
    log.warn({ err, src }, 'Failed to copy cookies file to temp — running without cookies');
    return null;
  }
}

async function ytDlpMetadata(url: string): Promise<YtDlpMeta> {
  // --ignore-no-formats-error: yt-dlp's default format selector is
  // strict (`bv*+ba/b`) and will fail with "Requested format is not
  // available" on videos where YouTube hasn't surfaced the standard
  // adaptive formats — common for newer or region-restricted content.
  // For metadata-only calls we don't actually need a format yet; the
  // real format selection happens during ytDlpDownload at play time.
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
