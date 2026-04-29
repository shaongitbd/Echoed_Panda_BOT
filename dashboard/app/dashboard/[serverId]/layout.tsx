import { redirect, notFound } from 'next/navigation';
import { Header } from '@/components/Header';
import { ServerSidebar } from '@/components/ServerSidebar';
import { getSession } from '@/lib/auth';
import { fetchUserinfo } from '@/lib/echoed';

// Per-server config layout. Validates that the logged-in user owns
// the server they're trying to configure — anything outside their
// owned_servers list 404s. We render the same sidebar across all
// child pages.

interface LayoutProps {
  children: React.ReactNode;
  params: Promise<{ serverId: string }>;
}

export default async function ServerLayout({ children, params }: LayoutProps): Promise<JSX.Element> {
  const { serverId } = await params;
  const session = await getSession();
  if (!session) redirect('/login');

  let user;
  try {
    user = await fetchUserinfo(session.accessToken);
  } catch {
    redirect('/login');
  }

  const server = (user.owned_servers ?? []).find((s) => s.id === serverId);
  if (!server) notFound();

  return (
    <>
      <Header />
      <div className="mx-auto flex max-w-7xl">
        <ServerSidebar
          server={{ id: server.id, name: server.name, iconUrl: server.iconUrl ?? null }}
        />
        <main className="min-w-0 flex-1 px-8 py-8">{children}</main>
      </div>
    </>
  );
}
