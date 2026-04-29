// Reusable shells for config pages. We extract these because every
// page repeats the same pattern: outer card, header with title+blurb,
// then either a stack of fields or a sub-grouping. Keeps each page
// thin and the visual rhythm consistent.

interface FormCardProps {
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function FormCard({ title, description, children }: FormCardProps): JSX.Element {
  return (
    <section className="rounded-lg border border-[var(--border-subtle)] bg-bg-card p-6">
      <div className="mb-5">
        <h2 className="font-display text-2xl tracking-tight text-text-primary">{title}</h2>
        {description ? (
          <p className="mt-1 text-sm text-text-secondary">{description}</p>
        ) : null}
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
        className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-text-muted"
      >
        {label}
      </label>
      {children}
      {hint ? <p className="mt-1.5 text-xs text-text-muted">{hint}</p> : null}
    </div>
  );
}

// Common input styling pulled into props the page can spread onto
// native inputs. Keeps the styling coherent without forcing every
// form to import a heavy `<Input />` wrapper.
export const inputClassName =
  'w-full rounded bg-bg-input border border-[var(--border-subtle)] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 transition-colors duration-150';

export const textareaClassName = `${inputClassName} font-mono leading-relaxed`;
