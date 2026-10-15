import Link from 'next/link';
import { BookOpen, ExternalLink } from 'lucide-react';
import { PandaLogo } from './PandaMark';

// The dashboard's own top bar — replaces the marketing header on settings
// pages (its Features / GitHub links were noise while configuring). Left:
// the logo, back to your servers. Right: the docs, echoed.gg, and who you're
// signed in as.

interface TopBarUser {
  name: string;
  avatarUrl?: string | null;
}

export function DashboardTopBar({ user, children }: { user?: TopBarUser | null; children?: React.ReactNode }): JSX.Element {
  return (
    <header className="sticky top-0 z-40 bg-bg-base">
      <div className="flex h-14 items-center gap-3 px-4 md:px-6">
        <Link href="/dashboard" className="shrink-0 rounded-lg" aria-label="Panda — your servers">
          <PandaLogo />
        </Link>
        {/* Room for page-level controls (the settings search). */}
        <div className="flex min-w-0 flex-1 justify-center">{children}</div>
        <nav className="flex shrink-0 items-center gap-1">
          <Link
            href="/docs"
            className="hidden h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-text-muted transition-colors duration-100 hover:bg-bg-card hover:text-text-primary sm:inline-flex"
          >
            <BookOpen aria-hidden="true" size={16} />
            Docs
          </Link>
          <a
            href="https://echoed.gg"
            className="hidden h-9 items-center gap-1.5 rounded-lg px-3 text-sm text-text-muted transition-colors duration-100 hover:bg-bg-card hover:text-text-primary sm:inline-flex"
          >
            echoed.gg
            <ExternalLink aria-hidden="true" size={14} />
          </a>
          {user ? (
            <span className="ml-1 inline-flex h-9 items-center gap-2 rounded-lg pl-1 pr-2 text-sm text-text-secondary">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" width={26} height={26} className="h-[26px] w-[26px] rounded-md object-cover" />
              ) : (
                <span className="flex h-[26px] w-[26px] items-center justify-center rounded-md bg-bg-elevated text-xs font-semibold">
                  {user.name.charAt(0).toUpperCase()}
                </span>
              )}
              <span className="hidden max-w-[12rem] truncate lg:inline">{user.name}</span>
            </span>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
