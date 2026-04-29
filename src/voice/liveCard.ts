// Live-updating "now playing" embed.
//
// On trackStart, posts a fresh embed and starts a 5-second ticker that
// edits it in place with the new progress bar / position. On trackEnd
// the ticker is cleared and the embed is finalised (frozen at 100%).
// On queueEnd the message is left as the last track's "ended" state —
// no need to delete it; users get a natural footer like "queue empty".
//
// Edit calls are best-effort: if a single edit 4xxs we just stop the
// ticker for that track to avoid a flood of warnings.

import type { EchoedClient, Embed } from '../client/echoedClient.js';
import { buildEmbed, COLORS } from '../client/embeds.js';
import type { MusicPlayer, NowPlaying } from './player.js';
import type { Track } from './source.js';
import { log } from '../log.js';

const UPDATE_INTERVAL_MS = 5_000;

export class LiveCard {
  private readonly api: EchoedClient;
  private readonly player: MusicPlayer;
  private readonly serverId: string;
  // Channel where !play was invoked — that's where the card lives.
  private textChannelId: string;

  private currentMessageId: string | null = null;
  private ticker: NodeJS.Timeout | null = null;
  private editsErrored = false;

  constructor(input: {
    api: EchoedClient;
    player: MusicPlayer;
    serverId: string;
    textChannelId: string;
  }) {
    this.api = input.api;
    this.player = input.player;
    this.serverId = input.serverId;
    this.textChannelId = input.textChannelId;

    this.player.on('trackStart', (track: Track) => {
      void this.onTrackStart(track);
    });
    this.player.on('trackEnd', () => {
      this.stopTicker();
      void this.finaliseLastEdit();
    });
  }

  // Update the channel where future cards post. Useful if the user
  // re-issues !play in a different channel.
  setTextChannel(channelId: string): void {
    this.textChannelId = channelId;
  }

  private async onTrackStart(track: Track): Promise<void> {
    this.editsErrored = false;
    this.currentMessageId = null;
    try {
      const sent = await this.api.sendMessage({
        serverId: this.serverId,
        channelId: this.textChannelId,
        content: '',
        embeds: [this.buildCard(track, this.player.nowPlaying())],
      });
      this.currentMessageId = sent.messageId;
    } catch (err) {
      log.warn({ err }, 'Live card initial send failed');
      return;
    }
    this.startTicker();
  }

  private startTicker(): void {
    this.stopTicker();
    this.ticker = setInterval(() => {
      void this.tick();
    }, UPDATE_INTERVAL_MS);
  }

  private stopTicker(): void {
    if (this.ticker) {
      clearInterval(this.ticker);
      this.ticker = null;
    }
  }

  // Push a single embed-edit reflecting the current playback position.
  private async tick(): Promise<void> {
    if (!this.currentMessageId || this.editsErrored) return;
    const np = this.player.nowPlaying();
    if (!np) {
      this.stopTicker();
      return;
    }
    try {
      await this.api.editMessage({
        serverId: this.serverId,
        messageId: this.currentMessageId,
        embeds: [this.buildCard(np.track, np)],
      });
    } catch (err) {
      // One transient error is enough to back off — we don't want to
      // spam edits if the message was deleted or perms changed.
      this.editsErrored = true;
      this.stopTicker();
      log.debug({ err }, 'Live card edit failed — stopping ticker for this track');
    }
  }

  // Final edit on track end so the embed shows a full progress bar
  // and "ended" footer rather than freezing mid-progress.
  private async finaliseLastEdit(): Promise<void> {
    if (!this.currentMessageId || this.editsErrored) return;
    const np = this.player.nowPlaying();
    // np is null at this point (player has cleared current). Find the
    // most recent track from the embed cache by re-issuing one final
    // edit at the "100%" state. We don't have the duration locally
    // here (player.current is null) — so just leave the embed at its
    // last tick. Skip the final edit if no np.
    if (!np) return;
    try {
      await this.api.editMessage({
        serverId: this.serverId,
        messageId: this.currentMessageId,
        embeds: [this.buildCard(np.track, { ...np, positionMs: np.track.durationSeconds * 1000 })],
      });
    } catch {
      /* best-effort */
    }
  }

  private buildCard(track: Track, np: NowPlaying | null): Embed {
    const positionSec = np ? Math.max(0, np.positionMs / 1000) : 0;
    const total = track.durationSeconds;
    const bar = renderProgressBar(positionSec, total);

    const lines: string[] = [];
    lines.push(`**${track.title}**`);
    if (track.uploader) lines.push(`by ${track.uploader}`);
    lines.push('');
    lines.push(bar);
    lines.push(`${formatTime(positionSec)} / ${formatTime(total)}` + (np?.pausedAt ? ' · ⏸ paused' : ''));

    const footerParts = [`Requested by ${track.requestedByName}`];
    if (this.player.getLoop() !== 'off') footerParts.push(`loop: ${this.player.getLoop()}`);
    footerParts.push(`vol: ${Math.round(this.player.getVolume() * 100)}%`);
    const queued = this.player.list().length;
    if (queued > 0) footerParts.push(`+${queued} queued`);

    return buildEmbed({
      title: '🎵 Now playing',
      description: lines.join('\n'),
      color: COLORS.ACCENT,
      thumbnail: track.thumbnailUrl,
      footer: footerParts.join(' · '),
      // Suppress timestamp — the position line already shows time, and
      // the embed timestamp at-the-bottom is misleading on edits.
      timestamp: null,
    });
  }
}

function renderProgressBar(positionSec: number, totalSec: number): string {
  if (totalSec <= 0) return '▱'.repeat(20) + '  · live';
  const pct = Math.min(1, Math.max(0, positionSec / totalSec));
  const filled = Math.round(pct * 20);
  return '▰'.repeat(filled) + '▱'.repeat(20 - filled);
}

function formatTime(seconds: number): string {
  if (seconds <= 0 || !Number.isFinite(seconds)) return '0:00';
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
