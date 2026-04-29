import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

// Landing page. Three sections, all dark, single accent color.
// Architecture mirrors tempvoice's narrative: hero → social proof
// strip → "how it works" → final CTA. Original copy throughout.

export default function HomePage(): JSX.Element {
  return (
    <>
      <Header />

      <main>
        {/* ─── Hero ──────────────────────────────────────────────────
            Asymmetric: text + CTAs on the left, dashboard mockup on
            the right. The mockup is the explanation — what users will
            actually be configuring. */}
        <section className="relative mx-auto grid max-w-6xl gap-16 px-6 pt-24 pb-32 lg:grid-cols-[1.1fr_1fr] lg:gap-12">
          <div className="relative z-10 flex flex-col justify-center">
            <h1 className="headline-display">
              <span className="text-accent">Run your server</span>
              <br />
              <span className="text-text-primary">on autopilot.</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-relaxed text-text-secondary">
              Levels, moderation, auto-mod, welcome flows, reaction roles, scheduled messages,
              social notifications &mdash; everything your Echoed server needs, configured from
              one dashboard.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                href="/login"
                className="rounded bg-accent px-6 py-3 text-sm font-semibold text-accent-fg transition-colors duration-150 hover:bg-accent-hover"
              >
                Add panda to your server
              </Link>
              <Link
                href="/login"
                className="rounded border border-[var(--border-strong)] bg-bg-card px-6 py-3 text-sm font-semibold text-text-primary transition-colors duration-150 hover:bg-bg-hover"
              >
                Open Dashboard
              </Link>
            </div>
          </div>

          {/* Stacked mockup cards — tilted slightly for depth, the
              way tempvoice does its channel preview stack. Pure CSS,
              no real screenshots yet (those come post-MVP). */}
          <div className="relative hero-glow flex items-center justify-center">
            <MockupStack />
          </div>
        </section>

        {/* ─── Servers strip ─────────────────────────────────────────
            Horizontal carousel of placeholder server cards. Once the
            bot is in real servers we replace this with live data. */}
        <section className="border-y border-[var(--border-subtle)] bg-bg-card/30">
          <div className="mx-auto max-w-6xl px-6 py-10">
            <p className="text-xs font-semibold uppercase tracking-[0.15em] text-text-muted">
              Trusted on Echoed servers
            </p>
            <div className="mt-6 flex gap-4 overflow-x-auto pb-2">
              {SAMPLE_SERVERS.map((s) => (
                <ServerCard key={s.name} {...s} />
              ))}
            </div>
          </div>
        </section>

        {/* ─── Features ──────────────────────────────────────────────
            Three big feature cards with vertical-stencil labels
            running up the right edge. Memorable detail. */}
        <section id="features" className="mx-auto max-w-6xl px-6 py-24">
          <div className="mb-12 max-w-2xl">
            <h2 className="font-display text-5xl tracking-tight text-text-primary">
              Three pillars. <span className="text-accent">No bloat.</span>
            </h2>
            <p className="mt-4 text-text-secondary">
              Every feature is configurable from the dashboard or chat. Disable what you don't
              need — panda only runs what you turn on.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {FEATURES.map((f) => (
              <FeatureCard key={f.label} {...f} />
            ))}
          </div>
        </section>

        {/* ─── Final CTA strip ───────────────────────────────────── */}
        <section className="mx-auto max-w-6xl px-6 py-24">
          <div className="rounded-lg border border-[var(--border-subtle)] bg-bg-card p-12 text-center">
            <h3 className="font-display text-4xl tracking-tight text-text-primary">
              Ready when you are.
            </h3>
            <p className="mx-auto mt-3 max-w-xl text-text-secondary">
              Free to use. No premium tier. No paywall around basic features.
            </p>
            <Link
              href="/login"
              className="mt-8 inline-block rounded bg-accent px-8 py-3 text-sm font-semibold text-accent-fg transition-colors duration-150 hover:bg-accent-hover"
            >
              Add panda to your server
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────
//
// Kept inline to this file — they're not used elsewhere and breaking
// them out would just create more imports. Promote when reused.

function MockupStack(): JSX.Element {
  return (
    <div className="relative w-full max-w-md">
      {/* Background stub card, slightly offset and lower opacity. */}
      <div className="absolute -left-6 top-8 w-full rounded-lg border border-[var(--border-subtle)] bg-bg-card p-5 opacity-40">
        <MockupRankCard />
      </div>
      {/* Foreground card, the real one. */}
      <div className="relative rounded-lg border border-[var(--border-strong)] bg-bg-card p-5 shadow-2xl">
        <MockupRankCard />
      </div>
    </div>
  );
}

function MockupRankCard(): JSX.Element {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-accent-muted ring-1 ring-accent" />
          <div>
            <div className="text-sm font-semibold">@maven</div>
            <div className="text-xs text-text-muted">Level 24 · 18,420 XP</div>
          </div>
        </div>
        <span className="rounded-sm bg-status-online/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-status-online">
          online
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-bg-elevated">
        <div className="h-full w-[68%] bg-accent" />
      </div>
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>1,365 / 2,000 XP to level 25</span>
        <span>#3 on the server</span>
      </div>
    </div>
  );
}

interface SampleServer {
  name: string;
  members: string;
  initial: string;
}

const SAMPLE_SERVERS: SampleServer[] = [
  { name: 'Late Night Devs', members: '12,402 members', initial: 'L' },
  { name: 'Gaming Lounge', members: '8,154 members', initial: 'G' },
  { name: 'Pixel Studio', members: '3,021 members', initial: 'P' },
  { name: 'Open Source HQ', members: '21,560 members', initial: 'O' },
  { name: 'Music Friends', members: '4,820 members', initial: 'M' },
];

function ServerCard({ name, members, initial }: SampleServer): JSX.Element {
  return (
    <div className="flex shrink-0 items-center gap-3 rounded border border-[var(--border-subtle)] bg-bg-card px-4 py-3">
      <div className="flex h-10 w-10 items-center justify-center rounded-sm bg-accent-muted font-display text-xl text-accent">
        {initial}
      </div>
      <div>
        <div className="text-sm font-semibold text-text-primary">{name}</div>
        <div className="text-xs text-text-muted">{members}</div>
      </div>
    </div>
  );
}

interface Feature {
  label: string;
  title: string;
  blurb: string;
}

const FEATURES: Feature[] = [
  {
    label: 'MODERATE',
    title: 'Stay calm at scale',
    blurb:
      'Eight-filter auto-mod, mod-log routing, timeout / kick / ban / warn with searchable history, bulk-purge.',
  },
  {
    label: 'LEVEL',
    title: 'Reward the regulars',
    blurb:
      'XP per message, role rewards at level thresholds, no-XP channels, customizable level-up announcements.',
  },
  {
    label: 'AUTOMATE',
    title: 'Set it and forget',
    blurb:
      'Welcome messages, reaction roles, scheduled posts, auto-react, keyword responses, Reddit / Twitch / YouTube alerts.',
  },
];

function FeatureCard({ label, title, blurb }: Feature): JSX.Element {
  return (
    <article className="relative overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-bg-card p-6 transition-colors duration-150 hover:border-[var(--border-strong)]">
      <div className="pr-12">
        <h3 className="font-display text-2xl tracking-tight text-text-primary">{title}</h3>
        <p className="mt-3 text-sm leading-relaxed text-text-secondary">{blurb}</p>
      </div>
      <span className="vertical-stencil absolute right-3 top-3 bottom-3">{label}</span>
    </article>
  );
}
