'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SidebarServer {
  id: string;
  name: string;
  iconUrl: string | null;
}

interface SidebarSection {
  href: string;
  label: string;
  icon: string;
}

const SECTIONS: SidebarSection[] = [
  { href: '', label: 'Overview', icon: '◆' },
  { href: '/general', label: 'General', icon: '⚙' },
  { href: '/levels', label: 'Levels', icon: '✦' },
  { href: '/welcome', label: 'Welcome', icon: '✿' },
  { href: '/moderation', label: 'Moderation', icon: '⚒' },
  { href: '/automod', label: 'Auto-mod', icon: '⚡' },
  { href: '/reactionroles', label: 'Reaction roles', icon: '✺' },
  { href: '/customcommands', label: 'Custom commands', icon: '✎' },
  { href: '/autoreact', label: 'Auto-react', icon: '✨' },
  { href: '/keywords', label: 'Keywords', icon: '✯' },
  { href: '/notifications', label: 'Notifications', icon: '◉' },
  { href: '/statcounters', label: 'Stats counters', icon: '#' },
  { href: '/schedules', label: 'Schedules', icon: '◷' },
];

// All feature areas now have web UIs — no "Coming soon" group.
const SOON_SECTIONS: string[] = [];

export function ServerSidebar({ server }: { server: SidebarServer }): JSX.Element {
  const pathname = usePathname() ?? '';
  const base = `/dashboard/${server.id}`;
  const initial = server.name.trim().charAt(0).toUpperCase() || '?';

  // We mark a section "active" when the URL exactly matches its href —
  // not "starts with", because Overview's `''` href would always win.
  const isActive = (href: string): boolean => {
    const target = `${base}${href}`;
    return pathname === target || (href === '' && pathname === `${base}/`);
  };

  return (
    <aside className="sticky top-16 h-[calc(100vh-4rem)] w-64 shrink-0 border-r border-[var(--border-subtle)] bg-bg-card/30 px-4 py-6">
      <div className="mb-8 flex items-center gap-3 rounded-lg border border-[var(--border-subtle)] bg-bg-card p-3">
        {server.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={server.iconUrl}
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 rounded-sm object-cover"
          />
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-accent-muted font-display text-lg text-accent">
            {initial}
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-text-primary">{server.name}</div>
          <Link
            href="/dashboard"
            className="text-xs text-text-muted hover:text-text-secondary transition-colors duration-150"
          >
            ← All servers
          </Link>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted">
          Configure
        </p>
        {SECTIONS.map((s) => (
          <Link
            key={s.href}
            href={`${base}${s.href}`}
            className={`flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors duration-150 ${
              isActive(s.href)
                ? 'bg-accent-muted text-accent border-l-2 border-accent'
                : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
            }`}
          >
            <span className="font-display text-lg">{s.icon}</span>
            {s.label}
          </Link>
        ))}

        {SOON_SECTIONS.length > 0 ? (
          <p className="mb-2 mt-6 px-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-text-muted">
            Coming soon
          </p>
        ) : null}
        {SOON_SECTIONS.map((label) => (
          <span
            key={label}
            className="flex cursor-not-allowed items-center gap-3 rounded px-3 py-2 text-sm text-text-muted opacity-60"
          >
            <span className="font-display text-lg">·</span>
            {label}
          </span>
        ))}
      </nav>
    </aside>
  );
}
