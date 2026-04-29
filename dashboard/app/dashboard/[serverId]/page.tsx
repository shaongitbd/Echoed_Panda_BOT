import Link from 'next/link';
import { getGuildConfig } from '@/lib/queries/guildConfig';
import { getLevelSettings } from '@/lib/queries/levelSettings';

interface PageProps {
  params: Promise<{ serverId: string }>;
}

// Overview page: at-a-glance status of every feature area, with
// jump links to the detail page that owns each. Read-only — every
// edit happens on the dedicated section page.
export default async function OverviewPage({ params }: PageProps): Promise<JSX.Element> {
  const { serverId } = await params;
  const [guild, levels] = await Promise.all([
    getGuildConfig(serverId),
    getLevelSettings(serverId),
  ]);

  const cards: StatusCardProps[] = [
    {
      href: `/dashboard/${serverId}/levels`,
      title: 'Levels',
      enabled: levels.enabled,
      summary: levels.enabled
        ? `${levels.xpPerMessageMin}-${levels.xpPerMessageMax} XP per message · ${levels.cooldownSeconds}s cooldown`
        : 'Disabled',
    },
    {
      href: `/dashboard/${serverId}/welcome`,
      title: 'Welcome',
      enabled: guild.welcomeChannel != null,
      summary: guild.welcomeChannel
        ? `Posts to channel id ${truncate(guild.welcomeChannel)}`
        : 'No welcome channel set',
    },
    {
      href: `/dashboard/${serverId}/welcome`,
      title: 'Auto-role',
      enabled: guild.autoroleId != null,
      summary: guild.autoroleId
        ? `Assigns role id ${truncate(guild.autoroleId)} on join`
        : 'No auto-role set',
    },
    {
      href: `/dashboard/${serverId}/moderation`,
      title: 'Mod-log',
      enabled: guild.modlogChannel != null,
      summary: guild.modlogChannel
        ? `Posts to channel id ${truncate(guild.modlogChannel)}`
        : 'No mod-log channel set',
    },
    {
      href: `/dashboard/${serverId}/moderation`,
      title: 'Anti-raid',
      enabled: guild.antiRaidEnabled,
      summary: guild.antiRaidEnabled
        ? `${guild.antiRaidThreshold} joins / ${guild.antiRaidWindowSeconds}s triggers lockdown`
        : 'Disabled',
    },
  ];

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-display text-5xl tracking-tight text-text-primary">Overview</h1>
        <p className="mt-2 text-text-secondary">
          What panda is doing on this server right now.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <StatusCard key={c.title} {...c} />
        ))}
      </div>
    </div>
  );
}

interface StatusCardProps {
  href: string;
  title: string;
  enabled: boolean;
  summary: string;
  soon?: boolean;
}

function StatusCard({ href, title, enabled, summary, soon }: StatusCardProps): JSX.Element {
  // The "Coming soon" badge in the corner uses the raw status colors
  // rather than accent — accent should be reserved for live, action-
  // ready elements so its presence is meaningful.
  return (
    <Link
      href={href}
      className="group relative block rounded-lg border border-[var(--border-subtle)] bg-bg-card p-5 transition-all duration-150 hover:border-accent/40 hover:bg-bg-hover"
    >
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-2xl tracking-tight text-text-primary">{title}</h2>
        {soon ? (
          <span className="rounded-sm bg-bg-elevated px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            soon
          </span>
        ) : enabled ? (
          <span className="rounded-sm bg-status-online/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-status-online">
            on
          </span>
        ) : (
          <span className="rounded-sm bg-bg-elevated px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            off
          </span>
        )}
      </div>
      <p className="text-sm text-text-secondary">{summary}</p>
    </Link>
  );
}

function truncate(s: string): string {
  return s.length > 12 ? `${s.slice(0, 8)}…` : s;
}
