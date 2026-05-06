import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

// ─── Landing page ───────────────────────────────────────────────────
//
// Minimal-editorial direction, sibling to the tempvoice.xyz brand family
// the same author maintains: contrastive Bebas Neue headline, product-led
// chat mockups instead of an icon-tile feature grid, single-scroll flow,
// gold accent reserved for primary moments only. Restraint over flourish.
//
// Panda is a *command-driven* chat bot, so the page leans into that —
// every product mockup shows a real `!command` exchange instead of an
// abstract illustration. No SaaS clichés (no glowing gradient cards, no
// generic "metric / icon / heading / blurb" repeats, no purple→blue).
// Header/Footer are imported as-is and not modified here.
//
// Sections (top → bottom):
//   1. Hero            — headline + subhead + dual CTA + first mockup
//   2. Trust strip     — "Free. Open source. No premium tier."
//   3. What it does    — three chat exchanges, one per pillar
//   4. Commands        — typographic command list (mono)
//   5. For admins      — auto-mod + anti-raid pitch with a console mockup
//   6. Open source     — short editorial pitch
//   7. Final CTA       — single ask, plain
//
// Copy is intentionally short. Whitespace carries the rhythm.

export default function HomePage(): JSX.Element {
  return (
    <>
      <Header />
      <main className="bg-bg-base">
        <Hero />
        <TrustStrip />
        <ChatStories />
        <CommandList />
        <AdminBlock />
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
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-12 px-6 py-24 md:grid-cols-[1.1fr_0.9fr] md:py-32">
        {/* Left — headline + CTAs */}
        <div className="max-w-xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
            Echoed bot · v1
          </p>
          <h1 className="mt-5 font-display text-[clamp(56px,9vw,112px)] leading-[0.92] tracking-tight text-text-primary">
            One bot.
            <br />
            <span className="text-accent">Every</span> moderation
            <br />
            chore handled.
          </h1>
          <p className="mt-6 max-w-md text-[15px] leading-relaxed text-text-secondary">
            Music, levels, auto-mod, anti-raid, welcomes, reaction roles,
            scheduled posts, social alerts. Free. Open source. No premium tier.
            Built for Echoed.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-4">
            <Link
              href="/auth/invite"
              className="inline-flex h-11 items-center rounded bg-accent px-6 text-sm font-semibold text-accent-fg transition-colors duration-150 hover:bg-accent-hover"
            >
              Add to your server
            </Link>
            <Link
              href="https://github.com/shaongitbd/panda"
              className="inline-flex h-11 items-center gap-2 px-2 text-sm text-text-secondary transition-colors duration-150 hover:text-text-primary"
            >
              <span>github.com/shaongitbd/panda</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="7" y1="17" x2="17" y2="7" />
                <polyline points="7 7 17 7 17 17" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Right — single chat mockup. Real command exchange, not abstract.
            Slightly smaller than the hero text on purpose — content leads,
            mockup supports. */}
        <div className="relative">
          <ChatMock
            channel="general"
            messages={[
              { author: 'Tariq', avatarColor: '#7c3aed', initials: 'T', body: '!play lofi study mix', mono: true },
              {
                author: 'panda',
                avatarColor: 'var(--accent)',
                initials: 'P',
                bot: true,
                rich: (
                  <div className="space-y-1">
                    <div className="font-medium text-text-primary">Now playing · lofi hip hop radio — beats to relax/study to</div>
                    <div className="text-[12px] text-text-muted">Queue · 1 · requested by Tariq</div>
                  </div>
                ),
              },
            ]}
          />
          {/* Tiny offset signature — left vertical rule like a margin
              note, gold to anchor the eye. Not a "feature card" element. */}
          <div className="pointer-events-none absolute -left-3 top-6 hidden h-12 w-[3px] rounded-full bg-accent md:block" />
        </div>
      </div>
    </section>
  );
}

// ─── 2. Trust strip ─────────────────────────────────────────────────
// Three statements, each on its own line. Big but not as big as the hero.
// Single typographic statement, no icons, no cards.

function TrustStrip(): JSX.Element {
  return (
    <section className="border-b border-[var(--border-subtle)]">
      <div className="mx-auto max-w-6xl px-6 py-16 md:py-20">
        <p className="font-display text-[clamp(40px,5.5vw,72px)] leading-[1.05] tracking-tight">
          <span className="text-text-primary">Free.</span>
          <span className="ml-4 text-text-muted">Open source.</span>
          <span className="ml-4 text-text-secondary">No premium tier.</span>
        </p>
        <p className="mt-6 max-w-xl text-[14px] leading-relaxed text-text-muted">
          Other bots gate their best features behind a paywall the moment
          your community grows. Panda doesn't. Every command, every dashboard
          page, every integration — included.
        </p>
      </div>
    </section>
  );
}

