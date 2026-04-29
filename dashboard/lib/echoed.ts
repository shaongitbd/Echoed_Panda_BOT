import { config, oauthRedirectUri } from './config';

// Thin client over Echoed's OAuth2 + user-info endpoints. Lives
// entirely server-side: every call here happens during a request
// handler with the user's access token, never in the browser.

export interface EchoedUser {
  sub: string;
  name?: string;
  username?: string;
  avatar_url?: string;
  email?: string;
  owned_servers?: Array<{ id: string; name: string; type?: string; iconUrl?: string }>;
  servers_count?: number;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

// Build the authorize URL the login page redirects to. State is a
// short random string the caller persists in a cookie and verifies
// on callback to defeat CSRF.
export function buildAuthorizeUrl(state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.echoedOAuth.clientId,
    redirect_uri: oauthRedirectUri(),
    scope: 'openid profile email servers',
    state,
  });
  return `${config.echoedOAuth.base}/oauth2/authorize?${params.toString()}`;
}

export async function exchangeCodeForToken(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: oauthRedirectUri(),
    client_id: config.echoedOAuth.clientId,
    client_secret: config.echoedOAuth.clientSecret,
  });
  const res = await fetch(`${config.echoedOAuth.base}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }
  return (await res.json()) as TokenResponse;
}

// Calls /oauth2/userinfo with the access token. Returns the same
// shape Echoed's docs declare (sub, name, owned_servers, etc).
export async function fetchUserinfo(accessToken: string): Promise<EchoedUser> {
  const res = await fetch(`${config.echoedOAuth.base}/oauth2/userinfo`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`userinfo failed: ${res.status}`);
  }
  return (await res.json()) as EchoedUser;
}
