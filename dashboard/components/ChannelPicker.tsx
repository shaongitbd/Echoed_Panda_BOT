'use client';

// Reusable channel picker. Two modes:
//   single — one channel; renders as a searchable combobox with a
//            cleared selection chip
//   multi  — many channels; renders the combobox plus a chip list of
//            selected channels, each with an × to remove
//
// The picker emits the selected channel-ID string(s) via the
// uncontrolled `name`-shaped <input type="hidden"> values that match
// the page's existing form actions, so callers don't need to rewire
// their server actions. The form sees the same `name` it always saw.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { BotChannel } from '@/lib/botApi';

const TYPE_ICON: Record<string, string> = {
  text: '#',
  voice: '🔊',
  video: '📹',
  calendar: '📅',
  tasks: '✓',
};

interface BasePickerProps {
  channels: BotChannel[];
  // Restrict the picker to specific channel types (e.g. only text). When
  // omitted, all types are pickable.
  allowedTypes?: BotChannel['type'][];
  placeholder?: string;
  // Form field name. Single-mode picker emits exactly this name; multi
  // emits multiple inputs with the same name (browsers serialize as a
  // repeated field — server reads via formData.getAll()).
  name: string;
  // Initial value(s).
  initial?: string | string[] | null;
}

interface SingleProps extends BasePickerProps {
  mode: 'single';
  initial?: string | null;
  // Optional "clear" affordance — single-mode pickers can clear back
  // to "(none)". When false the user must pick something.
  clearable?: boolean;
}

interface MultiProps extends BasePickerProps {
  mode: 'multi';
  initial?: string[];
}

type Props = SingleProps | MultiProps;

export function ChannelPicker(props: Props): JSX.Element {
  const channels = useMemo(
    () =>
      props.allowedTypes && props.allowedTypes.length > 0
        ? props.channels.filter((c) => (props.allowedTypes ?? []).includes(c.type))
        : props.channels,
    [props.channels, props.allowedTypes],
  );

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Selected state. Single = one ID or null. Multi = array of IDs.
  const [singleSel, setSingleSel] = useState<string | null>(
    props.mode === 'single' ? (typeof props.initial === 'string' ? props.initial : null) : null,
  );
  const [multiSel, setMultiSel] = useState<string[]>(
    props.mode === 'multi' && Array.isArray(props.initial) ? props.initial : [],
  );

  // Click-outside handler — close the dropdown when the user clicks
  // anywhere except inside the picker.
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
    if (!q) return channels;
    return channels.filter((c) => c.name.toLowerCase().includes(q));
  }, [channels, query]);

  const channelById = useMemo(() => {
    const m = new Map<string, BotChannel>();
    for (const c of channels) m.set(c.id, c);
    return m;
  }, [channels]);

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
      {/* Hidden form fields — what the server action actually reads. */}
      {props.mode === 'single' ? (
        <input type="hidden" name={props.name} value={singleSel ?? ''} />
      ) : (
        multiSel.map((id) => <input key={id} type="hidden" name={props.name} value={id} />)
      )}

      {/* Selected chips (multi-mode) or the current selection summary (single-mode). */}
      {props.mode === 'multi' && multiSel.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {multiSel.map((id) => {
            const c = channelById.get(id);
            return <Chip key={id} channel={c} fallbackId={id} onRemove={() => removeId(id)} />;
          })}
        </div>
      ) : null}

      {/* Trigger / input. Click to open; type to filter. */}
      <div
        className="flex w-full cursor-text items-center rounded border border-[var(--border-subtle)] bg-bg-input px-3 py-2 transition-colors duration-150 focus-within:border-accent/50"
        onClick={() => setOpen(true)}
      >
        {props.mode === 'single' && singleSel ? (
          <SingleSummary
            channel={channelById.get(singleSel)}
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
            (props.mode === 'single' && singleSel)
              ? ''
              : props.placeholder ?? 'Search channels…'
          }
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </div>

      {/* Dropdown */}
      {open ? (
        <div className="absolute left-0 right-0 z-30 mt-1 max-h-72 overflow-y-auto rounded border border-[var(--border-subtle)] bg-bg-card shadow-xl">
          {filtered.length === 0 ? (
            <div className="px-3 py-3 text-xs text-text-muted">
              {channels.length === 0
                ? 'No channels — bot may not be in this server yet.'
                : 'No channels match.'}
            </div>
          ) : (
            <ul role="listbox" className="py-1">
              {filtered.map((c) => {
                const selected =
                  props.mode === 'single' ? singleSel === c.id : multiSel.includes(c.id);
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => selectId(c.id)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors duration-100 ${
                        selected
                          ? 'bg-accent-muted text-text-primary'
                          : 'text-text-primary hover:bg-bg-hover'
                      }`}
                    >
                      <span className="w-4 text-center text-text-muted">
                        {TYPE_ICON[c.type] ?? '#'}
                      </span>
                      <span className="flex-1 truncate">{c.name}</span>
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

function Chip({
  channel,
  fallbackId,
  onRemove,
}: {
  channel: BotChannel | undefined;
  fallbackId: string;
  onRemove: () => void;
}): JSX.Element {
  const icon = channel ? TYPE_ICON[channel.type] ?? '#' : '#';
  const label = channel?.name ?? fallbackId.slice(0, 8) + '…';
  return (
    <span className="inline-flex items-center gap-1 rounded bg-bg-input px-2 py-1 text-xs text-text-primary ring-1 ring-[var(--border-subtle)]">
      <span className="text-text-muted">{icon}</span>
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
  channel,
  fallbackId,
  onClear,
}: {
  channel: BotChannel | undefined;
  fallbackId: string;
  onClear?: () => void;
}): JSX.Element {
  const icon = channel ? TYPE_ICON[channel.type] ?? '#' : '#';
  return (
    <span className="inline-flex items-center gap-1 rounded bg-bg-input px-2 py-0.5 text-sm text-text-primary ring-1 ring-[var(--border-subtle)]">
      <span className="text-text-muted">{icon}</span>
      <span>{channel?.name ?? fallbackId}</span>
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
