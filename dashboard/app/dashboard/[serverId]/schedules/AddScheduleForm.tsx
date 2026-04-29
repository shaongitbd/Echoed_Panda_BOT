'use client';

import { useState, useTransition } from 'react';
import { addScheduledMessage, type AddResult } from './actions';
import { inputClassName, textareaClassName, Field } from '@/components/FormCard';
import { ChannelPicker } from '@/components/ChannelPicker';
import type { BotChannel } from '@/lib/botApi';

// Form swaps the cadence input based on the selected kind. Every-mode
// shows an interval-in-seconds field; daily-mode shows an HH:MM
// picker. Anything else stays the same.
export function AddScheduleForm({
  serverId,
  channels,
}: {
  serverId: string;
  channels: BotChannel[];
}): JSX.Element {
  const [kind, setKind] = useState<'every' | 'daily'>('every');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const formEl = e.currentTarget;
        startTransition(async () => {
          const res: AddResult = await addScheduledMessage(serverId, fd);
          if (!res.ok) {
            setError(res.error ?? 'Failed to save.');
            return;
          }
          setError(null);
          formEl.reset();
          setKind('every');
        });
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Cadence" name="kind">
          <select
            id="kind"
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.currentTarget.value === 'daily' ? 'daily' : 'every')}
            className={inputClassName}
          >
            <option value="every">Every interval</option>
            <option value="daily">Daily at HH:MM</option>
          </select>
        </Field>

        {kind === 'every' ? (
          <Field
            label="Interval (seconds)"
            name="intervalSeconds"
            hint="Min 300 (5 min), max 30 days."
          >
            <input
              id="intervalSeconds"
              name="intervalSeconds"
              type="number"
              min={300}
              max={2592000}
              defaultValue={3600}
              required
              className={inputClassName}
            />
          </Field>
        ) : (
          <Field label="Time (UTC)" name="dailyTime" hint="24-hour HH:MM. Example: 09:00.">
            <input
              id="dailyTime"
              name="dailyTime"
              type="time"
              required
              defaultValue="09:00"
              className={inputClassName}
            />
          </Field>
        )}

        <Field label="Channel" name="channelId">
          <ChannelPicker
            mode="single"
            name="channelId"
            channels={channels}
            allowedTypes={['text']}
          />
        </Field>
      </div>

      <Field label="Message" name="message" hint="Plain text, up to 1500 chars.">
        <textarea
          id="message"
          name="message"
          placeholder="Standup in 30 minutes — drop your update 👇"
          rows={3}
          required
          maxLength={1500}
          className={textareaClassName}
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
          {pending ? 'Saving…' : 'Add schedule'}
        </button>
      </div>
    </form>
  );
}
