import Link from 'next/link';

export function Footer(): JSX.Element {
  return (
    <footer className="border-t border-[var(--border-subtle)] mt-32">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-12 sm:flex-row">
        <div className="flex items-center gap-2 text-sm text-text-muted">
          <span className="text-lg">🐼</span>
          <span className="font-display text-lg tracking-wide">panda</span>
          <span>· part of the Echoed ecosystem</span>
        </div>
        <div className="flex gap-6 text-xs text-text-muted">
          <Link href="/privacy" className="hover:text-text-secondary transition-colors duration-150">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-text-secondary transition-colors duration-150">
            Terms
          </Link>
          <Link
            href="https://echoed.gg"
            className="hover:text-text-secondary transition-colors duration-150"
          >
            Echoed
          </Link>
        </div>
      </div>
    </footer>
  );
}
