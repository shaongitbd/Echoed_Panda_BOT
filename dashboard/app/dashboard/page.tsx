import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { getSession } from '@/lib/auth';
import { fetchUserinfo } from '@/lib/echoed';

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

  const servers = user.owned_servers ?? [];

  return (
    <>
      <Header />

      <main className="mx-auto max-w-6xl px-6 pt-12 pb-24">
        <div className="mb-10">
          <h1 className="font-display text-5xl tracking-tight text-text-primary">
            Pick a server
          </h1>
          <p className="mt-2 text-text-secondary">
            Choose one of your servers to configure panda. Only servers where you have
            <span className="text-text-primary"> Manage Server</span> show up here.
          </p>
        </div>

        {servers.length === 0 ? (
          <EmptyState />
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

function EmptyState(): JSX.Element {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-bg-card p-12 text-center">
      <div className="mb-4 text-5xl">🐼</div>
      <h2 className="font-display text-3xl tracking-tight text-text-primary">
        No servers to configure
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
        You need <span className="text-text-primary">Manage Server</span> permission on at least
        one Echoed server, and panda needs to be invited there. Add panda below — once it joins,
        the server will appear here.
      </p>
      <Link
        href="/login"
        className="mt-8 inline-block rounded bg-accent px-6 py-3 text-sm font-semibold text-accent-fg transition-colors duration-150 hover:bg-accent-hover"
      >
        Add panda to a server
      </Link>
    </div>
  );
}
