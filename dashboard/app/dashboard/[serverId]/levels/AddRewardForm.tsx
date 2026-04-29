'use client';

import { useState, useTransition } from 'react';
import { addLevelReward, type AddRewardResult } from './actions';
import { inputClassName, Field } from '@/components/FormCard';
import { RolePicker } from '@/components/RolePicker';
import type { BotRole } from '@/lib/botApi';

export function AddRewardForm({
  serverId,
  roles,
}: {
  serverId: string;
  roles: BotRole[];
}): JSX.Element {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const formEl = e.currentTarget;
        startTransition(async () => {
          const res: AddRewardResult = await addLevelReward(serverId, fd);
          if (!res.ok) {
            setError(res.error ?? 'Failed to add reward.');
            return;
          }
          setError(null);
          formEl.reset();
        });
      }}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
        <Field label="Level" name="level">
          <input
            id="level"
            name="level"
            type="number"
            min={1}
            max={1000}
            placeholder="5"
            required
            className={inputClassName}
          />
        </Field>
        <Field label="Role" name="roleId">
          <RolePicker mode="single" name="roleId" roles={roles} />
        </Field>
        <button
          type="submit"
          disabled={pending}
          className="h-[42px] rounded bg-accent px-5 text-sm font-semibold text-accent-fg transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? 'Saving…' : 'Add reward'}
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
