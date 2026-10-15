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
  // The "Searching… / Getting it ready…" message !play posted for this
  // track. The live card turns it into the now-playing card (or the error)
  // instead of posting a second message; cleared once used.
  announceMessageId?: string;
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
  const entries = await ytDlpSearch(trimmed, 5);
  return entries.map((e) => youtubeMetaToTrack(e.meta, requestedBy, requestedByName));
}

async function resolveYoutubeUrl(
  url: string,
  requestedBy: string,
  requestedByName: string,
): Promise<Track> {
  const { meta, infoJsonPath } = await ytDlpMetadata(url);
  return youtubeMetaToTrack(meta, requestedBy, requestedByName, infoJsonPath);
}

interface YtDlpMeta {
  title?: string;
  duration?: number;
  webpage_url?: string;
  thumbnail?: string;
  uploader?: string;
  channel?: string;
  // A flat search entry (--flat-playlist) carries these instead of
  // webpage_url / thumbnail.
  url?: string;
  thumbnails?: { url?: string }[];
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
  // The gain that brings this file to the target loudness, measured once
  // when it lands on disk (see measureGainDb) — so a prefetched track is
  // measured during the previous one.
  let gainDb = 0;

  function ensureDownloaded(): Promise<string> {
    if (!downloadPromise) {
      downloadPromise = download()
        .then(async (path) => {
          gainDb = await measureGainDb(path, meta.durationSeconds);
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
      return openPcmFromFile(path, gainDb);
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
  infoJsonPath?: string,
): Track {
  const url = m.webpage_url ?? m.url ?? '';
  const track = buildTrack(
    'youtube',
    {
      title: m.title ?? '(untitled)',
      url,
      durationSeconds: typeof m.duration === 'number' ? m.duration : 0,
      // Flat entries list thumbnails smallest first; take the largest.
      thumbnailUrl: m.thumbnail ?? m.thumbnails?.[m.thumbnails.length - 1]?.url,
      uploader: m.uploader ?? m.channel,
      requestedBy,
      requestedByName,
    },
    () => ytDlpDownload(url, infoJsonPath),
  );
  // Hook the info-json into the track's cleanup chain so the
  // metadata file gets removed alongside the audio file.
  if (infoJsonPath) {
    const origCleanup = track.cleanup;
    track.cleanup = async () => {
      await origCleanup();
      await fs.unlink(infoJsonPath).catch(() => {});
    };
  }
  return track;
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
//
// `infoJsonPath` is the cached metadata from a prior ytDlpMetadata
// call. Passed via --load-info-json, it skips info re-extraction
// entirely (the player-client probe + signature solve costs ~2–5 s
// per call). When absent we fall back to extracting from the URL.
async function ytDlpDownload(url: string, infoJsonPath?: string): Promise<string> {
  const id = randomBytes(8).toString('hex');
  // %(ext)s lets yt-dlp pick the right extension (m4a / webm / opus).
  // We capture the final path via --print after_move:filepath so we
  // don't have to glob the directory.
  const outputTemplate = join(tmpdir(), `panda-yt-${id}.%(ext)s`);

  const startedAt = Date.now();
  log.info({ url, hasCache: Boolean(infoJsonPath) }, 'Starting yt-dlp download');

  // --load-info-json takes a JSON dict, not a URL, so the positional
  // arg is omitted in that branch. Falling back to URL when the JSON
  // is missing (or got reaped by /tmp cleanup) keeps long-queued
  // tracks playable.
  const sourceArgs: string[] = [];
  let useInfoJson = false;
  if (infoJsonPath) {
    try {
      // The metadata step runs with --ignore-no-formats-error, so its JSON
      // can hold no formats at all. Replaying that can only fail ("No video
      // formats found!"); extract afresh from the URL instead.
      const cached = JSON.parse(await fs.readFile(infoJsonPath, 'utf8')) as { formats?: unknown[] };
      if (Array.isArray(cached.formats) && cached.formats.length > 0) {
        sourceArgs.push('--load-info-json', infoJsonPath);
        useInfoJson = true;
      }
    } catch {
      // Cached info-json gone or unreadable — fall through to URL.
    }
  }
  if (!useInfoJson) sourceArgs.push(url);

  const out = await runYtDlp([
    ...ytDlpBaseArgs(),
    // Format priority — best available audio-only.
    //
    // LiveKit now transmits at 128 kbps Opus (music-quality), so the
    // source needs comparable headroom. Each transcode hop loses
    // information, and a 70 kbps source fed into a 128 kbps encoder
    // sounds dull — there's nothing for the encoder to preserve.
    // Targeting itag 251 (160 kbps Opus) keeps the source above the
    // transmit rate so the final Opus encode has room to breathe.
    //
    // Fallback chain widens progressively:
    //   1. opus audio-only        (typical: itag 251 ≈ 160 kbps)
    //   2. m4a audio-only         (typical: itag 140 ≈ 128 kbps)
    //   3. any audio-only
    //   4. anything-with-audio    (combined formats — last resort)
    //   5. any best               (truly anything that decodes)
    '-f',
    'bestaudio[acodec=opus]/bestaudio[ext=m4a]/bestaudio/bestaudio*/best',
    '-o',
    outputTemplate,
    '--no-progress',
    '--print',
    'after_move:filepath',
    ...sourceArgs,
  ]);

  const path = out.trim().split('\n').pop()?.trim();
  if (!path) throw new Error('yt-dlp download produced no file path');

  const sizeBytes = await fs.stat(path).then((s) => s.size).catch(() => 0);
  log.info(
    {
      path,
      url,
      ms: Date.now() - startedAt,
      sizeKB: Math.round(sizeBytes / 1024),
      cached: useInfoJson,
    },
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

// Ceiling on a direct-URL download. Any member who can use the music
// commands can hand us an arbitrary URL, so this has to be bounded — the
// previous version read the whole response into memory with no limit at
// all, which is a one-line way for anyone to exhaust the process.
const MAX_DIRECT_DOWNLOAD_BYTES = 100 * 1024 * 1024;
const DIRECT_DOWNLOAD_TIMEOUT_MS = 120_000;

// Reject anything pointed at the host itself or at a private network:
// a member-supplied URL must not be usable to reach things that are only
// reachable from where this process runs.
function isDisallowedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.internal')) return true;
  // IPv6 loopback / link-local / unique-local.
  if (h === '::1' || h.startsWith('fe80:') || h.startsWith('fc') || h.startsWith('fd')) return true;
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (a === 127 || a === 0 || a === 10) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a >= 224) return true; // multicast / reserved
  return false;
}

function assertAllowedUrl(raw: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('That URL is not valid.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http and https URLs are supported.');
  }
  if (isDisallowedHost(parsed.hostname)) {
    throw new Error('That URL points somewhere I will not fetch from.');
  }
  return parsed;
}

// Direct HTTP fetch to a temp file. Used for hosted .mp3 / .m4a /
// .ogg URLs that aren't YouTube or SoundCloud.
//
// Streams to disk with a running byte count rather than buffering the
// response. The cap is enforced on bytes actually received — a
// Content-Length header is supplied by the remote end and can simply be
// absent or wrong, so it can't be the thing we rely on.
async function httpDownload(url: string): Promise<string> {
  assertAllowedUrl(url);

  const id = randomBytes(8).toString('hex');
  const filePath = join(tmpdir(), `panda-http-${id}.audio`);
  const startedAt = Date.now();

  const res = await fetch(url, {
    signal: AbortSignal.timeout(DIRECT_DOWNLOAD_TIMEOUT_MS),
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  // Redirects are followed above, so re-check where we actually landed.
  assertAllowedUrl(res.url || url);
  if (!res.body) throw new Error('Empty response body');

  let received = 0;
  const handle = await fs.open(filePath, 'w');
  try {
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
      received += chunk.length;
      if (received > MAX_DIRECT_DOWNLOAD_BYTES) {
        throw new Error(
          `That file is larger than the ${Math.round(MAX_DIRECT_DOWNLOAD_BYTES / 1048576)} MB limit.`,
        );
      }
      await handle.write(chunk);
    }
  } catch (err) {
    await handle.close().catch(() => undefined);
    await fs.unlink(filePath).catch(() => undefined);
    throw err;
  }
  await handle.close();

  log.info(
    { path: filePath, url, ms: Date.now() - startedAt, sizeKB: Math.round(received / 1024) },
    'Direct URL download complete',
  );
  return filePath;
}

// =============================================================================
// FFmpeg pipeline
// =============================================================================

const TARGET_LUFS = -14;
// Highest true peak the gain may push a track to. Headroom below 0 dBTP
// keeps the downstream Opus encode from clipping between samples.
const PEAK_CEILING_DBTP = -1.5;
// Never boost a quiet track by more than this — past it, its own noise
// floor comes up with it.
const MAX_BOOST_DB = 12;
const MEASURE_TIMEOUT_MS = 60_000;
// Songs longer than this are measured from three windows rather than whole.
const SAMPLE_WINDOW_SECONDS = 20;
const SAMPLE_ABOVE_SECONDS = 90;
// Windows can miss a song's loudest moment, so a BOOST from a sampled
// measurement keeps this much more headroom. (A cut can't clip.)
const SAMPLED_PEAK_MARGIN_DB = 2;

interface Loudness { integrated: number; truePeak: number }

// One ebur128 pass over the file, or over [start, start + window).
function runEbur128(filePath: string, start: number | null): Promise<Loudness | null> {
  return new Promise((resolve) => {
    const window = start === null ? [] : ['-ss', String(start), '-t', String(SAMPLE_WINDOW_SECONDS)];
    // framelog=verbose: the per-frame readings go to a level we don't
    // print; the summary is still logged at info.
    const ff = spawn(
      'ffmpeg',
      ['-hide_banner', '-nostats', ...window, '-i', filePath, '-vn', '-af', 'ebur128=peak=true:framelog=verbose', '-f', 'null', '-'],
      { stdio: ['ignore', 'ignore', 'pipe'] },
    );
    let err = '';
    ff.stderr.on('data', (chunk) => {
      err += String(chunk);
      if (err.length > 64_000) err = err.slice(-16_000); // only the summary matters
    });
    const timer = setTimeout(() => ff.kill('SIGKILL'), MEASURE_TIMEOUT_MS);
    ff.on('error', () => { clearTimeout(timer); resolve(null); });
    ff.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) { resolve(null); return; }
      const summary = err.slice(err.lastIndexOf('Summary:'));
      resolve({
        integrated: Number(/I:\s+(-?[\d.]+) LUFS/.exec(summary)?.[1]),
        truePeak: Number(/Peak:\s+(-?[\d.]+) dBFS/.exec(summary)?.[1]),
      });
    });
  });
}

// Measure a file's integrated loudness (EBU R128) and true peak, and return
// the single gain that brings it to TARGET_LUFS without its peak passing
// PEAK_CEILING_DBTP. It runs when the download finishes — for every queued
// track after the first, while the previous one plays; for the first, it is
// part of the wait before music starts. Measuring decodes the audio, and a
// whole song took ~3 s to decode, so a song over SAMPLE_ABOVE_SECONDS is
// measured from three windows (early, middle, late — in parallel) instead:
// a fraction of the decoding, with extra headroom on any boost for the peak
// the windows might miss. Any failure means 0 dB — the track plays as
// published rather than not at all.
async function measureGainDb(filePath: string, durationSeconds: number): Promise<number> {
  const startedAt = Date.now();
  const sampled = durationSeconds > SAMPLE_ABOVE_SECONDS;
  const starts = sampled ? [0.12, 0.48, 0.8].map((f) => Math.floor(durationSeconds * f)) : [null];
  const results = (await Promise.all(starts.map((s) => runEbur128(filePath, s)))).filter(
    (r): r is Loudness => r !== null,
  );
  // Silence measures as -70 LUFS (the gate floor); nothing to normalise.
  const audible = results.filter((r) => Number.isFinite(r.integrated) && r.integrated > -69);
  if (audible.length === 0) {
    if (results.length === 0) log.warn({ filePath }, 'Loudness measurement failed — playing without gain');
    return 0;
  }
  // Combine the windows by energy, not by averaging dB values.
  const integrated =
    10 * Math.log10(audible.reduce((sum, r) => sum + 10 ** (r.integrated / 10), 0) / audible.length);
  const peaks = results.map((r) => r.truePeak).filter(Number.isFinite);
  const truePeak = peaks.length > 0 ? Math.max(...peaks) : NaN;

  let gain = TARGET_LUFS - integrated;
  if (Number.isFinite(truePeak)) {
    gain = Math.min(gain, PEAK_CEILING_DBTP - truePeak - (sampled ? SAMPLED_PEAK_MARGIN_DB : 0));
  } else {
    gain = Math.min(gain, 0); // no peak reading: never boost blind
  }
  gain = Math.min(gain, MAX_BOOST_DB);
  log.info(
    { filePath, integrated: Number(integrated.toFixed(1)), truePeak, sampled, gainDb: Number(gain.toFixed(2)), ms: Date.now() - startedAt },
    'Loudness measured',
  );
  return gain;
}

// Read a local audio file and emit 48kHz s16le stereo PCM. ffmpeg
// auto-detects the input format. No HTTP, no reconnect, no segmenting
// — just file → pcm.
//
// Loudness: every track is brought to -14 LUFS (the streaming-platform
// standard used by Spotify, YouTube, Apple Music) so members are not
// chasing !volume between a quiet podcast and a mastered pop song — but
// by ONE fixed gain per track (`gainDb`, measured by measureGainDb), not
// by single-pass `loudnorm`. That filter was used here before; in one
// pass it can only guess, so it rides the level continuously like an
// automatic gain control — squashing the difference between quiet and
// loud passages and dulling every drum hit. A constant gain keeps the
// music's own dynamics exactly as mastered.
function openPcmFromFile(filePath: string, gainDb: number): { pcm: Readable; close: () => void } {
  const ff = spawn(
    'ffmpeg',
    [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      filePath,
      '-vn',
      ...(gainDb !== 0 ? ['-af', `volume=${gainDb.toFixed(2)}dB`] : []),
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
  // No --extractor-args player-client list: yt-dlp's own default clients
  // are re-chosen every release to whatever YouTube currently serves. The
  // list we forced (android, ios, android_vr, tv) went stale — YouTube now
  // returns android/ios formats without URLs ("SABR-only") and android_vr
  // wants a PO token — and on the server that ended in "No video formats
  // found!" for ordinary videos.
  //
  // No --no-warnings either: those warnings are what explain a failure
  // (missing JS runtime, SABR, PO token), and they were being thrown away.
  return ['--no-playlist'];
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
          // The ERROR lines say what failed; with warnings no longer
          // suppressed, the last few lines could otherwise be warnings.
          const lines = err.trim().split('\n');
          const errors = lines.filter((l) => l.startsWith('ERROR'));
          const stderrSummary = (errors.length ? errors : lines).slice(-3).join(' | ');
          if (lines.length > errors.length) {
            log.warn({ stderr: lines.slice(-12).join('\n') }, 'yt-dlp stderr');
          }
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

async function ytDlpMetadata(
  url: string,
): Promise<{ meta: YtDlpMeta; infoJsonPath: string }> {
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
  const meta = JSON.parse(out) as YtDlpMeta;
  // Persist the full info dict so ytDlpDownload can replay it via
  // --load-info-json instead of re-extracting (skips player-client
  // probe + signature solve, ~2–5 s per track).
  const infoJsonPath = join(tmpdir(), `panda-info-${randomBytes(8).toString('hex')}.json`);
  await fs.writeFile(infoJsonPath, out);
  return { meta, infoJsonPath };
}

async function ytDlpSearch(
  query: string,
  limit: number,
): Promise<{ meta: YtDlpMeta }[]> {
  // --flat-playlist: the result LIST only — id, title, duration, channel,
  // watch URL and thumbnails, from one search request. Without it yt-dlp
  // fully extracted every result (player clients, signature/JS challenge)
  // before answering: 7.4 s for five hits vs 1.4 s flat, measured on the
  // same query, and four of the five were thrown away. The track that
  // actually plays is extracted once, by its download.
  const out = await runYtDlp([
    ...ytDlpBaseArgs(),
    '-J',
    '--flat-playlist',
    `ytsearch${limit}:${query}`,
  ]);
  const parsed = JSON.parse(out) as { entries?: (YtDlpMeta | null)[] };
  const entries = (parsed.entries ?? []).filter((e): e is YtDlpMeta => e !== null);
  return entries.map((meta) => ({ meta }));
}
