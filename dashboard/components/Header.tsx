import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { PandaLogo } from './PandaMark';

// The public pages' top nav (landing, docs, privacy, terms) — echoed.gg's
// nav: the rail colour, quiet links that fill on hover, one red button.
// Signed-in visitors get "Open dashboard" instead of the login.
export async function Header(): Promise<JSX.Element> {
  const session = await getSession();
  const link = 'inline-flex h-9 items-center rounded-lg px-3 text-[15px] text-text-muted transition-colors duration-100 hover:bg-bg-card hover:text-text-primary';

  return (
    <header className="sticky top-0 z-50 bg-bg-base">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-5 md:px-8">
        <Link href="/" className="shrink-0 rounded-lg" aria-label="Panda home">
          <PandaLogo />
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          <Link href="/#tour" className={link}>Look around</Link>
          <Link href="/docs" className={link}>Docs</Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          {session ? (
            <Link
              href="/dashboard"
              className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg transition-colors duration-100 hover:bg-accent-hover active:bg-accent-press"
            >
              Open dashboard
            </Link>
          ) : (
            <>
              <Link href="/#add" className="hidden h-10 items-center rounded-lg bg-bg-elevated px-4 text-sm font-semibold text-text-primary transition-colors duration-100 hover:bg-bg-hover sm:inline-flex">
                Add to server
              </Link>
              <Link
                href="/login"
                className="inline-flex h-10 items-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-fg transition-colors duration-100 hover:bg-accent-hover active:bg-accent-press"
              >
                Log in with Echoed
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
