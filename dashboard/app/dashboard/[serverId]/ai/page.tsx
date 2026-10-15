import { getServerChannels } from '@/lib/botApi';
import { getGuildConfig } from '@/lib/queries/guildConfig';
import { ModelPicker } from '@/components/ModelPicker';
import { secretBoxReady } from '@/lib/secretBox';
import { checksToday, getAiSettings, listAiChannels, type AiAction } from '@/lib/queries/aiModeration';
import { FormCard, Field, inputClassName, textareaClassName } from '@/components/FormCard';
import { ChannelPicker } from '@/components/ChannelPicker';
import { Toggle } from '@/components/Toggle';
import { SaveBar } from '@/components/SaveBar';
import {
  addAiChannelAction,
  removeAiChannelAction,
  saveAiChannelAction,
  saveAiSettingsAction,
} from './actions';

interface PageProps {
  params: Promise<{ serverId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const ERRORS: Record<string, string> = {
  unavailable: "AI moderation isn't available on this Panda install yet — the operator still has to set PANDA_AI_KEY_SECRET.",
  'key-format': "That doesn't look like an OpenRouter key.",
  'key-invalid': 'OpenRouter rejected that key. Nothing was saved.',
  'key-unreachable': "Couldn't reach OpenRouter to check the key. Nothing was saved — try again in a moment.",
  model: "That isn't a model id — pick one from the list (it looks like provider/model-name). Nothing was saved.",
  'model-unsupported': "OpenRouter doesn't list that model with structured (JSON-schema) answers and tool calling, which Panda needs — pick one from the list. Nothing was saved.",
  'needs-key': 'To turn AI moderation on, save an OpenRouter key and pick a model.',
  channel: "That channel couldn't be used. Pick a text channel in this server.",
  context: 'Channel rules are limited to 2,000 characters.',
};

const SAVED: Record<string, string> = {
  settings: 'Saved. The bot picks changes up within 30 seconds.',
  channel: 'Channel saved. The bot picks changes up within 30 seconds.',
  removed: 'Channel removed from AI moderation.',
};

const ACTION_INFO: Record<AiAction, { label: string; hint: string }> = {
  flag: { label: 'Flag', hint: 'post it to the mod-log for a human' },
  delete: { label: 'Delete', hint: 'remove the message' },
  warn: { label: 'Warn', hint: "add a warning to the member's record (escalation rules apply)" },
  timeout: { label: 'Timeout', hint: 'mute the member, up to the maximum below' },
  kick: { label: 'Kick', hint: 'remove the member from the server' },
  ban: { label: 'Ban', hint: 'ban the member — the most serious; use with care' },
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function AiModerationPage({ params, searchParams }: PageProps): Promise<JSX.Element> {
  const { serverId } = await params;
  const query = await searchParams;
  const [settings, channels, rules, used, guild] = await Promise.all([
    getAiSettings(serverId),
    getServerChannels(serverId),
    listAiChannels(serverId),
    checksToday(serverId),
    getGuildConfig(serverId),
  ]);
  // Where a flag actually goes — named, not "the mod-log". Flags only ever
  // post to the mod-log channel (never a public fallback).
  const modlogName = guild.modlogChannel ? channels.find((c) => c.id === guild.modlogChannel)?.name : null;
  const flagHint = modlogName
    ? `leave the message alone and post a 🚩 note in #${modlogName} (your mod-log) for a moderator to decide`
    : 'leave the message alone and post a 🚩 note in your mod-log channel for a moderator — none is set yet (Moderation page), so for now flags are only kept in the member’s case history';
  const ready = secretBoxReady();
  const error = ERRORS[first(query.error) ?? ''];
  const saved = SAVED[first(query.saved) ?? ''];
  const channelName = (id: string): string => channels.find((c) => c.id === id)?.name ?? 'unknown channel';
  const unconfigured = channels.filter((c) => c.type === 'text' && !rules.some((r) => r.channelId === c.id));

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.035em] text-text-primary sm:text-[32px]">AI moderation</h1>
        <p className="mt-2 max-w-3xl text-text-secondary">
          Panda reads each new message in the channels you choose, with a few messages before it for context, and
          judges it against that channel&apos;s rules using an AI model on <strong>your own OpenRouter key</strong>.
          Moderators can also talk to it with <code>!panda</code> — <code>!panda who spams the most here?</code>,{' '}
          <code>!panda what happened in #general last night?</code>, or replying to a message with{' '}
          <code>!panda delete everything this person posted today</code>. Panda looks through the channels that
          moderator can read, checks people&apos;s history, and answers; anything it would do is shown first and waits
          for their ✅. To follow up, they just reply to Panda&apos;s answer, like &ldquo;time out #1 for a day&rdquo;.
          Each question uses a few AI checks (one per step Panda takes, up to 7).
        </p>
        <p className="mt-2 max-w-3xl text-sm text-text-muted">
          Messages in AI-moderated channels are sent to OpenRouter and the model provider you pick. Staff, moderator
          roles and protected roles are never judged.
        </p>
      </div>

      {!ready ? (
        <p className="mb-6 rounded-xl bg-bg-card p-4 text-sm text-text-secondary">
          {ERRORS.unavailable}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mb-6 rounded border border-status-danger/40 bg-status-danger/10 p-4 text-sm text-text-primary">
          {error}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="mb-6 rounded-xl bg-bg-card p-4 text-sm text-text-primary">
          {saved}
        </p>
      ) : null}

      {/* ─── Connection ─────────────────────────────────────────── */}
      <form action={saveAiSettingsAction.bind(null, serverId)} className="space-y-6">
        <FormCard
          title="Key and model"
          description="Create a key at openrouter.ai/keys (you can give it a spending limit there). It is checked with OpenRouter, then stored encrypted — this page never shows it again, only its last four characters."
        >
          <Toggle
            name="enabled"
            label="AI moderation enabled"
            description="Master switch. When off, no message is sent to the model and !panda requests are refused."
            defaultChecked={settings.enabled}
          />
          <Field
            label="OpenRouter API key"
            name="apiKey"
            hint={settings.keyHint ? `A key ending in …${settings.keyHint} is saved. Leave blank to keep it.` : 'No key saved yet.'}
          >
            <input
              id="apiKey"
              name="apiKey"
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder={settings.keyHint ? `•••• ${settings.keyHint}` : 'sk-or-v1-…'}
              className={inputClassName}
            />
          </Field>
          {settings.keyHint ? <Toggle name="removeKey" label="Remove the saved key" /> : null}
          <Field label="Model" name="model">
            <ModelPicker name="model" initial={settings.model} />
          </Field>
          <Field
            label="Daily check limit"
            name="dailyCheckCap"
            hint={`Each judged message (and each !panda request) uses one check. ${used} used today. 0 pauses AI moderation for the rest of the day.`}
          >
            <input id="dailyCheckCap" name="dailyCheckCap" type="number" min={0} max={100000} defaultValue={settings.dailyCheckCap} className={inputClassName} />
          </Field>
          <Field
            label="Most automatic kicks + bans per hour"
            name="maxKickbanPerHour"
            hint="A safety brake: past this, a kick or ban the AI wants becomes a lighter action plus a flag for a human."
          >
            <input id="maxKickbanPerHour" name="maxKickbanPerHour" type="number" min={0} max={100} defaultValue={settings.maxKickbanPerHour} className={inputClassName} />
          </Field>
        </FormCard>
        <SaveBar />
      </form>

      {/* ─── Channels ───────────────────────────────────────────── */}
      <div className="mb-6 mt-14">
        <h2 className="font-display text-xl font-semibold tracking-[-0.03em] text-text-primary">Channels</h2>
        <p className="mt-2 max-w-3xl text-text-secondary">
          The AI only judges channels listed here. Give each one its rules in plain words — e.g. &ldquo;Only programming
          talk. Memes and off-topic chat get deleted.&rdquo; Admins can also set them in the channel with{' '}
          <code>!panda context &lt;rules&gt;</code>.
        </p>
      </div>

      <form action={addAiChannelAction.bind(null, serverId)} className="mb-8">
        <FormCard title="Add a channel" description="Starts with the safe defaults: flag and delete only.">
          <ChannelPicker name="channelId" mode="single" channels={unconfigured} allowedTypes={['text']} placeholder="Pick a text channel…" />
        </FormCard>
        <SaveBar label="Add channel" />
      </form>

      <div className="space-y-10">
        {rules.map((rule) => (
          <div key={rule.channelId}>
            <form action={saveAiChannelAction.bind(null, serverId, rule.channelId)} className="space-y-6">
              <FormCard title={`#${channelName(rule.channelId)}`}>
                <Toggle name="enabled" label="AI moderation in this channel" defaultChecked={rule.enabled} />
                <Field label="Rules for this channel" name={`context-${rule.channelId}`} hint="What's allowed and what isn't, in plain words. Up to 2,000 characters.">
                  <textarea
                    id={`context-${rule.channelId}`}
                    name="context"
                    defaultValue={rule.context}
                    rows={4}
                    maxLength={2000}
                    placeholder="Only programming-related chat. Delete memes, self-promotion and off-topic talk."
                    className={textareaClassName}
                  />
                </Field>
                <Field label="Messages of context" name={`history-${rule.channelId}`} hint="How many earlier messages the model reads to understand the conversation (0–20). More context costs more per check.">
                  <input id={`history-${rule.channelId}`} name="historySize" type="number" min={0} max={20} defaultValue={rule.historySize} className={inputClassName} />
                </Field>
                <fieldset>
                  <legend className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-text-muted">
                    What the AI may do on its own
                  </legend>
                  <div className="space-y-2">
                    {(Object.keys(ACTION_INFO) as AiAction[]).map((a) => (
                      <label key={a} className="flex cursor-pointer items-start gap-3 text-sm">
                        <input type="checkbox" name="actions" value={a} defaultChecked={rule.allowedActions.includes(a)} className="mt-0.5 h-4 w-4 accent-accent" />
                        <span>
                          <span className="font-medium text-text-primary">{ACTION_INFO[a].label}</span>
                          <span className="text-text-muted"> — {a === 'flag' ? flagHint : ACTION_INFO[a].hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="mt-1.5 text-xs text-text-muted">
                    The AI picks the lightest action that fits; anything heavier than you allow is reduced to the heaviest
                    you do allow. Moderators&apos; <code>!panda</code> requests aren&apos;t limited by this — they&apos;re limited by the
                    moderator&apos;s own permissions.
                  </p>
                </fieldset>
                <Field label="Longest timeout (minutes)" name={`timeout-${rule.channelId}`}>
                  <input id={`timeout-${rule.channelId}`} name="timeoutMaxMinutes" type="number" min={1} max={40320} defaultValue={rule.timeoutMaxMinutes} className={inputClassName} />
                </Field>
                <Field label="How sure it must be (%)" name={`conf-${rule.channelId}`} hint="Below this, the AI does nothing. 50–100.">
                  <input id={`conf-${rule.channelId}`} name="minConfidence" type="number" min={50} max={100} defaultValue={rule.minConfidence} className={inputClassName} />
                </Field>
                <Field label="How sure it must be to kick or ban (%)" name={`kbconf-${rule.channelId}`} hint="A kick or ban below this becomes a lighter action. 50–100.">
                  <input id={`kbconf-${rule.channelId}`} name="kickbanMinConfidence" type="number" min={50} max={100} defaultValue={rule.kickbanMinConfidence} className={inputClassName} />
                </Field>
              </FormCard>
              <SaveBar label={`Save #${channelName(rule.channelId)}`} />
            </form>
            <form action={removeAiChannelAction.bind(null, serverId, rule.channelId)} className="mt-2 flex justify-end">
              <button type="submit" className="text-xs text-text-muted underline underline-offset-2 hover:text-text-primary">
                Remove #{channelName(rule.channelId)} from AI moderation
              </button>
            </form>
          </div>
        ))}
      </div>
    </div>
  );
}
