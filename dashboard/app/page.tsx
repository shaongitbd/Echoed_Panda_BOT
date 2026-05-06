import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

// ─── Landing page ───────────────────────────────────────────────────
//
// Sister to tempvoice.xyz — same author, shared brand palette
// (crimson #d53254 accent, near-black surface stack, Bebas/Inter/JBM
// stack), same family of typographic restraint. Different product —
// Panda is a multipurpose moderation/music/levels bot, so the
// structure and copy are written for what Panda actually does.
//
// Type system on this page:
//   - All displays (hero h1, section h2, final-CTA h2) → Inter
//     font-black 900, tightly tracked. Reads as visibly heavier than
//     Bebas Neue's single 400 weight at every size.
//   - Kicker labels → Inter font-black 900, uppercase, tracked.
//   - Body          → Inter 400 / 500 / 700.
//   - Code, IDs, log lines → JetBrains Mono.
// Bebas Neue stays available via .font-display utility for one-off
// uses elsewhere, but the landing page commits to a single-family
// Inter system so weight contrast — not face contrast — does the
// hierarchy work.
//
// Each section uses a *different* product-mockup idiom:
//   1. Hero        — chat frame + Discord-style music embed
//   2. Music       — full player widget (track + progress + queue)
//   3. Moderation  — auto-mod toggle panel paired with case-file
//   4. Levels      — server leaderboard with XP bars + role rewards
//   5. Anti-raid   — console log mockup
//   6. Every feature — typeset inventory of all 14 features (links to /docs)
//   7. Open by design — paired icon-statements (open source / free)
//   8. Final CTA   — direct ask
//
// No gradients anywhere. Crimson is reserved for the headline emphasis
// word per section, mono command syntax, and the two primary CTAs.

export default function HomePage(): JSX.Element {
  return (
    <>
      <Header />
      <main className="bg-bg-base">
        <Hero />
        <MusicSection />
        <ModerationSection />
        <LevelsSection />
        <AntiRaidSection />
        <EveryFeatureSection />
        <OpenByDesignSection />
        <FinalCTA />
      </main>
      <Footer />
    </>
  );
}

// ─── 1. Hero ────────────────────────────────────────────────────────

function Hero(): JSX.Element {
  // Hero composition rationale:
  //
  // 1. Headline shrunk from 108px max → 72px. Still substantial,
  //    no longer dominates. Wider page rhythm.
  // 2. Lede tightened to a single short sentence — feature breadth
  //    moves out of the lede into a dedicated "Includes" strip
  //    underneath, where it belongs (lede sets the *positioning*,
  //    Includes proves *substance*).
  // 3. CTAs sit closer to the headline so the eye stays in the
  //    primary action zone instead of drifting through a long
  //    paragraph first.
  // 4. The chat frame on the right now tells *two* stories
  //    (music + levels) — proves "every chore" with two concrete
  //    examples, not just one. The two embeds use the same
  //    accent-bordered card primitive so they read as a matched
  //    pair, the way the Open-by-design icons do.
  // 5. Asymmetric column ratio (1.15fr / 0.85fr): the type column
  //    gets the wider slice, the chat column reads as supporting
  //    evidence rather than competing for the eye.
  return (
    <section className="border-b border-[var(--border-subtle)]">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-14 px-6 py-20 md:grid-cols-[1.15fr_0.85fr] md:py-28">
        <div className="max-w-xl md:pt-6">
          <h1 className="font-sans text-[clamp(40px,5.8vw,72px)] font-black leading-[0.96] tracking-[-0.03em] text-text-primary">
            One bot.<br />
            <span className="text-accent">Every</span> chore.
          </h1>
          <p className="mt-6 max-w-md text-[16px] font-medium leading-relaxed text-text-secondary">
            Built for Echoed. <span className="font-bold text-text-primary">Free.</span>{' '}
            <span className="font-bold text-text-primary">Open source.</span> No premium tier — ever.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-5">
            <Link
              href="/login"
              className="inline-flex h-11 items-center rounded bg-accent px-6 text-sm font-extrabold text-accent-fg transition-colors duration-150 hover:bg-accent-hover"
            >
              Login with Echoed
            </Link>
            <Link
              href="/docs#inviting"
              className="text-sm font-bold text-text-secondary underline-offset-4 transition-colors duration-150 hover:text-text-primary hover:underline"
            >
              How to install →
            </Link>
          </div>

          {/* Two-line install primer. The CTA above lands you on
              login — but Panda lives in your server's Bots tab,
              not in a one-click invite, so we tell you up front
              what you're walking into. */}
          <p className="mt-5 max-w-md text-[13px] font-medium leading-snug text-text-muted">
            Open your server in Echoed → <strong className="font-bold text-text-secondary">Server Settings</strong> → <strong className="font-bold text-text-secondary">Bots</strong>, invite Panda from there, then log in here to configure it.
          </p>

          {/* Includes strip — feature inventory. Sits behind the CTAs
              as supporting proof; the bullet · style and tighter type
              keep it visually quieter than the primary stack. */}
          <div className="mt-10 max-w-md border-t border-[var(--border-subtle)] pt-5">
            <span className="mr-3 font-black uppercase tracking-[0.16em] text-text-primary text-[11px]">
              Includes
            </span>
            <span className="text-[12.5px] font-medium leading-relaxed text-text-muted">
              Music · Levels · Auto-mod · Anti-raid · Welcomes · Reaction roles · Scheduled posts · Social alerts
            </span>
          </div>
        </div>

        <ChatFrame channel="general">
          <ChatLine author="Tariq" color="#7c3aed" initials="T" mono body="!play lofi study mix" />
          <ChatLine author="panda" color="var(--accent)" initials="P" bot>
            <MusicEmbed
              source="YouTube"
              title="lofi hip hop radio"
              subtitle="beats to relax / study to"
              progress={0.36}
              elapsed="1:24"
              total="3:42"
              queueNote="queue · 1 · requested by Tariq"
            />
          </ChatLine>
          <ChatLine author="drift" color="#ef4444" initials="D" body="AAAAAAAAAAA WHY ISN'T THIS WORKING" />
          <ChatLine author="panda" color="var(--accent)" initials="P" bot>
            <ModerationEmbed
              action="warned"
              user="drift"
              filter="caps filter"
              detail="74% over threshold · 3rd warning in 30d · escalation queued"
            />
          </ChatLine>
        </ChatFrame>
      </div>
    </section>
  );
}

