import { listForServer } from '@/lib/queries/autoReact';
import { getServerChannels } from '@/lib/botApi';
import { FormCard } from '@/components/FormCard';
import { AddAutoReactForm } from './AddAutoReactForm';
import { removeAutoReactRule } from './actions';

interface PageProps {
  params: Promise<{ serverId: string }>;
}

export default async function AutoReactPage({ params }: PageProps): Promise<JSX.Element> {
  const { serverId } = await params;
  const [rules, channels] = await Promise.all([
    listForServer(serverId),
    getServerChannels(serverId),
  ]);
  const channelById = new Map(channels.map((c) => [c.id, c]));

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-display text-5xl tracking-tight text-text-primary">Auto-react</h1>
        <p className="mt-2 text-text-secondary">
          Add a reaction emoji automatically to every new message in a channel.
        </p>
      </div>

      <FormCard
        title="Add a rule"
        description="One rule per (channel, emoji) pair. Re-adding the same combo replaces the previous one."
      >
        <AddAutoReactForm serverId={serverId} channels={channels} />
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
            No auto-react rules yet.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {rules.map((r) => {
              const remove = removeAutoReactRule.bind(null, serverId, r.channelId, r.emoji);
              return (
                <li
                  key={`${r.channelId}-${r.emoji}`}
                  className="flex items-center justify-between gap-4 p-4"
                >
                  <div className="flex items-center gap-4">
                    <span className="text-2xl">{r.emoji}</span>
                    <span className="text-sm text-text-secondary">→</span>
                    <span className="text-sm text-text-primary">
                      <span className="text-text-muted">#</span>
                      {channelById.get(r.channelId)?.name ?? r.channelId.slice(0, 8) + '…'}
                    </span>
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
