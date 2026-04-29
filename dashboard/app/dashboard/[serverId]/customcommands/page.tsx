import { redirect } from 'next/navigation';
import { listCommands } from '@/lib/queries/customCommands';
import { FormCard } from '@/components/FormCard';
import { getSession } from '@/lib/auth';
import { fetchUserinfo } from '@/lib/echoed';
import { AddCommandForm } from './AddCommandForm';
import { removeCustomCommand } from './actions';

interface PageProps {
  params: Promise<{ serverId: string }>;
}

export default async function CustomCommandsPage({ params }: PageProps): Promise<JSX.Element> {
  const { serverId } = await params;
  const session = await getSession();
  if (!session) redirect('/login');

  // We need the userId to record `created_by` on new commands. The
  // layout already verified this user owns the server, so we trust
  // the userinfo lookup.
  const user = await fetchUserinfo(session.accessToken);
  const userId = user.sub;

  const commands = await listCommands(serverId);

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-display text-5xl tracking-tight text-text-primary">
          Custom commands
        </h1>
        <p className="mt-2 text-text-secondary">
          Per-server commands that reply with a fixed template. Built-in command names are
          reserved.
        </p>
      </div>

      <FormCard
        title="Add a command"
        description="Adding overwrites if the name already exists. Responses support placeholders."
      >
        <AddCommandForm serverId={serverId} userId={userId} />
      </FormCard>

      <div className="mt-6 rounded-lg border border-[var(--border-subtle)] bg-bg-card">
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-5">
          <h2 className="font-display text-2xl tracking-tight text-text-primary">
            Existing commands
          </h2>
          <span className="rounded-sm bg-bg-elevated px-2 py-0.5 text-xs font-semibold text-text-muted">
            {commands.length}
          </span>
        </div>

        {commands.length === 0 ? (
          <div className="p-12 text-center">
            <div className="mb-4 text-5xl">💬</div>
            <h3 className="font-display text-2xl tracking-tight text-text-primary">
              No custom commands yet
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
              Add one above, or run <code className="font-mono text-xs text-text-primary">!cmd add</code> in chat.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {commands.map((c) => {
              const remove = removeCustomCommand.bind(null, serverId, c.name);
              return (
                <li key={c.name} className="flex items-start justify-between gap-4 p-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <code className="rounded bg-bg-elevated px-2 py-0.5 font-mono text-sm text-accent">
                        !{c.name}
                      </code>
                      <span className="text-xs text-text-muted">used {c.usesCount}×</span>
                    </div>
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-text-secondary">
                      {c.response}
                    </pre>
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
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
