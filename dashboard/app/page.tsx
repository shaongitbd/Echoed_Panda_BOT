import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

// Landing page — direct clone of tempvoice.xyz's structure:
//   1. Hero: short contrastive headline + 1-sentence subline + two CTAs
//      on the left, a single compact product mockup on the right.
//   2. "What does panda do?" — three side-by-side illustrations
//      walking through the user flow (command → response → dashboard).
//   3. "Let your server run itself." — text left, stacked mockups
//      right, showing automation in action.
//   4. Final CTA — single button on a quiet section.
//
// No broadcast chrome, no marquees, no grid textures, no vinyl
// metaphor. Flat warm-dark surfaces, single gold accent, generous
// whitespace, hairline borders. Restraint over flourish — the same
// minimal-editorial feel tempvoice has.

export default function HomePage(): JSX.Element {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <ThreeStep />
        <ModerateThemselves />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────

function Hero(): JSX.Element {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-14 px-6 pt-20 pb-24 lg:grid-cols-[1.05fr_1fr] lg:gap-16 lg:pt-28 lg:pb-32">
      <div>
        <h1 className="font-display tracking-tight text-text-primary" style={{ fontSize: 'clamp(3rem, 7.5vw, 5.5rem)', lineHeight: 0.96 }}>
          Less chaos.
          <br />
          <span className="text-accent">More server.</span>
        </h1>
        <p className="mt-6 max-w-md text-base leading-relaxed text-text-secondary">
          Panda keeps your Echoed server organised &mdash; music, levels, moderation, welcomes,
          social alerts &mdash; all configurable from one dashboard.
        </p>
        <div className="mt-9 flex flex-wrap gap-3">
          <Link
            href="/login"
            className="rounded-md bg-accent px-6 py-3 text-sm font-semibold text-accent-fg transition-colors duration-150 hover:bg-accent-hover"
          >
            Get panda
          </Link>
          <Link
            href="/login"
            className="rounded-md border border-[var(--border-strong)] bg-bg-card px-6 py-3 text-sm font-semibold text-text-primary transition-colors duration-150 hover:bg-bg-hover"
          >
            Open dashboard
          </Link>
        </div>
      </div>
      <div className="relative">
        <CompactExample />
      </div>
    </section>
  );
}

// ─── "What does panda do?" — three illustrated steps ─────────────────

function ThreeStep(): JSX.Element {
  return (
    <section id="how" className="border-t border-[var(--border-subtle)] bg-bg-card/30">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display tracking-tight text-text-primary" style={{ fontSize: 'clamp(2.25rem, 4.5vw, 3.5rem)', lineHeight: 1 }}>
            What does panda do?
          </h2>
          <p className="mt-5 text-base leading-relaxed text-text-secondary">
            Panda runs in your server. You type a command, the bot does the thing, you fine-tune
            the rules from the dashboard. That&rsquo;s the whole loop.
          </p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          <StepCard step="1" title="Type a command" tagline="Anywhere in chat.">
            <ChatSnippet
              rows={[{ user: 'maven', text: '!play synthwave drive 80s' }]}
            />
          </StepCard>
          <StepCard step="2" title="Panda handles it" tagline="Joins voice. Plays. Posts now-playing.">
            <ChatSnippet rows={[{ bot: true, embed: true }]} />
          </StepCard>
          <StepCard step="3" title="Tweak it on the web" tagline="Channel scopes, role gates, DJ perms.">
            <DashboardSnippet />
          </StepCard>
        </div>
      </div>
    </section>
  );
}

function StepCard({
  step,
  title,
  tagline,
  children,
}: {
  step: string;
  title: string;
  tagline: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <article className="flex flex-col rounded-lg border border-[var(--border-subtle)] bg-bg-card p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-accent text-xs font-bold text-accent-fg">
          {step}
        </span>
        <h3 className="font-display text-2xl tracking-tight text-text-primary">{title}</h3>
      </div>
      <p className="mt-2 text-sm text-text-secondary">{tagline}</p>
      <div className="mt-6">{children}</div>
    </article>
  );
}

// ─── "Let your server run itself" — text left, mockups stacked right ─

