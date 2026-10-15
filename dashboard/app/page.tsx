import Link from 'next/link';
import {
  ArrowRight, Bell, Cake, CalendarClock, ChartColumn, Check, Gavel, Gift, Hand, Hash, MessageCircleQuestionMark,
  Music, ScrollText, ShieldCheck, Sparkles, Star, Tags, TrendingUp, type LucideIcon,
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { PandaMark } from '@/components/PandaMark';

// panda.echoed.gg — what Panda does, shown working rather than listed.
// echoed.gg's language throughout: Unbounded display, Geologica text, flat
// plates stepped lighter, one red accent for "do this". The product mocks
// are drawn from Panda's real messages (the AI notice, the !panda confirm
// card, the now-playing card) so the page never promises something the bot
// doesn't say.

const wrap = 'mx-auto w-full max-w-6xl px-5 md:px-8';

export default function HomePage(): JSX.Element {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <CapabilityStrip />
        <AiSection />
        <ModerationSection />
        <MusicSection />
        <CommunitySection />
        <EverythingElse />
        <HowToAdd />
        <CloseBand />
      </main>
      <Footer />
    </>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }): JSX.Element {
  return <p className="text-xs font-semibold uppercase tracking-[0.085em] text-text-muted">{children}</p>;
}

function H2({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <h2 className="mt-3 max-w-[16ch] font-display text-[clamp(28px,3.4vw,42px)] font-semibold leading-[1.08] tracking-[-0.04em] text-text-primary [text-wrap:balance]">
      {children}
    </h2>
  );
}

function Lead({ children }: { children: React.ReactNode }): JSX.Element {
  return <p className="mt-4 max-w-[52ch] text-[17px] leading-[1.6] text-text-muted">{children}</p>;
}

function Points({ items }: { items: React.ReactNode[] }): JSX.Element {
  return (
    <ul className="mt-6 space-y-3">
      {items.map((t, i) => (
        <li key={i} className="flex gap-3 text-[15px] leading-6 text-text-secondary">
          <Check aria-hidden="true" size={18} className="mt-[3px] shrink-0 text-status-online" />
          <span>{t}</span>
        </li>
      ))}
    </ul>
  );
}

function Cmd({ children }: { children: React.ReactNode }): JSX.Element {
  return <code className="rounded-md bg-bg-elevated px-1.5 py-0.5 font-mono text-[12.5px] text-text-secondary">{children}</code>;
}

/** A member's rounded-square avatar, as Echoed draws them. */
function Avatar({ name, tone }: { name: string; tone: string }): JSX.Element {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-white" style={{ background: tone }}>
      {name.charAt(0).toUpperCase()}
    </span>
  );
}

function BotTag(): JSX.Element {
  return <span className="relative -top-px rounded-[3px] bg-[rgba(110,160,220,.13)] px-[5px] text-[11px] font-bold uppercase leading-4 tracking-[0.06em] text-[#8ab9e6]">Bot</span>;
}

function Msg({ name, tone, bot, time = 'Today at 21:14', children }: { name: string; tone?: string; bot?: boolean; time?: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex gap-3">
      {bot ? <PandaMark size={36} className="shrink-0 rounded-xl" /> : <Avatar name={name} tone={tone ?? '#5865f2'} />}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[15px] font-semibold text-text-primary">{name}</span>
          {bot ? <BotTag /> : null}
          <span className="text-xs text-text-faint">{time}</span>
        </div>
        <div className="mt-0.5 text-[15px] leading-6 text-text-secondary">{children}</div>
      </div>
    </div>
  );
}

/** The app window the chat mocks sit in: a channel header and a plate. */
function ChatWindow({ channel, children, className = '' }: { channel: string; children: React.ReactNode; className?: string }): JSX.Element {
  return (
    <div className={`overflow-hidden rounded-2xl bg-bg-card ${className}`}>
      <div className="flex h-12 items-center gap-2 bg-bg-input px-4">
        <Hash aria-hidden="true" size={16} className="text-text-faint" />
        <span className="text-sm font-semibold text-text-primary">{channel}</span>
      </div>
      <div className="space-y-5 p-4 sm:p-5">{children}</div>
    </div>
  );
}

// ── Hero ────────────────────────────────────────────────────────────────────

