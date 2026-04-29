'use client';

import { useState, useTransition } from 'react';
import { addStatCounter, type AddResult } from './actions';
import { inputClassName, Field } from '@/components/FormCard';

export function AddCounterForm({ serverId }: { serverId: string }): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const formEl = e.currentTarget;
        startTransition(async () => {
          const res: AddResult = await addStatCounter(serverId, fd);
          if (!res.ok) {
            setError(res.error ?? 'Failed to add.');
            return;
          }
          setError(null);
          formEl.reset();
        });
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Channel" name="channelId">
          <input
            id="channelId"
            name="channelId"
            placeholder="<#channel>"
            required
            className={inputClassName}
          />
        </Field>
        <Field label="Tracks" name="kind">
          <select id="kind" name="kind" required defaultValue="members" className={inputClassName}>
            <option value="members">Members</option>
            <option value="channels">Channels</option>
          </select>
        </Field>
        <Field label="Format" name="format" hint="Use {count} placeholder.">
          <input
            id="format"
            name="format"
            placeholder="Members: {count}"
            className={inputClassName}
          />
        </Field>
      </div>

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
          {pending ? 'Saving…' : 'Add counter'}
        </button>
      </div>
    </form>
  );
}
