import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getCommandRule, listCommandRules, MAX_COOLDOWN_SECONDS } from '@/lib/queries/commandSettings';
import { listCommands } from '@/lib/queries/customCommands';
import { getGuildConfig } from '@/lib/queries/guildConfig';
import { getServerChannels, getServerRoles } from '@/lib/botApi';
import { describeScope, ALL_SCOPE, categoryScope } from '@/lib/commandCatalog';
import { FormCard, Field, inputClassName } from '@/components/FormCard';
import { ChannelAllowIgnore, RoleAllowIgnore } from '@/components/AllowIgnoreLists';
import { Toggle } from '@/components/Toggle';
import { SaveBar } from '@/components/SaveBar';
import { saveRule, resetRule } from '../actions';
import { editHref } from '../ruleSummary';

interface PageProps {
  params: Promise<{ serverId: string }>;
  searchParams: Promise<{ scope?: string }>;
}

export default async function CommandRulePage({ params, searchParams }: PageProps): Promise<JSX.Element> {
  const { serverId } = await params;
  const { scope } = await searchParams;
  if (!scope) notFound();

  const [rule, allRules, customCommands, guild, channels, roles] = await Promise.all([
    getCommandRule(serverId, scope),
    listCommandRules(serverId),
    listCommands(serverId),
    getGuildConfig(serverId),
    getServerChannels(serverId),
    getServerRoles(serverId),
  ]);
  const prefix = guild.prefix ?? '!';

  // What this scope is: every command, a category, a built-in, or a custom
  // command. Anything else is a stale or hand-typed link.
  const known = describeScope(scope);
  const isCustom = !known && customCommands.some((c) => c.name === scope);
  if (!known && !isCustom) notFound();

  const title =
    known?.kind === 'all'
      ? 'All commands'
      : known?.kind === 'category'
        ? known.title
        : `${prefix}${scope}`;
  const subject =
    known?.kind === 'all'
      ? 'every command'
      : known?.kind === 'category'
        ? `every ${known.category.label.toLowerCase()} command`
        : 'this command';

  // The broader rules that also apply, so "why doesn't it work here?" is
  // answerable from this page.
  const broader: { label: string; scope: string }[] = [];
  if (scope !== ALL_SCOPE && allRules.has(ALL_SCOPE)) {
    broader.push({ label: 'All commands', scope: ALL_SCOPE });
  }
  if (known?.kind === 'command' && allRules.has(categoryScope(known.category.name))) {
    broader.push({
      label: `${known.category.label} commands`,
      scope: categoryScope(known.category.name),
    });
  }

  const save = saveRule.bind(null, serverId, scope);
  const reset = resetRule.bind(null, serverId, scope);

  return (
    <div>
      <Link
        href={`/dashboard/${serverId}/commands`}
        className="text-sm text-text-muted transition-colors duration-150 hover:text-text-primary"
      >
        ← Commands
      </Link>
      <div className="mb-10 mt-3">
        <h1 className="font-display text-5xl tracking-tight text-text-primary">{title}</h1>
        <p className="mt-2 text-text-secondary">
          {known?.kind === 'command'
            ? known.command.description
            : isCustom
              ? 'Custom command'
              : `These rules apply to ${subject}.`}
        </p>
        {broader.length > 0 ? (
          <p className="mt-3 text-sm text-text-muted">
            Also limited by{' '}
            {broader.map((b, i) => (
              <span key={b.scope}>
                {i > 0 ? ' and ' : ''}
                <Link href={editHref(serverId, b.scope)} className="text-accent hover:underline">
                  {b.label}
                </Link>
              </span>
            ))}{' '}
            — a command has to pass every rule that applies to it.
          </p>
        ) : null}
      </div>

      <form action={save} className="space-y-6">
        <FormCard
          title="On or off"
          description={
            scope === ALL_SCOPE
              ? `Off silences every command except ${prefix}command, which stays so you can turn things back on.`
              : 'An off command does nothing for anyone, admins included.'
          }
        >
          <Toggle
            name="enabled"
            label="Enabled"
            description="Off commands are ignored silently, as MEE6 does."
            defaultChecked={rule.enabled}
          />
        </FormCard>

        <FormCard
          title="Channels"
          description="Leave both empty to allow every channel. Someone trying it elsewhere gets a short pointer to the right channel, which removes itself."
        >
          <ChannelAllowIgnore
            channels={channels}
            allowedTypes={['text']}
            allowedName="allowedChannelIds"
            ignoredName="ignoredChannelIds"
            initialAllowed={rule.allowedChannelIds}
            initialIgnored={rule.ignoredChannelIds}
            allowedLabel="Only works in"
            allowedHint="Empty = works in every channel."
            ignoredLabel="Never works in"
            ignoredHint="Wins over the list above."
          />
        </FormCard>

        <FormCard
          title="Roles"
          description="Leave both empty to allow everyone. Members with Manage Server can always use it."
        >
          <RoleAllowIgnore
            roles={roles}
            allowedName="allowedRoleIds"
            ignoredName="ignoredRoleIds"
            initialAllowed={rule.allowedRoleIds}
            initialIgnored={rule.ignoredRoleIds}
            allowedLabel="Only members with"
            allowedHint="Empty = every member."
            ignoredLabel="Never members with"
            ignoredHint="Wins over the list above."
          />
        </FormCard>

        <FormCard title="Behaviour" description="Per-member cooldown and cleanup.">
          <Field
            label="Cooldown (seconds)"
            name="cooldownSeconds"
            hint={`Per member. Empty = the bot's default; 0 = none; up to ${MAX_COOLDOWN_SECONDS} (one hour). The most specific rule's cooldown wins.`}
          >
            <input
              id="cooldownSeconds"
              name="cooldownSeconds"
              type="number"
              min={0}
              max={MAX_COOLDOWN_SECONDS}
              defaultValue={rule.cooldownSeconds ?? ''}
              placeholder="default"
              className={inputClassName}
            />
          </Field>
          <Toggle
            name="deleteInvocation"
            label="Delete the command message after it runs"
            description="Keeps channels tidy. Needs the bot to have Manage Messages."
            defaultChecked={rule.deleteInvocation}
          />
        </FormCard>

        <SaveBar />
      </form>

      <form action={reset} className="mt-4 flex justify-end">
        <button
          type="submit"
          className="rounded border border-status-danger/30 bg-status-danger/5 px-3 py-1.5 text-xs font-semibold text-status-danger transition-colors duration-150 hover:bg-status-danger/15"
        >
          Reset to defaults
        </button>
      </form>
    </div>
  );
}