function Hero(): JSX.Element {
  return (
    <section className={`${wrap} grid items-center gap-12 pb-16 pt-12 md:pt-20 lg:grid-cols-[1.05fr_1fr]`}>
      <div>
        <Eyebrow>The bot for Echoed servers</Eyebrow>
        <h1 className="mt-4 max-w-[13ch] font-display text-[clamp(40px,5.6vw,72px)] font-semibold leading-[1.02] tracking-[-0.045em] text-text-primary [text-wrap:balance]">
          Your server, <span className="text-accent-text">looked after.</span>
        </h1>
        <p className="mt-6 max-w-[48ch] text-[clamp(17px,1.5vw,19px)] leading-[1.6] text-text-muted">
          Panda moderates with AI on your own key, plays music in voice, levels members up, welcomes newcomers and
          keeps a record of everything — <span className="text-text-secondary">set up from one dashboard, free, with no premium tier.</span>
        </p>
        <div className="mt-8 flex flex-wrap gap-2.5">
          <Link href="#add" className="inline-flex h-12 items-center gap-2 rounded-[10px] bg-accent px-5 text-[15px] font-semibold text-accent-fg transition-colors duration-100 hover:bg-accent-hover active:bg-accent-press">
            Add Panda to your server
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
          <Link href="/dashboard" className="inline-flex h-12 items-center rounded-[10px] bg-bg-elevated px-5 text-[15px] font-semibold text-text-primary transition-colors duration-100 hover:bg-bg-hover">
            Open the dashboard
          </Link>
        </div>
        <p className="mt-5 text-sm text-text-faint">80 commands · 20+ features · all of it free</p>
      </div>

      {/* Panda doing the job: an AI catch, then a moderator asking in plain words. */}
      <ChatWindow channel="general">
        <Msg name="kai_77" tone="#3a7d5c">
          free nitro for the first 50 people → disc0rd-gift.store/claim
        </Msg>
        <div className="flex items-center gap-2 rounded-xl bg-bg-input px-3 py-2 text-sm text-text-muted">
          <ShieldCheck aria-hidden="true" size={16} className="shrink-0 text-status-online" />
          <span>
            <span className="text-text-secondary">@kai_77</span>, your message was removed: a scam link posing as a
            giveaway.
          </span>
        </div>
        <Msg name="mira" tone="#a8507a">
          <span className="text-text-faint">↪ replying to kai_77 · </span>
          <span className="font-mono text-[13.5px] text-text-primary">!panda delete everything this guy posted in the last hour and time him out for a day</span>
        </Msg>
        <Msg name="Panda" bot>
          <div className="mt-1 rounded-xl bg-bg-elevated p-3.5">
            <p className="text-sm font-semibold text-text-primary">Confirm moderation</p>
            <ul className="mt-2 space-y-1 text-sm text-text-secondary">
              <li>• Delete <b className="font-semibold text-text-primary">14</b> messages from <b className="font-semibold text-text-primary">kai_77</b> in this channel</li>
              <li>• Time out <b className="font-semibold text-text-primary">kai_77</b> for 1 day — posting scam links</li>
            </ul>
            <p className="mt-2 text-xs text-text-faint">React ✅ to run it or ❌ to cancel. Only mira can confirm.</p>
          </div>
          <div className="mt-2 flex gap-1.5">
            <span className="inline-flex h-7 items-center gap-1.5 rounded-md bg-accent-muted px-2 text-sm text-accent-text">✅ 2</span>
            <span className="inline-flex h-7 items-center gap-1.5 rounded-md bg-bg-elevated px-2 text-sm text-text-muted">❌ 1</span>
          </div>
        </Msg>
      </ChatWindow>
    </section>
  );
}

// ── Everything Panda does, in one line ──────────────────────────────────────

const STRIP: [LucideIcon, string][] = [
  [Sparkles, 'AI moderation'], [ShieldCheck, 'Auto-mod'], [Gavel, 'Cases & warnings'], [ScrollText, 'Server log'],
  [Music, 'Music'], [TrendingUp, 'Levels'], [Hand, 'Welcomes'], [Tags, 'Reaction roles'], [Gift, 'Giveaways'],
  [Star, 'Starboard'], [MessageCircleQuestionMark, 'Question of the day'], [Cake, 'Birthdays'], [Hash, 'Counting'],
  [CalendarClock, 'Schedules'], [Bell, 'Social alerts'], [ChartColumn, 'Stat counters'],
];