function ModerateThemselves(): JSX.Element {
  return (
    <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-24 lg:grid-cols-[1fr_1fr] lg:gap-20">
      <div>
        <h2 className="font-display tracking-tight text-text-primary" style={{ fontSize: 'clamp(2.25rem, 4.5vw, 3.5rem)', lineHeight: 1 }}>
          Let your server run itself.
        </h2>
        <p className="mt-5 max-w-md text-base leading-relaxed text-text-secondary">
          Spam, raids, late-night noise &mdash; panda catches the obvious stuff so your mods can
          handle the actual humans. Welcome flows, auto-roles, scheduled posts and social alerts
          run in the background.
        </p>
        <ul className="mt-7 space-y-3 text-sm text-text-secondary">
          <Bullet>Eight-filter auto-mod (spam, links, caps, mentions, emoji, zalgo, invites, bad-words)</Bullet>
          <Bullet>Welcome messages, auto-roles, reaction-role menus</Bullet>
          <Bullet>Scheduled posts &amp; Reddit / Twitch / YouTube alerts</Bullet>
          <Bullet>Anti-raid lockdown when join floods spike</Bullet>
        </ul>
        <Link
          href="/login"
          className="mt-9 inline-block rounded-md border border-[var(--border-strong)] bg-bg-card px-6 py-3 text-sm font-semibold text-text-primary transition-colors duration-150 hover:bg-bg-hover"
        >
          See all features
        </Link>
      </div>

      {/* Stacked mockups, slightly offset */}
      <div className="relative h-[440px]">
        <div className="absolute right-0 top-0 w-[88%]">
          <ChatSnippet
            rows={[
              { user: 'someone-spammy', text: 'BUY CHEAP NITRO!! discord.gg/xxx', deleted: true },
              { bot: true, automod: true },
            ]}
          />
        </div>
        <div className="absolute bottom-0 left-0 w-[88%]">
          <ChatSnippet
            rows={[
              { bot: true, welcome: true, joiner: 'aria' },
            ]}
          />
        </div>
      </div>
    </section>
  );
}

function Bullet({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-2 block h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden="true" />
      <span className="leading-relaxed">{children}</span>
    </li>
  );
}

// ─── Final CTA ────────────────────────────────────────────────────────

function FinalCTA(): JSX.Element {
  return (
    <section className="border-t border-[var(--border-subtle)] bg-bg-card/30">
      <div className="mx-auto max-w-3xl px-6 py-24 text-center">
        <h2 className="font-display tracking-tight text-text-primary" style={{ fontSize: 'clamp(2.25rem, 5vw, 3.75rem)', lineHeight: 1 }}>
          Ready to add panda?
        </h2>
        <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-text-secondary">
          Free. Open source. No premium tier. Configure it in five minutes, forget it from then on.
        </p>
        <Link
          href="/login"
          className="mt-9 inline-block rounded-md bg-accent px-8 py-3.5 text-sm font-semibold text-accent-fg transition-colors duration-150 hover:bg-accent-hover"
        >
          Add panda to your server
        </Link>
      </div>
    </section>
  );
}

// ─── Mockup primitives ───────────────────────────────────────────────

interface ChatRowData {
  user?: string;
  text?: string;
  bot?: boolean;
  embed?: boolean;
  automod?: boolean;
  welcome?: boolean;
  joiner?: string;
  deleted?: boolean;
}

function ChatSnippet({ rows }: { rows: ChatRowData[] }): JSX.Element {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-bg-base p-4 shadow-xl">
      <div className="space-y-3">
        {rows.map((r, i) => (
          <ChatRow key={i} {...r} />
        ))}
      </div>
    </div>
  );
}

