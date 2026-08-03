// Container health check. Exits 0 while the main loop is turning.
//
// Reads the heartbeat the process writes on a timer and fails if it has
// gone stale. A wedged event loop stops writing while the process stays
// alive, which is exactly the state nothing else detects.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const file = process.env.PANDA_HEARTBEAT_FILE || path.join(os.tmpdir(), 'panda-heartbeat');
const MAX_AGE_MS = 90_000;

try {
  const written = Number(fs.readFileSync(file, 'utf8'));
  const age = Date.now() - written;
  if (!Number.isFinite(written) || age > MAX_AGE_MS) {
    console.error(`heartbeat stale (${Math.round(age / 1000)}s)`);
    process.exit(1);
  }
  process.exit(0);
} catch (err) {
  console.error(`heartbeat unreadable: ${err.message}`);
  process.exit(1);
}
