// Bounded-concurrency helpers.
//
// The API budget is shared across every server this process serves, so
// `Promise.all(items.map(...))` is never the right shape once `items` is
// derived from a batch of servers — it converts a batch of 25 servers into
// 25 simultaneous requests, and a batch of 400 entrants into 400. These
// helpers keep the fan-out flat regardless of batch size.

// Run `fn` over `items` with at most `limit` in flight. Results keep the
// input order. Rejections are returned as `null` rather than aborting the
// rest — callers that need to distinguish a failure from a null result
// should return a wrapper object from `fn`.
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<(R | null)[]> {
  const out: (R | null)[] = new Array(items.length).fill(null);
  if (items.length === 0) return out;

  const width = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;

  const workers = Array.from({ length: width }, async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        out[i] = await fn(items[i]!, i);
      } catch {
        out[i] = null;
      }
    }
  });

  await Promise.all(workers);
  return out;
}

// Same shape, but for side-effecting work where the result is discarded.
export async function forEachLimit<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<unknown>,
): Promise<void> {
  await mapLimit(items, limit, fn);
}

// Serializes async work per key. Two calls with the same key never overlap;
// different keys run freely. Used for role writes, where the platform
// applies a change by rewriting the member's whole role set — so two
// concurrent writes for one member can lose one of them.
export class KeyedQueue {
  private tails = new Map<string, Promise<unknown>>();

  run<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(key) ?? Promise.resolve();
    // Run regardless of whether the predecessor resolved or rejected, so
    // one failure doesn't cascade through everything queued behind it.
    const result = prev.then(fn, fn);
    const tail = result.catch(() => undefined);
    this.tails.set(key, tail);
    // Drop the key once it drains, so the map doesn't grow one entry per
    // member ever seen. Only the last task queued for the key clears it.
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return result;
  }

  get size(): number {
    return this.tails.size;
  }
}
