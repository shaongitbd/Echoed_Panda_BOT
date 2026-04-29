import 'dotenv/config';
import { log } from './log.js';

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    log.fatal(`Missing required env var: ${name}`);
    process.exit(1);
  }
  return v.trim();
}

function optional(name: string, fallback: string): string {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : fallback;
}

function optionalInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const parsed = parseInt(v, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function trimTrailingSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

export const config = {
  botToken: required('BOT_TOKEN'),
  databaseUrl: required('DATABASE_URL'),
  apiUrl: trimTrailingSlash(optional('ECHOED_API_URL', 'https://go.echoed.gg')),
  socketUrl: trimTrailingSlash(optional('ECHOED_SOCKET_URL', 'https://socket.echoed.gg')),
  // Default prefix; per-guild overrides come from panda.guild_config.
  defaultPrefix: optional('COMMAND_PREFIX', '!'),
  perChannelCooldownMs: optionalInt('PER_CHANNEL_COOLDOWN_MS', 2000),
  // Optional Twitch app credentials (client-credentials flow). Leave
  // empty to disable Twitch integration; the !twitch commands will
  // surface a "not configured" hint and the scheduler skips its tick.
  twitchClientId: optional('TWITCH_CLIENT_ID', ''),
  twitchClientSecret: optional('TWITCH_CLIENT_SECRET', ''),
} as const;

export const twitchEnabled = (): boolean =>
  config.twitchClientId.length > 0 && config.twitchClientSecret.length > 0;

log.debug(
  {
    config: {
      ...config,
      botToken: config.botToken.slice(0, 8) + '…',
      databaseUrl: config.databaseUrl.replace(/:([^:@/]+)@/, ':***@'),
    },
  },
  'Loaded config',
);
