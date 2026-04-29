'use client';

import { useState, useTransition } from 'react';
import { startGiveaway, type StartResult } from './actions';
import { inputClassName, Field } from '@/components/FormCard';
import { ChannelPicker } from '@/components/ChannelPicker';
import type { BotChannel } from '@/lib/botApi';

export function StartGiveawayForm({
  serverId,
  channels,
}: {
  serverId: string;
  channels: BotChannel[];
}): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        // Convert duration parts (days/hours/minutes) into seconds for
        // the action. Done client-side so the action stays simple.
        const days = Number(fd.get('durDays')) || 0;
        const hours = Number(fd.get('durHours')) || 0;
        const minutes = Number(fd.get('durMinutes')) || 0;
        const total = days * 86400 + hours * 3600 + minutes * 60;
        fd.delete('durDays');
        fd.delete('durHours');
        fd.delete('durMinutes');
        fd.set('durationSeconds', String(total));

        const formEl = e.currentTarget;
        startTransition(async () => {
          const res: StartResult = await startGiveaway(serverId, fd);
          if (!res.ok) {
            setError(res.error ?? 'Failed to start.');
            return;
          }
          setError(null);
          formEl.reset();
        });
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
        <Field label="Channel" name="channelId">
          <ChannelPicker
            mode="single"
            name="channelId"
            channels={channels}
            allowedTypes={['text']}
          />
        </Field>
        <Field label="Winners" name="winnerCount" hint="1-20.">
          <input
            id="winnerCount"
            name="winnerCount"
            type="number"
            min={1}
            max={20}
            defaultValue={1}
            required
            className={inputClassName}
          />
        </Field>
      </div>

      <Field label="Duration" name="durationSeconds" hint="Min 30s, max 30 days.">
        <div className="grid grid-cols-3 gap-2">
          <DurationInput name="durDays" placeholder="0" suffix="days" />
          <DurationInput name="durHours" placeholder="1" defaultValue={1} suffix="hours" />
          <DurationInput name="durMinutes" placeholder="0" suffix="minutes" />
        </div>
      </Field>

      <Field label="Prize" name="prize" hint="Up to 200 chars. Plain text.">
        <input
          id="prize"
          name="prize"
          placeholder="Steam key for Hades II"
          maxLength={200}
          required
          className={inputClassName}
        />
      </Field>

      {error ? (
        <div className="rounded border border-status-danger/40 bg-status-danger/10 p-3 text-xs text-status-danger">
          {error}
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-accent px-5 py-2 text-sm font-semibold text-accent-fg transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? 'Starting…' : 'Start giveaway'}
        </button>
      </div>
    </form>
  );
}

function DurationInput({
  name,
  placeholder,
  defaultValue,
  suffix,
}: {
  name: string;
  placeholder: string;
  defaultValue?: number;
  suffix: string;
}): JSX.Element {
  return (
    <label className="flex items-center gap-2 rounded border border-[var(--border-subtle)] bg-bg-input px-3 py-2 transition-colors duration-150 focus-within:border-accent/50">
      <input
        type="number"
        name={name}
        min={0}
        max={999}
        placeholder={placeholder}
        defaultValue={defaultValue}
        className="w-full bg-transparent text-sm text-text-primary outline-none"
      />
      <span className="shrink-0 text-xs text-text-muted">{suffix}</span>
    </label>
  );
}
