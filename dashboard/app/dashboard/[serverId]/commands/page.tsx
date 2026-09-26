import Link from 'next/link';
import { listCommandRules, type CommandRule } from '@/lib/queries/commandSettings';
import { listCommands } from '@/lib/queries/customCommands';
import { getGuildConfig } from '@/lib/queries/guildConfig';
import { COMMAND_CATALOG, ALL_SCOPE, categoryScope } from '@/lib/commandCatalog';
import { toggleRule } from './actions';
import { ruleChips, editHref } from './ruleSummary';

interface PageProps {
  params: Promise<{ serverId: string }>;
}

const CARD = 'rounded-lg border border-[var(--border-subtle)] bg-bg-card';
const CHIP = 'rounded-sm bg-bg-elevated px-2 py-0.5 text-xs font-semibold text-text-muted';
const CHIP_OFF = 'rounded-sm bg-status-danger/10 px-2 py-0.5 text-xs font-semibold text-status-danger';
const LINK_BTN =
  'rounded border border-[var(--border-subtle)] px-3 py-1 text-xs font-semibold text-text-secondary transition-colors duration-150 hover:bg-bg-elevated hover:text-text-primary';

function Chips({ rule }: { rule: CommandRule | undefined }): JSX.Element | null {
  const chips = ruleChips(rule);
  if (chips.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {chips.map((chip) => (
        <span key={chip} className={chip === 'Off' ? CHIP_OFF : CHIP}>
          {chip}
        </span>
      ))}
    </div>
  );
}

function ToggleButton({
  serverId,
  scope,
  enabled,
}: {
  serverId: string;
  scope: string;
  enabled: boolean;
}): JSX.Element {
  const action = toggleRule.bind(null, serverId, scope, !enabled);
  return (
    <form action={action}>
      <button type="submit" className={LINK_BTN}>
        {enabled ? 'Turn off' : 'Turn on'}
      </button>
    </form>
  );
}

function Row({
  serverId,
  scope,
  prefix,
  name,
  description,
  rule,
}: {
  serverId: string;
  scope: string;
  prefix: string;
  name: string;
  description: string;
  rule: CommandRule | undefined;
}): JSX.Element {
  const enabled = rule?.enabled ?? true;
  return (
    <li className="flex items-start justify-between gap-4 px-5 py-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-3">
          <code
            className={`rounded bg-bg-elevated px-2 py-0.5 font-mono text-sm ${enabled ? 'text-accent' : 'text-text-muted line-through'}`}
          >
            {prefix}
            {name}
          </code>
          <span className="text-sm text-text-secondary">{description}</span>
        </div>
        <Chips rule={rule} />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <ToggleButton serverId={serverId} scope={scope} enabled={enabled} />
        <Link href={editHref(serverId, scope)} className={LINK_BTN}>
          Rules
        </Link>
      </div>
    </li>
  );
}

export default async function CommandsPage({ params }: PageProps): Promise<JSX.Element> {
  const { serverId } = await params;
  const [rules, customCommands, guild] = await Promise.all([
    listCommandRules(serverId),
    listCommands(serverId),
    getGuildConfig(serverId),
  ]);
  const prefix = guild.prefix ?? '!';
  const allRule = rules.get(ALL_SCOPE);

  return (
    <div>
      <div className="mb-10">
        <h1 className="font-display text-5xl tracking-tight text-text-primary">Commands</h1>
        <p className="mt-2 text-text-secondary">
          Turn commands off, or limit which channels and roles can use them. Rules stack: a
          command has to pass the rule for all commands, its category&apos;s rule and its own.
          Members with Manage Server are never held to channel or role rules, so you can&apos;t
          lock yourself out. Changes reach the bot within a minute.
        </p>
      </div>

      {/* ─── Every command ─────────────────────────────────────────── */}
      <div className={CARD}>
        <div className="flex items-start justify-between gap-4 p-5">
          <div>
            <h2 className="font-display text-2xl tracking-tight text-text-primary">All commands</h2>
            <p className="mt-1 text-sm text-text-secondary">
              A rule here applies to every command, custom ones included — for example, keep the
              bot to #bot-commands.
            </p>
            <Chips rule={allRule} />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link href={editHref(serverId, ALL_SCOPE)} className={LINK_BTN}>
              Rules
            </Link>
          </div>
        </div>
      </div>

      {/* ─── Categories ────────────────────────────────────────────── */}
      {COMMAND_CATALOG.map((category) => {
        const scope = categoryScope(category.name);
        const catRule = rules.get(scope);
        return (
          <div key={category.name} className={`${CARD} mt-6`}>
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border-subtle)] p-5">
              <div>
                <h2 className="font-display text-2xl tracking-tight text-text-primary">
                  {category.label}
                </h2>
                <p className="mt-1 text-sm text-text-secondary">{category.blurb}</p>
                <Chips rule={catRule} />
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <ToggleButton serverId={serverId} scope={scope} enabled={catRule?.enabled ?? true} />
                <Link href={editHref(serverId, scope)} className={LINK_BTN}>
                  Category rules
                </Link>
              </div>
            </div>
            <ul className="divide-y divide-[var(--border-subtle)]">
              {category.commands.map((cmd) => (
                <Row
                  key={cmd.name}
                  serverId={serverId}
                  scope={cmd.name}
                  prefix={prefix}
                  name={cmd.name}
                  description={cmd.description}
                  rule={rules.get(cmd.name)}
                />
              ))}
            </ul>
          </div>
        );
      })}

      {/* ─── Custom commands ───────────────────────────────────────── */}
      <div className={`${CARD} mt-6`}>
        <div className="border-b border-[var(--border-subtle)] p-5">
          <h2 className="font-display text-2xl tracking-tight text-text-primary">
            Custom commands
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            Your server&apos;s own commands. They follow the all-commands rule and their own.
          </p>
        </div>
        {customCommands.length === 0 ? (
          <p className="p-5 text-sm text-text-muted">
            No custom commands yet — add them on the{' '}
            <Link href={`/dashboard/${serverId}/customcommands`} className="text-accent hover:underline">
              Custom commands
            </Link>{' '}
            page.
          </p>
        ) : (
          <ul className="divide-y divide-[var(--border-subtle)]">
            {customCommands.map((cmd) => (
              <Row
                key={cmd.name}
                serverId={serverId}
                scope={cmd.name}
                prefix={prefix}
                name={cmd.name}
                description="Custom command"
                rule={rules.get(cmd.name)}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
