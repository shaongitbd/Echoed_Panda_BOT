// Panda's mark, in echoed.gg's logo language: the rounded-square red tile
// Echoed's own icon sits on, with a plain geometric panda face on it (ears,
// head, eye patches). Replaces the 🐼 emoji, which renders as a different
// picture on every platform and can't take the brand colour.

export function PandaMark({ size = 28, className = '' }: { size?: number; className?: string }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      aria-hidden="true"
      className={className}
    >
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      {/* ears */}
      <circle cx="9.5" cy="10" r="3.6" fill="#1a1d23" />
      <circle cx="22.5" cy="10" r="3.6" fill="#1a1d23" />
      {/* head */}
      <ellipse cx="16" cy="17.5" rx="9.2" ry="8.2" fill="#fff" />
      {/* eye patches, tilted outward */}
      <ellipse cx="12.3" cy="16.6" rx="2.3" ry="3" transform="rotate(-24 12.3 16.6)" fill="#1a1d23" />
      <ellipse cx="19.7" cy="16.6" rx="2.3" ry="3" transform="rotate(24 19.7 16.6)" fill="#1a1d23" />
      {/* nose */}
      <ellipse cx="16" cy="21" rx="1.6" ry="1.1" fill="#1a1d23" />
    </svg>
  );
}

/** The mark plus the lowercase wordmark, as echoed.gg writes its own name. */
export function PandaLogo({ size = 26 }: { size?: number }): JSX.Element {
  return (
    <span className="inline-flex items-center gap-2">
      <PandaMark size={size} />
      <span className="font-display text-[19px] font-semibold tracking-[-0.04em] text-text-primary">panda</span>
    </span>
  );
}
