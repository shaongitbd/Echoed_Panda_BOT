'use client';

import { useState, useTransition } from 'react';
import { addCustomCommand, type AddCmdResult } from './actions';
import { inputClassName, textareaClassName, Field } from '@/components/FormCard';

interface Props {
  serverId: string;
  userId: string;
}

// Client component because we want to surface validation errors
// inline (without navigating) and reset the form on success. A
// pure-form action could only redirect or revalidate.
export function AddCommandForm({ serverId, userId }: Props): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const formEl = e.currentTarget;
        startTransition(async () => {
          const res: AddCmdResult = await addCustomCommand(serverId, userId, fd);
          if (!res.ok) {
            setError(res.error ?? 'Failed to save.');
            return;
          }
          setError(null);
          formEl.reset();
        });
      }}
      className="space-y-5"
    >
      <div className="grid gap-5 sm:grid-cols-[1fr_2fr]">
        <Field label="Command name" name="name" hint="Lowercase a-z / 0-9 / dash / underscore.">
          <input
            id="name"
            name="name"
            placeholder="welcome"
            maxLength={32}
            required
            className={inputClassName}
          />
        </Field>
        <Field
          label="Response"
          name="response"
          hint="Placeholders: {user}, {user.name}, {args}. Max 1900 chars."
        >
          <textarea
            id="response"
            name="response"
            placeholder="Hey {user}, welcome aboard 🐼"
            rows={3}
            maxLength={1900}
            required
            className={textareaClassName}
          />
        </Field>
      </div>

      {error ? (
        <div className="rounded border border-status-danger/40 bg-status-danger/10 p-3 text-sm text-status-danger">
          {error}
        </div>
      ) : null}

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded bg-accent px-5 py-2 text-sm font-semibold text-accent-fg transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Add command'}
        </button>
      </div>
    </form>
  );
}
