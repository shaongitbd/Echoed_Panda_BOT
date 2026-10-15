'use client';

import { useFormStatus } from 'react-dom';

// Sticky save bar at the bottom of every config form. Uses Next.js's
// useFormStatus to disable + show pending text while the server action
// runs. A raised plate (the float surface), no border and no blur — it is
// told apart from the page by being lighter, like every surface here.
export function SaveBar({ label = 'Save changes' }: { label?: string }): JSX.Element {
  const { pending } = useFormStatus();
  return (
    <div className="sticky bottom-4 z-10 mt-6 flex items-center justify-end gap-3 rounded-xl bg-bg-float p-2.5 pl-4">
      <span className="mr-auto text-xs text-text-faint">Changes reach the bot within a minute.</span>
      <button
        type="submit"
        disabled={pending}
        className="h-10 rounded-lg bg-accent px-5 text-sm font-semibold text-accent-fg transition-colors duration-150 hover:bg-accent-hover active:bg-accent-press disabled:pointer-events-none disabled:opacity-50"
      >
        {pending ? 'Saving…' : label}
      </button>
    </div>
  );
}
