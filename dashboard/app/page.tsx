import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Header } from '@/components/Header';
import { Footer } from '@/components/Footer';
import { ServerTour } from '@/components/home/ServerTour';
import { getSession } from '@/lib/auth';

// panda.echoed.gg. Set in echoed.gg's own world: its night scene (the house
// on the hill), and "Late Night Crew", the server echoed.gg shows on its
// homepage — where Panda already sits in the member list. The page is mostly
// that server, which you can walk around: every channel is one of Panda's
// jobs, as it actually happens in chat.

const wrap = 'mx-auto w-full px-5 md:px-8';

export default async function HomePage(): Promise<JSX.Element> {
  const session = await getSession();
  return (
    <>
      <Header />
      <main>
        {/* The scene */}
        <section className="relative isolate h-[min(86vh,780px)] min-h-[540px] overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/home/art-night-wide.jpg"
            alt=""
            className="absolute inset-0 -z-10 h-full w-full object-cover object-[58%_70%]"
          />
          {/* Darken the sky a touch for the text, and fade the ground into the page. */}
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-[rgba(11,12,15,.35)] via-transparent to-bg-base" />
          {/* The moon sits behind the headline on wide screens; dim the left of the sky so white type stays legible. */}
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,rgba(11,12,15,.55)_0%,rgba(11,12,15,.3)_45%,transparent_70%)]" />
          <div className={`${wrap} max-w-6xl pt-[clamp(48px,9vh,110px)]`}>
            <h1 className="max-w-[14ch] font-display text-[clamp(40px,6vw,76px)] font-semibold leading-[1.02] tracking-[-0.045em] text-white [text-wrap:balance]">
              Someone has to mind the house.
            </h1>
            <p className="mt-6 max-w-[46ch] text-[clamp(17px,1.6vw,20px)] leading-[1.55] text-white/80">
              Panda is the bot that lives in your Echoed server. It keeps out the spam and scams, plays the music,
              keeps score, and remembers everyone&apos;s birthday — so the rest of you can just hang out.
            </p>
            <div className="mt-8 flex flex-wrap gap-2.5">
              <Link
                href="#add"
                className="inline-flex h-12 items-center gap-2 rounded-[10px] bg-accent px-5 text-[15px] font-semibold text-white transition-colors duration-100 hover:bg-accent-hover active:bg-accent-press"
              >
                Add Panda to your server
                <ArrowRight aria-hidden="true" size={18} />
              </Link>
              <Link
                href="#tour"
                className="inline-flex h-12 items-center rounded-[10px] bg-[rgba(11,12,15,.5)] px-5 text-[15px] font-semibold text-white transition-colors duration-100 hover:bg-[rgba(11,12,15,.6)]"
              >
                Have a look around
              </Link>
            </div>
          </div>
        </section>

        {/* The server, rising out of the scene */}
        <section id="tour" className={`${wrap} relative z-10 -mt-[clamp(120px,22vh,220px)] max-w-7xl scroll-mt-20`}>
          <ServerTour />
          <p className="mt-4 text-center text-sm text-text-faint">
            Late Night Crew, a server on Echoed. Every channel on the left is something Panda does — click through them.
          </p>
        </section>

        {/* What it costs, plainly */}
        <section className={`${wrap} mt-24 max-w-6xl md:mt-32`}>
          <h2 className="max-w-[20ch] font-display text-[clamp(28px,3.4vw,42px)] font-semibold leading-[1.08] tracking-[-0.04em] text-text-primary">
            Free, all of it.
          </h2>
          <div className="mt-8 grid gap-x-12 gap-y-8 md:grid-cols-3">
            <div>
              <h3 className="text-[17px] font-semibold text-text-primary">No premium tier</h3>
              <p className="mt-2 text-[15px] leading-6 text-text-muted">
                Every feature on this page works in every server. Nothing is held back for a paid plan, and nothing
                stops working when your server grows.
              </p>
            </div>
            <div>
              <h3 className="text-[17px] font-semibold text-text-primary">AI on your own key</h3>
              <p className="mt-2 text-[15px] leading-6 text-text-muted">
                AI moderation runs on your OpenRouter key, with the model and the daily limit you choose. You pay
                OpenRouter for what you use; we never bill you.
              </p>
            </div>
            <div>
              <h3 className="text-[17px] font-semibold text-text-primary">Set up your way</h3>
              <p className="mt-2 text-[15px] leading-6 text-text-muted">
                Every setting is on the dashboard, and in chat as a command. <span className="font-mono text-[13.5px] text-text-secondary">!setup</span> turns
                on daily questions, a starboard, counting and birthdays in one go.
              </p>
            </div>
          </div>
        </section>

        {/* How to add it */}
        <section id="add" className={`${wrap} mt-24 max-w-6xl scroll-mt-24 md:mt-32`}>
          <div className="grid gap-10 rounded-[20px] bg-bg-card p-6 md:grid-cols-[1fr_1.2fr] md:p-10">
            <div>
              <h2 className="max-w-[14ch] font-display text-[clamp(28px,3.4vw,42px)] font-semibold leading-[1.08] tracking-[-0.04em] text-text-primary">
                Add Panda to your server.
              </h2>
              <p className="mt-4 max-w-[38ch] text-[15px] leading-6 text-text-muted">
                It takes about two minutes. You need to own the server, or have Manage Server in it.
              </p>
              <Link
                href={session ? '/dashboard' : '/login'}
                className="mt-6 inline-flex h-12 items-center gap-2 rounded-[10px] bg-accent px-5 text-[15px] font-semibold text-white transition-colors duration-100 hover:bg-accent-hover active:bg-accent-press"
              >
                {session ? 'Open the dashboard' : 'Log in with Echoed'}
                <ArrowRight aria-hidden="true" size={18} />
              </Link>
            </div>
            <ol className="space-y-6">
              {[
                ['In Echoed, open your server.', <>Click the server name, then <b className="font-semibold text-text-primary">Server Settings → Bots</b>, and add Panda.</>],
                ['Log in here with Echoed.', <>Servers you own that Panda is in show up on the dashboard straight away.</>],
                ['Turn on what you want.', <>Pick your server and switch features on — or type <span className="font-mono text-[13.5px] text-text-secondary">!help</span> in chat to see every command.</>],
              ].map(([title, body], i) => (
                <li key={i} className="flex gap-4">
                  <span className="font-display text-[15px] font-semibold tabular-nums text-text-faint">{i + 1}</span>
                  <div>
                    <p className="text-[16px] font-semibold text-text-primary">{title}</p>
                    <p className="mt-1 text-[15px] leading-6 text-text-muted">{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