// ─── ModerationEmbed ────────────────────────────────────────────────
// Twin to MusicEmbed — same compact accent-bordered card primitive,
// but warning-amber instead of crimson so the two embeds in the hero
// chat read as two different "moods" of the bot: crimson = community
// feature firing for the user who asked, amber = auto-mod quietly
// catching a violation. Together: panda plays your music *and*
// handles your trolls. That's the whole pitch.

interface ModerationEmbedProps {
  action: string;
  user: string;
  filter: string;
  detail: string;
}

function ModerationEmbed({ action, user, filter, detail }: ModerationEmbedProps): JSX.Element {
  return (
    <div className="mt-1 rounded border-l-2 border-status-warning bg-bg-elevated px-4 py-3.5">
      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-status-warning">
        Auto-mod
      </div>
      <p className="mt-1 text-[14px] leading-snug text-text-secondary">
        <span className="font-extrabold text-status-warning">{action}</span>{' '}
        <span className="font-extrabold text-text-primary">@{user}</span>
        <span className="text-text-muted"> · {filter}</span>
      </p>
      <p className="mt-1.5 text-[12px] font-medium text-text-muted">{detail}</p>
    </div>
  );
}

// ─── 2. Music ───────────────────────────────────────────────────────

function MusicSection(): JSX.Element {
  return (
    <section className="border-b border-[var(--border-subtle)]">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-6 py-24 md:grid-cols-2 md:py-28">
        <div>
          <SectionHead>
            A real <span className="text-accent">music player</span>.<br />
            Not just a YouTube link.
          </SectionHead>
          <SectionLead>
            YouTube and SoundCloud, instant queue, persistent volume per
            server. DJ role gates skip and pause to whoever you trust
            with the aux cord — admin not required.
          </SectionLead>
          <CommandRow items={[
            { cmd: '!play <query>', desc: 'YouTube or SoundCloud' },
            { cmd: '!skip',         desc: 'DJ-role only' },
            { cmd: '!queue',        desc: 'See what\'s next' },
            { cmd: '!volume <n>',   desc: 'Per-server memory' },
          ]} />
        </div>

        <PlayerWidget />
      </div>
    </section>
  );
}

// ─── 3. Moderation ──────────────────────────────────────────────────

