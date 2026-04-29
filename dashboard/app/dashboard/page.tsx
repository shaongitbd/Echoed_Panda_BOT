import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
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
  // surfaced separately as an "invite panda" section below the picker.
  const ownedServers = user.owned_servers ?? [];
  const botServers = await getBotServers();
  const botServerIds = new Set(botServers.map((s) => s.serverId));

  const servers = ownedServers.filter((s) => botServerIds.has(s.id));
  const inviteSuggestions = ownedServers.filter((s) => !botServerIds.has(s.id));

  return (
    <>
      <Header />

      <main className="mx-auto max-w-6xl px-6 pt-12 pb-24">
        <div className="mb-10">
          <h1 className="font-display text-5xl tracking-tight text-text-primary">
            Pick a server
          </h1>
          <p className="mt-2 text-text-secondary">
            Servers where you own and panda is already invited.
          </p>
        </div>

        {servers.length === 0 ? (
          <EmptyState hasInviteSuggestions={inviteSuggestions.length > 0} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {servers.map((s) => (
              <ServerTile
                key={s.id}
                id={s.id}
                name={s.name}
                iconUrl={s.iconUrl ?? null}
              />
            ))}
          </div>
        )}

        {inviteSuggestions.length > 0 ? (
          <div className="mt-12">
            <h2 className="font-display text-2xl tracking-tight text-text-primary">
              Invite panda to your other servers
            </h2>
            <p className="mt-1 mb-5 text-sm text-text-secondary">
              These servers belong to you but panda hasn't joined yet.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {inviteSuggestions.map((s) => (
                <InviteTile
                  key={s.id}
                  id={s.id}
                  name={s.name}
                  iconUrl={s.iconUrl ?? null}
                />
              ))}
            </div>
          </div>
        ) : null}
      </main>

      <Footer />
    </>
  );
}

interface ServerTileProps {
  id: string;
  name: string;
  iconUrl: string | null;
}

function ServerTile({ id, name, iconUrl }: ServerTileProps): JSX.Element {
  // First letter of the server name as the icon fallback. Same
  // visual treatment as the landing's sample-servers row, so the
  // dashboard feels continuous with the marketing page.
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  return (
    <Link
      href={`/dashboard/${id}`}
      className="group flex items-center gap-4 rounded-lg border border-[var(--border-subtle)] bg-bg-card p-5 transition-all duration-150 hover:border-accent/40 hover:bg-bg-hover"
    >
      {iconUrl ? (
        // Plain <img> — server icons can come from any host the
        // operator configured (MINIO_PUBLIC_URL), and next/image
        // requires every host to be allowlisted in next.config.mjs.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconUrl}
          alt=""
          width={56}
          height={56}
          className="h-14 w-14 rounded-sm object-cover ring-1 ring-[var(--border-subtle)]"
        />
      ) : (
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-sm bg-accent-muted font-display text-2xl text-accent">
          {initial}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-base font-semibold text-text-primary">{name}</div>
        <div className="text-xs text-text-muted">
          ID: <span className="font-mono">{id.slice(0, 8)}…</span>
        </div>
      </div>
      <span className="ml-auto text-text-muted transition-colors duration-150 group-hover:text-accent">
        →
      </span>
    </Link>
  );
}

function EmptyState({ hasInviteSuggestions }: { hasInviteSuggestions: boolean }): JSX.Element {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-bg-card p-12 text-center">
      <div className="mb-4 text-5xl">🐼</div>
      <h2 className="font-display text-3xl tracking-tight text-text-primary">
        Panda hasn't joined any of your servers yet
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
        {hasInviteSuggestions
          ? 'Invite panda to one of the servers below. Once it joins, the server will appear here for you to configure.'
          : 'You own no servers panda can join. Create a server on Echoed first — then come back and invite panda.'}
      </p>
    </div>
  );
}

// Invite tile — visually similar to ServerTile but greyed-out and
// links to the bot-invite flow rather than the config page.
function InviteTile({
  id,
  name,
  iconUrl,
}: {
  id: string;
  name: string;
  iconUrl: string | null;
}): JSX.Element {
  const initial = name.trim().charAt(0).toUpperCase() || '?';
  // Link target is the bot invite endpoint. Once the URL-invite
  // OAuth flow lands, swap this for `https://go.echoed.gg/oauth2/authorize?client_id=<bot-id>&scope=bot&server_id=${id}`.
  const inviteHref = `https://echoed.gg/server/${id}?invite=panda`;
  return (
    <a
      href={inviteHref}
      target="_blank"
      rel="noreferrer"
      className="group flex items-center gap-3 rounded-lg border border-dashed border-[var(--border-subtle)] bg-bg-card/40 p-4 transition-all duration-150 hover:border-accent/40 hover:bg-bg-hover"
    >
      {iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconUrl}
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 rounded-sm object-cover opacity-70 ring-1 ring-[var(--border-subtle)]"
        />
      ) : (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-bg-elevated font-display text-base text-text-muted">
          {initial}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-text-secondary group-hover:text-text-primary">
          {name}
        </div>
        <div className="text-[11px] uppercase tracking-wider text-text-muted">
          Invite panda →
        </div>
      </div>
    </a>
  );
}
