# Panda

A configurable bot for [Echoed](https://echoed.gg) servers. Levels,
moderation, auto-mod, welcome flows, reaction roles, custom commands,
scheduled messages, and social-feed notifications — all in a single
TypeScript service backed by Postgres.

## Stack

- Node 20 + TypeScript ESM
- `socket.io-client` for the realtime event stream
- `pg` for Postgres (per-bot schema: `panda.*`)
- `pino` for logs

## Setup

```bash
npm install
cp .env.example .env
# fill in BOT_TOKEN and DATABASE_URL
npm run dev
```

The bot creates its own `panda` schema and tables on first boot. The role
in `DATABASE_URL` needs `CREATE` on the database (one-time), or you can
pre-create the schema and grant `USAGE, CREATE` on it instead.

## Features

- **Leveling** — XP per message with role rewards, no-XP channels, customizable level-up messages
- **Moderation** — kick / ban / unban / timeout / warn with searchable history, mod-log routing, bulk purge
- **Auto-mod** — eight filters (invites, bad words, spam, caps, mass mentions, emoji spam, zalgo, links) with per-channel/role exempt lists
- **Welcome flows** — greeting messages, auto-role on join
- **Reaction roles** — three modes (normal, unique, verify) with bot-seeded reactions
- **Custom commands** — per-server text commands with placeholders (`{user}`, `{user.name}`, `{args}`)
- **Polls / suggestions / giveaways / reminders / AFK** — chat utilities backed by a single scheduler
- **Anti-raid** — mass-join detection with auto-lockdown
- **Scheduled messages** — recurring (`every 1h`) and daily (`14:00 UTC`) posts
- **Stats counters** — auto-rename channels with live member/channel counts
- **Temp channels** — time-limited channels that auto-delete
- **Notifications** — Reddit subreddit / Twitch streams / YouTube uploads

## Dashboard

A web dashboard for configuring everything visually lives in `dashboard/`
(Next.js 14, App Router). It logs in via Echoed OAuth2, reads/writes the
same `panda` schema, and runs as an independent service. See
`dashboard/README.md` for setup.

## Architecture

```
┌──────────────┐         ┌──────────────┐
│   Echoed     │◀────────│  panda bot   │
│   socket +   │  websocket  (this dir) │
│   REST API   │  + REST  │              │
└──────────────┘         └──────┬───────┘
                                │
                          ┌─────▼──────┐
                          │ Postgres   │
                          │ panda.*    │
                          └─────▲──────┘
                                │
                          ┌─────┴──────┐
                          │ dashboard  │
                          │ (Next.js)  │
                          └────────────┘
```

The bot and the dashboard both speak to the same Postgres schema. The
dashboard never talks to the bot directly — config writes go to
Postgres, and the bot picks them up on its next read (cache TTLs are
short — 60s typical).

## License

MIT.
"# Echoed_Panda_BOT" 
