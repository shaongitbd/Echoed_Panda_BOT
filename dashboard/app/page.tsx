import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

// ─────────────────────────────────────────────────────────────────────
// Landing page — "late-night broadcast meets liner-note editorial".
//
// One commitment, executed precisely:
//   • The page reads like the inside of a record sleeve. Eyebrows
//     name "SIDE A" / "SIDE B". The how-it-works section is a vinyl
//     track listing with run times. Features are a TOC with dotted
//     leaders, not a card grid. The footer of each spread carries a
//     catalog number.
//   • Type does the heavy lifting. Bebas at scale for impact lines;
//     Inter italic for editorial whisper; JetBrains Mono for every
//     piece of "chrome" (numbers, time codes, tags) — that's what
//     liner-note layouts actually look like.
//   • Single accent (gold #FFC928). No glow soup, no gradients, no
//     glassmorphism. Hairlines and hard edges only. Where motion
//     appears (ON AIR pulse, command marquee, hero waveform) it
//     reinforces the broadcast metaphor — every effect is earning
//     its keep.
//   • Asymmetric, left-aligned. Generous airy space + dense,
//     deliberately-cluttered moments (the tracklist row, the TOC).
//     Magazine rhythm, not SaaS rhythm.
//
// Server component end-to-end. CSS animations live in the inline
// <style> block at the top of <main> so the file is self-contained
// and we don't perturb globals.css for one page.
// ─────────────────────────────────────────────────────────────────────

export default function HomePage(): JSX.Element {
  return (
    <>
      <Header />
      <main className="relative overflow-x-hidden">
        <PageStyles />
        <Hero />
        <CommandMarquee />
        <SideATrackListing />
        <SideBCapabilities />
        <FinalSpread />
      </main>
      <Footer />
    </>
  );
}

// ─── Inline styles ───────────────────────────────────────────────────
// All keyframes and a couple of shape utilities the page leans on.
// Defined inline so this whole landing page is one self-contained file.

