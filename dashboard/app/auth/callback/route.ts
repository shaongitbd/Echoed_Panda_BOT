import { NextResponse, type NextRequest } from 'next/server';
import { exchangeCodeForToken, fetchUserinfo } from '@/lib/echoed';
import { setSession } from '@/lib/auth';
import { config } from '@/lib/config';

const STATE_COOKIE = 'panda_oauth_state';

// OAuth2 callback. Verifies the state cookie matches what came back
// from Echoed (CSRF defense), exchanges the code for a token,
// looks up the user, and writes the signed session cookie.
//
// Errors here surface as 400/500 with a plain-text body — there's
// no user-facing UI on this route. Failures usually mean the user
// declined or our config is off.
export async function GET(req: NextRequest): Promise<Response> {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return new NextResponse(`OAuth error: ${error}`, { status: 400 });
  }
  if (!code || !state) {
    return new NextResponse('Missing code or state', { status: 400 });
  }

  const stored = req.cookies.get(STATE_COOKIE)?.value;
  if (!stored || stored !== state) {
    return new NextResponse('Invalid state', { status: 400 });
  }

  let token;
  try {
    token = await exchangeCodeForToken(code);
  } catch (err) {
    return new NextResponse(`Token exchange failed: ${(err as Error).message}`, { status: 502 });
  }

  let user;
  try {
    user = await fetchUserinfo(token.access_token);
  } catch (err) {
    return new NextResponse(`User lookup failed: ${(err as Error).message}`, { status: 502 });
  }

  // Build the post-login redirect from DASHBOARD_BASE_URL, NOT from
  // req.url — behind Dokploy / Traefik / any reverse proxy, req.url
  // resolves to the internal Docker container hostname (e.g.
  // https://08d437…:3030) which the user's browser can't reach.
  const response = NextResponse.redirect(`${config.dashboardBaseUrl}/dashboard`);

  // Set the session cookie + clear the state cookie ON the redirect
  // response itself. cookies().set() inside a route handler that
  // returns a redirect drops the Set-Cookie header — this is the
  // class of bug that surfaces as "Invalid state" on the next round.
  setSession(response, {
    userId: user.sub,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + token.expires_in,
  });
  response.cookies.delete(STATE_COOKIE);

  return response;
}
