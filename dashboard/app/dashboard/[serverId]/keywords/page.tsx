import { listForServer } from '@/lib/queries/keywords';
import { FormCard } from '@/components/FormCard';
import { AddKeywordForm } from './AddKeywordForm';
import { removeKeyword } from './actions';

interface PageProps {
  params: Promise<{ serverId: string }>;
}

export default async function KeywordsPage({ params }: PageProps): Promise<JSX.Element> {
  const { serverId } = await params;
  const rules = await listForServer(serverId);

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-display text-5xl tracking-tight text-text-primary">Keywords</h1>
        <p className="mt-2 text-text-secondary">
          Reply automatically when a phrase is said. First match wins per message.
        </p>
      </div>

      <FormCard
        title="Add a rule"
        description="The bot fires AT MOST ONE keyword response per message — rules are evaluated in insertion order."
      >
        <AddKeywordForm serverId={serverId} />
      </FormCard>

      <div className="mt-6 rounded-lg border border-[var(--border-subtle)] bg-bg-card">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-5">
          <h2 className="font-display text-2xl tracking-tight text-text-primary">
            Configured rules
          </h2>
          <span className="rounded-sm bg-bg-elevated px-2 py-0.5 text-xs font-semibold text-text-muted">
            {rules.length}
          </span>
        </div>

        {rules.length === 0 ? (
          <div className="p-8 text-center text-sm text-text-muted">
            No keyword rules yet.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {rules.map((r) => {
              const remove = removeKeyword.bind(null, serverId, r.id);
              return (
                <li key={r.id} className="flex items-start justify-between gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <code className="rounded bg-bg-elevated px-2 py-0.5 font-mono text-sm text-accent">
                        "{r.phrase}"
                      </code>
                      {r.channelId ? (
                        <span className="font-mono text-xs text-text-muted">
                          in &lt;#{r.channelId}&gt;
                        </span>
                      ) : (
                        <span className="text-xs text-text-muted">any channel</span>
                      )}
                    </div>
                    <pre className="mt-2 max-w-2xl overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-text-secondary">
                      {r.response}
                    </pre>
                  </div>
                  <form action={remove}>
                    <button
                      type="submit"
                      className="rounded border border-status-danger/30 bg-status-danger/5 px-3 py-1 text-xs font-semibold text-status-danger transition-colors duration-150 hover:bg-status-danger/15"
                    >
                      Remove
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
