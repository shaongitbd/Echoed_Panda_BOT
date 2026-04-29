import { getGuildConfig } from '@/lib/queries/guildConfig';
import { getServerChannels } from '@/lib/botApi';
import { FormCard, Field, inputClassName } from '@/components/FormCard';
import { ChannelPicker } from '@/components/ChannelPicker';
import { Toggle } from '@/components/Toggle';
import { SaveBar } from '@/components/SaveBar';
import { saveModeration, clearLockdown } from './actions';

interface PageProps {
  params: Promise<{ serverId: string }>;
}

export default async function ModerationPage({ params }: PageProps): Promise<JSX.Element> {
  const { serverId } = await params;
  const [config, channels] = await Promise.all([
    getGuildConfig(serverId),
    getServerChannels(serverId),
  ]);
  const action = saveModeration.bind(null, serverId);
  const clearAction = clearLockdown.bind(null, serverId);

  // Anti-raid lockdown is bot-managed runtime state. We surface it
  // here as a status banner + optional manual clear, NOT a form
  // field — saving the form should never accidentally extend or end
  // a live lockdown.
  const lockdownActive =
    config.antiRaidLockdownUntil != null && config.antiRaidLockdownUntil > new Date();

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-display text-5xl tracking-tight text-text-primary">Moderation</h1>
        <p className="mt-2 text-text-secondary">
          Mod-log routing and anti-raid protection. Kick / ban / timeout are issued from chat
          commands.
        </p>
      </div>

      {lockdownActive ? (
        <div className="mb-6 flex items-center justify-between rounded-lg border border-status-danger/40 bg-status-danger/10 p-4">
          <div>
            <div className="text-sm font-semibold text-status-danger">🔒 Lockdown active</div>
            <div className="text-xs text-text-secondary">
              New joiners are auto-kicked until{' '}
              <span className="text-text-primary">
                {config.antiRaidLockdownUntil!.toISOString()}
              </span>
              .
            </div>
          </div>
          <form action={clearAction}>
            <button
              type="submit"
              className="rounded border border-status-danger/40 bg-status-danger/10 px-3 py-1.5 text-xs font-semibold text-status-danger transition-colors duration-150 hover:bg-status-danger/20"
            >
              Clear lockdown
            </button>
          </form>
        </div>
      ) : null}

      <form action={action} className="space-y-6">
        <FormCard
          title="Mod-log channel"
          description="Where the bot posts a record of every moderation action — kicks, bans, timeouts, warns, purges, and auto-mod hits."
        >
          <Field
            label="Channel"
            name="modlogChannel"
            hint="Pick the channel to log moderation actions in."
          >
            <ChannelPicker
              mode="single"
              name="modlogChannel"
              channels={channels}
              initial={config.modlogChannel}
              allowedTypes={['text']}
              clearable
            />
          </Field>
        </FormCard>

        <FormCard
          title="Anti-raid"
          description="Detect mass-join bursts and auto-kick incoming joiners during a configurable lockdown window."
        >
          <Toggle
            name="antiRaidEnabled"
            label="Anti-raid enabled"
            description="Engage automatic lockdown when too many joins happen in a small window."
            defaultChecked={config.antiRaidEnabled}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              label="Joins to trip"
              name="antiRaidThreshold"
              hint="Threshold of joins inside the window (2-200)."
            >
              <input
                id="antiRaidThreshold"
                name="antiRaidThreshold"
                type="number"
                min={2}
                max={200}
                defaultValue={config.antiRaidThreshold}
                className={inputClassName}
              />
            </Field>
            <Field
              label="Window (seconds)"
              name="antiRaidWindowSeconds"
              hint="5-600. Shorter = more sensitive."
            >
              <input
                id="antiRaidWindowSeconds"
                name="antiRaidWindowSeconds"
                type="number"
                min={5}
                max={600}
                defaultValue={config.antiRaidWindowSeconds}
                className={inputClassName}
              />
            </Field>
          </div>
        </FormCard>

        <SaveBar />
      </form>
    </div>
  );
}