function PageStyles(): JSX.Element {
  const css = `
    @keyframes panda-pulse {
      0%, 100% { opacity: 1; transform: scale(1); }
      50%      { opacity: 0.55; transform: scale(0.85); }
    }
    @keyframes panda-marquee {
      from { transform: translateX(0); }
      to   { transform: translateX(-50%); }
    }
    @keyframes panda-bar {
      0%, 100% { transform: scaleY(0.18); }
      50%      { transform: scaleY(1); }
    }
    @keyframes panda-rise {
      from { opacity: 0; transform: translateY(14px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .panda-rise        { animation: panda-rise 0.8s cubic-bezier(.22,.61,.36,1) both; }
    .panda-pulse-dot   { animation: panda-pulse 1.6s ease-in-out infinite; }
    .panda-marquee     { animation: panda-marquee 38s linear infinite; }
    .panda-bar         { transform-origin: bottom center; animation: panda-bar 1.1s ease-in-out infinite; }
    @media (prefers-reduced-motion: reduce) {
      .panda-pulse-dot, .panda-marquee, .panda-bar { animation: none; }
    }
    .panda-grid-bg {
      background-image:
        linear-gradient(to right, rgba(255,255,255,0.025) 1px, transparent 1px),
        linear-gradient(to bottom, rgba(255,255,255,0.025) 1px, transparent 1px);
      background-size: 64px 64px;
      mask-image: radial-gradient(ellipse 80% 60% at 60% 30%, #000 30%, transparent 75%);
    }
    .panda-leader {
      flex: 1 1 auto;
      margin: 0 0.85rem 0.4rem 0.85rem;
      border-bottom: 1px dotted rgba(255,255,255,0.14);
      align-self: end;
      min-width: 1.5rem;
    }
  `;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

// ─── Hero ─────────────────────────────────────────────────────────────
//
// Asymmetric two-up. Left: an ON AIR badge, the contrastive headline
// (Bebas + Inter italic), a single sentence of body, two CTAs, and a
// catalog stamp. Right: a stylised broadcast panel — the unit of
// memorability for this page. Behind everything, a faint masked grid
// (visible mostly behind the right panel) gives the feeling of a
// printed sheet without ever actually showing a "noise texture".

function Hero(): JSX.Element {
  return (
    <section className="relative">
      <div className="panda-grid-bg pointer-events-none absolute inset-0" aria-hidden="true" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-6 pt-20 pb-24 lg:grid-cols-[1.15fr_1fr] lg:gap-20 lg:pt-28 lg:pb-28">
        {/* Left column */}
        <div className="panda-rise relative z-10 flex flex-col" style={{ animationDelay: '60ms' }}>
          <OnAirBadge />

          <h1 className="mt-6 font-display leading-[0.92] tracking-[-0.012em]" style={{ fontSize: 'clamp(3.25rem, 8.5vw, 6.75rem)' }}>
            <span className="block text-text-primary">Play loud.</span>
            <span className="block font-sans italic font-light text-text-secondary" style={{ fontSize: 'clamp(2.5rem, 6.5vw, 5rem)', letterSpacing: '-0.015em' }}>
              Moderate <span className="text-accent">quietly.</span>
            </span>
          </h1>

          <p className="mt-7 max-w-md text-base leading-relaxed text-text-secondary">
            Music, levels, mod, welcomes &mdash; one bot for the people you&rsquo;d actually invite over.
            Configure it from chat or the dashboard. Free, open source, no premium tier.
          </p>

          <div className="mt-9 flex flex-wrap items-center gap-3">
            <Link
              href="/login"
              className="group relative inline-flex items-center gap-2.5 bg-accent px-7 py-3.5 text-sm font-semibold tracking-wide text-accent-fg transition-transform duration-150 hover:-translate-y-px hover:bg-accent-hover"
              style={{ borderRadius: '2px' }}
            >
              Add panda
              <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1">
                &#x2192;
              </span>
            </Link>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 border border-[var(--border-strong)] bg-transparent px-6 py-3.5 text-sm font-semibold text-text-primary transition-colors duration-150 hover:border-accent/60 hover:text-accent"
              style={{ borderRadius: '2px' }}
            >
              Open dashboard
            </Link>
          </div>

          <div className="mt-12 flex items-center gap-3 font-mono text-[10.5px] uppercase tracking-[0.22em] text-text-muted">
            <span className="text-accent">P&minus;0001</span>
            <span aria-hidden="true">/</span>
            <span>Echoed family</span>
            <span aria-hidden="true">/</span>
            <span>est. 2026</span>
          </div>
        </div>

        {/* Right column — broadcast panel */}
        <div className="panda-rise relative z-10" style={{ animationDelay: '180ms' }}>
          <BroadcastPanel />
        </div>
      </div>
    </section>
  );
}

function OnAirBadge(): JSX.Element {
  return (
    <div className="inline-flex w-fit items-center gap-3 border-y border-[var(--border-subtle)] py-2 font-mono text-[10.5px] uppercase tracking-[0.28em] text-text-muted">
      <span className="relative flex h-2 w-2 items-center justify-center">
        <span className="absolute h-2 w-2 rounded-full bg-accent panda-pulse-dot" />
      </span>
      <span className="text-text-secondary">On air</span>
      <span className="h-3 w-px bg-[var(--border-strong)]" aria-hidden="true" />
      <span className="text-text-secondary">CH 24.7</span>
      <span className="h-3 w-px bg-[var(--border-strong)]" aria-hidden="true" />
      <span className="text-accent">Live</span>
    </div>
  );
}

// ─── Broadcast panel ─────────────────────────────────────────────────
//
// The single object on the page that sells panda viscerally. Modeled
// loosely on a portable FM tuner: top header strip with station ID,
// a now-playing block, an animated waveform, a frequency dial, and
// a row of command keys. Not a Discord chat mockup — that's the
// generic move and we deliberately stepped past it.

function BroadcastPanel(): JSX.Element {
  return (
    <div className="relative mx-auto w-full max-w-md" style={{ filter: 'drop-shadow(0 24px 40px rgba(0,0,0,0.45))' }}>
      {/* Catalog tab — small ear at the top-right */}
      <div className="absolute -top-3 right-6 flex items-center gap-2 bg-bg-base px-3 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
        <span className="text-accent">cat.</span>
        <span>P&minus;0001/A</span>
      </div>

      <div className="relative border border-[var(--border-strong)] bg-bg-card" style={{ borderRadius: '4px' }}>
        {/* Station header */}
        <div className="flex items-center justify-between border-b border-[var(--border-subtle)] px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="grid h-7 w-7 place-items-center bg-accent font-display text-base text-accent-fg" style={{ borderRadius: '2px' }}>
              P
            </div>
            <div className="leading-tight">
              <div className="font-display text-base tracking-wide text-text-primary">Panda Station</div>
              <div className="font-mono text-[9.5px] uppercase tracking-[0.22em] text-text-muted">24.7 fm &middot; the squad cut</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted">
            <span className="h-1.5 w-1.5 rounded-full bg-status-online panda-pulse-dot" />
            <span>live</span>
          </div>
        </div>

        {/* Now playing */}
        <div className="px-5 pt-5 pb-4">
          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-accent">Now playing</div>
          <div className="mt-2 flex items-baseline justify-between gap-3">
            <h3 className="font-display text-2xl leading-tight tracking-tight text-text-primary">
              Blade Runner &mdash; Main Titles
            </h3>
            <span className="shrink-0 font-mono text-[10.5px] text-text-muted">04:01</span>
          </div>
          <div className="mt-1 flex items-center justify-between font-mono text-[10.5px] text-text-muted">
            <span>Vangelis</span>
            <span>queued by &#64;maven</span>
          </div>
        </div>

        {/* Waveform */}
        <div className="px-5">
          <Waveform />
          <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-text-muted">
            <span className="text-accent">01:23</span>
            <span>&minus;02:38</span>
          </div>
        </div>

        {/* Frequency dial */}
        <div className="mt-5 border-t border-[var(--border-subtle)] px-5 py-3">
          <FrequencyDial />
        </div>

        {/* Command keys */}
        <div className="grid grid-cols-4 border-t border-[var(--border-subtle)]">
          {(['!play', '!skip', '!queue', '!loop'] as const).map((cmd, i) => (
            <div
              key={cmd}
              className={`flex h-12 items-center justify-center font-mono text-[11px] uppercase tracking-[0.18em] text-text-secondary ${
                i < 3 ? 'border-r border-[var(--border-subtle)]' : ''
              } ${i === 0 ? 'bg-bg-elevated text-accent' : ''}`}
            >
              {cmd}
            </div>
          ))}
        </div>
      </div>

      {/* Foot tab — "side A" notation */}
      <div className="absolute -bottom-3 left-6 flex items-center gap-2 bg-bg-base px-3 font-mono text-[10px] uppercase tracking-[0.22em] text-text-muted">
        <span>side a</span>
        <span aria-hidden="true">&middot;</span>
        <span className="text-accent">aux out</span>
      </div>
    </div>
  );
}

// 24 vertical bars at varying baseline heights, all running the same
// keyframe with offset delays so the row reads as a moving wave.
function Waveform(): JSX.Element {
  const bars = Array.from({ length: 36 }, (_, i) => i);
  return (
    <div className="flex h-14 items-end gap-[3px]">
      {bars.map((i) => {
        const baseHeight = 18 + ((i * 53) % 70); // deterministic pseudo-random
        const delay = (i * 73) % 1100;
        const isPlayed = i < 13;
        return (
          <span
            key={i}
            className="panda-bar block w-[5px]"
            style={{
              height: `${baseHeight}%`,
              animationDelay: `${delay}ms`,
              backgroundColor: isPlayed ? 'var(--accent)' : 'var(--border-strong)',
            }}
          />
        );
      })}
    </div>
  );
}

// Tiny radio dial — 21 ticks, one accented, two anchor frequencies
// labeled. Static, but reads as "we're tuned in".
function FrequencyDial(): JSX.Element {
  const ticks = Array.from({ length: 21 }, (_, i) => i);
  return (
    <div>
      <div className="flex items-end gap-[6px]">
        {ticks.map((i) => {
          const isMajor = i % 5 === 0;
          const isTuned = i === 12;
          return (
            <span
              key={i}
              className="block w-px"
              style={{
                height: isTuned ? '18px' : isMajor ? '14px' : '8px',
                backgroundColor: isTuned ? 'var(--accent)' : isMajor ? 'var(--border-strong)' : 'var(--border-subtle)',
              }}
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[9.5px] uppercase tracking-[0.22em] text-text-muted">
        <span>87.5</span>
        <span className="text-accent">94.7</span>
        <span>108.0</span>
      </div>
    </div>
  );
}

// ─── Command marquee ──────────────────────────────────────────────────
//
// A horizontal ticker between the hero and Side A — restates panda's
// surface area without making any one feature the headline. CSS-only
// scroll, gradient-mask edges so commands fade rather than clip.

function CommandMarquee(): JSX.Element {
  const items = [
    '!play', '!skip', '!queue', '!nowplaying', '!volume', '!loop', '!shuffle',
    '!rank', '!lb', '!levelrewards', '!warn', '!ban', '!timeout', '!purge',
    '!welcome', '!autorole', '!reactrole', '!suggest', '!poll', '!remind',
    '!gstart', '!automod', '!reddit', '!twitch', '!youtube',
  ];
  // Duplicate so the keyframe (-50%) stitches seamlessly.
  const stream = [...items, ...items];
  return (
    <div
      className="relative border-y border-[var(--border-subtle)] bg-bg-base/60 py-4 overflow-hidden"
      style={{
        maskImage: 'linear-gradient(to right, transparent 0, #000 8%, #000 92%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to right, transparent 0, #000 8%, #000 92%, transparent 100%)',
      }}
    >
      <div className="panda-marquee flex w-max items-center gap-10 whitespace-nowrap font-mono text-[12px] uppercase tracking-[0.22em] text-text-muted">
        {stream.map((cmd, i) => (
          <span key={i} className="flex items-center gap-10">
            <span className={i % 7 === 0 ? 'text-accent' : ''}>{cmd}</span>
            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[var(--border-strong)]" />
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Side A — "Track Listing" (How it works) ─────────────────────────
//
// Three rows, each laid out exactly like a vinyl insert: number,
// run time, title in Bebas, blurb in Inter, type tag in mono.
// Hairlines between, no cards. The page's most "magazine" moment.

function SideATrackListing(): JSX.Element {
  const tracks: Track[] = [
    {
      n: '01',
      time: '0:00',
      title: 'Type a command.',
      blurb:
        'Anywhere in chat. Defaults are sane &mdash; no setup needed to start. Prefix swappable per server.',
      tag: 'INPUT',
    },
    {
      n: '02',
      time: '0:03',
      title: 'Panda handles it.',
      blurb:
        'Joins voice. Plays at 128 kbps Opus. Live now-playing card. Skip, queue, loop, shuffle from chat.',
      tag: 'LIVE',
    },
    {
      n: '03',
      time: '∞', // infinity
      title: 'Tweak on the web.',
      blurb:
        'Channel scopes, role gates, DJ permissions, level rewards, welcome flows &mdash; every knob is on the dashboard.',
      tag: 'CONFIG',
    },
  ];

  return (
    <section id="how" className="relative border-t border-[var(--border-strong)]">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <SideHeader side="A" eyebrow="Side A" title="Track listing" runtime="3 cuts &middot; 0:03 &middot; eternal" />

        <ol className="mt-14 flex flex-col">
          {tracks.map((t, i) => (
            <TrackRow key={t.n} {...t} last={i === tracks.length - 1} />
          ))}
        </ol>
      </div>
    </section>
  );
}

interface Track {
  n: string;
  time: string;
  title: string;
  blurb: string;
  tag: string;
}

function TrackRow({ n, time, title, blurb, tag, last }: Track & { last?: boolean }): JSX.Element {
  return (
    <li
      className={`group grid grid-cols-[auto_auto_1fr_auto] items-baseline gap-x-6 gap-y-1.5 border-t border-[var(--border-subtle)] py-7 transition-colors duration-200 hover:bg-bg-card/40 sm:grid-cols-[3.5rem_4.5rem_1fr_5rem] ${
        last ? 'border-b' : ''
      }`}
    >
      {/* Number */}
      <span className="font-mono text-[14px] tracking-[0.06em] text-text-muted transition-colors group-hover:text-accent">
        {n}
      </span>
      {/* Run time */}
      <span className="font-mono text-[13px] text-text-secondary">{time}</span>
      {/* Title + blurb */}
      <div className="col-span-2 sm:col-span-1">
        <h3 className="font-display text-3xl leading-none tracking-tight text-text-primary sm:text-[2.4rem]">
          {title}
        </h3>
        <p
          className="mt-2 max-w-xl text-sm leading-relaxed text-text-secondary"
          dangerouslySetInnerHTML={{ __html: blurb }}
        />
      </div>
      {/* Tag */}
      <span className="hidden border border-[var(--border-subtle)] px-2.5 py-1 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-text-muted sm:inline-block">
        {tag}
      </span>
    </li>
  );
}

// ─── Side B — Capabilities (TOC dotted leaders) ───────────────────────
//
// Features rendered as a contents page, not a card grid. Each row is
// a dotted leader between the feature name (Bebas) and a one-line
// description (Inter). Same visual rhythm as a magazine TOC. No
// rounded boxes anywhere.

function SideBCapabilities(): JSX.Element {
  return (
    <section id="features" className="relative border-t border-[var(--border-strong)]">
      <div className="mx-auto max-w-6xl px-6 py-24">
        <SideHeader side="B" eyebrow="Side B" title="Capabilities" runtime="six tracks &middot; everything you need" />

        <div className="mt-12 grid gap-x-16 gap-y-1 lg:grid-cols-2">
          {CAPABILITIES.map((c, i) => (
            <CapabilityRow key={c.title} index={i + 1} {...c} />
          ))}
        </div>

        <div className="mt-14 flex items-baseline justify-between border-t border-[var(--border-subtle)] pt-6 font-mono text-[11px] uppercase tracking-[0.22em] text-text-muted">
          <span>Disable any cut. Panda only runs what you turn on.</span>
          <span className="text-accent">END SIDE B</span>
        </div>
      </div>
    </section>
  );
}

interface Capability {
  title: string;
  detail: string;
}

const CAPABILITIES: Capability[] = [
  { title: 'Voice playback', detail: 'YouTube · SoundCloud · queue · DJ role · loudness-normalised' },
  { title: 'XP &amp; rewards', detail: 'Per-message XP · role rewards · no-XP channels · custom level-ups' },
  { title: 'Moderation', detail: 'Timeout · kick · ban · warn · searchable history · bulk-purge' },
  { title: 'Auto-mod', detail: 'Spam · links · caps · mentions · emoji · zalgo · invites · bad-words' },
  { title: 'Welcome flows', detail: 'Custom messages · auto-roles on join · reaction-role menus' },
  { title: 'Automation', detail: 'Scheduled posts · auto-react · keyword replies · Reddit/Twitch/YouTube alerts' },
];

function CapabilityRow({ index, title, detail }: Capability & { index: number }): JSX.Element {
  return (
    <div className="group flex items-baseline border-b border-[var(--border-subtle)] py-5">
      <span className="mr-4 w-8 shrink-0 font-mono text-[11px] tracking-[0.16em] text-text-muted transition-colors group-hover:text-accent">
        b{String(index).padStart(2, '0')}
      </span>
      <h3
        className="font-display text-2xl tracking-tight text-text-primary transition-colors group-hover:text-accent"
        dangerouslySetInnerHTML={{ __html: title }}
      />
      <span aria-hidden="true" className="panda-leader" />
      <p
        className="max-w-[24rem] shrink-0 text-right text-[13px] leading-snug text-text-secondary"
        dangerouslySetInnerHTML={{ __html: detail }}
      />
    </div>
  );
}

// ─── Side header (shared) ────────────────────────────────────────────
//
// Used by both Side A and Side B. Side letter at left in a chunky
// stamp, eyebrow + title + runtime stacked.

function SideHeader({
  side,
  eyebrow,
  title,
  runtime,
}: {
  side: string;
  eyebrow: string;
  title: string;
  runtime: string;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-end gap-x-10 gap-y-6">
      <div
        className="flex h-20 w-20 items-center justify-center border border-accent/40 font-display text-5xl text-accent"
        style={{ borderRadius: '2px' }}
      >
        {side}
      </div>
      <div>
        <p className="font-mono text-[10.5px] uppercase tracking-[0.28em] text-accent">{eyebrow}</p>
        <h2
          className="mt-2 font-display tracking-tight text-text-primary"
          style={{ fontSize: 'clamp(2.4rem, 5.5vw, 4.5rem)', lineHeight: 0.95 }}
        >
          {title}
        </h2>
      </div>
      <p
        className="ml-auto max-w-xs font-mono text-[11px] uppercase tracking-[0.22em] text-text-muted"
        dangerouslySetInnerHTML={{ __html: runtime }}
      />
    </div>
  );
}

// ─── Final spread (closing CTA) ──────────────────────────────────────
//
// Reads like the back of the sleeve. Big editorial closer, single
// CTA, then a catalog-number metadata strip beneath it as the final
// signoff before the footer.

function FinalSpread(): JSX.Element {
  return (
    <section className="relative border-t border-[var(--border-strong)]">
      <div className="mx-auto max-w-6xl px-6 py-28">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.28em] text-accent">Press play</p>
        <h2
          className="mt-4 font-display leading-[0.92] tracking-[-0.012em]"
          style={{ fontSize: 'clamp(3.5rem, 9vw, 7.5rem)' }}
        >
          <span className="block text-text-primary">Wire it in.</span>
          <span className="block font-sans italic font-light text-text-secondary" style={{ fontSize: 'clamp(2.4rem, 6vw, 5.25rem)' }}>
            It runs while you <span className="text-accent">sleep.</span>
          </span>
        </h2>

        <div className="mt-12 flex flex-wrap items-center gap-4">
          <Link
            href="/login"
            className="inline-flex items-center gap-3 bg-accent px-8 py-4 text-sm font-semibold tracking-wide text-accent-fg transition-transform duration-150 hover:-translate-y-px hover:bg-accent-hover"
            style={{ borderRadius: '2px' }}
          >
            Add panda to your server
            <span aria-hidden="true">&#x2192;</span>
          </Link>
          <Link
            href="https://github.com/shaongitbd/panda"
            className="font-mono text-[11px] uppercase tracking-[0.24em] text-text-muted underline-offset-4 hover:text-accent hover:underline"
          >
            Source &amp; self-host &raquo;
          </Link>
        </div>

        <div className="mt-20 grid grid-cols-2 gap-y-3 border-t border-[var(--border-subtle)] pt-6 font-mono text-[10.5px] uppercase tracking-[0.22em] text-text-muted sm:grid-cols-4">
          <CatalogCell label="Catalog" value="P-0001" valueAccent />
          <CatalogCell label="Imprint" value="Echoed Records" />
          <CatalogCell label="Pressing" value="Open source" />
          <CatalogCell label="Price" value="Free, always" />
        </div>
      </div>
    </section>
  );
}

function CatalogCell({
  label,
  value,
  valueAccent,
}: {
  label: string;
  value: string;
  valueAccent?: boolean;
}): JSX.Element {
  return (
    <div>
      <div className="text-text-muted/70">{label}</div>
      <div className={`mt-1.5 font-display text-base normal-case tracking-wide ${valueAccent ? 'text-accent' : 'text-text-primary'}`}>
        {value}
      </div>
    </div>
  );
}
