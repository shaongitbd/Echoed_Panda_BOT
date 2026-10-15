import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { getGuildConfig } from '@/lib/queries/guildConfig';
import { getLevelSettings } from '@/lib/queries/levelSettings';
import { getModuleStatus, type SectionStatus } from '@/lib/queries/moduleStatus';
import { getServerChannels, getServerRoles } from '@/lib/botApi';
import { GROUPS, SECTIONS } from '@/lib/sections';
import { PageHeader } from '@/components/FormCard';
import { iconFor } from '@/components/sectionIcons';

interface PageProps {
  params: Promise<{ serverId: string }>;
}

// Overview: every feature at a glance — on, off, or how many — with the
// details that matter in real names (#channel, @role), never raw ids. Each
// tile opens the page that owns it. Read-only; edits happen on those pages.
export default async function OverviewPage({ params }: PageProps): Promise<JSX.Element> {
  const { serverId } = await params;
  const [guild, levels, status, channels, roles] = await Promise.all([
    getGuildConfig(serverId),
    getLevelSettings(serverId),
    getModuleStatus(serverId),
    getServerChannels(serverId),
    getServerRoles(serverId),
  ]);
  const channel = (id: string | null): string | null =>
    id ? `#${channels.find((c) => c.id === id)?.name ?? 'deleted channel'}` : null;
  const role = (id: string | null): string | null =>
    id ? `@${roles.find((r) => r.id === id)?.name ?? 'deleted role'}` : null;

  // The one line of specifics each tile shows, where there's something to say.
  const detail: Record<string, string | null> = {
    '/moderation': [
      guild.modlogChannel ? `Mod-log in ${channel(guild.modlogChannel)}` : 'No mod-log channel yet',
      guild.antiRaidEnabled ? `anti-raid at ${guild.antiRaidThreshold} joins / ${guild.antiRaidWindowSeconds}s` : null,
    ].filter(Boolean).join(' · '),
    '/welcome': [
      guild.welcomeChannel ? `Greets in ${channel(guild.welcomeChannel)}` : 'No welcome channel yet',
      guild.autoroleId ? `gives ${role(guild.autoroleId)}` : null,
    ].filter(Boolean).join(' · '),
    '/levels': levels.enabled
      ? `${levels.xpPerMessageMin}–${levels.xpPerMessageMax} XP per message, every ${levels.cooldownSeconds}s`
      : null,
    '/general': `Command prefix ${guild.prefix ?? '!'}`,
  };

  // The two things a new server most needs, until they're done.
  const todo = [
    !guild.modlogChannel ? { href: '/moderation', text: 'Pick a mod-log channel, so every moderation action is on record.' } : null,
    !guild.welcomeChannel ? { href: '/welcome', text: 'Choose where new members are welcomed.' } : null,
  ].filter((x): x is { href: string; text: string } => x !== null);

  return (
    <div>
      <PageHeader title="Overview" description="What Panda is doing on this server. Open any feature to change it." />

      {todo.length > 0 ? (
        <div className="mb-8 rounded-2xl bg-accent-tint p-4 sm:p-5">
          <p className="text-sm font-semibold text-text-primary">Worth setting up first</p>
          <ul className="mt-2 space-y-1.5">
            {todo.map((t) => (
              <li key={t.href}>
                <Link href={`/dashboard/${serverId}${t.href}`} className="group inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text-primary">
                  {t.text}
                  <ArrowRight aria-hidden="true" size={14} className="text-text-faint transition-transform duration-100 group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="space-y-9">
        {GROUPS.map((g) => {
          const items = SECTIONS.filter((s) => s.group === g.key && s.href !== '');
          if (items.length === 0) return null;
          return (
            <section key={g.key}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.085em] text-text-faint">{g.label ?? 'Basics'}</h2>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {items.map((s) => {
                  const Icon = iconFor(s.href);
                  return (
                    <Link
                      key={s.href}
                      href={`/dashboard/${serverId}${s.href}`}
                      className="group flex gap-3.5 rounded-2xl bg-bg-card p-4 transition-colors duration-100 hover:bg-bg-elevated"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-bg-elevated text-text-secondary group-hover:bg-bg-hover">
                        <Icon aria-hidden="true" size={18} strokeWidth={1.9} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="text-[15px] font-semibold text-text-primary">{s.label}</span>
                          <StatusTag value={status[s.href]} />
                        </span>
                        <span className="mt-0.5 block text-sm leading-5 text-text-muted">{detail[s.href] || s.blurb}</span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function StatusTag({ value }: { value: SectionStatus | undefined }): JSX.Element | null {
  if (value === undefined) return null;
  if (typeof value === 'number') {
    return (
      <span className="rounded-md bg-bg-elevated px-1.5 text-[11px] font-medium leading-5 text-text-secondary tabular-nums">
        {value === 0 ? 'none yet' : value}
      </span>
    );
  }
  return value ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.07em] text-status-online">
      <span className="h-1.5 w-1.5 rounded-full bg-status-online" />
      On
    </span>
  ) : (
    <span className="text-[11px] font-semibold uppercase tracking-[0.07em] text-text-faint">Off</span>
  );
}
