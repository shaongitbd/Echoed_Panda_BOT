import { getLevelSettings } from '@/lib/queries/levelSettings';
import { listRewards } from '@/lib/queries/levelRewards';
import { getServerChannels } from '@/lib/botApi';
import { FormCard, Field, inputClassName, textareaClassName } from '@/components/FormCard';
import { ChannelPicker } from '@/components/ChannelPicker';
import { ChannelScope } from '@/components/ChannelScope';
import { Toggle } from '@/components/Toggle';
import { SaveBar } from '@/components/SaveBar';
import { saveLevels, removeLevelReward } from './actions';
import { AddRewardForm } from './AddRewardForm';

interface PageProps {
  params: Promise<{ serverId: string }>;
}

export default async function LevelsPage({ params }: PageProps): Promise<JSX.Element> {
  const { serverId } = await params;
  const [settings, rewards, channels] = await Promise.all([
    getLevelSettings(serverId),
    listRewards(serverId),
    getServerChannels(serverId),
  ]);

  // Bind serverId into the action so the form can stay
  // self-contained — the action receives (serverId, FormData).
  const action = saveLevels.bind(null, serverId);

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-display text-5xl tracking-tight text-text-primary">Levels</h1>
        <p className="mt-2 text-text-secondary">
          XP per message, role rewards, level-up announcements.
        </p>
      </div>

      <form action={action} className="space-y-6">
        <FormCard
          title="System"
          description="Master switch and reward stacking. Disable to silently skip XP grants without losing existing data."
        >
          <Toggle
            name="enabled"
            label="Levels enabled"
            description="Members earn XP for messages."
            defaultChecked={settings.enabled}
          />
          <Toggle
            name="stackRewards"
            label="Stack role rewards"
            description="When on, members keep every reward role they've earned. When off, only the latest reward role is kept."
            defaultChecked={settings.stackRewards}
          />
        </FormCard>

        <FormCard
          title="Level-up announcements"
          description="Where and how the bot announces a level-up. Leave the channel blank to announce in the channel where the level-up happened."
        >
          <Field
            label="Level-up channel"
            name="levelUpChannel"
            hint="Where level-up messages post. Leave empty to announce in the channel where the level-up happened."
          >
            <ChannelPicker
              mode="single"
              name="levelUpChannel"
              channels={channels}
              initial={settings.levelUpChannel}
              allowedTypes={['text']}
              clearable
            />
          </Field>

          <Field
            label="Level-up message"
            name="levelUpMessage"
            hint="Placeholders: {user}, {level}. Leave blank to use the default."
          >
            <textarea
              id="levelUpMessage"
              name="levelUpMessage"
              defaultValue={settings.levelUpMessage ?? ''}
              rows={3}
              placeholder="🎉 GG {user}! You just hit level {level}."
              className={textareaClassName}
            />
          </Field>
        </FormCard>

        <FormCard
          title="XP economy"
          description="Per-message XP range and cooldown. The same defaults match what the bot ships with."
        >
          <div className="grid gap-5 sm:grid-cols-3">
            <Field label="Min XP / msg" name="xpPerMessageMin">
              <input
                id="xpPerMessageMin"
                name="xpPerMessageMin"
                type="number"
                min={1}
                max={500}
                defaultValue={settings.xpPerMessageMin}
                className={inputClassName}
              />
            </Field>
            <Field label="Max XP / msg" name="xpPerMessageMax">
              <input
                id="xpPerMessageMax"
                name="xpPerMessageMax"
                type="number"
                min={1}
                max={500}
                defaultValue={settings.xpPerMessageMax}
                className={inputClassName}
              />
            </Field>
            <Field label="Cooldown (sec)" name="cooldownSeconds" hint="Per-user-per-channel">
              <input
                id="cooldownSeconds"
                name="cooldownSeconds"
                type="number"
                min={0}
                max={3600}
                defaultValue={settings.cooldownSeconds}
                className={inputClassName}
              />
            </Field>
          </div>
        </FormCard>

        <FormCard
          title="XP channel scope"
          description="Where members can earn XP. Use 'All except' to mute XP in spam / bot channels, or 'Only' to restrict XP to active chat channels."
        >
          <ChannelScope
            name="noXpChannelIds"
            channels={channels}
            allowedTypes={['text']}
            modes={['all', 'except']}
            initialMode={settings.noXpChannelIds.length > 0 ? 'except' : 'all'}
            initialChannels={settings.noXpChannelIds}
            labels={{
              all: 'XP in every channel',
              except: 'All except these',
            }}
          />
        </FormCard>

        <SaveBar />
      </form>

      {/* Level rewards live OUTSIDE the main settings form because
          their adds/removes are independent server actions, not
          part of the bulk save. Putting them in the same <form> would
          mean every reward change would also resave settings. */}
      <div className="mt-10 space-y-6">
        <FormCard
          title="Add a level reward"
          description="Members earn this role automatically when they cross the level threshold."
        >
          <AddRewardForm serverId={serverId} />
        </FormCard>

        <div className="rounded-lg border border-[var(--border-subtle)] bg-bg-card">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] p-5">
            <h2 className="font-display text-2xl tracking-tight text-text-primary">
              Configured rewards
            </h2>
            <span className="rounded-sm bg-bg-elevated px-2 py-0.5 text-xs font-semibold text-text-muted">
              {rewards.length}
            </span>
          </div>

          {rewards.length === 0 ? (
            <div className="p-8 text-center text-sm text-text-muted">
              No rewards configured yet. Add one above.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border-subtle)]">
              {rewards.map((r) => {
                const remove = removeLevelReward.bind(null, serverId, r.level);
                return (
                  <li key={r.level} className="flex items-center justify-between gap-4 p-4">
                    <div className="flex items-center gap-4">
                      <span className="rounded-sm bg-accent-muted px-2.5 py-1 font-display text-base text-accent">
                        Level {r.level}
                      </span>
                      <span className="text-sm text-text-secondary">→</span>
                      <span className="font-mono text-sm text-text-primary">
                        &lt;@&amp;{r.roleId}&gt;
                      </span>
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
    </div>
  );
}
