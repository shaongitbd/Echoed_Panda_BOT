// Reusable shells for config pages. Every page repeats the same pattern:
// a page heading, then plates (cards) of fields. echoed.gg's plate: a filled
// surface one step lighter than the page, rounded 16, no border — the step
// is what separates it.

interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  /** Right-aligned controls (e.g. a link to the docs). */
  actions?: React.ReactNode;
}

/** The page's title — Unbounded, sized for an app page rather than a hero. */
export function PageHeader({ title, description, actions }: PageHeaderProps): JSX.Element {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-3xl">
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.035em] text-text-primary sm:text-[32px]">
          {title}
        </h1>
        {description ? <p className="mt-2 text-[15px] leading-6 text-text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  );
}

interface FormCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Anchor id, so in-page links and search can jump straight here. */
  id?: string;
}

export function FormCard({ title, description, children, id }: FormCardProps): JSX.Element {
  return (
    <section id={id} className="scroll-mt-24 rounded-2xl bg-bg-card p-5 sm:p-6">
      <div className="mb-5">
        <h2 className="text-lg font-semibold tracking-[-0.01em] text-text-primary">{title}</h2>
        {description ? <p className="mt-1 text-sm leading-6 text-text-muted">{description}</p> : null}
      </div>
      <div className="space-y-5">{children}</div>
    </section>
  );
}

interface FieldProps {
  label: string;
  name: string;
  hint?: string;
  children: React.ReactNode;
}

export function Field({ label, name, hint, children }: FieldProps): JSX.Element {
  return (
    <div>
      <label
        htmlFor={name}
        className="mb-2 block text-xs font-semibold uppercase tracking-[0.085em] text-text-muted"
      >
        {label}
      </label>
      {children}
      {hint ? <p className="mt-2 text-xs leading-5 text-text-faint">{hint}</p> : null}
    </div>
  );
}

// echoed.gg's field: the recessed panel surface with an inset edge (not a
// border, so focus can thicken it without the field shifting), lighter edge
// on hover, the red accent edge on focus.
export const inputClassName =
  'w-full rounded-lg bg-bg-input px-3.5 py-2.5 text-[15px] text-text-primary placeholder:text-text-faint ' +
  'shadow-[inset_0_0_0_1px_var(--border-subtle)] hover:shadow-[inset_0_0_0_1px_var(--text-faint)] ' +
  'focus:outline-none focus:shadow-[inset_0_0_0_2px_var(--accent)] transition-shadow duration-150';

export const textareaClassName = `${inputClassName} font-mono text-sm leading-relaxed`;