// ─── 3. Chat stories — three vignettes ─────────────────────────────
// Each vignette is paired text + chat mockup. Asymmetric: text/mockup
// alternates left/right. NOT cards in a grid.

function ChatStories(): JSX.Element {
  return (
    <section id="features" className="border-b border-[var(--border-subtle)]">
      <div className="mx-auto max-w-6xl space-y-24 px-6 py-24 md:space-y-32 md:py-32">
        {/* Vignette A — moderation */}
        <Vignette
          number="01"
          headline={<>Moderation that <span className="text-accent">explains itself</span>.</>}
          body="Warn, timeout, kick, ban, all chat-first. Every action lands in your audit log with the moderator, the reason, and the original message preserved — even if the offending member deletes it."
          mock={
            <ChatMock
              channel="mod-chat"
              messages={[
                { author: 'Anya', avatarColor: '#ef4444', initials: 'A', body: '!warn @drift posting referral spam', mono: true },
                {
                  author: 'panda',
                  avatarColor: 'var(--accent)',
                  initials: 'P',
                  bot: true,
                  rich: (
                    <div className="space-y-1.5">
                      <div className="text-text-primary"><span className="font-medium">drift</span> warned · 3rd warning</div>
                      <div className="text-[12px] text-text-muted">Reason · posting referral spam · logged by Anya</div>
                      <div className="font-mono text-[11px] text-text-muted">case #482 → <span className="text-accent">audit-log</span></div>
                    </div>
                  ),
                },
              ]}
            />
          }
          flip={false}
        />

        {/* Vignette B — auto-mod */}
        <Vignette
          number="02"
          headline={<>Eight filters. <span className="text-accent">Off by default.</span></>}
          body="Spam, links, caps, mentions, emoji, zalgo, invite links, bad words. Each filter is a separate switch with its own thresholds, channel scope, and exempt roles. Configure what matters; ignore what doesn't."
          mock={
            <ChatMock
              channel="general"
              messages={[
                { author: 'Riley', avatarColor: '#0ea5e9', initials: 'R', body: 'AAAAAAAAAAAAA WHY ISNT IT WORKING', mono: false },
                {
                  author: 'panda',
                  avatarColor: 'var(--accent)',
                  initials: 'P',
                  bot: true,
                  small: true,
                  rich: <span className="text-text-muted">message removed · caps filter (74 % &gt; 60 %) · 5-min timeout</span>,
                },
                { author: 'Riley', avatarColor: '#0ea5e9', initials: 'R', body: 'okay i can take a hint', mono: false },
              ]}
            />
          }
          flip={true}
        />

        {/* Vignette C — welcomes */}
        <Vignette
          number="03"
          headline={<>Make new members feel <span className="text-accent">found</span>.</>}
          body="Auto-greet on join, auto-assign a starter role, point newcomers at #rules. Welcome messages support placeholders so the greet feels personal — not stamped."
          mock={
            <ChatMock
              channel="welcome"
              messages={[
                {
                  system: true,
                  body: 'mei joined the server.',
                },
                {
                  author: 'panda',
                  avatarColor: 'var(--accent)',
                  initials: 'P',
                  bot: true,
                  rich: (
                    <div className="space-y-1">
                      <div className="text-text-primary">Welcome <span className="text-accent">@mei</span> to <span className="font-medium">Lavender Cafe</span> ☕</div>
                      <div className="text-[12px] text-text-muted">You're member #1,247. Head over to #rules to get verified.</div>
                    </div>
                  ),
                },
              ]}
            />
          }
          flip={false}
        />
      </div>
    </section>
  );
}

interface VignetteProps {
  number: string;
  headline: React.ReactNode;
  body: string;
  mock: React.ReactNode;
  flip: boolean;
}

function Vignette({ number, headline, body, mock, flip }: VignetteProps): JSX.Element {
  return (
    <article className="grid grid-cols-1 items-center gap-10 md:grid-cols-2 md:gap-16">
      <div className={flip ? 'md:order-2' : ''}>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
          {number} · pillar
        </p>
        <h2 className="mt-3 font-display text-[clamp(34px,4.4vw,56px)] leading-[1] tracking-tight text-text-primary">
          {headline}
        </h2>
        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-text-secondary">
          {body}
        </p>
      </div>
      <div className={flip ? 'md:order-1' : ''}>
        {mock}
      </div>
    </article>
  );
}

