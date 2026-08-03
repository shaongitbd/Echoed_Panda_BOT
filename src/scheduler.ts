import type { EchoedClient } from './client/echoedClient.js';
import type { PermissionService } from './auth/permissions.js';
import { reminderTick } from './reminders/tick.js';
import { giveawayTick } from './giveaways/tick.js';
import { tempChannelTick } from './tempChannels/tick.js';
import { statTick } from './stats/tick.js';
import { redditTick } from './reddit/tick.js';
import { twitchTick } from './twitch/tick.js';
import { youtubeTick } from './youtube/tick.js';
import { schedMsgTick } from './schedMsg/tick.js';
import { qotdTick } from './qotd/tick.js';
import { birthdayTick } from './birthday/tick.js';
import { restoreLapsedLockdowns } from './antiRaid/detector.js';
import { log } from './log.js';

// How often we consider whether anything is due. Individual branches have
// their own intervals; this is just the resolution.
const TICK_INTERVAL_MS = 15_000;

// Warn when a branch runs longer than its own interval — that's the signal
// that it can't keep up with the fleet and is falling behind.
const SLOW_BRANCH_FACTOR = 1;

interface Branch {
  name: string;
  intervalMs: number;
  run: () => Promise<void>;
  // Wall-clock deadline for the next run. Branches used to fire every N
  // *executed* ticks, which meant a slow tick silently stretched every
  // slower-cadence branch with it — the "runs every 60s" comments were
  // only true when nothing ever ran long. Deadlines are absolute, so a
  // slow branch delays itself and nothing else.
  nextRunAt: number;
  // Per-branch in-flight guard. A single shared flag meant one slow
  // branch — an external poll, or a stats sweep over the whole fleet —
  // blocked reminders, giveaways and scheduled messages for every server
  // until it finished.
  running: boolean;
}

let timer: NodeJS.Timeout | null = null;
let branches: Branch[] = [];

function buildBranches(
  api: EchoedClient,
  botUserId: string | null,
  perms: PermissionService | null,
): Branch[] {
  const now = Date.now();
  const mk = (name: string, intervalMs: number, run: () => Promise<void>): Branch => ({
    name,
    intervalMs,
    run,
    nextRunAt: now,
    running: false,
  });

  return [
    // Time-sensitive: someone is waiting on these.
    mk('reminders', 15_000, () => reminderTick(api)),
    mk('giveaways', 15_000, () => giveawayTick(api, botUserId, perms)),
    mk('tempChannels', 60_000, () => tempChannelTick(api)),
    mk('schedMsg', 15_000, () => schedMsgTick(api)),

    // Daily engagement posts. They self-gate on their own due time, so a
    // minute of resolution lands them within a minute of the configured
    // time.
    mk('qotd', 60_000, () => qotdTick(api)),
    mk('birthday', 60_000, () => birthdayTick(api)),

    // Cosmetic. Channel renames are heavily rate-limited anyway.
    mk('stats', 120_000, () => statTick(api)),

    // Put back verification levels raised by an anti-raid lockdown whose
    // window has since passed. That level has no expiry of its own, so
    // without this a server that tripped anti-raid once stays at the
    // elevated join bar forever.
    mk('lockdownRestore', 120_000, () => restoreLapsedLockdowns(api)),

    // Third-party polls. Separate branches so one provider being slow or
    // unreachable doesn't hold up the others.
    mk('reddit', 300_000, () => redditTick(api)),
    mk('twitch', 300_000, () => twitchTick(api)),
    mk('youtube', 300_000, () => youtubeTick(api)),
  ];
}

function pump(): void {
  const now = Date.now();
  for (const b of branches) {
    if (b.running || now < b.nextRunAt) continue;
    b.running = true;
    const startedAt = now;
    void b
      .run()
      .catch((err: unknown) => {
        log.error({ err, branch: b.name }, 'Scheduler branch threw');
      })
      .finally(() => {
        const elapsed = Date.now() - startedAt;
        if (elapsed > b.intervalMs * SLOW_BRANCH_FACTOR) {
          log.warn(
            { branch: b.name, elapsedMs: elapsed, intervalMs: b.intervalMs },
            'Scheduler branch ran longer than its interval',
          );
        }
        b.running = false;
        // Schedule from completion, not from the deadline we missed, so a
        // branch that overruns doesn't immediately re-enter.
        b.nextRunAt = Date.now() + b.intervalMs;
      });
  }
}

// Start the scheduler. Idempotent; calling twice doesn't double-tick.
// `botUserId` is needed by the giveaway picker to filter out the bot's
// seeded reaction from the entry pool. `perms` is used by the picker
// to apply the optional "exclude admins" giveaway scope rule.
export function startScheduler(
  api: EchoedClient,
  botUserId: string | null,
  perms: PermissionService | null,
): void {
  if (timer) return;
  branches = buildBranches(api, botUserId, perms);
  timer = setInterval(pump, TICK_INTERVAL_MS);
  // Don't keep the process alive solely for the scheduler; the socket
  // connection is the lifeline.
  timer.unref();
  log.info({ intervalMs: TICK_INTERVAL_MS, branches: branches.length }, 'Scheduler started');
}

// Stop ticking and wait for in-flight branches to finish. Scheduled work
// claims its row before performing the side effect, so a branch killed
// halfway leaves that work leased until the claim goes stale — waiting a
// few seconds here turns a deploy from "some reminders are delayed" into
// "nothing was interrupted". Bounded so a wedged request can't block a
// shutdown indefinitely.
const DRAIN_TIMEOUT_MS = 8_000;

export async function stopScheduler(): Promise<void> {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  const deadline = Date.now() + DRAIN_TIMEOUT_MS;
  while (branches.some((b) => b.running) && Date.now() < deadline) {
    await new Promise<void>((resolve) => setTimeout(resolve, 100).unref());
  }
  const stuck = branches.filter((b) => b.running).map((b) => b.name);
  if (stuck.length > 0) {
    log.warn({ branches: stuck }, 'Shutdown drain timed out with branches still running');
  }
}
