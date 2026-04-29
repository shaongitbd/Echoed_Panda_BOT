'use client';

import { useState, useTransition } from 'react';
import { inputClassName, Field } from '@/components/FormCard';

interface AddSubFormProps {
  // Each notification kind has the same field shape — channel + a
  // platform-specific ID — so we parameterize the second field's
  // label/name/placeholder rather than write three near-duplicate
  // forms. The `action` is bound at the page level to the right
  // server-action and serverId.
  action: (formData: FormData) => Promise<{ ok: boolean; error?: string }>;
  idLabel: string;
  idName: string;
  idPlaceholder: string;
  submitLabel: string;
}

export function AddSubForm({
  action,
  idLabel,
  idName,
  idPlaceholder,
  submitLabel,
}: AddSubFormProps): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const formEl = e.currentTarget;
        startTransition(async () => {
          const res = await action(fd);
          if (!res.ok) {
            setError(res.error ?? 'Failed to save.');
            return;
          }
          setError(null);
          formEl.reset();
        });
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={idLabel} name={idName}>
          <input id={idName} name={idName} placeholder={idPlaceholder} required className={inputClassName} />
        </Field>
        <Field label="Channel" name="channelId" hint="Channel ID or <#channel>.">
          <input
            id="channelId"
            name="channelId"
            placeholder="<#channel>"
            required
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
          {pending ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
