'use client';

import { useState, useTransition } from 'react';
import { addAutoReactRule, type AddResult } from './actions';
import { inputClassName, Field } from '@/components/FormCard';

export function AddAutoReactForm({ serverId }: { serverId: string }): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const formEl = e.currentTarget;
        startTransition(async () => {
          const res: AddResult = await addAutoReactRule(serverId, fd);
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
      <div className="grid gap-4 sm:grid-cols-[2fr_1fr_auto] sm:items-end">
        <Field label="Channel" name="channelId">
          <input
            id="channelId"
            name="channelId"
            placeholder="<#channel>"
            required
            className={inputClassName}
          />
        </Field>
        <Field label="Emoji" name="emoji" hint="Unicode 🐼 or :name:.">
          <input id="emoji" name="emoji" placeholder="🐼" required className={inputClassName} />
        </Field>
        <button
          type="submit"
          disabled={pending}
          className="h-[42px] rounded bg-accent px-5 text-sm font-semibold text-accent-fg transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Add rule'}
        </button>
      </div>

      {error ? (
        <div className="rounded border border-status-danger/40 bg-status-danger/10 p-3 text-xs text-status-danger">
          {error}
        </div>
      ) : null}
    </form>
  );
}
