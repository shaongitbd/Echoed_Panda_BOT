import { listReactionRoles, type ReactRoleListing } from '@/lib/queries/reactionRoles';
import { getServerChannels, getServerRoles, type BotChannel, type BotRole } from '@/lib/botApi';
import { FormCard } from '@/components/FormCard';
import { deleteMapping, changeMode } from './actions';

interface PageProps {
  params: Promise<{ serverId: string }>;
}

export default async function ReactionRolesPage({ params }: PageProps): Promise<JSX.Element> {
  const { serverId } = await params;
  const [messages, channels, roles] = await Promise.all([
    listReactionRoles(serverId),
    getServerChannels(serverId),
    getServerRoles(serverId),
  ]);
  const channelById = new Map(channels.map((c) => [c.id, c]));
  const roleById = new Map(roles.map((r) => [r.id, r]));

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-display text-5xl tracking-tight text-text-primary">Reaction roles</h1>
        <p className="mt-2 text-text-secondary">
          Posted reaction-role messages, each with its emoji → role bindings.
        </p>
      </div>

      <FormCard
        title="How to add new reaction roles"
        description="Adding new bindings still happens in chat — picking emoji from a web UI is fiddly without a real picker, and the bot needs to seed the reaction on a real message it can see."
      >
        <pre className="rounded bg-bg-input p-3 font-mono text-xs leading-relaxed text-text-secondary">
{`!reactrole add <messageId> <emoji> <@role>
!reactrole mode <messageId> <normal|unique|verify>
!reactrole list`}
        </pre>
      </FormCard>

      <div className="mt-6 space-y-4">
        {messages.length === 0 ? (
          <div className="rounded-lg border border-[var(--border-subtle)] bg-bg-card p-12 text-center">
            <div className="mb-4 text-5xl">🎭</div>
            <h2 className="font-display text-3xl tracking-tight text-text-primary">
              No reaction-role messages yet
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-text-secondary">
              Run <code className="font-mono text-xs text-text-primary">!reactrole add …</code>{' '}
              in any channel to set one up. The dashboard will list every binding here.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <ReactRoleMessage
              key={m.messageId}
              listing={m}
              serverId={serverId}
              channel={channelById.get(m.channelId)}
              roleById={roleById}
            />
          ))
        )}
      </div>
    </div>
  );
}

function ReactRoleMessage({
  listing,
  serverId,
  channel,
  roleById,
}: {
  listing: ReactRoleListing;
  serverId: string;
  channel: BotChannel | undefined;
  roleById: Map<string, BotRole>;
}): JSX.Element {
  const modeAction = changeMode.bind(null, serverId, listing.messageId);

  return (
    <article className="rounded-lg border border-[var(--border-subtle)] bg-bg-card">
      {/* Header: message ID + channel + mode selector */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-subtle)] p-5">
        <div>
          <div className="font-mono text-xs text-text-muted">message id</div>
          <div className="font-mono text-sm text-text-primary">{listing.messageId}</div>
          <div className="mt-1 text-xs text-text-secondary">
            in{' '}
            <span className="text-text-primary">
              <span className="text-text-muted">#</span>
              {channel?.name ?? listing.channelId.slice(0, 8) + '…'}
            </span>
          </div>
        </div>

        <form action={modeAction} className="flex items-center gap-2">
          <label
            htmlFor={`mode-${listing.messageId}`}
            className="text-[10px] font-semibold uppercase tracking-wider text-text-muted"
          >
            Mode
          </label>
          <select
            id={`mode-${listing.messageId}`}
            name="mode"
            defaultValue={listing.mode}
            className="rounded bg-bg-input border border-[var(--border-subtle)] px-2 py-1.5 text-xs text-text-primary focus:outline-none focus:border-accent/50"
          >
            <option value="normal">normal</option>
            <option value="unique">unique</option>
            <option value="verify">verify</option>
          </select>
          <button
            type="submit"
            className="rounded border border-[var(--border-subtle)] bg-bg-elevated px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors duration-150 hover:bg-bg-hover"
          >
            Save mode
          </button>
        </form>
      </div>

      {/* Bindings table — emoji + role + delete button per row */}
      <ul className="divide-y divide-[var(--border-subtle)]">
        {listing.mappings.length === 0 ? (
          <li className="p-5 text-sm text-text-muted">No emoji mappings on this message.</li>
        ) : (
          listing.mappings.map((m) => {
            const deleteAction = deleteMapping.bind(null, serverId, listing.messageId, m.emoji);
            const role = roleById.get(m.roleId);
            const roleColor =
              role?.color && /^#([0-9a-fA-F]{6})$/.test(role.color) ? role.color : '#888';
            return (
              <li key={m.emoji} className="flex items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-4">
                  <span className="text-2xl">{m.emoji}</span>
                  <span className="text-sm text-text-secondary">→</span>
                  <span className="inline-flex items-center gap-2 text-sm text-text-primary">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: roleColor }}
                      aria-hidden="true"
                    />
                    {role?.name ?? m.roleId.slice(0, 8) + '…'}
                  </span>
                </div>
                <form action={deleteAction}>
                  <button
                    type="submit"
                    className="rounded border border-status-danger/30 bg-status-danger/5 px-3 py-1 text-xs font-semibold text-status-danger transition-colors duration-150 hover:bg-status-danger/15"
                  >
                    Remove
                  </button>
                </form>
              </li>
            );
          })
        )}
      </ul>
    </article>
  );
}
