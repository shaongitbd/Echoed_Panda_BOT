import { getLevelSettings } from '@/lib/queries/levelSettings';
import { FormCard, Field, inputClassName, textareaClassName } from '@/components/FormCard';
import { Toggle } from '@/components/Toggle';
import { SaveBar } from '@/components/SaveBar';
import { saveLevels } from './actions';

interface PageProps {
  params: Promise<{ serverId: string }>;
}

export default async function LevelsPage({ params }: PageProps): Promise<JSX.Element> {
  const { serverId } = await params;
  const settings = await getLevelSettings(serverId);

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
            hint="Channel ID or <#channel> mention. Leave blank to use the source channel; type 'none' to clear."
          >
            <input
              id="levelUpChannel"
              name="levelUpChannel"
              defaultValue={settings.levelUpChannel ?? ''}
              placeholder="<#channel> or channel ID"
              className={inputClassName}
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
          title="No-XP channels"
          description="Channels where members never earn XP. Comma- or space-separated."
        >
          <Field
            label="Excluded channels"
            name="noXpChannelIds"
            hint="Channel IDs or <#channel> mentions, space- or comma-separated."
          >
            <textarea
              id="noXpChannelIds"
              name="noXpChannelIds"
              defaultValue={settings.noXpChannelIds.map((id) => `<#${id}>`).join(' ')}
              rows={2}
              placeholder="<#channel-id-1> <#channel-id-2>"
              className={textareaClassName}
            />
          </Field>
        </FormCard>

        <SaveBar />
      </form>
    </div>
  );
}
