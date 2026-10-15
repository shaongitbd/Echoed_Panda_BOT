'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { GROUPS, SECTIONS } from '@/lib/sections';
import type { StatusMap } from '@/lib/queries/moduleStatus';
import { iconFor } from './sectionIcons';

interface SidebarServer {
  id: string;
  name: string;
  iconUrl: string | null;
}

// The server's dashboard navigation: grouped, with what's on at a glance —
// a green dot for a feature that's switched on, a count for a list feature
// that has entries. Nothing for off / empty, so the on things stand out.
export function ServerSidebar({ server, status }: { server: SidebarServer; status: StatusMap }): JSX.Element {
  const pathname = usePathname() ?? '';
  const base = `/dashboard/${server.id}`;

  // A section is "active" on its own URL and on pages under it (Commands →
  // /commands/edit). Overview's `''` href only matches exactly, or it would
  // win everywhere.
  const isActive = (href: string): boolean => {
    const target = `${base}${href}`;
    if (href === '') return pathname === target || pathname === `${base}/`;
    return pathname === target || pathname.startsWith(`${target}/`);
  };

  const nav = (
    <nav aria-label="Server settings" className="flex flex-col gap-5">
      {GROUPS.map((g) => {
        const items = SECTIONS.filter((s) => s.group === g.key);
        if (items.length === 0) return null;
        return (
          <div key={g.key} className="flex flex-col gap-0.5">
            {g.label ? (
              <p className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-[0.085em] text-text-faint">
                {g.label}
              </p>
            ) : null}
            {items.map((s) => {
              const Icon = iconFor(s.href);
              const active = isActive(s.href);
              const st = status[s.href];
              return (
                <Link
                  key={s.href}
                  href={`${base}${s.href}`}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors duration-100 ${
                    active
                      ? 'bg-bg-card font-medium text-text-primary'
                      : 'text-text-muted hover:bg-bg-card/60 hover:text-text-primary'
                  }`}
                >
                  {active ? (
                    <span aria-hidden="true" className="absolute -left-3 top-2 h-5 w-[3px] rounded-r bg-accent" />
                  ) : null}
                  <Icon aria-hidden="true" size={17} strokeWidth={1.9} className={active ? 'text-text-primary' : 'text-text-faint'} />
                  <span className="min-w-0 flex-1 truncate">{s.label}</span>
                  {st === true ? (
                    <span className="h-2 w-2 shrink-0 rounded-full bg-status-online" title="On" aria-label="on" />
                  ) : typeof st === 'number' && st > 0 ? (
                    <span className="shrink-0 rounded-md bg-bg-elevated px-1.5 text-[11px] font-medium leading-5 text-text-secondary tabular-nums">
                      {st}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        );
      })}
    </nav>
  );

  const serverCard = (
    <div className="flex items-center gap-3 rounded-xl bg-bg-card p-2.5">
      {server.iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={server.iconUrl} alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-elevated text-sm font-semibold text-text-secondary">
          {server.name.trim().charAt(0).toUpperCase() || '?'}
        </div>
      )}
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-text-primary">{server.name}</div>
        <Link href="/dashboard" className="text-xs text-text-faint transition-colors duration-100 hover:text-text-secondary">
          Switch server
        </Link>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop: a fixed column beside the page. */}
      <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-64 shrink-0 overflow-y-auto px-3 py-5 md:block">
        <div className="mb-5">{serverCard}</div>
        {nav}
      </aside>
      {/* Phone: the same navigation, folded under the server card. */}
      <div className="px-4 pt-4 md:hidden">
        {serverCard}
        <details className="mt-2 rounded-xl bg-bg-card">
          <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium text-text-primary">
            {SECTIONS.find((s) => isActive(s.href))?.label ?? 'Sections'} <span className="text-text-faint">· change</span>
          </summary>
          <div className="px-3 pb-3">{nav}</div>
        </details>
      </div>
    </>
  );
}
