import Link from 'next/link';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';

// ─── /docs ──────────────────────────────────────────────────────────
//
// Written for the non-technical server owner. Plain English, no
// jargon, no "see official documentation" cop-outs. Every feature
// lives on this one page so the reader can ⌘F to find anything.
//
// Layout: sticky table-of-contents on the left (desktop), flow on
// the right. Mobile drops the TOC and stacks linearly.
//
// Tone rules I held myself to while writing this:
//   • Address the reader directly. "You" not "users".
//   • Lead with what something does. Setup details follow.
//   • One step per numbered item. Never combine two clicks into one
//     sentence — that loses people.
//   • Show the *exact* button name the user will see, not paraphrases.
//   • Don't say "easily" or "just" — those words shame the reader
//     when something turns out to be hard.

export const metadata = {
  title: 'Docs — Panda',
  description:
    'Every feature, every command, step-by-step setup. Written for server owners — no Discord-bot jargon required.',
};

// ─── Section structure ──────────────────────────────────────────────

interface Section {
  id: string;
  title: string;
  group: 'Setup' | 'Community' | 'Automation' | 'Server health' | 'Outside reach';
}

const SECTIONS: Section[] = [
  { id: 'quick-start',     title: 'Quick start',         group: 'Setup' },
  { id: 'inviting',        title: 'Inviting Panda',      group: 'Setup' },
  { id: 'dashboard',       title: 'Using the dashboard', group: 'Setup' },
  { id: 'permissions',     title: 'Permissions & roles', group: 'Setup' },

  { id: 'music',           title: 'Music',               group: 'Community' },
  { id: 'levels',          title: 'Levels & XP',         group: 'Community' },
  { id: 'welcome',         title: 'Welcome messages',    group: 'Community' },
  { id: 'reaction-roles',  title: 'Reaction roles',      group: 'Community' },
  { id: 'giveaways',       title: 'Giveaways',           group: 'Community' },

  { id: 'auto-mod',        title: 'Auto-mod filters',    group: 'Automation' },
  { id: 'auto-react',      title: 'Auto-react',          group: 'Automation' },
  { id: 'custom-commands', title: 'Custom commands',     group: 'Automation' },
  { id: 'schedules',       title: 'Scheduled messages',  group: 'Automation' },
  { id: 'keywords',        title: 'Keyword alerts',      group: 'Automation' },

  { id: 'moderation',      title: 'Moderation',          group: 'Server health' },
  { id: 'anti-raid',       title: 'Anti-raid',           group: 'Server health' },
  { id: 'stat-counters',   title: 'Stat counters',       group: 'Server health' },

  { id: 'social-alerts',   title: 'Social alerts',       group: 'Outside reach' },

  { id: 'troubleshooting', title: 'Troubleshooting',     group: 'Setup' },
];

// ═══════════════════════════════════════════════════════════════════
// Page
// ═══════════════════════════════════════════════════════════════════