function CapabilityStrip(): JSX.Element {
  return (
    <section id="features" className={`${wrap} scroll-mt-20 pb-6`}>
      <ul className="flex flex-wrap gap-2">
        {STRIP.map(([Icon, label]) => (
          <li key={label} className="inline-flex h-9 items-center gap-2 rounded-lg bg-bg-card px-3 text-sm text-text-secondary">
            <Icon aria-hidden="true" size={16} className="text-text-faint" />
            {label}
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Feature sections ────────────────────────────────────────────────────────

function Feature({ id, flip, text, visual }: { id?: string; flip?: boolean; text: React.ReactNode; visual: React.ReactNode }): JSX.Element {
  return (
    <section id={id} className={`${wrap} grid scroll-mt-20 items-center gap-10 py-16 md:py-24 lg:grid-cols-2 lg:gap-16`}>
      <div className={flip ? 'lg:order-2' : ''}>{text}</div>
      <div className={flip ? 'lg:order-1' : ''}>{visual}</div>
    </section>
  );
}

function AiSection(): JSX.Element {
  return (
    <Feature
      id="ai"
      text={
        <>
          <Eyebrow>AI moderation</Eyebrow>
          <H2>Moderation that reads the room.</H2>
          <Lead>
            Big servers outgrow human moderators. Give each channel its rules in plain words and Panda judges new
            messages against them — with the conversation before them as context, so a joke between friends isn&apos;t
            treated like an attack.
          </Lead>
          <Points
            items={[
              <>Your own <b className="font-semibold text-text-primary">OpenRouter key and model</b>, with a daily limit you set — you&apos;re never billed by us.</>,
              <>You choose what it may do per channel: flag, delete, warn, time out — even kick or ban, behind a higher bar and an hourly brake.</>,
              <>Moderators ask in plain words with <Cmd>!panda</Cmd>. It shows exactly what it will do and waits for their ✅.</>,
              <>Staff and protected roles are never judged, and every action lands in the mod-log.</>,
            ]}
          />
        </>
      }
      visual={
        <div className="space-y-3">
          <div className="rounded-2xl bg-bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.085em] text-text-faint">Rules for #dev-help</p>
            <p className="mt-2 text-[15px] leading-6 text-text-secondary">
              Programming questions and answers only. Memes, self-promotion and off-topic chat get deleted. Be patient with
              beginners.
            </p>
            <div className="mt-4 flex flex-wrap gap-1.5 text-xs">
              {['Reads the last 8 messages', 'May flag, delete, warn', '80% sure to act'].map((t) => (
                <span key={t} className="rounded-md bg-bg-elevated px-2 py-1 text-text-muted">{t}</span>
              ))}
            </div>
          </div>
          <ul className="divide-y divide-[var(--border-subtle)] rounded-2xl bg-bg-card">
            {[
              { verdict: 'Kept', tone: 'text-status-online', msg: '“why does my useEffect run twice in dev?”', why: 'On topic' },
              { verdict: 'Deleted', tone: 'text-accent-text', msg: '“anyone want to see my cat lol”', why: 'Off-topic for this channel' },
              { verdict: 'Flagged', tone: 'text-status-warning', msg: '“dm me for cheap accounts”', why: 'Likely selling — a moderator should look' },
            ].map((r) => (
              <li key={r.msg} className="flex items-start gap-4 px-5 py-3.5">
                <span className={`w-16 shrink-0 text-xs font-semibold uppercase tracking-[0.07em] ${r.tone}`}>{r.verdict}</span>
                <span className="min-w-0">
                  <span className="block text-sm text-text-secondary">{r.msg}</span>
                  <span className="block text-xs text-text-faint">{r.why}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      }
    />
  );
}

function ModerationSection(): JSX.Element {
  const cases = [
    { n: 482, action: 'Warn', who: 'drift', why: 'Caps filter — 3rd warning in 30 days', by: 'Auto-mod' },
    { n: 483, action: 'Timeout', who: 'drift', why: 'Reached 3 warnings · 1 hour', by: 'Escalation' },
    { n: 484, action: 'Ban', who: 'spam_bot_91', why: 'Posting scam links', by: 'mira' },
  ];
  return (
    <Feature
      flip
      text={
        <>
          <Eyebrow>Moderation</Eyebrow>
          <H2>Every action, on the record.</H2>
          <Lead>
            Kick, ban, time out, warn and purge from chat — every one becomes a numbered case in your mod-log, with who
            did it and why.
          </Lead>
          <Points
            items={[
              <>Warnings that escalate on their own: at 3 a timeout, at 5 a kick — your numbers.</>,
              <>Auto-mod with eight filters: spam, bad words, caps, links, invites, mass mentions, emoji, zalgo.</>,
              <>Moderator roles use the commands without platform permissions; protected roles are off-limits.</>,
              <>Anti-raid locks the server down when joins flood in. A server log records edits, deletes, joins and leaves.</>,
            ]}
          />
        </>
      }
      visual={
        <div className="rounded-2xl bg-bg-card p-2">
          <p className="px-3 pb-2 pt-2.5 text-xs font-semibold uppercase tracking-[0.085em] text-text-faint"># mod-log</p>
          <ul className="space-y-1">
            {cases.map((c) => (
              <li key={c.n} className="rounded-xl bg-bg-input px-4 py-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold text-text-primary">Case #{c.n}</span>
                  <span className="rounded-md bg-bg-elevated px-1.5 text-xs font-semibold text-text-secondary">{c.action}</span>
                  <span className="text-text-secondary">@{c.who}</span>
                </div>
                <p className="mt-1 text-xs text-text-faint">{c.why} · by {c.by}</p>
              </li>
            ))}
          </ul>
        </div>
      }
    />
  );
}

function MusicSection(): JSX.Element {
  return (
    <Feature
      text={
        <>
          <Eyebrow>Music</Eyebrow>
          <H2>Music that sounds like music.</H2>
          <Lead>
            Type <Cmd>!play</Cmd> and a song name. Panda says what it&apos;s doing while it searches and gets the track
            ready, then keeps a live now-playing card updated in the channel.
          </Lead>
          <Points
            items={[
              <>YouTube, SoundCloud and direct links, with a queue, loop and shuffle.</>,
              <>Stereo, and every song brought to the same loudness — without flattening its dynamics.</>,
              <>A DJ role for skip, stop and volume; limit music to the channels you choose.</>,
            ]}
          />
        </>
      }
      visual={
        <div className="rounded-2xl bg-bg-card p-5">
          <div className="flex gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#3b2a5a,#7a3b55)]">
              <Music aria-hidden="true" size={28} className="text-white/80" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-[0.085em] text-text-faint">Now playing</p>
              <p className="mt-1 truncate text-[17px] font-semibold text-text-primary">Summertime Sadness</p>
              <p className="truncate text-sm text-text-muted">Lana Del Rey · requested by mira</p>
            </div>
          </div>
          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-bg-elevated">
            <div className="h-full w-[38%] rounded-full bg-accent" />
          </div>
          <div className="mt-2 flex justify-between text-xs tabular-nums text-text-faint">
            <span>1:41</span>
            <span>Up next: 3 in queue</span>
            <span>4:25</span>
          </div>
        </div>
      }
    />
  );
}

function CommunitySection(): JSX.Element {
  const board = [
    { name: 'tariq', lvl: 28, pct: 82, tone: '#7c5cd6' },
    { name: 'mei', lvl: 26, pct: 64, tone: '#2f8fc9' },
    { name: 'ash', lvl: 24, pct: 41, tone: '#3a9a6b' },
  ];
  return (
    <Feature
      flip
      text={
        <>
          <Eyebrow>Community</Eyebrow>
          <H2>Reasons to come back.</H2>
          <Lead>
            The small rituals that make a server feel alive — and keep it from going quiet after the first week.
          </Lead>
          <Points
            items={[
              <>Levels and XP for chatting, with roles as rewards and a leaderboard.</>,
              <>A daily question of the day, birthday wishes with a birthday role, and a daily check-in streak.</>,
              <>A starboard for the best messages, a counting game, giveaways and reaction roles.</>,
              <>Welcome messages and a role for every newcomer.</>,
            ]}
          />
        </>
      }
      visual={
        <div className="rounded-2xl bg-bg-card p-2">
          <p className="px-3 pb-2 pt-2.5 text-xs font-semibold uppercase tracking-[0.085em] text-text-faint">Leaderboard</p>
          <ul className="space-y-1">
            {board.map((m, i) => (
              <li key={m.name} className="flex items-center gap-3 rounded-xl bg-bg-input px-3 py-2.5">
                <span className="w-4 text-center text-sm tabular-nums text-text-faint">{i + 1}</span>
                <Avatar name={m.name} tone={m.tone} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-text-primary">{m.name}</span>
                    <span className="text-xs text-text-faint">level {m.lvl}</span>
                  </div>
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-bg-elevated">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${m.pct}%` }} />
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      }
    />
  );
}

// ── Everything else, as an index ────────────────────────────────────────────

const EVERYTHING: { group: string; items: [string, string, string][] }[] = [
  {
    group: 'Automation',
    items: [
      ['Custom commands', 'Your own commands that reply with text you write.', '!yourcommand'],
      ['Keywords', 'Reply automatically when someone says a phrase.', 'keyword add'],
      ['Auto-react', 'React to every message in a channel.', 'autoreact add'],
      ['Schedules', 'Post messages on a schedule.', 'schedule add'],
    ],
  },
  {
    group: 'Alerts',
    items: [
      ['Twitch', 'Post when a streamer goes live.', 'twitch follow'],
      ['YouTube', 'Post when a channel uploads.', 'youtube follow'],
      ['Reddit', 'Post new posts from a subreddit.', 'reddit follow'],
    ],
  },
  {
    group: 'Utilities',
    items: [
      ['Stat counters', 'Channel names that show member counts.', 'statcounter add'],
      ['Temp channels', 'Channels that delete themselves when time is up.', 'tempchannel'],
      ['Polls & suggestions', 'Quick polls and a suggestions channel.', 'poll · suggest'],
      ['Reminders & AFK', 'Remind me later; tell people you’re away.', 'remind · afk'],
    ],
  },
];

function EverythingElse(): JSX.Element {
  return (
    <section className={`${wrap} py-16 md:py-24`}>
      <Eyebrow>And the rest</Eyebrow>
      <H2>Everything else, already in the box.</H2>
      <div className="mt-10 grid gap-8 md:grid-cols-3">
        {EVERYTHING.map((g) => (
          <div key={g.group}>
            <p className="mb-3 text-sm font-semibold text-text-primary">{g.group}</p>
            <ul className="divide-y divide-[var(--border-subtle)] rounded-2xl bg-bg-card">
              {g.items.map(([name, what, cmd]) => (
                <li key={name} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-text-primary">{name}</span>
                    <span className="shrink-0 font-mono text-[11.5px] text-text-faint">{cmd}</span>
                  </div>
                  <p className="mt-0.5 text-[13px] leading-5 text-text-muted">{what}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-8 text-sm text-text-muted">
        Every command is listed with <Cmd>!help</Cmd>, and in the{' '}
        <Link href="/docs" className="text-text-primary underline decoration-text-faint underline-offset-[3px] hover:decoration-text-primary">
          docs
        </Link>
        .
      </p>
    </section>
  );
}

// ── How to add ──────────────────────────────────────────────────────────────

function HowToAdd(): JSX.Element {
  const steps: [string, React.ReactNode][] = [
    ['Add it in Echoed', <>Open your server, then <b className="font-semibold text-text-primary">Server Settings → Bots</b>, and add Panda. You need the Manage Server permission.</>],
    ['Log in here', <>Log in to this dashboard with your Echoed account. Servers you own where Panda is in show up straight away.</>],
    ['Switch on what you want', <>Pick your server and turn features on — or type <Cmd>!setup</Cmd> in chat and Panda sets up daily questions, a starboard, counting and birthdays for you.</>],
  ];
  return (
    <section id="add" className={`${wrap} scroll-mt-20 py-16 md:py-24`}>
      <Eyebrow>Get started</Eyebrow>
      <H2>Three steps, two minutes.</H2>
      <ol className="mt-10 grid gap-3 md:grid-cols-3">
        {steps.map(([title, body], i) => (
          <li key={title} className="rounded-2xl bg-bg-card p-5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-bg-elevated font-display text-sm font-semibold text-text-primary">
              {i + 1}
            </span>
            <p className="mt-4 text-[17px] font-semibold text-text-primary">{title}</p>
            <p className="mt-1.5 text-[15px] leading-6 text-text-muted">{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function CloseBand(): JSX.Element {
  return (
    <section className={`${wrap} pb-8 pt-8`}>
      <div className="flex flex-col items-start gap-6 rounded-[20px] bg-accent px-6 py-10 md:flex-row md:items-center md:justify-between md:px-12 md:py-14">
        <div>
          <h2 className="max-w-[18ch] font-display text-[clamp(28px,3.6vw,44px)] font-semibold leading-[1.06] tracking-[-0.04em] text-white">
            Free. No premium tier. Ever.
          </h2>
          <p className="mt-3 max-w-[46ch] text-[16px] leading-6 text-white/85">
            Every feature on this page is in Panda for every server. The code is public on GitHub.
          </p>
        </div>
        <Link href="/dashboard" className="inline-flex h-12 shrink-0 items-center gap-2 rounded-[10px] bg-white px-5 text-[15px] font-semibold text-[#1a1d23] transition-opacity duration-100 hover:opacity-90">
          Open the dashboard
          <ArrowRight aria-hidden="true" size={18} />
        </Link>
      </div>
    </section>
  );
}
