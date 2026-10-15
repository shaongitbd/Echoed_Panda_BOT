'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CornerDownLeft, Search } from 'lucide-react';
import { searchSettings, type SearchEntry } from '@/lib/settingsIndex';
import { cardAnchor } from './FormCard';
import { iconFor } from './sectionIcons';

// "Where is that setting?" — type a few letters, jump straight to the card.
// Opens from the top bar or with Ctrl+K / ⌘K anywhere on a server's pages.
export function SettingsSearch({ serverId }: { serverId: string }): JSX.Element {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const results = useMemo(() => searchSettings(query), [query]);

  const close = useCallback(() => {
    setOpen(false);
    setQuery('');
    setActive(0);
    triggerRef.current?.focus();
  }, []);

  const go = useCallback(
    (e: SearchEntry) => {
      const hash = e.card ? `#${cardAnchor(e.card)}` : '';
      router.push(`/dashboard/${serverId}${e.href}${hash}`);
      close();
    },
    [router, serverId, close],
  );

  // Ctrl+K / ⌘K opens it from anywhere.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
        ev.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const onInputKey = (ev: React.KeyboardEvent<HTMLInputElement>) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      close();
    } else if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(results.length - 1, 0)));
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (ev.key === 'Enter') {
      const hit = results[active];
      if (hit) {
        ev.preventDefault();
        go(hit);
      }
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className="flex h-9 w-full max-w-sm items-center gap-2 rounded-lg bg-bg-card px-3 text-sm text-text-faint transition-colors duration-100 hover:bg-bg-elevated hover:text-text-muted"
      >
        <Search aria-hidden="true" size={16} />
        <span className="flex-1 text-left">Search settings</span>
        <kbd className="hidden rounded-md bg-bg-elevated px-1.5 font-sans text-[11px] text-text-muted sm:inline">Ctrl K</kbd>
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-[12vh]"
          onMouseDown={(ev) => {
            if (ev.target === ev.currentTarget) close();
          }}
        >
          <div role="dialog" aria-modal="true" aria-label="Search settings" className="w-[min(560px,100%)] overflow-hidden rounded-2xl bg-bg-float">
            <div className="flex items-center gap-3 px-4">
              <Search aria-hidden="true" size={18} className="shrink-0 text-text-faint" />
              <input
                ref={inputRef}
                value={query}
                onChange={(ev) => {
                  setQuery(ev.target.value);
                  setActive(0);
                }}
                onKeyDown={onInputKey}
                placeholder="Bad words, welcome message, DJ role…"
                aria-label="Search settings"
                role="combobox"
                aria-expanded={results.length > 0}
                aria-controls="settings-search-results"
                aria-activedescendant={results[active] ? `ssr-${active}` : undefined}
                className="h-14 min-w-0 flex-1 bg-transparent text-[15px] text-text-primary placeholder:text-text-faint focus:outline-none"
              />
              <kbd className="rounded-md bg-bg-elevated px-1.5 text-[11px] text-text-muted">Esc</kbd>
            </div>

            {query.trim() ? (
              results.length > 0 ? (
                <ul id="settings-search-results" role="listbox" className="max-h-[50vh] overflow-y-auto border-t border-[var(--border-subtle)] p-1.5">
                  {results.map((r, i) => {
                    const Icon = iconFor(r.href);
                    const isActive = i === active;
                    return (
                      <li key={`${r.href}:${r.card ?? ''}`} id={`ssr-${i}`} role="option" aria-selected={isActive}>
                        <button
                          type="button"
                          onMouseEnter={() => setActive(i)}
                          onClick={() => go(r)}
                          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${isActive ? 'bg-bg-hover' : ''}`}
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-bg-elevated text-text-secondary">
                            <Icon aria-hidden="true" size={16} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-text-primary">{r.label}</span>
                            <span className="block truncate text-xs text-text-faint">{r.card ? r.section : 'Page'}</span>
                          </span>
                          {isActive ? <CornerDownLeft aria-hidden="true" size={15} className="shrink-0 text-text-faint" /> : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="border-t border-[var(--border-subtle)] px-4 py-5 text-sm text-text-muted">
                  Nothing matches &ldquo;{query.trim()}&rdquo;.
                </p>
              )
            ) : (
              <p className="border-t border-[var(--border-subtle)] px-4 py-4 text-xs text-text-faint">
                Type a setting or a feature — e.g. &ldquo;prefix&rdquo;, &ldquo;raid&rdquo;, &ldquo;level roles&rdquo;.
              </p>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
