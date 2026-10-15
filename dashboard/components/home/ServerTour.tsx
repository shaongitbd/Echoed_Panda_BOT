'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Compass, Hash, Plus } from 'lucide-react';
import { PandaMark } from '../PandaMark';

// The homepage's centrepiece: "Late Night Crew", the server echoed.gg shows
// on its own homepage (same cast, same avatars, same art) — where Panda is
// already in the member list. Every channel is one of Panda's jobs, shown
// the way it actually happens in chat. Panda's lines are its real messages
// (src/levels, src/welcome, src/counting, src/qotd, src/twitch,
// src/ai/autoModerate, src/ai/pandaCommand), not paraphrases.

type Cast = 'mika' | 'juno' | 'dev' | 'ollie' | 'ren' | 'sasha';

const CAST: Record<Cast, { name: string; color: string; role?: string }> = {
  mika: { name: 'Mika', color: '#c9a0ff', role: 'Owner' },
  juno: { name: 'Juno', color: '#8ab9e6', role: 'Mod' },
  dev: { name: 'Dev', color: '#f0a07a' },
  ollie: { name: 'Ollie', color: '#7ad1a1' },
  ren: { name: 'Ren', color: '#86d68f' },
  sasha: { name: 'Sasha', color: '#f08a8c' },
};

// ── Message pieces ──────────────────────────────────────────────────────────

function Who({ cast, time, children }: { cast: Cast; time: string; children: React.ReactNode }): JSX.Element {
  const c = CAST[cast];
  return (
    <div className="flex gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/home/av-${cast}.jpg`} alt="" width={38} height={38} className="h-[38px] w-[38px] shrink-0 rounded-xl" />
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold" style={{ color: c.color }}>{c.name}</span>
          <span className="text-xs text-text-faint">{time}</span>
        </div>
        <div className="text-[15px] leading-6 text-text-secondary">{children}</div>
      </div>
    </div>
  );
}

function Stranger({ name, tone, time, children }: { name: string; tone: string; time: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex gap-3">
      <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-white" style={{ background: tone }}>
        {name.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold text-text-primary">{name}</span>
          <span className="text-xs text-text-faint">{time}</span>
        </div>
        <div className="text-[15px] leading-6 text-text-secondary">{children}</div>
      </div>
    </div>
  );
}

function Panda({ time, children }: { time: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="flex gap-3">
      <PandaMark size={38} className="shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-[15px] font-semibold text-text-primary">Panda</span>
          <span className="relative -top-px rounded-[3px] bg-[rgba(110,160,220,.13)] px-[5px] text-[11px] font-bold uppercase leading-4 tracking-[0.06em] text-[#8ab9e6]">Bot</span>
          <span className="text-xs text-text-faint">{time}</span>
        </div>
        <div className="text-[15px] leading-6 text-text-secondary">{children}</div>
      </div>
    </div>
  );
}

function Mention({ children }: { children: React.ReactNode }): JSX.Element {
  return <span className="text-accent-text">@{children}</span>;
}

/** An embed, as Echoed draws one: a plate with a coloured edge. */
function Embed({ color = 'var(--accent)', title, children }: { color?: string; title?: React.ReactNode; children: React.ReactNode }): JSX.Element {
  return (
    <div className="relative mt-1.5 max-w-[440px] overflow-hidden rounded-xl bg-bg-elevated py-3 pl-4 pr-4">
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px]" style={{ background: color }} />
      {title ? <p className="text-sm font-semibold text-text-primary">{title}</p> : null}
      <div className="mt-1 text-sm leading-[1.55] text-text-secondary">{children}</div>
    </div>
  );
}

