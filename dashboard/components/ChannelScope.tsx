'use client';

// Channel scope widget: a three-mode radio (all / only / except) paired
// with a multi-select ChannelPicker. The picker is hidden when the mode
// is "all" because there are no channels to specify.
//
// Form-wise this submits two field names from one widget:
//   - <name>_mode   →  'all' | 'only' | 'except'
//   - <name>        →  channel-id (repeated; empty when mode='all')
//
// Server actions read both via formData.get(`${name}_mode`) +
// formData.getAll(name).

import { useState } from 'react';
import type { BotChannel } from '@/lib/botApi';
import { ChannelPicker } from './ChannelPicker';

export type ScopeMode = 'all' | 'only' | 'except';

interface Props {
  name: string;
  channels: BotChannel[];
  initialMode?: ScopeMode;
  initialChannels?: string[];
  // Restrict to a subset of modes — useful when a feature's data model
  // doesn't (yet) support inversion. Defaults to all three.
  modes?: ScopeMode[];
  // Localised copy for the radio labels — keeps the widget reusable
  // across leveling, automod, etc. with feature-specific phrasing.
  labels?: {
    all?: string;
    only?: string;
    except?: string;
  };
  allowedTypes?: BotChannel['type'][];
}

const DEFAULT_MODES: ScopeMode[] = ['all', 'only', 'except'];

export function ChannelScope({
  name,
  channels,
  initialMode = 'all',
  initialChannels = [],
  modes = DEFAULT_MODES,
  labels,
  allowedTypes,
}: Props): JSX.Element {
  const [mode, setMode] = useState<ScopeMode>(
    modes.includes(initialMode) ? initialMode : (modes[0] ?? 'all'),
  );

  return (
    <div>
      <input type="hidden" name={`${name}_mode`} value={mode} />

      <div className="mb-3 flex flex-col gap-1.5 sm:flex-row sm:gap-4">
        {modes.includes('all') ? (
          <RadioRow
            checked={mode === 'all'}
            onChange={() => setMode('all')}
            label={labels?.all ?? 'All channels'}
          />
        ) : null}
        {modes.includes('only') ? (
          <RadioRow
            checked={mode === 'only'}
            onChange={() => setMode('only')}
            label={labels?.only ?? 'Only these channels'}
          />
        ) : null}
        {modes.includes('except') ? (
          <RadioRow
            checked={mode === 'except'}
            onChange={() => setMode('except')}
            label={labels?.except ?? 'All except these'}
          />
        ) : null}
      </div>

      {mode === 'all' ? null : (
        <ChannelPicker
          mode="multi"
          name={name}
          channels={channels}
          initial={initialChannels}
          allowedTypes={allowedTypes}
          placeholder={mode === 'only' ? 'Pick channels to include…' : 'Pick channels to exclude…'}
        />
      )}
    </div>
  );
}

function RadioRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}): JSX.Element {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-text-primary">
      <span
        className={`flex h-4 w-4 items-center justify-center rounded-full border transition-colors duration-150 ${
          checked ? 'border-accent' : 'border-[var(--border-subtle)]'
        }`}
        aria-hidden="true"
      >
        {checked ? <span className="h-2 w-2 rounded-full bg-accent" /> : null}
      </span>
      <input
        type="radio"
        className="sr-only"
        checked={checked}
        onChange={onChange}
        readOnly
      />
      <span>{label}</span>
    </label>
  );
}