// ─── 4. Command list — typographic, not cards ───────────────────────

function CommandList(): JSX.Element {
  const groups: { label: string; items: { cmd: string; desc: string }[] }[] = [
    {
      label: 'Music',
      items: [
        { cmd: '!play <query>',  desc: 'YouTube or SoundCloud, instant.' },
        { cmd: '!skip',          desc: 'DJ-role or admin only.' },
        { cmd: '!queue',         desc: 'See what\'s next, who asked.' },
        { cmd: '!volume <0–100>',desc: 'Per-server volume memory.' },
      ],
    },
    {
      label: 'Moderation',
      items: [
        { cmd: '!warn @user <reason>',     desc: 'Logged, audit-trail, escalation-aware.' },
        { cmd: '!timeout @user <duration>',desc: '1m, 1h, 7d — natural durations.' },
        { cmd: '!kick @user <reason>',     desc: 'Kicks + DMs the reason.' },
        { cmd: '!ban @user <reason>',      desc: 'Permanent. Always logged.' },
      ],
    },
    {
      label: 'Engagement',
      items: [
        { cmd: '!rank',            desc: 'XP, level, time-to-next.' },
        { cmd: '!leaderboard',     desc: 'Top members in your server.' },
        { cmd: '!gstart <prize>',  desc: 'Giveaway with role-scoped entry.' },
        { cmd: '!afk <message>',   desc: 'Auto-reply when mentioned.' },
      ],
    },
  ];

  return (
    <section id="commands" className="border-b border-[var(--border-subtle)]">
      <div className="mx-auto max-w-6xl px-6 py-24 md:py-28">
        <div className="grid grid-cols-1 gap-12 md:grid-cols-[1fr_2.4fr] md:gap-20">
          <div className="md:sticky md:top-28 md:self-start">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
              Commands
            </p>
            <h2 className="mt-3 font-display text-[clamp(36px,4.6vw,60px)] leading-[1] tracking-tight text-text-primary">
              Chat-first.<br />Mouse-optional.
            </h2>
            <p className="mt-5 max-w-sm text-[14px] leading-relaxed text-text-secondary">
              Everything Panda does is reachable from a message. The dashboard
              is just for the things you really don't want to type.
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
              ...and roughly forty more — see <Link href="/dashboard" className="text-accent hover:underline">your dashboard</Link> for the full list per category.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 5. For admins — anti-raid + console mockup ─────────────────────

function AdminBlock(): JSX.Element {
  return (
    <section className="border-b border-[var(--border-subtle)]">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-6 py-24 md:grid-cols-2 md:py-28">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
            For admins
          </p>
          <h2 className="mt-3 font-display text-[clamp(36px,4.6vw,60px)] leading-[1] tracking-tight text-text-primary">
            When the raid<br />starts at <span className="text-accent">3 AM</span>.
          </h2>
          <p className="mt-5 max-w-md text-[15px] leading-relaxed text-text-secondary">
            Anti-raid watches join velocity and verification posture. Crosses
            the threshold, lockdown engages: invites pause, verification level
            climbs, every join hits a holding queue until you wake up.
          </p>
        </div>

        <ConsoleMock />
      </div>
    </section>
  );
}

function ConsoleMock(): JSX.Element {
  // Console-style mockup distinct from the chat mockups above — different
  // visual shape so the page doesn't feel like the same component four
  // times. Mono throughout, status pill on the top right.
  return (
    <div className="rounded border border-[var(--border-subtle)] bg-bg-card font-mono text-[12px] leading-relaxed shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-2.5">
        <div className="flex items-center gap-2 text-text-muted">
          <span className="h-2 w-2 rounded-full bg-status-danger" />
          <span className="uppercase tracking-[0.18em]">anti-raid</span>
        </div>
        <span className="rounded-full bg-status-danger/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-status-danger">
          Lockdown
        </span>
      </div>
      <div className="px-4 py-4 text-text-secondary">
        <p>
          <span className="text-text-muted">[03:24:11]</span> 14 joins / 60s — threshold 12
        </p>
        <p>
          <span className="text-text-muted">[03:24:11]</span> verification → <span className="text-status-warning">Medium</span>
        </p>
        <p>
          <span className="text-text-muted">[03:24:11]</span> invites paused
        </p>
        <p className="mt-2 text-text-muted">— holding —</p>
        <p>
          <span className="text-text-muted">[03:24:14]</span> <span className="text-text-primary">@noctis_</span> queued · 6h account
        </p>
        <p>
          <span className="text-text-muted">[03:24:15]</span> <span className="text-text-primary">@halo7</span> queued · 11h account
        </p>
        <p>
          <span className="text-text-muted">[03:24:18]</span> <span className="text-text-primary">@plumeria</span> queued · 4h account
        </p>
        <p className="mt-3 text-text-muted">
          <span className="text-accent">→</span> 11 more in queue. Review when you're ready.
        </p>
      </div>
    </div>
  );
}

// ─── 6. Open source pitch ──────────────────────────────────────────

function OpenSource(): JSX.Element {
  return (
    <section className="border-b border-[var(--border-subtle)]">
      <div className="mx-auto max-w-6xl px-6 py-20 md:py-24">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[2fr_1fr] md:gap-16">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-muted">
              Open source
            </p>
            <h2 className="mt-3 font-display text-[clamp(34px,4.2vw,52px)] leading-[1.05] tracking-tight text-text-primary">
              The whole bot fits<br />in <span className="text-accent">one repo</span>.
            </h2>
            <p className="mt-5 max-w-xl text-[15px] leading-relaxed text-text-secondary">
              Read the source, file an issue, ship a PR. No telemetry, no
              tracking, no "premium tier" you'll be nudged toward. If we ever
              cross those lines, fork us — that's the point of MIT.
            </p>
          </div>
          <div className="self-end">
            <div className="rounded border border-[var(--border-subtle)] bg-bg-card px-5 py-4 font-mono text-[12px] text-text-secondary">
              <div className="flex items-center justify-between">
                <span className="text-text-muted">license</span>
                <span className="text-text-primary">MIT</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-text-muted">stack</span>
                <span className="text-text-primary">Node · TS · Postgres</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="text-text-muted">premium</span>
                <span className="text-status-online">none — free</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 7. Final CTA ───────────────────────────────────────────────────

function FinalCTA(): JSX.Element {
  return (
    <section>
      <div className="mx-auto max-w-6xl px-6 py-28 md:py-36">
        <div className="max-w-2xl">
          <h2 className="font-display text-[clamp(44px,6vw,84px)] leading-[0.95] tracking-tight text-text-primary">
            Add Panda to your<br />server in <span className="text-accent">two clicks</span>.
          </h2>
          <p className="mt-6 max-w-lg text-[15px] leading-relaxed text-text-secondary">
            Authorize once, configure from chat or the dashboard. Leave whenever
            you want — your settings stay, your data leaves with you.
          </p>
          <div className="mt-10 flex flex-wrap items-center gap-5">
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
      </div>
    </section>
  );
}

// ─── Reusable mockup primitives ─────────────────────────────────────

interface ChatMessage {
  author?: string;
  initials?: string;
  avatarColor?: string;
  bot?: boolean;
  body?: string;
  rich?: React.ReactNode;
  mono?: boolean;
  small?: boolean;
  system?: boolean;
}

interface ChatMockProps {
  channel: string;
  messages: ChatMessage[];
}

// Restrained chat-window mockup. NOT a glassy card with neon borders —
// flat warm-dark surface with a single hairline. Channel header up top,
// messages stacked below. This is the only "feature card" pattern on
// the page; reused so the visual repetition becomes the rhythm.
function ChatMock({ channel, messages }: ChatMockProps): JSX.Element {
  return (
    <div className="overflow-hidden rounded border border-[var(--border-subtle)] bg-bg-card shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-2.5">
        <div className="flex items-center gap-2 text-text-muted">
          <span className="text-[15px]">#</span>
          <span className="text-[13px]">{channel}</span>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-status-online" />
          live
        </div>
      </div>
      <div className="space-y-4 px-4 py-5">
        {messages.map((m, i) => (
          <ChatRow key={i} message={m} />
        ))}
      </div>
    </div>
  );
}

function ChatRow({ message }: { message: ChatMessage }): JSX.Element {
  if (message.system) {
    return (
      <div className="text-[12px] italic text-text-muted">
        {message.body}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3">
      <div
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-bg-base"
        style={{ background: message.avatarColor }}
      >
        {message.initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold text-text-primary">
            {message.author}
          </span>
          {message.bot && (
            <span className="rounded-sm bg-accent/15 px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wider text-accent">
              bot
            </span>
          )}
          <span className="text-[11px] text-text-muted">just now</span>
        </div>
        <div
          className={[
            'mt-0.5',
            message.small ? 'text-[12px]' : 'text-[13.5px]',
            message.mono ? 'font-mono text-accent' : 'leading-relaxed text-text-secondary',
          ].join(' ')}
        >
          {message.body ?? message.rich}
        </div>
      </div>
    </div>
  );
}
