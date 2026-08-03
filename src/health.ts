// Liveness signal.
//
// The process deliberately survives uncaught exceptions and unhandled
// rejections rather than restarting — most of those come from a single
// command handler and shouldn't take every server down with them. But
// nothing was watching for the case where it survives into a state where
// it does no useful work: an event loop wedged behind a stuck operation
// looks identical, from outside, to a quiet evening.
//
// So the main loop touches a file on a timer, and the container health
// check asks how long ago that happened. Missing the deadline means the
// loop is not turning, and the orchestrator restarts us — which is the
// right outcome, and the one that wasn't happening.

import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { log } from './log.js';

export const HEARTBEAT_FILE = process.env.PANDA_HEARTBEAT_FILE ?? join(tmpdir(), 'panda-heartbeat');

const HEARTBEAT_INTERVAL_MS = 15_000;

let timer: NodeJS.Timeout | null = null;

async function touch(): Promise<void> {
  try {
    await fs.writeFile(HEARTBEAT_FILE, String(Date.now()), 'utf8');
  } catch (err) {
    log.debug({ err, file: HEARTBEAT_FILE }, 'Heartbeat write failed');
  }
}

export function startHeartbeat(): void {
  if (timer) return;
  void touch();
  timer = setInterval(() => void touch(), HEARTBEAT_INTERVAL_MS);
  // Deliberately NOT unref'd: while the process is alive it should be
  // saying so.
}

export function stopHeartbeat(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
