'use client';

// The AI page's model picker: OpenRouter's usable models (the ones that
// enforce a JSON schema), searchable by any part of the id or name, with
// each model's price and context size. The list comes from /api/ai-models
// once; typing then searches it locally with the same ranking the endpoint
// uses (lib/modelSearch), so results change on every keystroke with no
// round trip. Submits the chosen id under `name`, like the old text field.

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { formatContext, formatPerMillion, searchModels, type ModelOption, type ModelSort } from '@/lib/modelSearch';
import { inputClassName } from './FormCard';

const SHOWN = 80;
const SORTS: { id: ModelSort; label: string }[] = [
  { id: 'match', label: 'Best match' },
  { id: 'cheapest', label: 'Cheapest' },
  { id: 'newest', label: 'Newest' },
];

const NONE: ModelOption[] = [];

type Load ={ state: 'loading' } | { state: 'ready'; models: ModelOption[] } | { state: 'failed' };

function priceLine(m: ModelOption): string {
  const input = formatPerMillion(m.promptPerMillion);
  const output = formatPerMillion(m.completionPerMillion);
  if (input === null) return 'priced per request';
  if (input === 'free' && output === 'free') return 'free';
  return `${input} in · ${output ?? '?'} out`;
}

export function ModelPicker({ name, initial }: { name: string; initial: string | null }): JSX.Element {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [value, setValue] = useState(initial ?? '');
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<ModelSort>('match');
  const [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const listId = useId();

  useEffect(() => {
    let live = true;
    fetch('/api/ai-models')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body: { available: boolean; models: ModelOption[] }) => {
        if (live) setLoad(body.available ? { state: 'ready', models: body.models } : { state: 'failed' });
      })
      .catch(() => live && setLoad({ state: 'failed' }));
    return () => {
      live = false;
    };
  }, []);

  const models = load.state === 'ready' ? load.models : NONE;
  const selected = models.find((m) => m.id === value) ?? null;
  const hits = useMemo(() => searchModels(models, query, sort), [models, query, sort]);

  // Close on a click outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  // Keep the keyboard row in view.
  useEffect(() => {
    if (!open) return;
    list.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const openList = () => {
    setQuery('');
    setActive(0);
    setOpen(true);
  };
  const choose = (m: ModelOption) => {
    setValue(m.id);
    setOpen(false);
    input.current?.blur();
  };

  // OpenRouter unreachable: the field takes a typed id, as before.
  if (load.state === 'failed') {
    return (
      <>
        <input id={name} name={name} defaultValue={initial ?? ''} placeholder="provider/model-name" spellCheck={false} className={inputClassName} />
        <p className="mt-2 text-xs leading-5 text-text-faint">Couldn&apos;t load OpenRouter&apos;s model list just now — type a model id.</p>
      </>
    );
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      e.preventDefault();
      openList();
      return;
    }
    if (!open) return;
    const last = Math.min(hits.length, SHOWN) - 1;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(last, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      // Never submit the settings form from inside the search.
      e.preventDefault();
      const m = hits[active];
      if (m) choose(m);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  const shown = open ? query : selected?.name ?? value;

  return (
    <div ref={root} className="relative">
      <input type="hidden" name={name} value={value} />
      <div className="relative">
        <input
          ref={input}
          id={name}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && hits[active] ? `${listId}-${active}` : undefined}
          autoComplete="off"
          spellCheck={false}
          value={shown}
          placeholder={load.state === 'loading' ? 'Loading models…' : open ? 'Search — "deepseek flash", "claude", "free"…' : 'Pick a model'}
          onFocus={() => !open && openList()}
          onClick={() => !open && openList()}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            if (!open) setOpen(true);
          }}
          onKeyDown={onKeyDown}
          className={`${inputClassName} pr-16`}
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-0.5">
          {value && !open ? (
            <button
              type="button"
              aria-label="Clear the model"
              onClick={() => setValue('')}
              className="flex h-7 w-7 items-center justify-center rounded-md text-text-faint transition-colors duration-100 hover:bg-bg-hover hover:text-text-primary"
            >
              <X aria-hidden="true" size={15} />
            </button>
          ) : null}
          <ChevronDown aria-hidden="true" size={16} className="pointer-events-none mx-1 text-text-faint" />
        </div>
      </div>

      {/* What's chosen, and what it costs. */}
      {!open && value ? (
        <p className="mt-2 text-xs leading-5 text-text-faint">
          <span className="font-mono text-text-muted">{value}</span>
          {selected ? (
            <>
              {' · '}{priceLine(selected)} per million tokens
              {formatContext(selected.contextLength) ? ` · ${formatContext(selected.contextLength)} context` : ''}
            </>
          ) : load.state === 'ready' ? (
            <span className="text-status-warning"> · OpenRouter doesn&apos;t list this model with structured outputs any more — pick another.</span>
          ) : null}
        </p>
      ) : null}

      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-1.5 overflow-hidden rounded-xl bg-bg-float">
          <div className="flex items-center gap-1 px-2 pb-1 pt-2">
            {SORTS.map((s) => (
              <button
                key={s.id}
                type="button"
                // Keep focus in the search box.
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  setSort(s.id);
                  setActive(0);
                }}
                aria-pressed={sort === s.id}
                className={`h-7 rounded-md px-2.5 text-xs font-semibold transition-colors duration-100 ${
                  sort === s.id ? 'bg-bg-hover text-text-primary' : 'text-text-muted hover:bg-bg-elevated hover:text-text-primary'
                }`}
              >
                {s.label}
              </button>
            ))}
            <span className="ml-auto pr-1 text-xs tabular-nums text-text-faint">
              {load.state === 'loading' ? '' : `${hits.length} model${hits.length === 1 ? '' : 's'}`}
            </span>
          </div>
          <ul ref={list} id={listId} role="listbox" aria-label="Models" className="max-h-80 overflow-y-auto p-1">
            {load.state === 'loading' ? (
              <li className="px-3 py-3 text-sm text-text-muted">Loading OpenRouter&apos;s models…</li>
            ) : hits.length === 0 ? (
              <li className="px-3 py-3 text-sm text-text-muted">No model matches “{query}”.</li>
            ) : (
              hits.slice(0, SHOWN).map((m, i) => {
                const isActive = i === active;
                const isChosen = m.id === value;
                return (
                  <li
                    key={m.id}
                    id={`${listId}-${i}`}
                    data-index={i}
                    role="option"
                    aria-selected={isChosen}
                    onPointerDown={(e) => e.preventDefault()}
                    onPointerMove={() => setActive(i)}
                    onClick={() => choose(m)}
                    className={`flex cursor-pointer items-baseline gap-3 rounded-lg px-3 py-2 ${
                      isChosen ? 'bg-accent-muted' : isActive ? 'bg-bg-hover' : ''
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-text-primary">{m.name}</span>
                      <span className="block truncate font-mono text-xs text-text-faint">{m.id}</span>
                    </span>
                    <span className="shrink-0 text-right text-xs tabular-nums text-text-muted">
                      <span className="block">{priceLine(m)}</span>
                      {formatContext(m.contextLength) ? (
                        <span className="block text-text-faint">{formatContext(m.contextLength)} context</span>
                      ) : null}
                    </span>
                  </li>
                );
              })
            )}
            {hits.length > SHOWN ? (
              <li className="px-3 py-2 text-xs text-text-faint">{hits.length - SHOWN} more — keep typing to narrow it down.</li>
            ) : null}
          </ul>
          <p className="px-3 pb-2.5 pt-1 text-xs text-text-faint">Prices are per million tokens. One message check is about 1–2 thousand.</p>
        </div>
      ) : null}
    </div>
  );
}