export default function DocsPage(): JSX.Element {
  return (
    <>
      <Header />
      <main className="bg-bg-base">
        <DocsHero />

        <div className="mx-auto max-w-6xl px-6 py-14 md:py-20">
          <div className="grid grid-cols-1 gap-12 lg:grid-cols-[240px_1fr] lg:gap-16">
            <TableOfContents />
            <div className="min-w-0 space-y-20">
              <QuickStart />
              <Inviting />
              <DashboardUsage />
              <Permissions />

              <Music />
              <Levels />
              <Welcome />
              <ReactionRoles />
              <Giveaways />

              <AutoMod />
              <AutoReact />
              <CustomCommands />
              <Schedules />
              <Keywords />

              <Moderation />
              <AntiRaid />
              <StatCounters />

              <SocialAlerts />

              <Troubleshooting />
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

// ─── Hero ───────────────────────────────────────────────────────────

function DocsHero(): JSX.Element {
  return (
    <section className="border-b border-[var(--border-subtle)]">
      <div className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        <p className="font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-text-muted">
          Documentation · v1
        </p>
        <h1 className="mt-3 max-w-3xl font-sans text-[clamp(36px,5vw,60px)] font-black leading-[0.98] tracking-[-0.03em] text-text-primary">
          How to do <span className="text-accent">everything</span> with Panda.
        </h1>
        <p className="mt-5 max-w-xl text-[15.5px] font-medium leading-relaxed text-text-secondary">
          One page, every feature, written for owners — not Discord-bot
          veterans. If a step assumes you already know something,
          that's a bug — open an issue and we'll fix it.
        </p>

        <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-[12.5px] font-medium text-text-muted">
          <span><span className="font-bold text-text-secondary">Reading time:</span> ~12 min total</span>
          <span className="text-text-muted/60">·</span>
          <span><span className="font-bold text-text-secondary">Find a feature:</span> use ⌘F</span>
          <span className="text-text-muted/60">·</span>
          <span><span className="font-bold text-text-secondary">Stuck?</span>{' '}
            <Link href="https://github.com/shaongitbd/panda/issues" className="text-text-secondary underline underline-offset-2 hover:text-text-primary">file an issue</Link>
          </span>
        </div>
      </div>
    </section>
  );
}

// ─── Table of contents ──────────────────────────────────────────────

function TableOfContents(): JSX.Element {
  const groups = SECTIONS.reduce<Record<string, Section[]>>((acc, s) => {
    if (!acc[s.group]) acc[s.group] = [];
    acc[s.group]!.push(s);
    return acc;
  }, {});

  return (
    <aside className="lg:sticky lg:top-24 lg:self-start">
      <p className="font-mono text-[10.5px] font-black uppercase tracking-[0.18em] text-text-muted">
        Contents
      </p>
      <div className="mt-4 space-y-6 text-[13px]">
        {(Object.keys(groups) as (keyof typeof groups)[]).map((group) => (
          <div key={group}>
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-text-secondary">
              {group}
            </p>
            <ul className="mt-2 space-y-1.5">
              {groups[group]!.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`#${s.id}`}
                    className="text-text-muted transition-colors duration-150 hover:text-text-primary"
                  >
                    {s.title}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Section primitives
// ═══════════════════════════════════════════════════════════════════

function H2({ id, kicker, children }: { id: string; kicker?: string; children: React.ReactNode }): JSX.Element {
  return (
    <header className="mb-6 scroll-mt-24" id={id}>
      {kicker && (
        <p className="mb-2 font-mono text-[11px] font-black uppercase tracking-[0.18em] text-text-muted">
          {kicker}
        </p>
      )}
      <h2 className="font-sans text-[clamp(28px,3.4vw,40px)] font-black leading-[1.05] tracking-[-0.02em] text-text-primary">
        {children}
      </h2>
    </header>
  );
}

function P({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <p className="mt-4 max-w-prose text-[15px] font-medium leading-[1.65] text-text-secondary">
      {children}
    </p>
  );
}

function Steps({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <ol className="mt-5 max-w-prose list-decimal space-y-2.5 pl-5 text-[14.5px] font-medium leading-[1.65] text-text-secondary marker:font-black marker:text-accent">
      {children}
    </ol>
  );
}

function HeadsUp({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="mt-5 max-w-prose rounded border-l-2 border-status-warning bg-bg-card px-5 py-4">
      <p className="font-mono text-[10.5px] font-black uppercase tracking-[0.18em] text-status-warning">
        Heads up
      </p>
      <p className="mt-2 text-[14px] font-medium leading-[1.6] text-text-secondary">
        {children}
      </p>
    </div>
  );
}

function Cmd({ cmd, desc }: { cmd: string; desc: string }): JSX.Element {
  return (
    <li className="grid grid-cols-1 items-baseline gap-x-6 gap-y-1 py-2.5 sm:grid-cols-[260px_1fr]">
      <code className="font-mono text-[13px] font-bold text-accent">{cmd}</code>
      <span className="text-[13.5px] font-medium leading-snug text-text-secondary">{desc}</span>
    </li>
  );
}

function Commands({ children }: { children: React.ReactNode }): JSX.Element {
  return (
    <div className="mt-6 max-w-prose">
      <p className="font-mono text-[10.5px] font-black uppercase tracking-[0.18em] text-text-muted">
        Commands
      </p>
      <ul className="mt-2 divide-y divide-[var(--border-subtle)] border-y border-[var(--border-subtle)]">
        {children}
      </ul>
    </div>
  );
}

function DashboardLink(): JSX.Element {
  return (
    <Link href="/dashboard" className="font-bold text-text-primary underline underline-offset-2 hover:text-accent">
      dashboard
    </Link>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sections
// ═══════════════════════════════════════════════════════════════════

function QuickStart(): JSX.Element {
  return (
    <section>
      <H2 id="quick-start" kicker="Setup · 2 min">If you've never set up a bot before</H2>
      <P>
        Panda doesn't have a one-click invite URL — you add it from
        inside Echoed, the way you'd add any other bot, then come
        here to configure it. These five steps get you live with
        sensible defaults.
      </P>
      <Steps>
        <li>In Echoed, open the server you want Panda in. Click the server name at the top of the channel list, then <strong>Server Settings</strong>.</li>
        <li>Click the <strong>Bots</strong> tab. You'll see this tab only if you have <strong>Manage Server</strong> permission — if you don't, ask your server owner to add Panda for you.</li>
        <li>Find <strong>Panda</strong> in the list of available bots and click <strong>Add</strong>. Echoed shows you what permissions Panda is requesting — review them and confirm. Panda appears in your member list immediately.</li>
        <li>Come back to this site (<Link href="/" className="font-bold text-text-primary underline underline-offset-2 hover:text-accent">memebot.echoed.gg</Link>) and click <strong>Login with Echoed</strong> in the top right.</li>
        <li>Pick your server from the sidebar. The first time you land, Panda's already running with sensible defaults — type <code className="font-mono text-[13px] font-bold text-accent">!ping</code> in any text channel to confirm it's responding.</li>
      </Steps>
      <P>
        That's it. Everything else on this page is fine-tuning.
      </P>
    </section>
  );
}

function Inviting(): JSX.Element {
  return (
    <section>
      <H2 id="inviting">Inviting Panda to a server</H2>
      <P>
        You add Panda from inside Echoed — there's no separate invite
        URL or OAuth popup. The full flow is below. You'll need{' '}
        <strong>Manage Server</strong> permission on the server.
        If you don't, ask the owner to add it for you.
      </P>
      <Steps>
        <li>Open Echoed and go to the server you want Panda in.</li>
        <li>Click the server name at the very top of the channel list — a menu drops down.</li>
        <li>Pick <strong>Server Settings</strong>. The settings panel opens.</li>
        <li>In the settings sidebar, click the <strong>Bots</strong> tab. (If you don't see this tab, you don't have Manage Server permission — see the heads-up below.)</li>
        <li>Browse the available bots, find <strong>Panda</strong>, and click <strong>Add</strong>.</li>
        <li>Echoed shows you what permissions Panda needs. Read them — you can untick anything you don't want, but some features will stop working without their permissions (e.g. untick <strong>Manage Roles</strong> and reaction roles + level rewards stop working).</li>
        <li>Confirm. Panda joins your server within a second or two and shows up in the member list.</li>
        <li>To configure Panda, come to <Link href="/" className="font-bold text-text-primary underline underline-offset-2 hover:text-accent">memebot.echoed.gg</Link> and click <strong>Login with Echoed</strong>. Your server appears in the dashboard sidebar.</li>
      </Steps>
      <HeadsUp>
        Don't have Manage Server permission? You can still configure
        Panda's settings via this dashboard if your server owner
        grants you a role with <strong>Manage Server</strong> later.
        Without it, you can't add the bot in the first place.
      </HeadsUp>
      <HeadsUp>
        Removing Panda works the same way — go back to{' '}
        <strong>Server Settings → Bots</strong> in Echoed and click{' '}
        <strong>Remove</strong> next to Panda. Your saved
        configuration stays available for 30 days in case you re-add
        it.
      </HeadsUp>
    </section>
  );
}

function DashboardUsage(): JSX.Element {
  return (
    <section>
      <H2 id="dashboard">Finding your way around the dashboard</H2>
      <P>
        Every feature has a dedicated page. The sidebar on the left
        lists them all; the main panel shows whichever one you've
        clicked. Whatever changes you make are{' '}
        <strong>not saved until you press Save</strong> at the bottom
        of the page — you'll see a yellow bar appear once you've
        edited anything.
      </P>
      <P>
        If you switch pages with unsaved changes, the dashboard warns
        you before discarding them. Press <strong>Discard</strong> to
        throw them away or <strong>Stay</strong> to go back.
      </P>
      <HeadsUp>
        Saved settings apply within a few seconds. If you've just
        changed something and chat doesn't reflect it, give it 10
        seconds before assuming it's broken.
      </HeadsUp>
    </section>
  );
}

function Permissions(): JSX.Element {
  return (
    <section>
      <H2 id="permissions">Permissions & roles</H2>
      <P>
        Most features can be restricted to specific roles or
        channels. The pattern is the same everywhere in the
        dashboard:
      </P>
      <Steps>
        <li><strong>Allowed roles</strong> — only members with at least one of these roles can use the feature. Leave empty to allow everyone.</li>
        <li><strong>Ignored roles</strong> — members with any of these roles are blocked from the feature, even if they're in <strong>Allowed roles</strong>. Useful for muting bots from earning XP.</li>
        <li><strong>Allowed channels</strong> — the feature only fires in these channels. Leave empty to allow everywhere.</li>
        <li><strong>Ignored channels</strong> — the feature is suppressed in these channels. Useful for excluding spam channels from XP or auto-mod.</li>
      </Steps>
      <P>
        Ignored always wins over Allowed. So if you put
        <strong> @bots</strong> in Ignored roles, members with that
        role never trigger the feature, even if they have other roles
        in Allowed.
      </P>
    </section>
  );
}

// ─── Community ──────────────────────────────────────────────────────

function Music(): JSX.Element {
  return (
    <section>
      <H2 id="music" kicker="Community">Music</H2>
      <P>
        Panda plays YouTube and SoundCloud audio in any voice channel.
        It joins the channel you're in when you run{' '}
        <code className="font-mono text-[13px] font-bold text-accent">!play</code>
        , so you don't have to specify one.
      </P>
      <P>
        <strong>DJ role:</strong> if you set a DJ role on the
        dashboard, only members with that role can skip, pause, stop,
        or change the volume. Everyone can still queue songs and use
        <code className="font-mono text-[13px] font-bold text-accent"> !rank</code>
        -style lookup commands.
      </P>
      <Steps>
        <li>Open the <DashboardLink /> → <strong>Music</strong>.</li>
        <li><strong>DJ role</strong> — pick a role (or leave empty to let anyone control playback).</li>
        <li><strong>Default volume</strong> — 50 is a reasonable starting point; persists per server.</li>
        <li>Click <strong>Save</strong>.</li>
        <li>Join a voice channel and type <code className="font-mono text-[13px] font-bold text-accent">!play lofi study mix</code>. Panda joins, queues the result, and starts playing.</li>
      </Steps>
      <Commands>
        <Cmd cmd="!play <query or url>"   desc="Search and queue a track. Accepts plain text, YouTube URLs, SoundCloud URLs, or playlists." />
        <Cmd cmd="!skip"                  desc="Skip to the next track. DJ-role only if a DJ role is set." />
        <Cmd cmd="!queue"                 desc="Show the current queue with positions and durations." />
        <Cmd cmd="!nowplaying"            desc="Show the current track and progress." />
        <Cmd cmd="!volume <0-100>"        desc="Set playback volume. DJ-role only. Persists across restarts." />
        <Cmd cmd="!pause / !resume"       desc="Pause or resume the current track. DJ-role only." />
        <Cmd cmd="!stop"                  desc="Stop playback and clear the queue. DJ-role only." />
        <Cmd cmd="!loop track / queue / off" desc="Loop the current track, the entire queue, or stop looping." />
        <Cmd cmd="!shuffle"               desc="Shuffle the queue." />
        <Cmd cmd="!seek <time>"           desc="Jump to a position in the current track. Format: 1:30 or 90." />
        <Cmd cmd="!remove <position>"     desc="Remove the track at that queue position." />
      </Commands>
    </section>
  );
}

function Levels(): JSX.Element {
  return (
    <section>
      <H2 id="levels" kicker="Community">Levels & XP</H2>
      <P>
        Members earn XP for each message they send. As they level up
        you can grant them roles — that's how you build a "regulars"
        or "veteran" tier without manually assigning roles every
        time someone hangs around.
      </P>
      <P>
        Anti-spam decay is built in: once a member sends a message
        they have to wait 60 seconds before another message earns
        XP. Bots and ignored channels never earn XP.
      </P>
      <Steps>
        <li>Open the <DashboardLink /> → <strong>Levels</strong> and toggle <strong>Enabled</strong> on.</li>
        <li><strong>XP per message</strong> — defaults to 15-25 (random in that range). Lower numbers slow progression; higher speeds it up.</li>
        <li><strong>Ignored channels</strong> — add channels where messages shouldn't earn XP (spam, bot-commands, etc).</li>
        <li><strong>Role rewards</strong> — click <strong>Add reward</strong>. Pick a level (e.g. 5) and a role (e.g. <strong>@member</strong>). When someone hits level 5 they automatically get @member.</li>
        <li><strong>Stack roles</strong> — if on, members keep all reward roles they've earned. If off, they only have the highest one.</li>
        <li>Click <strong>Save</strong>.</li>
      </Steps>
      <Commands>
        <Cmd cmd="!rank"             desc="Show your XP, level, and how much you need for the next level." />
        <Cmd cmd="!rank @member"     desc="Show another member's rank." />
        <Cmd cmd="!leaderboard"      desc="Top 10 members in the server by XP." />
        <Cmd cmd="!setxp @user <n>"  desc="Override a member's XP. Manage Server only." />
        <Cmd cmd="!resetxp @user"    desc="Reset a member to 0 XP. Manage Server only." />
      </Commands>
    </section>
  );
}

function Welcome(): JSX.Element {
  return (
    <section>
      <H2 id="welcome" kicker="Community">Welcome messages</H2>
      <P>
        When a new member joins, Panda can post a greeting in any
        channel and optionally assign them a starter role.
      </P>
      <Steps>
        <li>Open the <DashboardLink /> → <strong>Welcome</strong> and toggle <strong>Enabled</strong> on.</li>
        <li><strong>Channel</strong> — pick where the welcome message should appear (usually <strong>#general</strong> or a dedicated <strong>#welcome</strong>).</li>
        <li><strong>Message</strong> — write the greeting. Use <code className="font-mono text-[13px] font-bold text-accent">{'{user}'}</code> to mention the new member, <code className="font-mono text-[13px] font-bold text-accent">{'{server}'}</code> for the server name, and <code className="font-mono text-[13px] font-bold text-accent">{'{count}'}</code> for total member count.</li>
        <li><strong>Auto-role</strong> (optional) — pick a role to assign new members automatically. Useful for verification gates.</li>
        <li>Click <strong>Save</strong>, then <strong>Test</strong> to see what the message looks like.</li>
      </Steps>
      <Commands>
        <Cmd cmd="!welcometest" desc="Trigger the welcome message as if you just joined." />
      </Commands>
    </section>
  );
}

function ReactionRoles(): JSX.Element {
  return (
    <section>
      <H2 id="reaction-roles" kicker="Community">Reaction roles</H2>
      <P>
        Members assign themselves roles by reacting to a message with
        a specific emoji. Common uses: pick your colour, opt into a
        ping role, choose a pronoun.
      </P>
      <Steps>
        <li>Post a message in your server explaining the choices (e.g. <em>"React with 🔴 for red, 🔵 for blue"</em>).</li>
        <li>Right-click that message and copy its message ID. (If your settings don't show "Copy ID", turn on <strong>Developer Mode</strong> in Echoed's user settings.)</li>
        <li>Open the <DashboardLink /> → <strong>Reaction Roles</strong> and click <strong>New panel</strong>.</li>
        <li>Paste the message ID, pick the channel, then add each emoji + role pair.</li>
        <li><strong>Mode</strong>:
          <em> Toggle</em> — react to add the role, react again to remove it.
          <em> Verify</em> — react once to add, can't unassign.
          <em> Pick one</em> — only one role from the panel at a time.
        </li>
        <li>Click <strong>Save</strong>. Panda adds its reactions to the message.</li>
      </Steps>
      <HeadsUp>
        Panda needs <strong>Manage Roles</strong> permission and the
        roles you're handing out must sit{' '}
        <em>below</em> Panda's role in the role list. If a role is
        above Panda, the assignment silently fails.
      </HeadsUp>
    </section>
  );
}

function Giveaways(): JSX.Element {
  return (
    <section>
      <H2 id="giveaways" kicker="Community">Giveaways</H2>
      <P>
        Run reaction-based giveaways with auto-pick winners,
        configurable duration, and entry requirements (minimum
        account age, required role, etc.).
      </P>
      <Steps>
        <li>Open the <DashboardLink /> → <strong>Giveaways</strong> and click <strong>New giveaway</strong>.</li>
        <li><strong>Channel</strong> — where the giveaway message will be posted.</li>
        <li><strong>Prize</strong> — short text describing what's being given away.</li>
        <li><strong>Duration</strong> — when the giveaway ends. Format: <code className="font-mono text-[13px] font-bold text-accent">3d</code> for 3 days, <code className="font-mono text-[13px] font-bold text-accent">12h</code> for 12 hours.</li>
        <li><strong>Winners</strong> — how many people win.</li>
        <li><strong>Requirements</strong> (optional) — required role, minimum account age in days, etc.</li>
        <li>Click <strong>Start</strong>. Panda posts the giveaway and members enter by reacting with 🎉.</li>
      </Steps>
      <Commands>
        <Cmd cmd="!giveaway start"       desc="Quick-start a giveaway from chat. Walks you through the prompts." />
        <Cmd cmd="!giveaway end <id>"    desc="End a running giveaway early and pick winners." />
        <Cmd cmd="!reroll <id>"          desc="Pick new winners for a finished giveaway. Useful if a winner doesn't claim." />
      </Commands>
    </section>
  );
}

// ─── Automation ─────────────────────────────────────────────────────

function AutoMod(): JSX.Element {
  return (
    <section>
      <H2 id="auto-mod" kicker="Automation">Auto-mod filters</H2>
      <P>
        Eight filters that watch every message and act when something
        crosses your threshold. Each one is independent — you can turn
        any on or off without affecting the others.
      </P>
      <P>
        The filters: <strong>spam</strong> (rapid messages),{' '}
        <strong>caps</strong> (high uppercase ratio),{' '}
        <strong>links</strong> (URLs),{' '}
        <strong>invites</strong> (Discord/Echoed invites),{' '}
        <strong>mass-mention</strong>,{' '}
        <strong>emoji-spam</strong>,{' '}
        <strong>zalgo</strong> (corrupted text),{' '}
        <strong>bad-words</strong> (your custom list).
      </P>
      <Steps>
        <li>Open the <DashboardLink /> → <strong>Auto-mod</strong>.</li>
        <li>For each filter you want active, toggle it on and set the threshold:
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li><strong>Spam:</strong> N messages within M seconds</li>
            <li><strong>Caps:</strong> percentage of uppercase letters in messages over X characters long</li>
            <li><strong>Bad-words:</strong> add your own list one per line; supports partial matches</li>
          </ul>
        </li>
        <li><strong>Action</strong> per filter: delete, warn, timeout, or kick. Choose what happens when the filter fires.</li>
        <li><strong>Exempt roles</strong> — moderators and trusted members. They never trigger filters.</li>
        <li>Click <strong>Save</strong>.</li>
      </Steps>
      <HeadsUp>
        Filter actions log to the audit channel you set under{' '}
        <strong>Moderation</strong> (see below). If you haven't set
        one, the actions still happen but you won't have a record —
        we strongly recommend setting an audit channel before turning
        auto-mod on.
      </HeadsUp>
    </section>
  );
}

function AutoReact(): JSX.Element {
  return (
    <section>
      <H2 id="auto-react" kicker="Automation">Auto-react</H2>
      <P>
        Panda adds reactions automatically to messages matching
        patterns you specify. Useful for: marking announcements with
        a starter set of reactions, adding 👀 to every message in
        #suggestions, etc.
      </P>
      <Steps>
        <li>Open the <DashboardLink /> → <strong>Auto-react</strong> and click <strong>New rule</strong>.</li>
        <li><strong>Match</strong> — choose <em>any message in channel</em> (always reacts) or <em>contains text</em> (matches a keyword).</li>
        <li><strong>Channel</strong> — restrict to one channel, or leave empty to apply server-wide.</li>
        <li><strong>Reactions</strong> — pick one or more emoji. Custom server emoji work.</li>
        <li>Click <strong>Save</strong>.</li>
      </Steps>
    </section>
  );
}

function CustomCommands(): JSX.Element {
  return (
    <section>
      <H2 id="custom-commands" kicker="Automation">Custom commands</H2>
      <P>
        Define your own <code className="font-mono text-[13px] font-bold text-accent">!commands</code> that send a fixed
        response. Common uses: server rules, FAQ replies, role-info
        cheatsheets, recurring jokes.
      </P>
      <Steps>
        <li>Open the <DashboardLink /> → <strong>Custom Commands</strong> and click <strong>New command</strong>.</li>
        <li><strong>Trigger</strong> — the command name without the <code>!</code>. E.g. <code className="font-mono text-[13px] font-bold text-accent">rules</code> means members run <code className="font-mono text-[13px] font-bold text-accent">!rules</code>.</li>
        <li><strong>Response</strong> — what Panda replies. Use <code className="font-mono text-[13px] font-bold text-accent">{'{user}'}</code>, <code className="font-mono text-[13px] font-bold text-accent">{'{server}'}</code>, <code className="font-mono text-[13px] font-bold text-accent">{'{args}'}</code> placeholders.</li>
        <li><strong>Restrictions</strong> (optional) — limit to specific channels or roles.</li>
        <li><strong>Cooldown</strong> (optional) — minimum seconds between uses, per member.</li>
        <li>Click <strong>Save</strong>. The command works immediately.</li>
      </Steps>
      <HeadsUp>
        Custom command names can't collide with built-in commands
        (e.g. you can't make <code className="font-mono text-[13px] font-bold text-accent">!play</code> a custom command
        because <code className="font-mono text-[13px] font-bold text-accent">!play</code> is built in). The
        dashboard warns you before saving.
      </HeadsUp>
    </section>
  );
}

function Schedules(): JSX.Element {
  return (
    <section>
      <H2 id="schedules" kicker="Automation">Scheduled messages</H2>
      <P>
        Post messages on a schedule — daily reminders, weekly event
        announcements, monthly check-ins.
      </P>
      <Steps>
        <li>Open the <DashboardLink /> → <strong>Schedules</strong> and click <strong>New schedule</strong>.</li>
        <li><strong>Channel</strong> — where the message gets posted.</li>
        <li><strong>Message</strong> — what to send. Mentions and links work normally.</li>
        <li><strong>Frequency</strong> — once, daily, weekly, or custom (cron-style: <code className="font-mono text-[13px] font-bold text-accent">0 9 * * 1</code> = 9am every Monday).</li>
        <li><strong>Timezone</strong> — defaults to UTC. Pick your server's primary timezone for sane "9am" expectations.</li>
        <li>Click <strong>Save</strong>.</li>
      </Steps>
    </section>
  );
}

function Keywords(): JSX.Element {
  return (
    <section>
      <H2 id="keywords" kicker="Automation">Keyword alerts</H2>
      <P>
        Get a DM when specific words show up in your server's chat.
        Useful for catching mentions of your name, your project, or
        a topic you care about — without scrolling everywhere.
      </P>
      <Steps>
        <li>Open the <DashboardLink /> → <strong>Keywords</strong> and click <strong>Add keyword</strong>.</li>
        <li><strong>Keyword</strong> — the word or phrase to watch for. Case-insensitive. Whole-word matching by default.</li>
        <li><strong>Notify</strong> — yourself, or a list of members.</li>
        <li><strong>Restrict to channels</strong> (optional) — only watch in specific channels.</li>
        <li>Click <strong>Save</strong>. You'll get a DM the next time the word appears.</li>
      </Steps>
      <HeadsUp>
        Keywords don't fire when the keyword is in the watcher's own
        message — you won't ping yourself.
      </HeadsUp>
    </section>
  );
}

// ─── Server health ──────────────────────────────────────────────────

function Moderation(): JSX.Element {
  return (
    <section>
      <H2 id="moderation" kicker="Server health">Moderation</H2>
      <P>
        Manual mod actions with full audit logging. Each action gets
        a case number and shows up in your audit channel with the
        actor, target, reason, and any escalation context (e.g.
        "3rd warning in 30 days").
      </P>
      <Steps>
        <li>Open the <DashboardLink /> → <strong>Moderation</strong>.</li>
        <li><strong>Audit channel</strong> — pick a private channel only mods can read. Every mod action gets logged here.</li>
        <li><strong>DM target on action</strong> — if on, Panda DMs the kicked/banned member with the reason. If off, they're silently removed.</li>
        <li><strong>Escalation thresholds</strong> (optional) — e.g. <em>3 warnings in 30 days = auto-timeout</em>. Configurable per action.</li>
        <li>Click <strong>Save</strong>.</li>
      </Steps>
      <Commands>
        <Cmd cmd="!warn @user <reason>"    desc="Issue a warning. Logged + escalation-aware. Reason is required." />
        <Cmd cmd="!timeout @user <duration> <reason>" desc="Mute the member for a duration. Format: 1m, 1h, 7d." />
        <Cmd cmd="!kick @user <reason>"    desc="Remove from server. They can rejoin with a new invite." />
        <Cmd cmd="!ban @user <reason>"     desc="Permanent ban. Logged. Use !unban to reverse." />
        <Cmd cmd="!unban <userId>"         desc="Lift a ban. Use the user ID since they're not in the server anymore." />
        <Cmd cmd="!case <number>"          desc="Pull up a specific case from the audit log." />
        <Cmd cmd="!history @user"          desc="Show every mod action against this user." />
      </Commands>
    </section>
  );
}

function AntiRaid(): JSX.Element {
  return (
    <section>
      <H2 id="anti-raid" kicker="Server health">Anti-raid</H2>
      <P>
        Watches the rate at which new members are joining and the
        average age of their accounts. When something looks off,
        Panda enters lockdown: invites pause, verification level
        climbs, new joiners go to a holding queue you review when
        you're back.
      </P>
      <Steps>
        <li>Open the <DashboardLink /> → <strong>General</strong> → <strong>Anti-raid</strong>.</li>
        <li><strong>Join rate threshold</strong> — N joins within M seconds triggers lockdown. Default 12 / 60 catches most automated raids without false-positiving viral growth.</li>
        <li><strong>Account age threshold</strong> — accounts younger than this go straight to the queue. Default 24 hours.</li>
        <li><strong>Lockdown notification channel</strong> — where Panda pings you when lockdown engages.</li>
        <li><strong>Auto-lift</strong> — minutes after the last suspicious join with no further activity, lockdown lifts automatically. Default 30. Set to 0 to require manual lift.</li>
        <li>Click <strong>Save</strong>.</li>
      </Steps>
      <Commands>
        <Cmd cmd="!lockdown"          desc="Manually engage lockdown. Pauses invites and queues new joins." />
        <Cmd cmd="!unlock"            desc="Manually lift lockdown." />
        <Cmd cmd="!raidqueue"         desc="Show the holding queue with timestamps and account ages." />
        <Cmd cmd="!raidqueue approve <user>" desc="Approve a queued member into the server." />
        <Cmd cmd="!raidqueue reject <user>"  desc="Kick a queued member." />
      </Commands>
    </section>
  );
}

function StatCounters(): JSX.Element {
  return (
    <section>
      <H2 id="stat-counters" kicker="Server health">Stat counters</H2>
      <P>
        Live-updating voice channel names that show server stats —
        member count, online count, custom values you push from
        outside.
      </P>
      <Steps>
        <li>Create a voice channel that nobody will join (e.g. <strong>📊 Members: —</strong>). Members listening to the channel name = members not connecting to it.</li>
        <li>Open the <DashboardLink /> → <strong>Stat Counters</strong> and click <strong>New counter</strong>.</li>
        <li><strong>Channel</strong> — pick the voice channel from step 1.</li>
        <li><strong>Stat</strong> — total members, online members, member count of a specific role, or custom (push values via the API).</li>
        <li><strong>Format</strong> — e.g. <code className="font-mono text-[13px] font-bold text-accent">📊 Members: {'{value}'}</code>.</li>
        <li>Click <strong>Save</strong>. The channel renames within a minute.</li>
      </Steps>
      <HeadsUp>
        Echoed rate-limits channel renames to about twice every 10
        minutes. Counters refresh on that schedule — don't expect
        second-by-second updates.
      </HeadsUp>
    </section>
  );
}

// ─── Outside reach ──────────────────────────────────────────────────

function SocialAlerts(): JSX.Element {
  return (
    <section>
      <H2 id="social-alerts" kicker="Outside reach">Social alerts</H2>
      <P>
        Watch Twitch streamers, YouTube channels, and Reddit feeds.
        Panda posts in your channel when they go live or upload
        something new.
      </P>
      <Steps>
        <li>Open the <DashboardLink /> → <strong>Notifications</strong> and click <strong>New watcher</strong>.</li>
        <li><strong>Service</strong> — Twitch, YouTube, or Reddit.</li>
        <li><strong>Account / channel / subreddit</strong> — paste the username, channel handle, or subreddit name.</li>
        <li><strong>Notify in</strong> — pick the channel where the alert posts.</li>
        <li><strong>Mention</strong> (optional) — role to ping with each alert. Many servers create a <strong>@stream-pings</strong> role members opt into via reaction roles.</li>
        <li><strong>Custom message</strong> (optional) — override the default text. Use <code className="font-mono text-[13px] font-bold text-accent">{'{title}'}</code>, <code className="font-mono text-[13px] font-bold text-accent">{'{url}'}</code>, <code className="font-mono text-[13px] font-bold text-accent">{'{author}'}</code>.</li>
        <li>Click <strong>Save</strong>.</li>
      </Steps>
      <HeadsUp>
        Watchers poll every few minutes — alerts arrive within 5
        minutes of the actual event, not instantly. Twitch is
        slightly faster (1-2 min) because it uses webhooks.
      </HeadsUp>
    </section>
  );
}

// ─── Troubleshooting ────────────────────────────────────────────────

function Troubleshooting(): JSX.Element {
  return (
    <section>
      <H2 id="troubleshooting">When something doesn't work</H2>
      <P>
        Most "Panda isn't responding" reports come down to one of
        three causes. Walk through these in order before opening a
        bug report.
      </P>

      <div className="mt-8 space-y-8">
        <Issue title="Panda isn't responding to commands at all">
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            <li>Confirm Panda is online — it should appear with a green dot in your member list.</li>
            <li>Check the channel — Panda needs <strong>Send Messages</strong> permission in the channel you're typing in. If <strong>@everyone</strong> can talk and Panda can't, an explicit role override is blocking it.</li>
            <li>Check the command prefix — defaults to <code className="font-mono text-[13px] font-bold text-accent">!</code>. If your server changed it, use the new prefix instead.</li>
            <li>Try a known-working command like <code className="font-mono text-[13px] font-bold text-accent">!ping</code>. If that responds, the issue is feature-specific (next section).</li>
          </ol>
        </Issue>

        <Issue title="Panda responds to !ping but a specific feature doesn't work">
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            <li>Open the <DashboardLink /> → the feature's page. Confirm <strong>Enabled</strong> is on.</li>
            <li>Check the channel and role restrictions on that feature. The feature might be configured to only run in certain channels or for certain roles.</li>
            <li>Check Panda's role permissions. Some features need extra permissions (e.g. reaction roles need <strong>Manage Roles</strong>; auto-mod with <em>delete</em> action needs <strong>Manage Messages</strong>).</li>
            <li>Check role hierarchy. Panda can't moderate or assign roles that sit <em>above</em> its own role in the role list. Drag Panda's role up if needed.</li>
          </ol>
        </Issue>

        <Issue title="Music plays but skips/stops randomly">
          <ol className="mt-3 list-decimal space-y-2 pl-5">
            <li>Confirm the source is reachable. Some YouTube videos are region-locked or marked as music-label-only — those won't play.</li>
            <li>Check voice channel size. If your channel hits its user limit, Panda may have been auto-disconnected.</li>
            <li>Try <code className="font-mono text-[13px] font-bold text-accent">!stop</code> then <code className="font-mono text-[13px] font-bold text-accent">!play &lt;query&gt;</code> again. This resets the audio pipeline.</li>
            <li>If only specific tracks fail, paste the URL — that lets us check whether it's a source issue or our parser.</li>
          </ol>
        </Issue>
      </div>

      <P>
        Still stuck?{' '}
        <Link href="https://github.com/shaongitbd/panda/issues" className="font-bold text-text-primary underline underline-offset-2 hover:text-accent">
          Open an issue on GitHub
        </Link>{' '}
        with: what you tried, what you expected, what happened
        instead, and your server ID (visible in the dashboard URL).
        We read every one.
      </P>
    </section>
  );
}

function Issue({ title, children }: { title: string; children: React.ReactNode }): JSX.Element {
  return (
    <div className="max-w-prose">
      <h3 className="font-sans text-[18px] font-black tracking-tight text-text-primary">
        {title}
      </h3>
      <div className="text-[14.5px] font-medium leading-[1.65] text-text-secondary">
        {children}
      </div>
    </div>
  );
}
