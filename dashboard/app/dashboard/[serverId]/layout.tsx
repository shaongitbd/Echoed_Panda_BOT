import { redirect, notFound } from 'next/navigation';
import { DashboardTopBar } from '@/components/DashboardTopBar';
import { ServerSidebar } from '@/components/ServerSidebar';
import { getSession } from '@/lib/auth';
import { fetchUserinfo } from '@/lib/echoed';
import { getModuleStatus } from '@/lib/queries/moduleStatus';

// Per-server config layout. Validates that the logged-in user owns
// the server they're trying to configure — anything outside their
// owned_servers list 404s. Every child page shares the top bar and the
// grouped sidebar (with what's switched on).

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

  const status = await getModuleStatus(serverId);

  return (
    <>
      <DashboardTopBar user={{ name: user.name ?? user.username ?? 'You', avatarUrl: user.avatar_url ?? null }} />
      <div className="mx-auto flex max-w-[1400px]">
        <ServerSidebar
          server={{ id: server.id, name: server.name, iconUrl: server.iconUrl ?? null }}
          status={status}
        />
        <main className="min-w-0 flex-1 px-4 pb-16 pt-5 md:px-8 md:pt-7">
          <div className="mx-auto max-w-4xl">{children}</div>
        </main>
      </div>
    </>
  );
}
