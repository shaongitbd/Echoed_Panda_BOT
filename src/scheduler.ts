import type { EchoedClient } from './client/echoedClient.js';
import { reminderTick } from './reminders/tick.js';
import { giveawayTick } from './giveaways/tick.js';
import { tempChannelTick } from './tempChannels/tick.js';
import { statTick } from './stats/tick.js';
import { redditTick } from './reddit/tick.js';
import { twitchTick } from './twitch/tick.js';
import { youtubeTick } from './youtube/tick.js';
import { schedMsgTick } from './schedMsg/tick.js';
import { log } from './log.js';

// Base tick cadence. Slower-cadence tasks fire every N base ticks
// so the whole scheduler stays in one place rather than fanning out
// into several setIntervals.
const TICK_INTERVAL_MS = 15_000;

// Run every 60s (4 base ticks). Server populations don't shift fast
// enough to need more, and channel renames are rate-limited.
const STATS_EVERY_N_TICKS = 4;

// Run every 5 min (20 base ticks). Reddit's ToS asks for ≤1 req/sec
// per source; we batch by subreddit so this is well within bounds.
const REDDIT_EVERY_N_TICKS = 20;

let timer: NodeJS.Timeout | null = null;
let runningTick: Promise<void> | null = null;
let tickCount = 0;

async function tick(api: EchoedClient, botUserId: string | null): Promise<void> {
  tickCount++;

  // Always-on: reminders, giveaways, temp-channel cleanup, scheduled
  // messages. The shared bot rate limit serializes API calls across
  // all branches.
  const branches: Promise<unknown>[] = [
    reminderTick(api).catch((err: unknown) => {
      log.error({ err }, 'reminderTick threw');
    }),
    giveawayTick(api, botUserId).catch((err: unknown) => {
      log.error({ err }, 'giveawayTick threw');
    }),
    tempChannelTick(api).catch((err: unknown) => {
      log.error({ err }, 'tempChannelTick threw');
    }),
    schedMsgTick(api).catch((err: unknown) => {
      log.error({ err }, 'schedMsgTick threw');
    }),
  ];

  if (tickCount % STATS_EVERY_N_TICKS === 0) {
    branches.push(
      statTick(api).catch((err: unknown) => {
        log.error({ err }, 'statTick threw');
      }),
    );
  }
  if (tickCount % REDDIT_EVERY_N_TICKS === 0) {
    branches.push(
      redditTick(api).catch((err: unknown) => {
        log.error({ err }, 'redditTick threw');
      }),
    );
    // Twitch + YouTube share Reddit's 5-min cadence — same external-
    // poll category, comparable freshness needs, no reason to spin
    // separate intervals.
    branches.push(
      twitchTick(api).catch((err: unknown) => {
        log.error({ err }, 'twitchTick threw');
      }),
    );
    branches.push(
      youtubeTick(api).catch((err: unknown) => {
        log.error({ err }, 'youtubeTick threw');
      }),
    );
  }

  await Promise.allSettled(branches);
}

// Start the scheduler. Idempotent; calling twice doesn't double-tick.
// `botUserId` is needed by the giveaway picker to filter out the bot's
// seeded reaction from the entry pool.
export function startScheduler(api: EchoedClient, botUserId: string | null): void {
  if (timer) return;
  timer = setInterval(() => {
    if (runningTick) return; // skip if previous tick is still running
    runningTick = tick(api, botUserId).finally(() => {
      runningTick = null;
    });
  }, TICK_INTERVAL_MS);
  // Don't keep the process alive solely for the scheduler; the socket
  // connection is the lifeline.
  timer.unref();
  log.info({ intervalMs: TICK_INTERVAL_MS }, 'Scheduler started');
}

export function stopScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