function ModerationSection(): JSX.Element {
  return (
    <section className="border-b border-[var(--border-subtle)]">
      <div className="mx-auto max-w-6xl px-6 py-24 md:py-28">
        <div className="grid grid-cols-1 items-center gap-14 md:grid-cols-2 md:gap-20">
          <div className="md:order-2">
            <SectionHead>
              Auto-mod that <span className="text-accent">explains itself</span>.
            </SectionHead>
            <SectionLead>
              Eight filters, each with their own thresholds, channel
              scope, and exempt roles. When one fires, the audit log
              shows you exactly which filter caught it, what triggered
              it, and what the bot did next.
            </SectionLead>
            <CommandRow items={[
              { cmd: '!warn @user <reason>',      desc: 'Logged + escalation-aware' },
              { cmd: '!timeout @user <duration>', desc: '1m, 1h, 7d' },
              { cmd: '!kick @user',               desc: 'DMs the reason' },
              { cmd: '!ban @user',                desc: 'Permanent, logged' },
            ]} />
          </div>

          <div className="space-y-5 md:order-1">
            <FilterPanel />
            <CaseFile />
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── 4. Levels ──────────────────────────────────────────────────────

function LevelsSection(): JSX.Element {
  return (
    <section className="border-b border-[var(--border-subtle)]">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-6 py-24 md:grid-cols-2 md:py-28">
        <div>
          <SectionHead>
            Reward the people who <span className="text-accent">show up</span>.
          </SectionHead>
          <SectionLead>
            XP per message, anti-spam decay, role rewards on level
            milestones. Cooldowns prevent farm-spam; bots and channels
            you exclude don't count toward XP.
          </SectionLead>
          <CommandRow items={[
            { cmd: '!rank',          desc: 'XP, level, time-to-next' },
            { cmd: '!leaderboard',   desc: 'Server top members' },
            { cmd: '!setxp @user <n>', desc: 'Admin override' },
          ]} />
        </div>

        <Leaderboard />
      </div>
    </section>
  );
}

// ─── 5. Anti-raid ───────────────────────────────────────────────────

function AntiRaidSection(): JSX.Element {
  return (
    <section className="border-b border-[var(--border-subtle)]">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-6 py-24 md:grid-cols-2 md:py-28">
        <div>
          <SectionHead>
            Anti-raid runs <span className="text-accent">while you sleep</span>.
          </SectionHead>
          <SectionLead>
            Watches join velocity and account age. Crosses your
            threshold and lockdown engages — invites pause, verification
            climbs, every join goes to a holding queue you review when
            you're back at the keyboard.
          </SectionLead>
        </div>

        <ConsoleLog />
      </div>
    </section>
  );
}

// ─── 6. Every feature — comprehensive inventory ─────────────────────
//
// The four deep-dive sections above (music, moderation, levels,
// anti-raid) showcase the bread-and-butter. This section tells the
// rest of the story: every other feature panda offers, listed once,
// short enough to skim, with sample commands and a docs link per
// row. The intent is breadth-proof — readers shouldn't have to
// guess whether panda does X. They should be able to scan and see.
//
// Layout: a 2-column typeset list, divider-separated. Each row has
// kicker (category), feature name in font-black, one-line summary,
// inline command samples, and a "→ docs" anchor. No card chrome —
// the typography does the work, the way a well-designed reference
// page does.

interface FeatureItem {
  group: 'Community' | 'Automation' | 'Server health' | 'Outside reach';
  name: string;
  summary: string;
  commands?: string[];
  setup?: string;
  docsId: string;
}

const FEATURES: FeatureItem[] = [
  {
    group: 'Community',
    name: 'Music',
    summary: 'YouTube and SoundCloud playback with persistent queue, per-server volume, and DJ-role gating on skip and pause.',
    commands: ['!play', '!skip', '!queue', '!volume', '!loop', '!shuffle'],
    docsId: 'music',
  },
  {
    group: 'Community',
    name: 'Levels & XP',
    summary: 'Members earn XP for messages, with anti-spam decay. Award roles automatically at level milestones.',
    commands: ['!rank', '!leaderboard', '!setxp'],
    docsId: 'levels',
  },
  {
    group: 'Community',
    name: 'Welcome messages',
    summary: 'Greet new members in any channel, optionally hand out a starter role, support {user} / {server} / {count} placeholders.',
    commands: ['!welcometest'],
    docsId: 'welcome',
  },
  {
    group: 'Community',
    name: 'Reaction roles',
    summary: 'Members self-assign roles by reacting to a message. Toggle, verify, or pick-one modes.',
    setup: 'dashboard only',
    docsId: 'reaction-roles',
  },
  {
    group: 'Community',
    name: 'Giveaways',
    summary: 'Reaction-based entry, configurable duration and winner count, role and account-age requirements, one-click reroll.',
    commands: ['!giveaway start', '!giveaway end', '!reroll'],
    docsId: 'giveaways',
  },

  {
    group: 'Automation',
    name: 'Auto-mod filters',
    summary: 'Eight filters — spam, caps, links, invites, mass-mention, emoji-spam, zalgo, bad-words — each with own thresholds.',
    setup: 'dashboard only',
    docsId: 'auto-mod',
  },
  {
    group: 'Automation',
    name: 'Auto-react',
    summary: 'Bot adds reactions automatically to messages matching keyword patterns. Useful for #suggestions and announcements.',
    setup: 'dashboard only',
    docsId: 'auto-react',
  },
  {
    group: 'Automation',
    name: 'Custom commands',
    summary: 'Define your own !commands with fixed responses, role/channel restrictions, and per-member cooldowns.',
    setup: 'dashboard only',
    docsId: 'custom-commands',
  },
  {
    group: 'Automation',
    name: 'Scheduled messages',
    summary: 'Post on a schedule — once, daily, weekly, or cron. Timezone-aware so 9am means 9am.',
    setup: 'dashboard only',
    docsId: 'schedules',
  },
  {
    group: 'Automation',
    name: 'Keyword alerts',
    summary: 'DM-notify when a word or phrase shows up anywhere in the server. Per-member, per-channel scoping.',
    setup: 'dashboard only',
    docsId: 'keywords',
  },

  {
    group: 'Server health',
    name: 'Moderation',
    summary: 'Manual mod actions with case numbers, escalation-aware repeats, full audit logging, and DM-on-action.',
    commands: ['!warn', '!timeout', '!kick', '!ban', '!case', '!history'],
    docsId: 'moderation',
  },
  {
    group: 'Server health',
    name: 'Anti-raid',
    summary: 'Watches join velocity and account age. Lockdown engages automatically; suspicious joins go to a review queue.',
    commands: ['!lockdown', '!unlock', '!raidqueue'],
    docsId: 'anti-raid',
  },
  {
    group: 'Server health',
    name: 'Stat counters',
    summary: 'Live-updating voice channel names showing member count, online count, role membership, or custom values.',
    setup: 'dashboard only',
    docsId: 'stat-counters',
  },

  {
    group: 'Outside reach',
    name: 'Social alerts',
    summary: 'Watch Twitch, YouTube, and Reddit. Post in-server when streamers go live, channels upload, or subreddits hit fresh posts.',
    setup: 'dashboard only',
    docsId: 'social-alerts',
  },
];

function EveryFeatureSection(): JSX.Element {
  return (
    <section id="features" className="border-b border-[var(--border-subtle)]">
      <div className="mx-auto max-w-6xl px-6 py-24 md:py-28">
        <div className="grid grid-cols-1 gap-x-16 gap-y-10 md:grid-cols-[0.85fr_1.15fr]">
          {/* Left column — section heading + lead-in. Sticks to top
              on tall viewports so the right-side list feels anchored
              to a context. */}
          <div className="md:sticky md:top-24 md:self-start">
            <SectionHead>
              Every feature, <span className="text-accent">in full</span>.
            </SectionHead>
            <SectionLead>
              Fourteen tools. One bot. Zero locked behind a paywall.
              Pick a feature to jump into the docs — written for
              owners, not bot veterans.
            </SectionLead>
            <Link
              href="/docs"
              className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-text-primary underline-offset-4 transition-colors duration-150 hover:text-accent hover:underline"
            >
              Open the full docs →
            </Link>
          </div>

          {/* Right column — the list. Grouped by category, each
              category preceded by a small kicker so readers can
              skim by intent. */}
          <FeatureList />
        </div>
      </div>
    </section>
  );
}

function FeatureList(): JSX.Element {
  // Group features by category preserving the array order — gives
  // a stable, intentional read order (community → automation →
  // health → reach) without a runtime sort.
  const groups: { name: FeatureItem['group']; items: FeatureItem[] }[] = [];
  for (const f of FEATURES) {
    let g = groups.find((x) => x.name === f.group);
    if (!g) {
      g = { name: f.group, items: [] };
      groups.push(g);
    }
    g.items.push(f);
  }

  return (
    <div className="space-y-12">
      {groups.map((g) => (
        <div key={g.name}>
          <p className="font-mono text-[10.5px] font-black uppercase tracking-[0.2em] text-text-muted">
            {g.name}
          </p>
          <ul className="mt-3 divide-y divide-[var(--border-subtle)] border-t border-[var(--border-subtle)]">
            {g.items.map((item) => (
              <li key={item.name} className="grid grid-cols-1 gap-x-8 gap-y-2 py-5 md:grid-cols-[200px_1fr]">
                <div>
                  <h3 className="font-sans text-[16.5px] font-black tracking-tight text-text-primary">
                    {item.name}
                  </h3>
                  <Link
                    href={`/docs#${item.docsId}`}
                    className="mt-1 inline-block text-[11.5px] font-bold text-text-muted underline-offset-2 transition-colors duration-150 hover:text-accent hover:underline"
                  >
                    Read docs →
                  </Link>
                </div>
                <div>
                  <p className="text-[14px] font-medium leading-[1.55] text-text-secondary">
                    {item.summary}
                  </p>
                  {item.commands && (
                    <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[12px] font-bold text-accent">
                      {item.commands.map((c) => (
                        <span key={c}>{c}</span>
                      ))}
                    </p>
                  )}
                  {item.setup && !item.commands && (
                    <p className="mt-2 font-mono text-[11.5px] font-bold uppercase tracking-[0.14em] text-text-muted">
                      {item.setup}
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

// ─── 7. Open by design — paired icon statements ─────────────────────

function OpenByDesignSection(): JSX.Element {
  return (
    <section className="border-b border-[var(--border-subtle)]">
      <div className="mx-auto max-w-6xl px-6 py-24 md:py-28">
        <SectionHead>
          Open by <span className="text-accent">design</span>.
        </SectionHead>
        <SectionLead>
          The whole bot fits in one repo. No telemetry, no tracking, no
          premium tier you'll be nudged toward later.
        </SectionLead>

        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
          <IconStatement icon={<GithubIcon />} title="Open source">
            MIT licensed. Read the source, file an issue, ship a PR.
            If we ever cross the lines we promised — fork us. That's
            the point.
          </IconStatement>
          <IconStatement icon={<TagIcon />} title="Free of charge">
            Every command, every dashboard page, every integration —
            included. No paywall the moment your community grows.
          </IconStatement>
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
        <h2 className="max-w-3xl font-sans text-[clamp(44px,6.4vw,88px)] font-black leading-[0.96] tracking-[-0.03em] text-text-primary">
          Install Panda in three steps.
        </h2>

        {/* Numbered install primer — three steps, plain English.
            This is the actual install flow: invite from inside
            Echoed first, then come back here to configure. No
            one-click invite URL exists yet. */}
        <ol className="mt-10 max-w-3xl space-y-5">
          <InstallStep n="1" title="Open your server's Bots tab">
            In Echoed, open the server you want Panda in. Click{' '}
            <strong className="font-bold text-text-primary">Server Settings</strong>{' '}
            → <strong className="font-bold text-text-primary">Bots</strong>.
            You'll need <strong className="font-bold text-text-primary">Manage Server</strong>{' '}
            permission to see this tab.
          </InstallStep>
          <InstallStep n="2" title="Invite Panda from the bot list">
            Find <strong className="font-bold text-text-primary">Panda</strong> in
            the available bots, click <strong className="font-bold text-text-primary">Add</strong>,
            and confirm the permissions. Panda joins your server immediately.
          </InstallStep>
          <InstallStep n="3" title="Come back here and log in">
            Click <strong className="font-bold text-text-primary">Login with Echoed</strong>{' '}
            below. Pick your server from the sidebar to start configuring.
            Default settings are sensible — you can ship as-is or tune anything.
          </InstallStep>
        </ol>

        <div className="mt-12 flex flex-wrap items-center gap-6">
          <Link
            href="/login"
            className="inline-flex h-12 items-center rounded bg-accent px-7 text-[15px] font-extrabold text-accent-fg transition-colors duration-150 hover:bg-accent-hover"
          >
            Login with Echoed
          </Link>
          <Link
            href="/docs"
            className="text-[14px] font-bold text-text-secondary underline-offset-4 transition-colors duration-150 hover:text-text-primary hover:underline"
          >
            Read the docs first →
          </Link>
        </div>
      </div>
    </section>
  );
}

function InstallStep({ n, title, children }: { n: string; title: string; children: React.ReactNode }): JSX.Element {
  return (
    <li className="grid grid-cols-[44px_1fr] gap-5">
      <div className="font-mono text-[28px] font-black leading-none text-accent">{n}</div>
      <div>
        <h3 className="font-sans text-[18px] font-black tracking-tight text-text-primary">
          {title}
        </h3>
        <p className="mt-1.5 text-[14.5px] font-medium leading-[1.6] text-text-secondary">
          {children}
        </p>
      </div>
    </li>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Typographic primitives
// ═══════════════════════════════════════════════════════════════════

// SectionHead — the consistent h2 treatment used by every section
// other than the hero + final-CTA. Inter font-black 900 lands
// substantially heavier than Bebas Neue's single 400 weight, which
// is exactly what the design needs at this size.
function SectionHead({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <h2 className="font-sans text-[clamp(36px,4.7vw,60px)] font-black leading-[1.02] tracking-[-0.02em] text-text-primary">
      {children}
    </h2>
  );
}

function SectionLead({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <p className="mt-5 max-w-md text-[15.5px] font-medium leading-relaxed text-text-secondary">
      {children}
    </p>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Mockup primitives
// ═══════════════════════════════════════════════════════════════════

function ChatFrame({ channel, children }: { channel: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="overflow-hidden rounded border border-[var(--border-subtle)] bg-bg-card shadow-2xl shadow-black/40">
      <div className="border-b border-[var(--border-subtle)] px-4 py-2.5 text-[13px] font-semibold text-text-muted">
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
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-black text-white"
        style={{ background: color }}
      >
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[13.5px] font-extrabold text-text-primary">{author}</span>
          {bot && (
            <span className="rounded-sm bg-accent/15 px-1.5 py-[1px] text-[9px] font-black uppercase tracking-wider text-accent">
              bot
            </span>
          )}
          <span className="text-[11px] text-text-muted">just now</span>
        </div>
        <div className={['mt-0.5', mono ? 'font-mono text-[13px] font-bold text-accent' : 'text-[13.5px] leading-relaxed text-text-secondary'].join(' ')}>
          {body ?? children}
        </div>
      </div>
    </div>
  );
}

// ─── MusicEmbed ─────────────────────────────────────────────────────

interface MusicEmbedProps {
  source: string;
  title: string;
  subtitle: string;
  progress: number;
  elapsed: string;
  total: string;
  queueNote: string;
}

function MusicEmbed({ source, title, subtitle, progress, elapsed, total, queueNote }: MusicEmbedProps): JSX.Element {
  return (
    <div className="mt-1 flex gap-3 rounded border-l-2 border-accent bg-bg-elevated px-4 py-3.5">
      {/* Thumbnail tile — the album-art slot in real music bots.
          Solid neutral square with an inset play triangle. Reads as
          "this is a track card," no fake imagery needed. */}
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded border border-[var(--border-subtle)] bg-bg-base">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" className="text-text-secondary translate-x-[1px]" aria-hidden>
          <polygon points="6 4 20 12 6 20" />
        </svg>
      </div>

      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-accent">{source}</div>
        <div className="mt-0.5 text-[15px] font-extrabold text-text-primary truncate">{title}</div>
        <div className="text-[12.5px] font-medium text-text-secondary truncate">{subtitle}</div>
        <div className="mt-2.5 h-[3px] overflow-hidden rounded bg-bg-base">
          <div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between font-mono text-[10.5px] font-bold text-text-muted">
          <span>{elapsed}</span>
          <span className="font-medium">{queueNote}</span>
          <span>{total}</span>
        </div>
      </div>
    </div>
  );
}

// ─── PlayerWidget ───────────────────────────────────────────────────

function PlayerWidget(): JSX.Element {
  const queue = [
    { user: 'Tariq', title: 'feature track 1',     duration: '4:21' },
    { user: 'Mei',   title: 'sleep playlist mix',  duration: '3:58' },
    { user: 'Riley', title: 'monster blue (live)', duration: '10:32' },
  ];
  return (
    <div className="overflow-hidden rounded border border-[var(--border-subtle)] bg-bg-card shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3">
        <span className="text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">panda · player</span>
        <span className="flex items-center gap-1.5 text-[11px] font-bold text-text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-status-online" /> live
        </span>
      </div>

      <div className="px-5 pt-5">
        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-accent">YouTube</div>
        <div className="mt-1 text-[19px] font-extrabold text-text-primary truncate">lofi hip hop radio</div>
        <div className="text-[13px] font-medium text-text-secondary truncate">beats to relax / study to</div>
        <div className="mt-4 h-[3px] overflow-hidden rounded bg-bg-base">
          <div className="h-full bg-accent" style={{ width: '36%' }} />
        </div>
        <div className="mt-1.5 flex items-center justify-between font-mono text-[11px] font-bold text-text-muted">
          <span>1:24</span>
          <span>3:42</span>
        </div>
      </div>

      <div className="mt-4 border-t border-[var(--border-subtle)] px-5 py-4">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Up next</p>
        <ul className="mt-3 space-y-2.5">
          {queue.map((q, i) => (
            <li key={i} className="grid grid-cols-[18px_1fr_auto] items-baseline gap-3 text-[13px]">
              <span className="font-mono text-[11px] font-bold text-text-muted">{i + 1}</span>
              <span className="min-w-0 truncate">
                <span className="font-bold text-text-primary">{q.title}</span>
                <span className="text-text-muted"> · {q.user}</span>
              </span>
              <span className="font-mono text-[11px] font-bold text-text-muted">{q.duration}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="border-t border-[var(--border-subtle)] bg-bg-base/40 px-5 py-3 font-mono text-[11px] text-text-muted">
        <span className="font-extrabold text-accent">!skip</span>{'  '}
        <span className="font-extrabold text-accent">!queue</span>{'  '}
        <span className="font-extrabold text-accent">!volume</span>{'  '}
        <span className="font-extrabold text-accent">!loop</span>
      </div>
    </div>
  );
}

// ─── FilterPanel ────────────────────────────────────────────────────

function FilterPanel(): JSX.Element {
  const filters = [
    { name: 'spam',          rule: '5 msgs / 3s',     action: 'timeout', on: true },
    { name: 'caps',          rule: '> 60 % over 6 c', action: 'warn',    on: true },
    { name: 'invites',       rule: 'all DMs',         action: 'delete',  on: true },
    { name: 'mass-mention',  rule: '5 in one msg',    action: '—',       on: false },
    { name: 'zalgo',         rule: 'ratio > 1.5',     action: 'delete',  on: true },
    { name: 'emoji',         rule: '20 in a row',     action: '—',       on: false },
    { name: 'bad-words',     rule: 'custom list',     action: 'warn',    on: true },
    { name: 'links',         rule: 'allow-list',      action: '—',       on: false },
  ];
  return (
    <div className="overflow-hidden rounded border border-[var(--border-subtle)] bg-bg-card shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3">
        <span className="text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">auto-mod</span>
        <span className="text-[11px] font-bold text-text-secondary">5 of 8 active</span>
      </div>
      <ul className="divide-y divide-[var(--border-subtle)]">
        {filters.map((f) => (
          <li key={f.name} className="grid grid-cols-[28px_1fr_auto] items-center gap-3 px-5 py-3 text-[12.5px]">
            <span
              className={`relative inline-flex h-[14px] w-[24px] items-center rounded-full transition-colors duration-150 ${
                f.on ? 'bg-accent' : 'bg-bg-input'
              }`}
              aria-hidden
            >
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full bg-white transition-transform duration-150 ${
                  f.on ? 'translate-x-[11px]' : 'translate-x-[2px]'
                }`}
              />
            </span>
            <div className="flex items-baseline gap-2 min-w-0">
              <span className={f.on ? 'font-extrabold text-text-primary' : 'text-text-muted'}>{f.name}</span>
              <span className="font-mono text-[11px] text-text-muted truncate">{f.rule}</span>
            </div>
            <span className={`font-mono text-[11px] font-bold ${f.on ? 'text-accent' : 'text-text-muted/60'}`}>
              {f.action}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── CaseFile ───────────────────────────────────────────────────────

function CaseFile(): JSX.Element {
  return (
    <div className="rounded border border-[var(--border-subtle)] bg-bg-card shadow-2xl shadow-black/40">
      <div className="border-b border-[var(--border-subtle)] px-5 py-2.5 text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">
        audit log · case 482
      </div>
      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-black text-accent-fg">
            P
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] leading-snug text-text-secondary">
              <span className="font-extrabold text-text-primary">panda</span>{' '}
              <span className="font-extrabold text-accent">warned</span>{' '}
              <span className="font-extrabold text-text-primary">@drift</span>
            </p>
            <p className="mt-1 text-[12px] font-medium text-text-muted">
              caps filter · 74% over threshold · 3rd warning in 30d
            </p>
            <p className="mt-2 text-[12px] text-text-muted italic border-l-2 border-[rgba(255,255,255,0.10)] pl-3">
              "AAAAAAAAAAA WHY ISNT IT WORKING"
            </p>
          </div>
          <span className="font-mono text-[10.5px] font-bold text-text-muted">#general</span>
        </div>
      </div>
    </div>
  );
}

// ─── Leaderboard ────────────────────────────────────────────────────

function Leaderboard(): JSX.Element {
  const rows = [
    { rank: 1, user: 'Tariq',   color: '#7c3aed', level: 28, pct: 82 },
    { rank: 2, user: 'Mei',     color: '#0ea5e9', level: 26, pct: 64 },
    { rank: 3, user: 'ash',     color: '#10b981', level: 24, pct: 41 },
    { rank: 4, user: 'noctis_', color: '#f59e0b', level: 23, pct: 38 },
    { rank: 5, user: 'Anya',    color: '#ef4444', level: 22, pct: 19 },
  ];
  const rewards = [
    { level: 5,  role: '@member' },
    { level: 15, role: '@regular' },
    { level: 30, role: '@veteran' },
  ];
  return (
    <div className="overflow-hidden rounded border border-[var(--border-subtle)] bg-bg-card shadow-2xl shadow-black/40">
      <div className="border-b border-[var(--border-subtle)] px-5 py-3">
        <span className="text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">
          Lavender Cafe · leaderboard
        </span>
      </div>

      <ul className="divide-y divide-[var(--border-subtle)]">
        {rows.map((r) => (
          <li key={r.user} className="grid grid-cols-[24px_28px_1fr_auto] items-center gap-3 px-5 py-3">
            <span className="font-mono text-[12px] font-black text-text-muted">{r.rank}</span>
            <div
              className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-black text-white"
              style={{ background: r.color }}
            >
              {r.user[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className="truncate text-[13.5px] font-extrabold text-text-primary">{r.user}</span>
                <span className="text-[11px] font-bold text-text-secondary">level {r.level}</span>
              </div>
              <div className="mt-1.5 h-[3px] overflow-hidden rounded bg-bg-base">
                <div className="h-full bg-accent" style={{ width: `${r.pct}%` }} />
              </div>
            </div>
            <span className="font-mono text-[11px] font-black text-text-muted">{r.pct}%</span>
          </li>
        ))}
      </ul>

      <div className="border-t border-[var(--border-subtle)] px-5 py-4">
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-text-muted">Role rewards</p>
        <dl className="mt-3 grid grid-cols-[72px_1fr] gap-y-2 text-[12.5px]">
          {rewards.map((r) => (
            <div key={r.level} className="contents">
              <dt className="font-mono font-bold text-text-secondary">level {r.level}</dt>
              <dd className="font-extrabold text-accent">{r.role}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}

// ─── ConsoleLog ─────────────────────────────────────────────────────

function ConsoleLog(): JSX.Element {
  return (
    <div className="rounded border border-[var(--border-subtle)] bg-bg-card font-mono text-[12px] leading-relaxed shadow-2xl shadow-black/40">
      <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-4 py-2.5">
        <span className="text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">anti-raid · log</span>
        <span className="rounded-full bg-status-danger/15 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-status-danger">
          lockdown
        </span>
      </div>
      <div className="px-4 py-4 text-text-secondary">
        <p><span className="text-text-muted">03:24:11</span> <span className="font-bold text-text-primary">14 joins / 60s</span> — threshold 12</p>
        <p><span className="text-text-muted">03:24:11</span> verification → <span className="font-extrabold text-status-warning">Medium</span></p>
        <p><span className="text-text-muted">03:24:11</span> invites <span className="font-extrabold text-status-danger">paused</span></p>
        <p className="mt-2 text-text-muted">— holding —</p>
        <p><span className="text-text-muted">03:24:14</span> <span className="font-extrabold text-text-primary">@noctis_</span> · 6h account</p>
        <p><span className="text-text-muted">03:24:15</span> <span className="font-extrabold text-text-primary">@halo7</span> · 11h account</p>
        <p><span className="text-text-muted">03:24:18</span> <span className="font-extrabold text-text-primary">@plumeria</span> · 4h account</p>
        <p className="mt-3 text-text-muted">11 more queued. Review when you're ready.</p>
      </div>
    </div>
  );
}

// ─── CommandRow ─────────────────────────────────────────────────────

function CommandRow({ items }: { items: { cmd: string; desc: string }[] }): JSX.Element {
  return (
    <ul className="mt-7 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
      {items.map((item) => (
        <li
          key={item.cmd}
          className="grid grid-cols-[1fr_auto] items-baseline gap-6 py-2.5 sm:grid-cols-[200px_1fr]"
        >
          <code className="font-mono text-[12.5px] font-bold text-accent">{item.cmd}</code>
          <p className="text-[12.5px] font-medium text-text-secondary">{item.desc}</p>
        </li>
      ))}
    </ul>
  );
}

// ─── IconStatement (open / free section) ────────────────────────────

function IconStatement({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <div className="rounded border border-[var(--border-subtle)] bg-bg-card px-6 py-7">
      <div className="text-text-muted">{icon}</div>
      <h3 className="mt-5 font-sans text-[20px] font-black tracking-tight text-text-primary">
        {title}
      </h3>
      <p className="mt-2 text-[14px] font-medium leading-relaxed text-text-secondary">
        {children}
      </p>
    </div>
  );
}

// Inline SVGs — Lucide-style stroke icons, sized 28×28, currentColor
// inherited from parent (text-text-muted on the section). No fills,
// no gradients, no decorative tints — pure neutral grey, matched
// stroke weight so the two icons read as a pair.

function GithubIcon(): JSX.Element {
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M15 22v-4a4.8 4.8 0 0 0-1-3.5c3 0 6-2 6-5.5.08-1.25-.27-2.48-1-3.5.28-1.15.28-2.35 0-3.5 0 0-1 0-3 1.5-2.64-.5-5.36-.5-8 0C6 2 5 2 5 2c-.3 1.15-.3 2.35 0 3.5A5.403 5.403 0 0 0 4 9c0 3.5 3 5.5 6 5.5-.39.49-.68 1.05-.85 1.65-.17.6-.22 1.23-.15 1.85v4" />
      <path d="M9 18c-4.51 2-5-2-7-2" />
    </svg>
  );
}

function TagIcon(): JSX.Element {
  // Price-tag with a hash-style mark — reads as "labelled / no charge"
  // when paired with the "Free of charge" title. Same stroke weight
  // and corner style as GithubIcon so they read as a matched pair.
  return (
    <svg
      width="28"
      height="28"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.59 13.41 13.42 20.58a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}
