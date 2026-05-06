import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

// ─── Landing page ───────────────────────────────────────────────────
//
// Sister to tempvoice.xyz — same author, shared brand palette, same
// family of typographic restraint. Different product (Panda is a
// multipurpose moderation/music/levels bot, not temp voice channels),
// so the structure and copy are written specifically for what Panda
// does.
//
// Earlier draft of this page had the usual AI-slop tells: templated
// "01 · pillar" mono labels above every section, a descending-colour
// trust strip, the same chat-window component reused four times, a
// gimmicky `license · MIT` fact card, "two-clicks" cliché copy. All
// stripped. This pass:
//   - lets Bebas Neue carry section identity (no kicker labels)
//   - varies the mockup frame per section so the page doesn't feel
//     like the same component four times
//   - declarative copy, no try-hard phrasing
//   - crimson accent reserved for the headline emphasis word and the
//     primary CTAs only
//
// Sections:
//   1. Hero          — headline + subhead + dual CTA + a chat exchange
//   2. Manifesto     — single line of positioning
//   3. Three pillars — typographic + varied mockup per pillar
//   4. Commands      — typographic table, mono in crimson
//   5. Anti-raid     — console mockup
//   6. Open source   — plain paragraph, no fact card
//   7. Final CTA     — direct ask

export default function HomePage(): JSX.Element {
  return (
    <>
      <Header />
      <main className="bg-bg-base">
        <Hero />
        <Manifesto />
        <Pillars />
        <Commands />
        <AntiRaid />
        <OpenSource />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}

// ─── 1. Hero ────────────────────────────────────────────────────────

function Hero(): JSX.Element {
  return (
    <section className="border-b border-[var(--border-subtle)]">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-6 py-24 md:grid-cols-[1.1fr_0.9fr] md:py-32">
        <div className="max-w-xl">
          <h1 className="font-display text-[clamp(56px,9vw,116px)] leading-[0.92] tracking-tight text-text-primary">
            One bot. <span className="text-accent">Every</span> chore.
          </h1>
          <p className="mt-7 max-w-md text-[15px] leading-relaxed text-text-secondary">
            Panda runs music, levels, auto-mod, anti-raid, welcomes,
            reaction roles, scheduled posts, social alerts. Free. Open
            source. Built for Echoed.
          </p>

          <div className="mt-10 flex flex-wrap items-center gap-5">
            <Link
              href="/auth/invite"
              className="inline-flex h-11 items-center rounded bg-accent px-6 text-sm font-semibold text-accent-fg transition-colors duration-150 hover:bg-accent-hover"
            >
              Add to your server
            </Link>
            <Link
              href="https://github.com/shaongitbd/panda"
              className="text-sm text-text-secondary underline-offset-4 transition-colors duration-150 hover:text-text-primary hover:underline"
            >
              Read the source →
            </Link>
          </div>
        </div>

        {/* Single chat exchange. Plain frame — channel name top-left, no
            "live" status pill (that read as decorative). */}
        <ChatFrame channel="general">
          <ChatLine
            author="Tariq"
            color="#7c3aed"
            initials="T"
            mono
            body="!play lofi study mix"
          />
          <ChatLine
            author="panda"
            color="var(--accent)"
            initials="P"
            bot
          >
            <div className="font-medium text-text-primary">
              Now playing · lofi hip hop radio
            </div>
            <div className="mt-0.5 text-[12px] text-text-muted">
              queue · 1 · requested by Tariq
            </div>
          </ChatLine>
        </ChatFrame>
      </div>
    </section>
  );
}

// ─── 2. Manifesto ───────────────────────────────────────────────────
// One sentence. No descending-colour gimmick. Lets the typography do
// the work — Bebas Neue at this size doesn't need any other treatment.

function Manifesto(): JSX.Element {
  return (
    <section className="border-b border-[var(--border-subtle)]">
      <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
        <p className="font-display text-[clamp(40px,5.4vw,72px)] leading-[1.05] tracking-tight text-text-primary">
          Free. Open source. No premium tier.
        </p>
        <p className="mt-6 max-w-xl text-[14px] leading-relaxed text-text-muted">
          Other bots gate their best features behind a paywall the
          moment your community grows. Panda doesn't. Every command,
          every dashboard page, every integration — included.
        </p>
      </div>
    </section>
  );
}

// ─── 3. Three pillars ───────────────────────────────────────────────
// Each pillar uses a *different* mockup frame so the page doesn't
// repeat the same chat-window component four times. Pillar 1 is a
// case-file callout, pillar 2 is an inline chat snippet, pillar 3 is
// a full chat exchange with system events.

function Pillars(): JSX.Element {
  return (
    <section id="features" className="border-b border-[var(--border-subtle)]">
      <div className="mx-auto max-w-6xl space-y-28 px-6 py-24 md:py-32">

        {/* Pillar 1 — moderation, paired with a "case-file" mockup */}
        <article className="grid grid-cols-1 items-center gap-12 md:grid-cols-2 md:gap-20">
          <div>
            <h2 className="font-display text-[clamp(36px,4.6vw,60px)] leading-[1] tracking-tight text-text-primary">
              Moderation that <span className="text-accent">explains itself</span>.
            </h2>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-text-secondary">
              Warn, timeout, kick, ban — chat-first. Every action lands
              in the audit log with the moderator, the reason, and the
              original message preserved, even if the offender deletes
              it on the way out.
            </p>
          </div>

          {/* Case-file mockup — distinct from chat frame. No avatar,
              no message bubbles. Reads like a moderator's clipboard. */}
          <div className="rounded border border-[var(--border-subtle)] bg-bg-card font-mono text-[12px] leading-relaxed shadow-2xl shadow-black/40">
            <div className="border-b border-[var(--border-subtle)] px-5 py-3 text-[11px] uppercase tracking-[0.18em] text-text-muted">
              audit log · case 482
            </div>
            <dl className="grid grid-cols-[88px_1fr] gap-y-2 px-5 py-4 text-text-secondary">
              <dt className="text-text-muted">action</dt><dd className="text-accent">warn</dd>
              <dt className="text-text-muted">target</dt><dd className="text-text-primary">@drift</dd>
              <dt className="text-text-muted">reason</dt><dd>posting referral spam</dd>
              <dt className="text-text-muted">history</dt><dd>3rd warning · 30-day window</dd>
              <dt className="text-text-muted">moderator</dt><dd className="text-text-primary">Anya</dd>
              <dt className="text-text-muted">channel</dt><dd>#general</dd>
              <dt className="text-text-muted">message</dt>
              <dd className="text-text-muted italic">"check out my crypto giveaway https://…"</dd>
            </dl>
          </div>
        </article>

        {/* Pillar 2 — auto-mod, paired with an inline chat snippet
            (no channel header — different shape from hero/pillar 3) */}
        <article className="grid grid-cols-1 items-center gap-12 md:grid-cols-2 md:gap-20">
          <div className="md:order-2">
            <h2 className="font-display text-[clamp(36px,4.6vw,60px)] leading-[1] tracking-tight text-text-primary">
              Eight filters. <span className="text-accent">Off by default</span>.
            </h2>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-text-secondary">
              Spam, links, caps, mentions, emoji, zalgo, invites,
              bad-words. Each filter has its own thresholds, channel
              scope, and exempt roles. Configure what matters, ignore
              what doesn't.
            </p>
          </div>

          <div className="md:order-1 space-y-3 rounded border border-[var(--border-subtle)] bg-bg-card px-5 py-5 shadow-2xl shadow-black/40">
            <ChatLine author="Riley" color="#0ea5e9" initials="R" body="AAAAAAAAAAA WHY ISNT IT WORKING" />
            <div className="ml-11 border-l-2 border-[rgba(255,255,255,0.10)] pl-3 text-[12px] text-text-muted">
              message removed · caps filter (74% &gt; 60%) · 5-minute timeout
            </div>
            <ChatLine author="Riley" color="#0ea5e9" initials="R" body="okay i can take a hint" />
          </div>
        </article>

        {/* Pillar 3 — welcomes, full chat frame with a system event */}
        <article className="grid grid-cols-1 items-center gap-12 md:grid-cols-2 md:gap-20">
          <div>
            <h2 className="font-display text-[clamp(36px,4.6vw,60px)] leading-[1] tracking-tight text-text-primary">
              Greet new members <span className="text-accent">like a person</span>.
            </h2>
            <p className="mt-5 max-w-md text-[15px] leading-relaxed text-text-secondary">
              Auto-greet on join, auto-assign a starter role, point them
              at the rules. Welcome templates support placeholders so
              the message doesn't read stamped.
            </p>
          </div>

          <ChatFrame channel="welcome">
            <div className="text-[12px] italic text-text-muted">
              mei joined the server.
            </div>
            <ChatLine author="panda" color="var(--accent)" initials="P" bot>
              <div className="text-text-primary">
                Welcome <span className="text-accent">@mei</span> to <span className="font-medium">Lavender Cafe</span>.
              </div>
              <div className="mt-0.5 text-[12px] text-text-muted">
                You're member #1,247 — head over to #rules to get verified.
              </div>
            </ChatLine>
          </ChatFrame>
        </article>
      </div>
    </section>
  );
}

// ─── 4. Commands ────────────────────────────────────────────────────

function Commands(): JSX.Element {
  const groups: { label: string; items: { cmd: string; desc: string }[] }[] = [
    {
      label: 'Music',
      items: [
        { cmd: '!play <query>',     desc: 'YouTube or SoundCloud, instant.' },
        { cmd: '!skip',             desc: 'DJ-role or admin only.' },
        { cmd: '!queue',            desc: 'See what\'s next, who asked.' },
        { cmd: '!volume <0–100>',   desc: 'Per-server volume memory.' },
      ],
    },
    {
      label: 'Moderation',
      items: [
        { cmd: '!warn @user <reason>',      desc: 'Logged, escalation-aware.' },
        { cmd: '!timeout @user <duration>', desc: '1m, 1h, 7d — natural durations.' },
        { cmd: '!kick @user <reason>',      desc: 'Kicks and DMs the reason.' },
        { cmd: '!ban @user <reason>',       desc: 'Permanent. Always logged.' },
      ],
    },
    {
      label: 'Engagement',
      items: [
        { cmd: '!rank',              desc: 'XP, level, time-to-next.' },
        { cmd: '!leaderboard',       desc: 'Top members in your server.' },
        { cmd: '!gstart <prize>',    desc: 'Giveaway with role-scoped entry.' },
        { cmd: '!afk <message>',     desc: 'Auto-reply when mentioned.' },
      ],
    },
  ];

  return (
    <section id="commands" className="border-b border-[var(--border-subtle)]">
      <div className="mx-auto max-w-6xl px-6 py-24 md:py-28">
        <div className="grid grid-cols-1 gap-14 md:grid-cols-[1fr_2.4fr] md:gap-20">
          <div className="md:sticky md:top-28 md:self-start">
            <h2 className="font-display text-[clamp(36px,4.6vw,60px)] leading-[1] tracking-tight text-text-primary">
              Reachable from a message.
            </h2>
            <p className="mt-5 max-w-sm text-[15px] leading-relaxed text-text-secondary">
              Everything Panda does is one command away. The dashboard
              is for the things you really don't want to type.
            </p>
          </div>

          <div className="space-y-12">
            {groups.map((g) => (
              <div key={g.label}>
                <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                  {g.label}
                </p>
                <div className="divide-y divide-[var(--border-subtle)]">
                  {g.items.map((item) => (
                    <div
                      key={item.cmd}
                      className="grid grid-cols-1 gap-1 py-4 md:grid-cols-[260px_1fr] md:items-baseline md:gap-8"
                    >
                      <code className="font-mono text-[13px] text-accent">
                        {item.cmd}
                      </code>
                      <p className="text-[14px] leading-relaxed text-text-secondary">
                        {item.desc}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            <p className="text-[13px] text-text-muted">
              ...and forty more. The dashboard groups them by category.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 5. Anti-raid ───────────────────────────────────────────────────

function AntiRaid(): JSX.Element {
  return (
    <section className="border-b border-[var(--border-subtle)]">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-6 py-24 md:grid-cols-2 md:py-28">
        <div>
          <h2 className="font-display text-[clamp(36px,4.6vw,60px)] leading-[1] tracking-tight text-text-primary">
            Anti-raid runs <span className="text-accent">while you sleep</span>.
          </h2>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-text-secondary">
            Watches join velocity and account age. Crosses your
            threshold and lockdown engages — invites pause, verification
            climbs, every join goes to a holding queue you review when
            you're back at the keyboard.
          </p>
        </div>

        <div className="rounded border border-[var(--border-subtle)] bg-bg-card font-mono text-[12px] leading-relaxed shadow-2xl shadow-black/40">
          <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-2.5">
            <span className="text-[11px] uppercase tracking-[0.18em] text-text-muted">
              anti-raid · log
            </span>
            <span className="rounded-full bg-status-danger/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-status-danger">
              lockdown
            </span>
          </div>
          <div className="px-4 py-4 text-text-secondary">
            <p><span className="text-text-muted">03:24:11</span> 14 joins / 60s — threshold 12</p>
            <p><span className="text-text-muted">03:24:11</span> verification → <span className="text-status-warning">Medium</span></p>
            <p><span className="text-text-muted">03:24:11</span> invites paused</p>
            <p className="mt-2 text-text-muted">— holding —</p>
            <p><span className="text-text-muted">03:24:14</span> <span className="text-text-primary">@noctis_</span> · 6h account</p>
            <p><span className="text-text-muted">03:24:15</span> <span className="text-text-primary">@halo7</span> · 11h account</p>
            <p><span className="text-text-muted">03:24:18</span> <span className="text-text-primary">@plumeria</span> · 4h account</p>
            <p className="mt-3 text-text-muted">11 more queued. Review when you're ready.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 6. Open source ─────────────────────────────────────────────────
// Plain paragraph, no fact card. The line itself is the statement.

function OpenSource(): JSX.Element {
  return (
    <section className="border-b border-[var(--border-subtle)]">
      <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
        <h2 className="font-display text-[clamp(34px,4.4vw,56px)] leading-[1.05] tracking-tight text-text-primary">
          The whole bot fits in <span className="text-accent">one repo</span>.
        </h2>
        <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-text-secondary">
          MIT license. No telemetry. No tracking. No premium tier you'll
          be nudged toward later. If we ever cross those lines —
          fork us. That's the point.
        </p>
        <Link
          href="https://github.com/shaongitbd/panda"
          className="mt-7 inline-flex text-sm text-text-secondary underline-offset-4 transition-colors duration-150 hover:text-text-primary hover:underline"
        >
          github.com/shaongitbd/panda →
        </Link>
      </div>
    </section>
  );
}

// ─── 7. Final CTA ───────────────────────────────────────────────────

function FinalCTA(): JSX.Element {
  return (
    <section>
      <div className="mx-auto max-w-6xl px-6 py-28 md:py-36">
        <h2 className="max-w-3xl font-display text-[clamp(48px,7vw,96px)] leading-[0.95] tracking-tight text-text-primary">
          Add Panda to your server.
        </h2>
        <p className="mt-6 max-w-lg text-[15px] leading-relaxed text-text-secondary">
          Authorise once. Configure from chat or the dashboard. Leave
          whenever — your settings stay, your data leaves with you.
        </p>
        <div className="mt-10 flex flex-wrap items-center gap-6">
          <Link
            href="/auth/invite"
            className="inline-flex h-12 items-center rounded bg-accent px-7 text-[15px] font-semibold text-accent-fg transition-colors duration-150 hover:bg-accent-hover"
          >
            Add to your server
          </Link>
          <Link
            href="/dashboard"
            className="text-[14px] text-text-secondary underline-offset-4 transition-colors duration-150 hover:text-text-primary hover:underline"
          >
            Already have it? Open dashboard →
          </Link>
        </div>
      </div>
    </section>
  );
}

// ─── Mockup primitives ──────────────────────────────────────────────
// Two reusable bits: <ChatFrame> (channel-headed window) and <ChatLine>
// (one message row). The page also uses bespoke mockup shapes inline
// (case-file dl/dt grid, anti-raid console log) — those stay inline so
// each section reads with its own visual idiom instead of every mockup
// looking like the same component.

function ChatFrame({ channel, children }: { channel: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="overflow-hidden rounded border border-[var(--border-subtle)] bg-bg-card shadow-2xl shadow-black/40">
      <div className="border-b border-[var(--border-subtle)] px-4 py-2.5 text-[13px] text-text-muted">
        <span className="text-text-secondary">#</span> {channel}
      </div>
      <div className="space-y-4 px-4 py-5">{children}</div>
    </div>
  );
}

interface ChatLineProps {
  author: string;
  color: string;
  initials: string;
  bot?: boolean;
  body?: string;
  mono?: boolean;
  children?: React.ReactNode;
}

function ChatLine({ author, color, initials, bot, body, mono, children }: ChatLineProps): JSX.Element {
  return (
    <div className="flex items-start gap-3">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-bg-base"
        style={{ background: color }}
      >
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold text-text-primary">{author}</span>
          {bot && (
            <span className="rounded-sm bg-accent/15 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wider text-accent">
              bot
            </span>
          )}
          <span className="text-[11px] text-text-muted">just now</span>
        </div>
        <div className={['mt-0.5 text-[13.5px]', mono ? 'font-mono text-accent' : 'leading-relaxed text-text-secondary'].join(' ')}>
          {body ?? children}
        </div>
      </div>
    </div>
  );
}
