'use client';

import { useState, useTransition } from 'react';
import { addKeyword, type AddResult } from './actions';
import { inputClassName, textareaClassName, Field } from '@/components/FormCard';
import { ChannelPicker } from '@/components/ChannelPicker';
import type { BotChannel } from '@/lib/botApi';

export function AddKeywordForm({
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
        const formEl = e.currentTarget;
        startTransition(async () => {
          const res: AddResult = await addKeyword(serverId, fd);
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
        <Field label="Phrase" name="phrase" hint="Word-boundary, case-insensitive.">
          <input
            id="phrase"
            name="phrase"
            placeholder="good bot"
            maxLength={80}
            required
            className={inputClassName}
          />
        </Field>
        <Field
          label="Channel filter"
          name="channelId"
          hint="Optional — leave empty to fire in any channel."
        >
          <ChannelPicker
            mode="single"
            name="channelId"
            channels={channels}
            allowedTypes={['text']}
            clearable
            placeholder="(any channel)"
          />
        </Field>
      </div>

      <Field label="Response" name="response" hint="Max 1900 chars. Plain text.">
        <textarea
          id="response"
          name="response"
          placeholder="🐼 thanks!"
          rows={2}
          maxLength={1900}
          required
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
          {pending ? 'Saving…' : 'Add rule'}
        </button>
      </div>
    </form>
  );
}
