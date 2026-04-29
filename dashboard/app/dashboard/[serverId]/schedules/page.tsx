import { listForServer, type ScheduledMessage } from '@/lib/queries/scheduledMessages';
import { FormCard } from '@/components/FormCard';
import { AddScheduleForm } from './AddScheduleForm';
import { removeScheduledMessage } from './actions';

interface PageProps {
  params: Promise<{ serverId: string }>;
}

export default async function SchedulesPage({ params }: PageProps): Promise<JSX.Element> {
  const { serverId } = await params;
  const items = await listForServer(serverId);

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-display text-5xl tracking-tight text-text-primary">Schedules</h1>
        <p className="mt-2 text-text-secondary">
          Recurring messages — every N seconds, or daily at a UTC time. The bot fires every 15s
          and advances next-run atomically.
        </p>
      </div>

      <FormCard
        title="Add a schedule"
        description="Daily times are stored in UTC. Per-server timezones are a future polish."
      >
        <AddScheduleForm serverId={serverId} />
      </FormCard>

      <div className="mt-6 rounded-lg border border-[var(--border-subtle)] bg-bg-card">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-5">
          <h2 className="font-display text-2xl tracking-tight text-text-primary">Active</h2>
          <span className="rounded-sm bg-bg-elevated px-2 py-0.5 text-xs font-semibold text-text-muted">
            {items.length}
          </span>
        </div>

        {items.length === 0 ? (
          <div className="p-8 text-center text-sm text-text-muted">
            No schedules yet. The next run after you add one will fire on the next 15s tick.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {items.map((s) => (
              <ScheduleRow key={s.id} item={s} serverId={serverId} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function ScheduleRow({
  item,
  serverId,
}: {
  item: ScheduledMessage;
  serverId: string;
}): JSX.Element {
  const remove = removeScheduledMessage.bind(null, serverId, item.id);
  const cadence =
    item.kind === 'every'
      ? `every ${formatInterval(item.intervalSeconds ?? 0)}`
      : `daily ${item.dailyTime ?? '?'} UTC`;
  const nextIn = Math.max(0, Math.floor((item.nextRunAt.getTime() - Date.now()) / 1000));

  return (
    <li className="flex items-start justify-between gap-4 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-sm bg-accent-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
            {cadence}
          </span>
          <span className="font-mono text-sm text-text-primary">&lt;#{item.channelId}&gt;</span>
          <span className="text-xs text-text-muted">next in {formatInterval(nextIn)}</span>
        </div>
        <div className="mt-2 max-w-2xl whitespace-pre-wrap break-words font-mono text-xs text-text-secondary">
          {item.message}
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
}

function formatInterval(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (days) parts.push(`${days}d`);
  if (hours) parts.push(`${hours}h`);
  if (minutes && !days) parts.push(`${minutes}m`);
  return parts.join(' ') || '0s';
}
