import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ChevronRight, Plus } from 'lucide-react';
import { DashboardTopBar } from '@/components/DashboardTopBar';
import { PageHeader } from '@/components/FormCard';
import { PandaMark } from '@/components/PandaMark';
import { getSession } from '@/lib/auth';
import { fetchUserinfo } from '@/lib/echoed';
import { getBotServers } from '@/lib/botApi';

// Dashboard home — gated. Lists the user's owned servers (from
// Echoed's userinfo `owned_servers` field). Clicking a card takes
// the admin into per-server config.
//
// We deliberately keep this as a server component so the access
// token never leaves the server boundary. Empty / failure states
// are rendered inline rather than thrown so the user never sees a
// stack trace.

export default async function DashboardHome(): Promise<JSX.Element> {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  let user;
  try {
    user = await fetchUserinfo(session.accessToken);
  } catch {
    // Token expired or revoked — kick back to login. A real refresh
    // flow comes later; for now this is "log in again".
    redirect('/login');
  }

  // Intersect "servers the user owns" with "servers the bot is in".
  // Showing the bot-less ones would let the admin save config that the
  // bot can't see — useless and confusing. The bot-less servers are
  // surfaced separately as an "add panda" section below the picker.
  const ownedServers = user.owned_servers ?? [];
  const botServers = await getBotServers();
  const botServerIds = new Set(botServers.map((s) => s.serverId));

  const servers = ownedServers.filter((s) => botServerIds.has(s.id));
  const inviteSuggestions = ownedServers.filter((s) => !botServerIds.has(s.id));

  return (
    <>
      <DashboardTopBar user={{ name: user.name ?? user.username ?? 'You', avatarUrl: user.avatar_url ?? null }} />

      <main className="mx-auto max-w-5xl px-4 pb-24 pt-8 md:px-6 md:pt-12">
        <PageHeader title="Your servers" description="Servers you own where Panda is in. Pick one to set it up." />

        {servers.length === 0 ? (
          <EmptyState hasInviteSuggestions={inviteSuggestions.length > 0} />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {servers.map((s) => (
              <ServerTile key={s.id} id={s.id} name={s.name} iconUrl={s.iconUrl ?? null} />
            ))}
          </div>
        )}

        {inviteSuggestions.length > 0 ? (
          <section className="mt-14">
            <h2 className="text-lg font-semibold tracking-[-0.01em] text-text-primary">Add Panda to another server</h2>
            <p className="mb-5 mt-1 text-sm text-text-muted">
              You own these, but Panda isn&apos;t in them yet. In Echoed: Server Settings → Bots → add Panda.
            </p>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {inviteSuggestions.map((s) => (
                <InviteTile key={s.id} id={s.id} name={s.name} iconUrl={s.iconUrl ?? null} />
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </>
  );
}

interface ServerTileProps {
  id: string;
  name: string;
  iconUrl: string | null;
}

function ServerIcon({ name, iconUrl, size }: { name: string; iconUrl: string | null; size: number }): JSX.Element {
  // Plain <img> — server icons can come from any host the operator
  // configured (MINIO_PUBLIC_URL), and next/image requires every host to
  // be allowlisted in next.config.mjs.
  return iconUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={iconUrl} alt="" width={size} height={size} style={{ width: size, height: size }} className="shrink-0 rounded-xl object-cover" />
  ) : (
    <div
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center rounded-xl bg-bg-elevated text-base font-semibold text-text-secondary"
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </div>
  );
}

function ServerTile({ id, name, iconUrl }: ServerTileProps): JSX.Element {
  return (
    <Link
      href={`/dashboard/${id}`}
      className="group flex items-center gap-3.5 rounded-2xl bg-bg-card p-4 transition-colors duration-100 hover:bg-bg-elevated"
    >
      <ServerIcon name={name} iconUrl={iconUrl} size={48} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-semibold text-text-primary">{name}</div>
        <div className="text-xs text-text-faint">Open settings</div>
      </div>
      <ChevronRight aria-hidden="true" size={18} className="shrink-0 text-text-faint transition-transform duration-100 group-hover:translate-x-0.5 group-hover:text-text-secondary" />
    </Link>
  );
}

function EmptyState({ hasInviteSuggestions }: { hasInviteSuggestions: boolean }): JSX.Element {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-bg-card px-6 py-12 text-center">
      <PandaMark size={48} />
      <h2 className="mt-5 text-lg font-semibold text-text-primary">Panda isn&apos;t in any of your servers yet</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-text-muted">
        {hasInviteSuggestions
          ? 'Add Panda to one of the servers below. Once it joins, the server shows up here to set up.'
          : 'You don’t own a server Panda can join yet. Create one on Echoed, then add Panda from Server Settings → Bots.'}
      </p>
    </div>
  );
}

// A server Panda isn't in. Links to the server on Echoed, where Server
// Settings → Bots adds it.
function InviteTile({ id, name, iconUrl }: { id: string; name: string; iconUrl: string | null }): JSX.Element {
  // Once the URL-invite OAuth flow lands, swap this for
  // `https://go.echoed.gg/oauth2/authorize?client_id=<bot-id>&scope=bot&server_id=${id}`.
  const inviteHref = `https://echoed.gg/server/${id}?invite=panda`;
  return (
    <a
      href={inviteHref}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center gap-3 rounded-xl p-2.5 transition-colors duration-100 hover:bg-bg-card"
    >
      <ServerIcon name={name} iconUrl={iconUrl} size={36} />
      <div className="min-w-0 flex-1 truncate text-sm text-text-secondary group-hover:text-text-primary">{name}</div>
      <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-bg-elevated px-2 py-1 text-xs font-medium text-text-secondary group-hover:text-text-primary">
        <Plus aria-hidden="true" size={13} />
        Add
      </span>
    </a>
  );
}