function Reactions({ items }: { items: [string, number, boolean?][] }): JSX.Element {
  return (
    <div className="mt-1.5 flex gap-1.5">
      {items.map(([e, n, mine]) => (
        <span key={e} className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-sm ${mine ? 'bg-accent-muted text-accent-text' : 'bg-bg-elevated text-text-muted'}`}>
          {e} {n}
        </span>
      ))}
    </div>
  );
}

/** A mod-log post, line for line as src/mod/modlog.ts renders it. */
function ModlogEntry({ emoji, verb, target, n, extra, by, reason }: { emoji: string; verb: string; target: string; n: number; extra: string; by: string; reason: string }): JSX.Element {
  return (
    <>
      <p>{emoji} <b className="font-semibold text-text-primary">{verb}</b> <Mention>{target}</Mention> · Case #{n}</p>
      <p>{extra}</p>
      <p>Moderator: <Mention>{by}</Mention></p>
      <p>Reason: {reason}</p>
    </>
  );
}

/** A text bar, as the bot draws one (rank: █░, music: ▰▱), 20 cells. */
function TextBar({ fraction, on, off }: { fraction: number; on: string; off: string }): JSX.Element {
  const filled = Math.round(fraction * 20);
  return <span className="font-mono text-[13px] tracking-[-0.04em]">{on.repeat(filled)}{off.repeat(20 - filled)}</span>;
}

function Cmd({ children }: { children: React.ReactNode }): JSX.Element {
  return <span className="font-mono text-[13.5px] text-text-primary">{children}</span>;
}

// ── The channels ────────────────────────────────────────────────────────────

interface Channel {
  id: string;
  name: string;
  group: string;
  /** What this channel shows — the line under the channel name. */
  topic: string;
  body: () => JSX.Element;
}

const CHANNELS: Channel[] = [
  {
    id: 'general',
    name: 'general',
    group: 'Chat',
    topic: 'AI moderation — judged against this channel’s rules, on the server’s own OpenRouter key.',
    body: () => (
      <>
        <Who cast="ollie" time="9:41 PM">anyone up for a match after dinner?</Who>
        <Stranger name="kai_77" tone="#3a7d5c" time="9:42 PM">free nitro for the first 50 people → disc0rd-gift.store/claim</Stranger>
        <Panda time="9:42 PM">
          🛡️ <Mention>kai_77</Mention>, your message was removed: a scam link posing as a giveaway.
        </Panda>
        <Who cast="juno" time="9:43 PM">
          <span className="text-text-faint">↪ kai_77 · </span>
          <Cmd>!panda delete everything this guy posted today and time him out for a day</Cmd>
        </Who>
        <Panda time="9:43 PM">
          <Embed color="var(--status-warning)" title="Confirm moderation">
            <p><b className="font-semibold text-text-primary">You asked:</b> delete kai_77&apos;s messages from today and time them out for a day.</p>
            <p className="mt-2 font-semibold text-text-primary">I&apos;ll do this:</p>
            <p>• Delete <b className="font-semibold text-text-primary">6</b> messages from <b className="font-semibold text-text-primary">kai_77</b> in this channel</p>
            <p>• Time out <b className="font-semibold text-text-primary">kai_77</b> for 1d — posting scam links</p>
            <p className="mt-2 text-xs text-text-faint">React ✅ to run it or ❌ to cancel. Only Juno can confirm; this expires in 2 minutes.</p>
          </Embed>
          <Reactions items={[['✅', 1, true], ['❌', 0]]} />
        </Panda>
      </>
    ),
  },
  {
    id: 'mod-log',
    name: 'mod-log',
    group: 'Chat',
    topic: 'Every moderation action becomes a numbered case — who, what, and why.',
    body: () => (
      <>
        <Panda time="9:42 PM">
          <ModlogEntry emoji="🧹" verb="Purged messages by" target="kai_77" n={211} extra="1 message" by="Panda" reason="[AI] A scam link posing as a giveaway" />
        </Panda>
        <Panda time="9:43 PM">
          <ModlogEntry emoji="🧹" verb="Purged messages by" target="kai_77" n={212} extra="6 messages" by="Juno" reason="Posting scam links" />
        </Panda>
        <Panda time="9:43 PM">
          <ModlogEntry emoji="🔇" verb="Timed out" target="kai_77" n={213} extra="Duration: 1d" by="Juno" reason="Posting scam links" />
        </Panda>
        <Who cast="mika" time="9:50 PM"><Cmd>!escalation add 3 timeout 1h</Cmd></Who>
        <Panda time="9:50 PM">Escalation set: 3 warnings → time out for 1h.</Panda>
      </>
    ),
  },
  {
    id: 'welcome',
    name: 'welcome',
    group: 'Chat',
    topic: 'Welcome messages and a role for every newcomer.',
    body: () => (
      <>
        <Panda time="8:02 PM">Welcome to <b className="font-semibold text-text-primary">Late Night Crew</b>, <Mention>Bea</Mention>! You&apos;re member #24.</Panda>
        <Who cast="mika" time="8:03 PM">heyyy bea!! grab a role in #roles and come say hi in general</Who>
        <Who cast="sasha" time="8:03 PM">welcome 🌙</Who>
      </>
    ),
  },
  {
    id: 'music',
    name: 'music',
    group: 'Hangout',
    topic: 'Music in voice — YouTube, SoundCloud or a link, in stereo, every song at the same loudness.',
    body: () => (
      <>
        <Who cast="dev" time="10:12 PM"><Cmd>!play summertime sadness</Cmd></Who>
        <Panda time="10:12 PM">
          <Embed title="🎵 Now playing">
            <p className="font-semibold text-text-primary">Summertime Sadness</p>
            <p>by Lana Del Rey</p>
            <p className="mt-2"><TextBar fraction={0.38} on="▰" off="▱" /></p>
            <p>1:41 / 4:25</p>
            <p className="mt-1.5 text-xs text-text-faint">Requested by Dev · vol: 100% · +1 queued</p>
          </Embed>
        </Panda>
        <Who cast="ren" time="10:13 PM"><Cmd>!play https://soundcloud.com/…</Cmd></Who>
        <Panda time="10:13 PM">
          <Embed title="+ Queued (#2)">
            <p className="font-semibold text-text-primary">lofi rain mix</p>
            <p>by nightcafe · 58:10</p>
            <p className="mt-1.5 text-xs text-text-faint">Requested by Ren</p>
          </Embed>
        </Panda>
      </>
    ),
  },
  {
    id: 'levels',
    name: 'levels',
    group: 'Community',
    topic: 'XP for chatting, level-up messages and roles as rewards.',
    body: () => (
      <>
        <Panda time="9:58 PM">🎉 GG <Mention>Ollie</Mention>! You just hit <b className="font-semibold text-text-primary">level 12</b>.</Panda>
        <Who cast="ollie" time="9:58 PM">LETS GO</Who>
        <Who cast="ren" time="9:59 PM"><Cmd>!rank</Cmd></Who>
        <Panda time="9:59 PM">
          <Embed title="Rank">
            <p className="font-semibold text-text-primary">Ren</p>
            <p><TextBar fraction={0.64} on="█" off="░" /> 640 / 1,000 XP</p>
            <div className="mt-2 flex gap-8">
              <p><span className="block text-xs font-semibold text-text-primary">Level</span><b className="font-semibold text-text-primary">9</b></p>
              <p><span className="block text-xs font-semibold text-text-primary">Total XP</span>4,890</p>
              <p><span className="block text-xs font-semibold text-text-primary">Rank</span>#3</p>
            </div>
            <p className="mt-1.5 text-xs text-text-faint">360 XP to level 10</p>
          </Embed>
        </Panda>
      </>
    ),
  },
  {
    id: 'starboard',
    name: 'starboard',
    group: 'Community',
    topic: 'A message gets enough ⭐ and Panda reposts it here.',
    body: () => (
      <>
        <Panda time="11:20 PM">
          <Embed title="⭐ 5">
            <p>the factory must grow dev</p>
            <div className="mt-2 flex gap-8">
              <p><span className="block text-xs font-semibold text-text-primary">Posted by</span>Mika</p>
              <p><span className="block text-xs font-semibold text-text-primary">Channel</span>question-of-the-day</p>
            </div>
          </Embed>
        </Panda>
        <Panda time="11:41 PM">
          <Embed title="⭐ 7">
            <p>i will never live this down</p>
            <div className="mt-2 flex gap-8">
              <p><span className="block text-xs font-semibold text-text-primary">Posted by</span>Ollie</p>
              <p><span className="block text-xs font-semibold text-text-primary">Channel</span>counting</p>
            </div>
          </Embed>
        </Panda>
      </>
    ),
  },
  {
    id: 'question-of-the-day',
    name: 'question-of-the-day',
    group: 'Community',
    topic: 'One conversation starter a day — the server’s own questions first.',
    body: () => (
      <>
        <Panda time="12:00 PM">
          <Embed title="💬 Question of the Day">What game have you sunk the most hours into, and zero regrets?</Embed>
        </Panda>
        <Who cast="juno" time="12:04 PM">stardew. 400 hours. no regrets</Who>
        <Who cast="dev" time="12:07 PM">factorio and i am not okay</Who>
        <Who cast="mika" time="12:09 PM">the factory must grow dev</Who>
      </>
    ),
  },
  {
    id: 'counting',
    name: 'counting',
    group: 'Community',
    topic: 'Count up together — one number each, nobody twice in a row.',
    body: () => (
      <>
        <Who cast="ren" time="11:01 PM">147<Reactions items={[['✅', 1]]} /></Who>
        <Who cast="sasha" time="11:01 PM">148<Reactions items={[['🏆', 1]]} /></Who>
        <Who cast="ollie" time="11:02 PM">150<Reactions items={[['❌', 1]]} /></Who>
        <Panda time="11:02 PM">
          ❌ <Mention>Ollie</Mention> broke the chain at <b className="font-semibold text-text-primary">148</b> — <b className="font-semibold text-text-primary">150</b> wasn&apos;t right — it was <b className="font-semibold text-text-primary">149</b>. Next number is <b className="font-semibold text-text-primary">1</b>.
        </Panda>
        <Who cast="ollie" time="11:02 PM">i will never live this down</Who>
      </>
    ),
  },
  {
    id: 'birthdays',
    name: 'birthdays',
    group: 'Community',
    topic: 'Birthday wishes on the day, with a birthday role for 24 hours.',
    body: () => (
      <>
        <Panda time="9:00 AM">
          🎂 Happy birthday <Mention>Sasha</Mention>! Hope it&apos;s a great one. 🎉
          <Reactions items={[['🎉', 6], ['🎂', 4]]} />
        </Panda>
        <Who cast="sasha" time="9:31 AM">you guys 🥹</Who>
      </>
    ),
  },
  {
    id: 'announcements',
    name: 'announcements',
    group: 'Alerts',
    topic: 'Twitch, YouTube and Reddit alerts, and messages on a schedule.',
    body: () => (
      <>
        <Panda time="8:00 PM">
          <p>🔴 <b className="font-semibold text-text-primary">juno_plays</b> is live on Twitch!</p>
          <p><b className="font-semibold text-text-primary">ranked grind until i hit diamond (or cry)</b></p>
          <p>Playing: Valorant</p>
          <p className="text-[#8ab9e6]">https://twitch.tv/juno_plays</p>
        </Panda>
        <Panda time="Fri 6:00 PM">🍿 Movie night is Saturday at 9 — vote for the film in #general.</Panda>
      </>
    ),
  },
];

const GROUP_ORDER = ['Chat', 'Hangout', 'Community', 'Alerts'];

// ── The window ──────────────────────────────────────────────────────────────

export function ServerTour(): JSX.Element {
  const [active, setActive] = useState(CHANNELS[0]!.id);
  // Channels not opened yet carry the unread dot — what there is to see.
  const [seen, setSeen] = useState<Set<string>>(() => new Set([CHANNELS[0]!.id]));
  const channel = CHANNELS.find((c) => c.id === active) ?? CHANNELS[0]!;
  // Open each channel at its newest message, as a chat does.
  const scroller = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [active]);

  const open = (id: string) => {
    setActive(id);
    setSeen((s) => new Set(s).add(id));
  };

  return (
    <div className="overflow-hidden rounded-2xl bg-bg-base ring-1 ring-black/40">
      <div className="flex h-[640px] max-h-[82vh]">
        {/* Server rail */}
        <div className="hidden w-16 shrink-0 flex-col items-center gap-2.5 bg-bg-base py-3 lg:flex">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-accent font-display text-lg font-bold text-white">e</span>
          <span className="relative">
            <span aria-hidden="true" className="absolute -left-3 top-2 h-7 w-1 rounded-r bg-text-primary" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/home/art-night-wide.jpg" alt="Late Night Crew" className="h-11 w-11 rounded-xl object-cover" />
          </span>
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-bg-card text-sm font-semibold text-text-muted">PP</span>
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-bg-card text-text-muted"><Plus aria-hidden="true" size={18} /></span>
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-bg-card text-text-muted"><Compass aria-hidden="true" size={18} /></span>
        </div>

        {/* Channel list */}
        <nav aria-label="Channels in Late Night Crew" className="hidden w-60 shrink-0 flex-col bg-bg-input md:flex">
          <div className="relative h-24 shrink-0 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/home/art-night-wide.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_35%]" />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[rgba(19,21,26,.9)]" />
            <div className="absolute bottom-2.5 left-3.5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.085em] text-white/75">Private · 24 members</p>
              <p className="text-[15px] font-semibold text-white">Late Night Crew</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {GROUP_ORDER.map((g) => (
              <div key={g} className="mb-3">
                <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-[0.085em] text-text-faint">{g}</p>
                {CHANNELS.filter((c) => c.group === g).map((c) => {
                  const isActive = c.id === active;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => open(c.id)}
                      aria-current={isActive ? 'true' : undefined}
                      className={`relative flex h-8 w-full items-center gap-1.5 rounded-lg px-2 text-left text-[15px] transition-colors duration-100 ${
                        isActive ? 'bg-bg-elevated font-medium text-text-primary' : 'text-text-muted hover:bg-bg-card hover:text-text-secondary'
                      }`}
                    >
                      <Hash aria-hidden="true" size={16} className="shrink-0 text-text-faint" />
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      {!seen.has(c.id) ? <span aria-label="new" className="h-2 w-2 shrink-0 rounded-full bg-text-primary" /> : null}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </nav>

        {/* Chat */}
        <div className="flex min-w-0 flex-1 flex-col bg-bg-card">
          {/* Phones: the channels as a strip above the chat. */}
          <div className="flex gap-1.5 overflow-x-auto bg-bg-input px-3 py-2.5 [scrollbar-width:none] md:hidden [&::-webkit-scrollbar]:hidden">
            {CHANNELS.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => open(c.id)}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-sm ${c.id === active ? 'bg-bg-elevated text-text-primary' : 'text-text-muted'}`}
              >
                #{c.name}
              </button>
            ))}
          </div>
          <div className="flex h-12 shrink-0 items-center gap-2 px-4">
            <Hash aria-hidden="true" size={18} className="shrink-0 text-text-faint" />
            <span className="shrink-0 font-display text-[15px] font-semibold tracking-[-0.02em] text-text-primary">{channel.name}</span>
            <span className="hidden truncate border-l border-[var(--border-subtle)] pl-3 text-sm text-text-muted sm:inline">{channel.topic}</span>
          </div>
          {/* Pinned to the bottom like a real chat, with mt-auto rather than
              justify-end — justify-end makes the overflowing top unscrollable. */}
          <div ref={scroller} className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 pb-4 pt-2">
            <div key={channel.id} className="mt-auto flex flex-col gap-5 motion-safe:animate-[tourIn_160ms_ease-out]">
              <p className="text-sm text-text-muted sm:hidden">{channel.topic}</p>
              {channel.body()}
            </div>
          </div>
          <div className="shrink-0 px-4 pb-4">
            <div className="flex min-h-[44px] items-center gap-3 rounded-xl bg-bg-elevated px-4 py-2 text-sm text-text-faint">
              <span className="flex-1">You&apos;re looking around Late Night Crew. Panda does all of this in your server too.</span>
              <Link href="#add" className="shrink-0 font-semibold text-text-primary hover:underline">Add Panda</Link>
            </div>
          </div>
        </div>

        {/* Members */}
        <aside aria-label="Members" className="hidden w-56 shrink-0 bg-bg-input px-3 py-4 xl:block">
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.085em] text-text-faint">Online — 6</p>
          <ul className="space-y-1">
            {(Object.keys(CAST) as Cast[]).map((k) => (
              <li key={k} className="flex items-center gap-2.5 rounded-lg px-1 py-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/home/av-${k}.jpg`} alt="" width={30} height={30} className="h-[30px] w-[30px] rounded-[10px]" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium" style={{ color: CAST[k].color }}>{CAST[k].name}</span>
                  {CAST[k].role ? <span className="block text-[11px] text-text-faint">{CAST[k].role}</span> : null}
                </span>
              </li>
            ))}
          </ul>
          <p className="mb-2 mt-5 px-1 text-[11px] font-semibold uppercase tracking-[0.085em] text-text-faint">Bots — 1</p>
          <div className="flex items-center gap-2.5 rounded-lg bg-bg-card px-1.5 py-1.5">
            <PandaMark size={30} className="shrink-0 rounded-[10px]" />
            <span className="min-w-0">
              <span className="block text-sm font-medium text-text-primary">Panda</span>
              <span className="block text-[11px] text-text-faint">Watching 24 members</span>
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
