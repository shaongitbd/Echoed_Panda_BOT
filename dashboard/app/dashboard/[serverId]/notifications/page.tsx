import {
  listRedditSubs,
  listTwitchSubs,
  listYouTubeSubs,
} from '@/lib/queries/notifications';
import { getServerChannels, type BotChannel } from '@/lib/botApi';
import { FormCard } from '@/components/FormCard';
import { AddSubForm } from './AddSubForm';
import {
  addReddit,
  removeReddit,
  addTwitch,
  removeTwitch,
  addYouTube,
  removeYouTube,
} from './actions';

interface PageProps {
  params: Promise<{ serverId: string }>;
}

const TWITCH_CONFIGURED =
  Boolean(process.env.TWITCH_CLIENT_ID) && Boolean(process.env.TWITCH_CLIENT_SECRET);

export default async function NotificationsPage({ params }: PageProps): Promise<JSX.Element> {
  const { serverId } = await params;
  const [reddit, twitch, youtube, channels] = await Promise.all([
    listRedditSubs(serverId),
    listTwitchSubs(serverId),
    listYouTubeSubs(serverId),
    getServerChannels(serverId),
  ]);
  const channelById = new Map(channels.map((c) => [c.id, c]));

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-display text-5xl tracking-tight text-text-primary">Notifications</h1>
        <p className="mt-2 text-text-secondary">
          External-feed alerts. The bot polls every 5 minutes — new posts go to the channel you
          pick.
        </p>
      </div>

      <div className="space-y-6">
        {/* ─── Reddit ─────────────────────────────────────────────── */}
        <FormCard
          title="Reddit"
          description="Watch a subreddit's /new feed and post updates to a channel. No API key required."
        >
          <AddSubForm
            action={addReddit.bind(null, serverId)}
            idLabel="Subreddit"
            idName="subreddit"
            idPlaceholder="memes, programmerhumor, …"
            submitLabel="Follow"
            channels={channels}
          />
          <SubList
            empty="No subreddits followed yet."
            items={reddit.map((r) => ({
              id: r.id,
              left: <span className="font-semibold">r/{r.subreddit}</span>,
              right: <ChannelMention id={r.channelId} channels={channelById} />,
            }))}
            onRemove={(id) => removeReddit.bind(null, serverId, id)}
          />
        </FormCard>

        {/* ─── Twitch ─────────────────────────────────────────────── */}
        <FormCard
          title="Twitch"
          description={
            TWITCH_CONFIGURED
              ? 'Live-on-Twitch alerts. Edge-detected — only fires on offline → online transitions.'
              : 'Twitch integration isn\'t configured on this bot. Subscriptions can be added but won\'t fire until the operator sets TWITCH_CLIENT_ID and TWITCH_CLIENT_SECRET.'
          }
        >
          {!TWITCH_CONFIGURED ? (
            <div className="rounded border border-status-warning/40 bg-status-warning/10 p-3 text-xs text-status-warning">
              Twitch credentials missing — alerts won't fire yet.
            </div>
          ) : null}
          <AddSubForm
            action={addTwitch.bind(null, serverId)}
            idLabel="Twitch username"
            idName="twitchLogin"
            idPlaceholder="username (no @)"
            submitLabel="Follow"
            channels={channels}
          />
          <SubList
            empty="No streamers followed yet."
            items={twitch.map((t) => ({
              id: t.id,
              left: (
                <span className="flex items-center gap-2">
                  <span className="font-semibold">{t.twitchLogin}</span>
                  {t.lastCheckLive ? (
                    <span className="rounded-sm bg-status-online/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-status-online">
                      live
                    </span>
                  ) : null}
                </span>
              ),
              right: <ChannelMention id={t.channelId} channels={channelById} />,
            }))}
            onRemove={(id) => removeTwitch.bind(null, serverId, id)}
          />
        </FormCard>

        {/* ─── YouTube ────────────────────────────────────────────── */}
        <FormCard
          title="YouTube"
          description="New uploads via the public RSS feed. No API key required, but the channel ID must be the UC… form (not @handle)."
        >
          <AddSubForm
            action={addYouTube.bind(null, serverId)}
            idLabel="YouTube channel ID"
            idName="youtubeChannelId"
            idPlaceholder="UCxxxxxxxxxxxxxxxxxxxx"
            submitLabel="Follow"
            channels={channels}
          />
          <SubList
            empty="No channels followed yet."
            items={youtube.map((y) => ({
              id: y.id,
              left: (
                <code className="font-mono text-xs text-text-primary">{y.youtubeChannelId}</code>
              ),
              right: <ChannelMention id={y.channelId} channels={channelById} />,
            }))}
            onRemove={(id) => removeYouTube.bind(null, serverId, id)}
          />
        </FormCard>
      </div>
    </div>
  );
}

interface SubListItem {
  id: number;
  left: React.ReactNode;
  right: React.ReactNode;
}

function SubList({
  items,
  empty,
  onRemove,
}: {
  items: SubListItem[];
  empty: string;
  onRemove: (id: number) => () => Promise<void>;
}): JSX.Element {
  if (items.length === 0) {
    return <div className="text-xs text-text-muted">{empty}</div>;
  }
  return (
    <ul className="divide-y divide-[var(--border-subtle)] rounded border border-[var(--border-subtle)] bg-bg-input/30">
      {items.map((it) => (
        <li key={it.id} className="flex items-center justify-between gap-3 p-3">
          <div className="min-w-0 flex-1 text-sm">{it.left}</div>
          <div className="text-xs text-text-secondary">{it.right}</div>
          <form action={onRemove(it.id)}>
            <button
              type="submit"
              className="rounded border border-status-danger/30 bg-status-danger/5 px-3 py-1 text-xs font-semibold text-status-danger transition-colors duration-150 hover:bg-status-danger/15"
            >
              Remove
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}

function ChannelMention({
  id,
  channels,
}: {
  id: string;
  channels: Map<string, BotChannel>;
}): JSX.Element {
  const c = channels.get(id);
  return (
    <span className="text-text-primary">
      <span className="text-text-muted">#</span>
      {c?.name ?? id.slice(0, 8) + '…'}
    </span>
  );
}
