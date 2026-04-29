'use client';

// Mirrors ChannelPicker but for server roles. Used by music DJ role,
// auto-role on welcome, and (future) automod role exemption. Same
// emit-as-hidden-form-field pattern so server actions read the role
// ID via formData.get(name) without rewiring.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { BotRole } from '@/lib/botApi';

interface BasePickerProps {
  roles: BotRole[];
  placeholder?: string;
  name: string;
  initial?: string | string[] | null;
}

interface SingleProps extends BasePickerProps {
  mode: 'single';
  initial?: string | null;
  clearable?: boolean;
}

interface MultiProps extends BasePickerProps {
  mode: 'multi';
  initial?: string[];
}

type Props = SingleProps | MultiProps;

export function RolePicker(props: Props): JSX.Element {
  const { roles } = props;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const [singleSel, setSingleSel] = useState<string | null>(
    props.mode === 'single' ? (typeof props.initial === 'string' ? props.initial : null) : null,
  );
  const [multiSel, setMultiSel] = useState<string[]>(
    props.mode === 'multi' && Array.isArray(props.initial) ? props.initial : [],
  );

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent): void {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return roles;
    return roles.filter((r) => r.name.toLowerCase().includes(q));
  }, [roles, query]);

  const roleById = useMemo(() => {
    const m = new Map<string, BotRole>();
    for (const r of roles) m.set(r.id, r);
    return m;
  }, [roles]);

  function selectId(id: string): void {
    if (props.mode === 'single') {
      setSingleSel(id);
      setOpen(false);
      setQuery('');
    } else {
      setMultiSel((prev) => (prev.includes(id) ? prev : [...prev, id]));
      setQuery('');
    }
  }

  function removeId(id: string): void {
    if (props.mode === 'single') {
      setSingleSel(null);
    } else {
      setMultiSel((prev) => prev.filter((x) => x !== id));
    }
  }

  return (
    <div ref={containerRef} className="relative">
      {props.mode === 'single' ? (
        <input type="hidden" name={props.name} value={singleSel ?? ''} />
      ) : (
        multiSel.map((id) => <input key={id} type="hidden" name={props.name} value={id} />)
      )}

      {props.mode === 'multi' && multiSel.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {multiSel.map((id) => {
            const r = roleById.get(id);
            return <Chip key={id} role={r} fallbackId={id} onRemove={() => removeId(id)} />;
          })}
        </div>
      ) : null}

      <div
        className="flex w-full cursor-text items-center rounded border border-[var(--border-subtle)] bg-bg-input px-3 py-2 transition-colors duration-150 focus-within:border-accent/50"
        onClick={() => setOpen(true)}
      >
        {props.mode === 'single' && singleSel ? (
          <SingleSummary
            role={roleById.get(singleSel)}
            fallbackId={singleSel}
            onClear={
              (props as SingleProps).clearable !== false ? () => setSingleSel(null) : undefined
            }
          />
        ) : null}
        <input
          type="text"
          className="ml-1 min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
          placeholder={
            (props.mode === 'single' && singleSel) ? '' : props.placeholder ?? 'Search roles…'
          }
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>

      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded border border-[var(--border-subtle)] bg-bg-card shadow-xl">
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-xs text-text-muted">
              {roles.length === 0 ? 'No roles in this server.' : 'No roles match.'}
            </div>
          ) : (
            <ul role="listbox" className="py-1">
              {filtered.map((r) => {
                const selected =
                  props.mode === 'single' ? singleSel === r.id : multiSel.includes(r.id);
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => selectId(r.id)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-100 ${
                        selected
                          ? 'bg-accent-muted text-text-primary'
                          : 'text-text-primary hover:bg-bg-hover'
                      }`}
                    >
                      <ColorDot color={r.color} />
                      <span className="flex-1 truncate">{r.name}</span>
                      {selected ? <span className="text-xs text-accent">selected</span> : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function ColorDot({ color }: { color: string | undefined }): JSX.Element {
  const c = color && /^#([0-9a-fA-F]{6})$/.test(color) ? color : '#888';
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: c }}
      aria-hidden="true"
    />
  );
}

function Chip({
  role,
  fallbackId,
  onRemove,
}: {
  role: BotRole | undefined;
  fallbackId: string;
  onRemove: () => void;
}): JSX.Element {
  const label = role?.name ?? fallbackId.slice(0, 8) + '…';
  return (
    <span className="inline-flex items-center gap-1.5 rounded bg-bg-input px-2 py-1 text-xs text-text-primary ring-1 ring-[var(--border-subtle)]">
      <ColorDot color={role?.color} />
      <span>{label}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="ml-0.5 text-text-muted hover:text-text-primary"
        aria-label={`Remove ${label}`}
      >
        ×
      </button>
    </span>
  );
}

function SingleSummary({
  role,
  fallbackId,
  onClear,
}: {
  role: BotRole | undefined;
  fallbackId: string;
  onClear?: () => void;
}): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1.5 rounded bg-bg-input px-2 py-0.5 text-sm text-text-primary ring-1 ring-[var(--border-subtle)]">
      <ColorDot color={role?.color} />
      <span>{role?.name ?? fallbackId}</span>
      {onClear ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClear();
          }}
          className="ml-1 text-text-muted hover:text-text-primary"
          aria-label="Clear"
        >
          ×
        </button>
      ) : null}
    </span>
  );
}
