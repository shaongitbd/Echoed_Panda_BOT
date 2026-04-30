import { listActive, listRecentEnded, type Giveaway } from '@/lib/queries/giveaways';
import { getGuildConfig } from '@/lib/queries/guildConfig';
import { getServerChannels, getServerRoles, type BotChannel } from '@/lib/botApi';
import { FormCard, Field } from '@/components/FormCard';
import { RoleAllowIgnore } from '@/components/AllowIgnoreLists';
import { SaveBar } from '@/components/SaveBar';
import { StartGiveawayForm } from './StartForm';
import { endGiveawayNow, saveGiveawayScope } from './actions';

interface PageProps {
  params: Promise<{ serverId: string }>;
}

export default async function GiveawaysPage({ params }: PageProps): Promise<JSX.Element> {
  const { serverId } = await params;
  const [active, recent, channels, roles, config] = await Promise.all([
    listActive(serverId),
    listRecentEnded(serverId),
    getServerChannels(serverId),
    getServerRoles(serverId),
    getGuildConfig(serverId),
  ]);
  const channelById = new Map(channels.map((c) => [c.id, c]));
  const saveScope = saveGiveawayScope.bind(null, serverId);

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-display text-5xl tracking-tight text-text-primary">Giveaways</h1>
        <p className="mt-2 text-text-secondary">
          Start, monitor, and end giveaways. Members enter by reacting with 🎉. The bot picks
          winners on the next 15s tick after <code className="text-text-primary">end_at</code>{' '}
          passes.
        </p>
      </div>

      <FormCard
        title="Start a giveaway"
        description="The bot posts the announcement and seeds the 🎉 reaction. Hit 'End now' below to wrap up early."
      >
        <StartGiveawayForm serverId={serverId} channels={channels} />
      </FormCard>

      <div className="mt-6 rounded-lg border border-[var(--border-subtle)] bg-bg-card">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-5">
          <h2 className="font-display text-2xl tracking-tight text-text-primary">Active</h2>
          <span className="rounded-sm bg-bg-elevated px-2 py-0.5 text-xs font-semibold text-text-muted">
            {active.length}
          </span>
        </div>
        {active.length === 0 ? (
          <div className="p-8 text-center text-sm text-text-muted">
            No active giveaways. Start one above.
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {active.map((g) => (
              <ActiveRow
                key={g.id}
                giveaway={g}
                channel={channelById.get(g.channelId)}
                serverId={serverId}
              />
            ))}
          </ul>
        )}
      </div>

      {recent.length > 0 ? (
        <div className="mt-6 rounded-lg border border-[var(--border-subtle)] bg-bg-card">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-5">
            <h2 className="font-display text-2xl tracking-tight text-text-primary">
              Recently ended
            </h2>
            <span className="rounded-sm bg-bg-elevated px-2 py-0.5 text-xs font-semibold text-text-muted">
              {recent.length}
            </span>
          </div>
          <ul className="divide-y divide-[var(--border-subtle)]">
            {recent.map((g) => (
              <EndedRow key={g.id} giveaway={g} channel={channelById.get(g.channelId)} />
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ActiveRow({
  giveaway,
  channel,
  serverId,
}: {
  giveaway: Giveaway;
  channel: BotChannel | undefined;
  serverId: string;
}): JSX.Element {
  const remaining = Math.max(
    0,
    Math.floor((giveaway.endAt.getTime() - Date.now()) / 1000),
  );
  const end = endGiveawayNow.bind(null, serverId, giveaway.id);

  return (
    <li className="flex items-start justify-between gap-4 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-base font-semibold text-text-primary">{giveaway.prize}</span>
          <span className="rounded-sm bg-accent-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-accent">
            {giveaway.winnerCount} winner{giveaway.winnerCount === 1 ? '' : 's'}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-muted">
          <span>
            in{' '}
            <span className="text-text-primary">
              <span className="text-text-muted">#</span>
              {channel?.name ?? giveaway.channelId.slice(0, 8) + '…'}
            </span>
          </span>
          <span>·</span>
          <span>ends in {formatRemaining(remaining)}</span>
        </div>
      </div>
      <form action={end}>
        <button
          type="submit"
          className="rounded border border-status-warning/30 bg-status-warning/5 px-3 py-1 text-xs font-semibold text-status-warning transition-colors duration-150 hover:bg-status-warning/15"
        >
          End now
        </button>
      </form>
    </li>
  );
}

function EndedRow({
  giveaway,
  channel,
}: {
  giveaway: Giveaway;
  channel: BotChannel | undefined;
}): JSX.Element {
  return (
    <li className="flex items-start justify-between gap-4 p-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-base font-semibold text-text-primary">{giveaway.prize}</span>
          {giveaway.winners.length > 0 ? (
            <span className="rounded-sm bg-status-online/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-status-online">
              {giveaway.winners.length} winner{giveaway.winners.length === 1 ? '' : 's'}
            </span>
          ) : (
            <span className="rounded-sm bg-bg-elevated px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              no winners
            </span>
          )}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-text-muted">
          <span>
            in{' '}
            <span className="text-text-secondary">
              <span className="text-text-muted">#</span>
              {channel?.name ?? giveaway.channelId.slice(0, 8) + '…'}
            </span>
          </span>
          <span>·</span>
          <span>ended {giveaway.endAt.toISOString().slice(0, 16).replace('T', ' ')} UTC</span>
        </div>
        {giveaway.winners.length > 0 ? (
          <div className="mt-2 text-xs text-text-secondary">
            Winners:{' '}
            {giveaway.winners.map((id, i) => (
              <span key={id}>
                <span className="text-text-primary">&lt;@{id}&gt;</span>
                {i < giveaway.winners.length - 1 ? ', ' : ''}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

function formatRemaining(seconds: number): string {
  if (seconds <= 0) return 'now';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${minutes}m`;
  if (minutes) return `${minutes}m`;
  return `${seconds}s`;
}
