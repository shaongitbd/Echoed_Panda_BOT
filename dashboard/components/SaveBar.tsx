'use client';

import { useFormStatus } from 'react-dom';

// Sticky save bar at the bottom of every config form. Uses Next.js's
// useFormStatus to disable + show pending text while the server
// action runs. Lives outside the form's normal flow visually, but
// inside it logically — hence type="submit".
export function SaveBar({ label = 'Save changes' }: { label?: string }): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <div className="sticky bottom-4 z-10 mt-8 flex justify-end rounded-lg border border-[var(--border-subtle)] bg-bg-card/95 p-3 backdrop-blur">
      <button
        type="submit"
        disabled={pending}
        className="rounded bg-accent px-6 py-2.5 text-sm font-semibold text-accent-fg transition-colors duration-150 hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? 'Saving…' : label}
      </button>
    </div>
  );
}
