// Quadratic level curve. To go from level x to x+1 requires
// `5*x² + 50*x + 100` XP. This makes early levels fast and later
// levels meaningfully harder — a smoother feel than a flat curve.
//
// The functions here are pure, allocation-free, and cheap to call on
// every message; we don't memoize because the math is faster than
// touching a Map.

// XP needed to advance FROM `level` TO `level + 1`.
export function xpForNextLevel(level: number): number {
  return 5 * level * level + 50 * level + 100;
}

// Total XP required to be AT exactly `level` (i.e., the boundary).
// Closed-form sum of xpForNextLevel(0..level-1).
export function totalXpForLevel(level: number): number {
  if (level <= 0) return 0;
  // Sum_{x=0}^{level-1} (5x² + 50x + 100)
  // = 5 * (level-1) * level * (2*level - 1) / 6
  // + 50 * (level-1) * level / 2
  // + 100 * level
  const n = level;
  const sumSq = ((n - 1) * n * (2 * n - 1)) / 6; // Sum of x² from 0 to n-1
  const sumLin = ((n - 1) * n) / 2; // Sum of x from 0 to n-1
  return 5 * sumSq + 50 * sumLin + 100 * n;
}

// Resolve a total-XP value back to its level. Iterates upward from 0
// rather than inverting the cubic — at realistic XP totals this is bounded to
// a few dozen iterations even for top-of-leaderboard accounts and
// avoids floating-point drift around level boundaries.
export function levelForTotalXp(totalXp: number): number {
  if (totalXp <= 0) return 0;
  let level = 0;
  let acc = 0;
  while (true) {
    const need = xpForNextLevel(level);
    if (acc + need > totalXp) return level;
    acc += need;
    level += 1;
    // Hard ceiling to keep the loop bounded if someone manages to break
    // out of reasonable XP ranges (~bil). 1000 ≈ never reached but
    // protects the message hot path.
    if (level >= 1000) return level;
  }
}

export interface ProgressInfo {
  level: number;
  // XP earned within the current level (resets each level).
  intoLevel: number;
  // XP needed to complete the current level.
  levelTotal: number;
  // XP still needed to hit the next level.
  remaining: number;
  // 0..1 fraction through the current level.
  fraction: number;
}

export function progressToNext(totalXp: number): ProgressInfo {
  const level = levelForTotalXp(totalXp);
  const base = totalXpForLevel(level);
  const levelTotal = xpForNextLevel(level);
  const intoLevel = totalXp - base;
  const remaining = Math.max(0, levelTotal - intoLevel);
  const fraction = levelTotal > 0 ? Math.min(1, intoLevel / levelTotal) : 0;
  return { level, intoLevel, levelTotal, remaining, fraction };
}
