// Outbound request pacing.
//
// The API's request budget is keyed on the bot account, not on the server
// the request is about — so every server this process serves draws from one
// shared allowance. At a few hundred servers that works out to a fraction
// of a request per server per minute, which means the pacing has to be
// process-wide. A per-server or per-feature limiter would not help.
//
// Two mechanisms, both global:
//   - a token bucket, sized under the documented budget, that shapes the
//     long-run rate
//   - an in-flight cap, so a burst can't open dozens of sockets at once
//
// Requests also carry a priority. Something a member is waiting on should
// not queue behind a batch of cosmetic background updates.

import { log } from '../log.js';

// Documented budget is 120 requests / 60 s. Stay under it: the budget is
// shared with anything else using this token, and a burst that trips it
// costs more than the headroom does.
const CAPACITY = 90;
const REFILL_PER_SEC = 90 / 60;

// Concurrency ceiling. Above this we are just queueing at the far end.
const MAX_IN_FLIGHT = 6;

export type Priority = 'interactive' | 'background';

interface Waiter {
  resolve: () => void;
  priority: Priority;
  queuedAt: number;
}

class RateLimiter {
  private tokens = CAPACITY;
  private lastRefill = Date.now();
  private inFlight = 0;
  private waiters: Waiter[] = [];

  // Set when the server tells us to back off. Everything waits until it
  // passes, regardless of the local bucket.
  private pausedUntil = 0;

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    if (elapsed <= 0) return;
    this.tokens = Math.min(CAPACITY, this.tokens + elapsed * REFILL_PER_SEC);
    this.lastRefill = now;
  }

  // Server-directed backoff. `seconds` comes from the response.
  pause(seconds: number): void {
    const until = Date.now() + Math.max(0, seconds) * 1000;
    if (until > this.pausedUntil) {
      this.pausedUntil = until;
      // Spend the bucket too, so we don't resume into an immediate burst.
      this.tokens = 0;
      log.warn({ seconds }, 'Rate limited — pausing outbound requests');
    }
  }

  private canProceed(): boolean {
    if (Date.now() < this.pausedUntil) return false;
    if (this.inFlight >= MAX_IN_FLIGHT) return false;
    this.refill();
    return this.tokens >= 1;
  }

  private pump(): void {
    while (this.waiters.length > 0 && this.canProceed()) {
      // Interactive work first; within a priority, oldest first.
      let bestIndex = 0;
      for (let i = 1; i < this.waiters.length; i++) {
        const a = this.waiters[i]!;
        const b = this.waiters[bestIndex]!;
        if (a.priority === b.priority) {
          if (a.queuedAt < b.queuedAt) bestIndex = i;
        } else if (a.priority === 'interactive') {
          bestIndex = i;
        }
      }
      const [waiter] = this.waiters.splice(bestIndex, 1);
      this.tokens -= 1;
      this.inFlight += 1;
      waiter!.resolve();
    }

    if (this.waiters.length > 0) {
      // Wake up when the next token lands, or when the pause lifts.
      const pauseWait = Math.max(0, this.pausedUntil - Date.now());
      const tokenWait = this.tokens >= 1 ? 0 : ((1 - this.tokens) / REFILL_PER_SEC) * 1000;
      const wait = Math.max(25, Math.max(pauseWait, tokenWait));
      if (!this.wakeTimer) {
        this.wakeTimer = setTimeout(() => {
          this.wakeTimer = null;
          this.pump();
        }, wait);
        this.wakeTimer.unref();
      }
    }
  }

  private wakeTimer: NodeJS.Timeout | null = null;

  async acquire(priority: Priority): Promise<void> {
    if (this.waiters.length === 0 && this.canProceed()) {
      this.tokens -= 1;
      this.inFlight += 1;
      return;
    }
    await new Promise<void>((resolve) => {
      this.waiters.push({ resolve, priority, queuedAt: Date.now() });
      this.pump();
    });
  }

  release(): void {
    this.inFlight = Math.max(0, this.inFlight - 1);
    this.pump();
  }

  stats(): { queued: number; inFlight: number; tokens: number } {
    return {
      queued: this.waiters.length,
      inFlight: this.inFlight,
      tokens: Math.floor(this.tokens),
    };
  }
}

export const limiter = new RateLimiter();