function ChatRow({ user, text, bot, embed, automod, welcome, joiner, deleted }: ChatRowData): JSX.Element {
  const handle = bot ? 'panda' : user ?? 'user';
  const initial = handle.slice(0, 1).toUpperCase();
  const swatch = bot
    ? 'bg-accent text-accent-fg'
    : 'bg-bg-elevated text-text-secondary';

  return (
    <div className="flex items-start gap-3">
      <div
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${swatch}`}
        aria-hidden="true"
      >
        {initial}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className={`text-sm font-semibold ${bot ? 'text-accent' : 'text-text-primary'}`}>
            {handle}
          </span>
          {bot && (
            <span className="rounded-sm bg-accent-muted px-1.5 py-px text-[9px] font-semibold uppercase tracking-wider text-accent">
              bot
            </span>
          )}
        </div>
        {text && (
          <p
            className={`mt-0.5 break-words text-sm ${
              deleted ? 'text-text-muted line-through' : 'text-text-primary'
            }`}
          >
            {text}
          </p>
        )}
        {embed && <NowPlayingEmbed />}
        {automod && <AutomodEmbed />}
        {welcome && <WelcomeEmbed joiner={joiner ?? 'aria'} />}
      </div>
    </div>
  );
}

function NowPlayingEmbed(): JSX.Element {
  return (
    <div className="mt-2 overflow-hidden rounded border-l-2 border-accent bg-bg-card p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-accent">
        Now playing
      </div>
      <div className="mt-1 truncate text-sm font-semibold text-text-primary">
        Blade Runner — Main Titles
      </div>
      <div className="text-xs text-text-muted">Vangelis · 4:01</div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-bg-input">
        <div className="h-full w-[34%] rounded-full bg-accent" />
      </div>
    </div>
  );
}

function AutomodEmbed(): JSX.Element {
  return (
    <div className="mt-2 rounded border-l-2 border-status-warning bg-bg-card p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-status-warning">
        Auto-mod · spam filter
      </div>
      <div className="mt-1 text-sm text-text-primary">
        Removed a message from <span className="font-semibold">@someone-spammy</span>
      </div>
      <div className="mt-1 text-xs text-text-muted">
        Reason: link to non-whitelisted invite
      </div>
    </div>
  );
}

function WelcomeEmbed({ joiner }: { joiner: string }): JSX.Element {
  return (
    <div className="mt-2 rounded border-l-2 border-status-online bg-bg-card p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-status-online">
        Welcome
      </div>
      <div className="mt-1 text-sm text-text-primary">
        <span className="font-semibold text-accent">@{joiner}</span> just joined the server &mdash;
        say hi.
      </div>
      <div className="mt-1 text-xs text-text-muted">Auto-role: Member · 247 members total</div>
    </div>
  );
}

// ─── Hero compact example ────────────────────────────────────────────

function CompactExample(): JSX.Element {
  return (
    <div className="rounded-lg border border-[var(--border-strong)] bg-bg-card p-5 shadow-2xl">
      <div className="mb-3 flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-text-muted">#</span>
          <span className="font-semibold text-text-primary">music-room</span>
        </div>
        <span className="text-[11px] text-text-muted">5 online</span>
      </div>
      <div className="space-y-3">
        <ChatRow user="maven" text="!play https://youtu.be/blade-runner-ost" />
        <ChatRow bot embed />
        <ChatRow user="aria" text="banger" />
      </div>
    </div>
  );
}

// ─── Step 3 dashboard snippet ────────────────────────────────────────

function DashboardSnippet(): JSX.Element {
  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-bg-base p-4 shadow-xl">
      <div className="mb-3 flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">
            Music settings
          </div>
          <div className="font-display text-base tracking-tight text-text-primary">
            Late Night Devs
          </div>
        </div>
        <span className="rounded-full bg-status-online/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-status-online">
          live
        </span>
      </div>
      <div className="space-y-2">
        <SettingRow label="DJ role" value="@DJs" pill />
        <SettingRow label="Allowed channels" value="#music · #lounge" />
        <SettingRow label="Auto-leave when empty" toggle />
      </div>
    </div>
  );
}

function SettingRow({
  label,
  value,
  pill,
  toggle,
}: {
  label: string;
  value?: string;
  pill?: boolean;
  toggle?: boolean;
}): JSX.Element {
  return (
    <div className="flex items-center justify-between rounded border border-[var(--border-subtle)] bg-bg-card p-2.5">
      <span className="text-xs text-text-secondary">{label}</span>
      {toggle ? (
        <span className="relative inline-flex h-4 w-7 items-center rounded-full bg-accent">
          <span className="ml-3 h-3 w-3 rounded-full bg-accent-fg" />
        </span>
      ) : pill ? (
        <span className="rounded-full bg-accent-muted px-2.5 py-0.5 text-[11px] font-semibold text-accent">
          {value}
        </span>
      ) : (
        <span className="truncate font-mono text-[11px] text-text-primary">{value}</span>
      )}
    </div>
  );
}
