import { getGuildConfig } from '@/lib/queries/guildConfig';
import { listEscalations, formatDuration, MAX_RULES } from '@/lib/queries/escalation';
import { getServerChannels, getServerRoles } from '@/lib/botApi';
import { FormCard, Field, inputClassName } from '@/components/FormCard';
import { ChannelPicker } from '@/components/ChannelPicker';
import { RolePicker } from '@/components/RolePicker';
import { Toggle } from '@/components/Toggle';
import { SaveBar } from '@/components/SaveBar';
import { saveModeration, clearLockdown } from './actions';

interface PageProps {
  params: Promise<{ serverId: string }>;
}

export default async function ModerationPage({ params }: PageProps): Promise<JSX.Element> {
  const { serverId } = await params;
  const [config, channels, roles, escalations] = await Promise.all([
    getGuildConfig(serverId),
    getServerChannels(serverId),
    getServerRoles(serverId),
    listEscalations(serverId),
  ]);
  // Existing rules plus a few empty slots, up to the cap.
  const escalationRows = Array.from(
    { length: Math.min(MAX_RULES, Math.max(escalations.length + 2, 3)) },
    (_, i) => escalations[i] ?? null,
  );
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
          title="Moderator roles"
          description="Members with a moderator role can use Panda's moderation commands — kick, ban, timeout, warn, purge, lock, cases — without holding the platform permissions themselves. Panda acts with its own."
        >
          <Field
            label="Moderator roles"
            name="modRoleIds"
            hint="Moderators can't use Panda on each other; only admins can."
          >
            <RolePicker mode="multi" name="modRoleIds" roles={roles} initial={config.modRoleIds} />
          </Field>
          <Field
            label="Protected roles"
            name="protectedRoleIds"
            hint="Panda won't moderate members with these roles, except when an admin asks, and warning escalation skips them."
          >
            <RolePicker mode="multi" name="protectedRoleIds" roles={roles} initial={config.protectedRoleIds} />
          </Field>
        </FormCard>

        <FormCard
          title="Warning escalation"
          description="Act automatically when a member's warnings reach a number. Counts every warning — from moderators and from auto-mod. Clearing someone's warnings starts them over."
        >
          <div className="space-y-3">
            {escalationRows.map((rule, i) => (
              <div key={i} className="grid grid-cols-[88px_1fr_1fr] items-center gap-3">
                <input
                  aria-label={`Rule ${i + 1}: warnings`}
                  name={`esc_count_${i}`}
                  type="number"
                  min={1}
                  max={100}
                  placeholder="3"
                  defaultValue={rule?.warnCount ?? ''}
                  className={inputClassName}
                />
                <select
                  aria-label={`Rule ${i + 1}: action`}
                  name={`esc_action_${i}`}
                  defaultValue={rule?.action ?? ''}
                  className={inputClassName}
                >
                  <option value="">No rule</option>
                  <option value="timeout">Time out</option>
                  <option value="kick">Kick</option>
                  <option value="ban">Ban</option>
                </select>
                <input
                  aria-label={`Rule ${i + 1}: timeout length`}
                  name={`esc_duration_${i}`}
                  placeholder="1h (timeouts only)"
                  defaultValue={rule?.action === 'timeout' && rule.durationSeconds ? formatDuration(rule.durationSeconds) : ''}
                  className={inputClassName}
                />
              </div>
            ))}
            <p className="text-xs text-text-muted">
              Warnings · action · timeout length (like 10m, 1h, 1d). Save to get more empty rows, up to {MAX_RULES}.
            </p>
          </div>
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
