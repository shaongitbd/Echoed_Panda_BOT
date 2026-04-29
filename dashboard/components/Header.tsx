import Link from 'next/link';
import { getSession } from '@/lib/auth';

// Top nav. Sticky, mostly transparent — uses the dark base bg with
// a subtle bottom border. Login state determines the right-side CTA.
export async function Header(): Promise<JSX.Element> {
  const session = await getSession();

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border-subtle)] bg-[color-mix(in_oklab,var(--bg-base),transparent_15%)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link href="/" className="flex items-center gap-2 group">
          <span className="text-2xl">🐼</span>
          <span className="font-display text-2xl tracking-wide group-hover:text-accent transition-colors duration-150">
            panda
          </span>
        </Link>

        <nav className="hidden items-center gap-8 text-sm text-text-secondary md:flex">
          <Link href="/#features" className="hover:text-text-primary transition-colors duration-150">
            Features
          </Link>
          <Link href="/#commands" className="hover:text-text-primary transition-colors duration-150">
            Commands
          </Link>
          <Link
            href="https://github.com/shaongitbd/panda"
            className="hover:text-text-primary transition-colors duration-150"
          >
            GitHub
          </Link>
        </nav>

        <div>
          {session ? (
            <Link
              href="/dashboard"
              className="rounded bg-accent px-5 py-2 text-sm font-semibold text-accent-fg transition-colors duration-150 hover:bg-accent-hover"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              href="/login"
              className="rounded bg-accent px-5 py-2 text-sm font-semibold text-accent-fg transition-colors duration-150 hover:bg-accent-hover"
            >
              Login with Echoed
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
