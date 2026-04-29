'use client';

import { useState } from 'react';

interface ToggleProps {
  name: string;
  defaultChecked?: boolean;
  label: string;
  description?: string;
}

// Native <input type=checkbox> stays in the DOM (and submits with the
// form) but we render a styled track + thumb on top via labels. No
// JS toggle logic — the browser handles state. We mirror local
// state only for the visual transition.
export function Toggle({ name, defaultChecked = false, label, description }: ToggleProps): JSX.Element {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <span className="relative shrink-0">
        <input
          type="checkbox"
          name={name}
          defaultChecked={defaultChecked}
          onChange={(e) => setChecked(e.currentTarget.checked)}
          className="peer sr-only"
        />
        <span
          className={`block h-6 w-11 rounded-full transition-colors duration-150 ${
            checked ? 'bg-accent' : 'bg-bg-elevated'
          }`}
        />
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white transition-transform duration-150 ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </span>
      <span className="flex-1">
        <span className="block text-sm font-medium text-text-primary">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-xs text-text-muted">{description}</span>
        ) : null}
      </span>
    </label>
  );
}
