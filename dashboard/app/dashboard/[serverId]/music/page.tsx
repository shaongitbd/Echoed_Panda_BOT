import { getGuildConfig } from '@/lib/queries/guildConfig';
import { getServerRoles } from '@/lib/botApi';
import { FormCard, Field } from '@/components/FormCard';
import { RolePicker } from '@/components/RolePicker';
import { SaveBar } from '@/components/SaveBar';
import { saveMusic } from './actions';

interface PageProps {
  params: Promise<{ serverId: string }>;
}

export default async function MusicPage({ params }: PageProps): Promise<JSX.Element> {
  const { serverId } = await params;
  const [config, roles] = await Promise.all([
    getGuildConfig(serverId),
    getServerRoles(serverId),
  ]);
  const action = saveMusic.bind(null, serverId);

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-display text-5xl tracking-tight text-text-primary">Music</h1>
        <p className="mt-2 text-text-secondary">
          Voice playback &mdash; YouTube, SoundCloud, direct URLs. Plays through the channel
          panda is in. Configuration here only controls who can manage playback; the queue and
          now-playing live in chat via <code className="text-text-primary">!play</code>,{' '}
          <code className="text-text-primary">!queue</code>,{' '}
          <code className="text-text-primary">!skip</code>, etc.
        </p>
      </div>

      <form action={action} className="space-y-6">
        <FormCard
          title="DJ role"
          description="Members with this role can run skip / pause / volume / loop / shuffle / clearqueue without holding Manage Server. The user who queued the currently-playing track can always skip their own. Leave empty to require Manage Server for every disruptive action."
        >
          <Field
            label="DJ role"
            name="djRoleId"
            hint="Pick the role that grants music control. Clear to require Manage Server only."
          >
            <RolePicker
              mode="single"
              name="djRoleId"
              roles={roles}
              initial={config.djRoleId}
              clearable
              placeholder="(no DJ role — Manage Server only)"
            />
          </Field>
        </FormCard>

        <FormCard
          title="Permission cheat sheet"
          description="Who can run each music command, after the DJ role is set."
        >
          <ul className="space-y-2 text-sm text-text-secondary">
            <Row what="play / queue / nowplaying / volume (read)" who="anyone with CONNECT in the voice channel" />
            <Row what="skip" who="DJ role / Manage Server &mdash; or original requester of the current track" />
            <Row what="stop / pause / resume / volume (write)" who="DJ role / Manage Server" />
            <Row what="loop / shuffle / clearqueue" who="DJ role / Manage Server" />
            <Row what="remove <pos>" who="DJ role / Manage Server &mdash; or original requester" />
            <Row what="djrole" who="Manage Server only (no self-promotion)" />
          </ul>
        </FormCard>

        <SaveBar />
      </form>
    </div>
  );
}

function Row({ what, who }: { what: string; who: string }): JSX.Element {
  return (
    <li className="flex items-baseline gap-3 border-b border-[var(--border-subtle)] pb-2 last:border-0 last:pb-0">
      <code className="shrink-0 rounded bg-bg-input px-2 py-0.5 font-mono text-xs text-accent">
        {what}
      </code>
      <span className="text-text-secondary">{who}</span>
    </li>
  );
}
