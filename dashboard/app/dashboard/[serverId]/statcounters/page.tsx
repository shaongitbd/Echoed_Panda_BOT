import { listForServer } from '@/lib/queries/statCounters';
import { getServerChannels } from '@/lib/botApi';
import { FormCard } from '@/components/FormCard';
import { AddCounterForm } from './AddCounterForm';
import { removeStatCounter } from './actions';

interface PageProps {
  params: Promise<{ serverId: string }>;
}

export default async function StatCountersPage({ params }: PageProps): Promise<JSX.Element> {
  const { serverId } = await params;
  const [counters, channels] = await Promise.all([
    listForServer(serverId),
    getServerChannels(serverId),
  ]);
  const channelById = new Map(channels.map((c) => [c.id, c]));

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-display text-5xl tracking-tight text-text-primary">
          Stat counters
        </h1>
        <p className="mt-2 text-text-secondary">
          Auto-rename channels with live numbers. Best on locked / no-permission voice channels
          so the name shows in the sidebar but nobody can join and hide it.
        </p>
      </div>

      <FormCard
        title="Add a counter"
        description="The bot renames the channel every minute (or when the value changes). Customize the format with the {count} placeholder."
      >
        <AddCounterForm serverId={serverId} channels={channels} />
      </FormCard>

      <div className="mt-6 rounded-lg border border-[var(--border-subtle)] bg-bg-card">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-5">
          <h2 className="font-display text-2xl tracking-tight text-text-primary">Configured</h2>
          <span className="rounded-sm bg-bg-elevated px-2 py-0.5 text-xs font-semibold text-text-muted">
            {counters.length}
          </span>
        </div>

        {counters.length === 0 ? (
          <div className="p-8 text-center text-sm text-text-muted">
            No counters yet. Add one above and the bot starts renaming on the next tick (≤1 min).
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {counters.map((c) => {
              const remove = removeStatCounter.bind(null, serverId, c.channelId);
              return (
                <li key={c.channelId} className="flex items-start justify-between gap-4 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm text-text-primary">
                        <span className="text-text-muted">#</span>
                        {channelById.get(c.channelId)?.name ?? c.channelId.slice(0, 8) + '…'}
                      </span>
                      <span className="rounded-sm bg-accent-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
                        {c.kind}
                      </span>
                      {c.lastValue !== null ? (
                        <span className="text-xs text-text-muted">last: {c.lastValue}</span>
                      ) : null}
                    </div>
                    <div className="mt-1 font-mono text-xs text-text-secondary">
                      format: {c.format}
                    </div>
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
