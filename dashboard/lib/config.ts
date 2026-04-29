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

  dashboardBaseUrl: trimTrailingSlash(optional('DASHBOARD_BASE_URL', 'http://localhost:3030')),
};

export const oauthRedirectUri = (): string => `${config.dashboardBaseUrl}/auth/callback`;
