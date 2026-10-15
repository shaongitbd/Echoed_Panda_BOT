// Centralized env loading. Throws at boot if anything required is
// missing — better to fail at startup than to discover during the
// OAuth callback that SESSION_SECRET is undefined.

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v.trim();
}

function optional(name: string, fallback: string): string {
  const v = process.env[name]?.trim();
  return v && v.length > 0 ? v : fallback;
}

function trimTrailingSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

export const config = {
  databaseUrl: required('DATABASE_URL'),
  sessionSecret: required('SESSION_SECRET'),

  echoedOAuth: {
    clientId: required('ECHOED_OAUTH_CLIENT_ID'),
    clientSecret: required('ECHOED_OAUTH_CLIENT_SECRET'),
    base: trimTrailingSlash(optional('ECHOED_OAUTH_BASE', 'https://go.echoed.gg')),
  },

  // Same bot token the bot process uses — needed for server-side
  // channel/role lookups when rendering the dashboard. Stored only on
  // the dashboard server, never sent to the browser.
  botApi: {
    base: trimTrailingSlash(optional('PANDA_API_BASE', 'https://go.echoed.gg')),
    token: required('PANDA_BOT_TOKEN'),
  },

  dashboardBaseUrl: trimTrailingSlash(optional('DASHBOARD_BASE_URL', 'http://localhost:3030')),

  // AI moderation: the same secret the bot has (PANDA_AI_KEY_SECRET), from
  // which both derive the key that seals servers' OpenRouter keys. Optional
  // so the dashboard still boots without it; the AI page then says it's
  // unavailable instead of saving keys nobody could open.
  aiKeySecret: optional('PANDA_AI_KEY_SECRET', ''),
};

export const oauthRedirectUri = (): string => `${config.dashboardBaseUrl}/auth/callback`;
