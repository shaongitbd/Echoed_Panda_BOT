import { getAutomodConfig } from '@/lib/queries/automodConfig';
import { FormCard, Field, inputClassName, textareaClassName } from '@/components/FormCard';
import { Toggle } from '@/components/Toggle';
import { SaveBar } from '@/components/SaveBar';
import { saveAutomod } from './actions';

interface PageProps {
  params: Promise<{ serverId: string }>;
}

export default async function AutomodPage({ params }: PageProps): Promise<JSX.Element> {
  const { serverId } = await params;
  const config = await getAutomodConfig(serverId);
  const action = saveAutomod.bind(null, serverId);

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-display text-5xl tracking-tight text-text-primary">Auto-mod</h1>
        <p className="mt-2 text-text-secondary">
          Eight filters that delete offending messages and add a warning to the user's record.
          Each filter is independently toggleable.
        </p>
      </div>

      <form action={action} className="space-y-6">
        <FormCard
          title="Master switch"
          description="When off, every filter below is bypassed regardless of its individual toggle. Existing config stays — flipping back on resumes where you left off."
        >
          <Toggle
            name="enabled"
            label="Auto-mod enabled"
            description="Required for any filter to fire."
            defaultChecked={config.enabled}
          />
        </FormCard>

        {/* ─── Invites ───────────────────────────────────────────── */}
        <FormCard
          title="Invite links"
          description="Blocks invite-share patterns from popular chat platforms plus echoed.gg/invite/* and echoed.gg/i/*."
        >
          <Toggle
            name="invitesEnabled"
            label="Block invites"
            defaultChecked={config.invitesEnabled}
          />
        </FormCard>

        {/* ─── Bad words ─────────────────────────────────────────── */}
        <FormCard
          title="Bad words"
          description="Word-boundary case-insensitive match against your list. 'ass' matches 'ass!' but not 'assassin'."
        >
          <Toggle
            name="badWordsEnabled"
            label="Bad-words filter"
            defaultChecked={config.badWordsEnabled}
          />
          <Field
            label={`Word list (${config.badWords.length} configured)`}
            name="badWords"
            hint="One per line, or comma-separated. Lowercased on save."
          >
            <textarea
              id="badWords"
              name="badWords"
              defaultValue={config.badWords.join('\n')}
              rows={5}
              placeholder="word1&#10;word2&#10;phrase three"
              className={textareaClassName}
            />
          </Field>
        </FormCard>

        {/* ─── Mass mentions ─────────────────────────────────────── */}
        <FormCard
          title="Mass mentions"
          description="Counts user mentions, role mentions, and @everyone / @here in a single message."
        >
          <Toggle
            name="mentionsEnabled"
            label="Block mass mentions"
            defaultChecked={config.mentionsEnabled}
          />
          <Field
            label="Threshold"
            name="mentionsThreshold"
            hint="Messages with at least this many total mentions get flagged. 2-50."
          >
            <input
              id="mentionsThreshold"
              name="mentionsThreshold"
              type="number"
              min={2}
              max={50}
              defaultValue={config.mentionsThreshold}
              className={inputClassName}
            />
          </Field>
        </FormCard>

        {/* ─── Links ─────────────────────────────────────────────── */}
        <FormCard
          title="External links"
          description="Block any http(s) link not on the whitelist. Subdomains of whitelisted domains are allowed automatically."
        >
          <Toggle
            name="linksEnabled"
            label="Block links"
            defaultChecked={config.linksEnabled}
          />
          <Field
            label="Domain whitelist"
            name="linkWhitelist"
            hint="One domain per line (e.g. youtube.com). Leave empty to block ALL links when this filter is on."
          >
            <textarea
              id="linkWhitelist"
              name="linkWhitelist"
              defaultValue={config.linkWhitelist.join('\n')}
              rows={3}
              placeholder="youtube.com&#10;github.com&#10;echoed.gg"
              className={textareaClassName}
            />
          </Field>
        </FormCard>

        {/* ─── Caps ──────────────────────────────────────────────── */}
        <FormCard
          title="Excessive caps"
          description="Triggers when at least N% of letters are uppercase AND the message is at least M characters long. Short shouts like 'OK' don't trip."
        >
          <Toggle
            name="capsEnabled"
            label="Block caps spam"
            defaultChecked={config.capsEnabled}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Threshold %" name="capsThresholdPct" hint="30-100. Default 70.">
              <input
                id="capsThresholdPct"
                name="capsThresholdPct"
                type="number"
                min={30}
                max={100}
                defaultValue={config.capsThresholdPct}
                className={inputClassName}
              />
            </Field>
            <Field label="Min message length" name="capsMinLength" hint="1-1000. Default 10.">
              <input
                id="capsMinLength"
                name="capsMinLength"
                type="number"
                min={1}
                max={1000}
                defaultValue={config.capsMinLength}
                className={inputClassName}
              />
            </Field>
          </div>
        </FormCard>

        {/* ─── Emoji spam ────────────────────────────────────────── */}
        <FormCard
          title="Emoji spam"
          description="Counts pictographic Unicode characters. Triggers when a single message includes at least N of them."
        >
          <Toggle
            name="emojiEnabled"
            label="Block emoji spam"
            defaultChecked={config.emojiEnabled}
          />
          <Field
            label="Threshold"
            name="emojiThreshold"
            hint="2-100. Default 10."
          >
            <input
              id="emojiThreshold"
              name="emojiThreshold"
              type="number"
              min={2}
              max={100}
              defaultValue={config.emojiThreshold}
              className={inputClassName}
            />
          </Field>
        </FormCard>

        {/* ─── Zalgo ─────────────────────────────────────────────── */}
        <FormCard
          title="Zalgo / combining-mark abuse"
          description="Detects the layered-diacritic 'glitch text' look. Won't false-positive on plain accented text like résumé."
        >
          <Toggle
            name="zalgoEnabled"
            label="Block zalgo"
            defaultChecked={config.zalgoEnabled}
          />
        </FormCard>

        {/* ─── Spam (rate) ───────────────────────────────────────── */}
        <FormCard
          title="Spam (message rate)"
          description="Per-user sliding-window counter. When a user posts more than threshold messages within the window, the most recent one trips."
        >
          <Toggle
            name="spamEnabled"
            label="Block fast posting"
            defaultChecked={config.spamEnabled}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Threshold (messages)" name="spamThreshold" hint="2-50. Default 5.">
              <input
                id="spamThreshold"
                name="spamThreshold"
                type="number"
                min={2}
                max={50}
                defaultValue={config.spamThreshold}
                className={inputClassName}
              />
            </Field>
            <Field label="Window (seconds)" name="spamWindowSeconds" hint="1-60. Default 5.">
              <input
                id="spamWindowSeconds"
                name="spamWindowSeconds"
                type="number"
                min={1}
                max={60}
                defaultValue={config.spamWindowSeconds}
                className={inputClassName}
              />
            </Field>
          </div>
        </FormCard>

        {/* ─── Exempts ───────────────────────────────────────────── */}
        <FormCard
          title="Exempts"
          description="Channels and roles auto-mod ignores. Useful for #staff-only channels or trusted moderator roles."
        >
          <Field
            label="Exempt channels"
            name="exemptChannelIds"
            hint="Channel IDs or <#channel> mentions, space- or comma-separated."
          >
            <textarea
              id="exemptChannelIds"
              name="exemptChannelIds"
              defaultValue={config.exemptChannelIds.map((id) => `<#${id}>`).join(' ')}
              rows={2}
              placeholder="<#staff-room> <#mod-chat>"
              className={textareaClassName}
            />
          </Field>
          <Field
            label="Exempt roles"
            name="exemptRoleIds"
            hint="Role IDs or <@&role> mentions. (Note: role-exempt is stored but not yet enforced by the bot — channel-exempt and master-disable both work today.)"
          >
            <textarea
              id="exemptRoleIds"
              name="exemptRoleIds"
              defaultValue={config.exemptRoleIds.map((id) => `<@&${id}>`).join(' ')}
              rows={2}
              placeholder="<@&moderator> <@&trusted>"
              className={textareaClassName}
            />
          </Field>
        </FormCard>

        <SaveBar />
      </form>
    </div>
  );
}
