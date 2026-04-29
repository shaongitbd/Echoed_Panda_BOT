'use client';

// MEE6-style allow/ignore widget pair for channels and roles.
//
// Two stacked multi-select pickers with clear semantics:
//   - "Allowed" — empty list means "everywhere / everyone"; non-empty
//     restricts the feature to those targets.
//   - "Ignored" — overrides allowed. Anything in this list is excluded
//     even if it's also in (or implied by) the allowed list.
//
// The component is a pure UI shell over the existing ChannelPicker /
// RolePicker. Form-wise it emits two separate field names per pair so
// the server action reads them independently.

import { ChannelPicker } from './ChannelPicker';
import { RolePicker } from './RolePicker';
import type { BotChannel, BotRole } from '@/lib/botApi';

export interface ChannelAllowIgnoreProps {
  channels: BotChannel[];
  allowedTypes?: BotChannel['type'][];

  allowedName: string;
  ignoredName: string;
  initialAllowed: string[];
  initialIgnored: string[];

  // Localised copy for the two labels (the feature wording matters —
  // "where members earn XP" reads better than "allowed channels").
  allowedLabel: string;
  ignoredLabel: string;
  allowedHint?: string;
  ignoredHint?: string;
}

export function ChannelAllowIgnore(props: ChannelAllowIgnoreProps): JSX.Element {
  return (
    <div className="space-y-4">
      <Field label={props.allowedLabel} hint={props.allowedHint}>
        <ChannelPicker
          mode="multi"
          name={props.allowedName}
          channels={props.channels}
          initial={props.initialAllowed}
          allowedTypes={props.allowedTypes}
          placeholder="(any channel — leave empty for no allow-list)"
        />
      </Field>
      <Field label={props.ignoredLabel} hint={props.ignoredHint}>
        <ChannelPicker
          mode="multi"
          name={props.ignoredName}
          channels={props.channels}
          initial={props.initialIgnored}
          allowedTypes={props.allowedTypes}
          placeholder="(none ignored)"
        />
      </Field>
    </div>
  );
}

export interface RoleAllowIgnoreProps {
  roles: BotRole[];

  allowedName: string;
  ignoredName: string;
  initialAllowed: string[];
  initialIgnored: string[];

  allowedLabel: string;
  ignoredLabel: string;
  allowedHint?: string;
  ignoredHint?: string;
}

export function RoleAllowIgnore(props: RoleAllowIgnoreProps): JSX.Element {
  return (
    <div className="space-y-4">
      <Field label={props.allowedLabel} hint={props.allowedHint}>
        <RolePicker
          mode="multi"
          name={props.allowedName}
          roles={props.roles}
          initial={props.initialAllowed}
          placeholder="(any role — leave empty for no allow-list)"
        />
      </Field>
      <Field label={props.ignoredLabel} hint={props.ignoredHint}>
        <RolePicker
          mode="multi"
          name={props.ignoredName}
          roles={props.roles}
          initial={props.initialIgnored}
          placeholder="(no roles ignored)"
        />
      </Field>
    </div>
  );
}

// Local Field — avoids importing FormCard's Field which expects a
// `name` prop tied to a single input, while ours wraps a multi-input
// picker. Same visual rhythm as the rest of the app.
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div>
      <div className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-text-muted">
        {label}
      </div>
      {children}
      {hint ? <p className="mt-1.5 text-xs text-text-muted">{hint}</p> : null}
    </div>
  );
}
