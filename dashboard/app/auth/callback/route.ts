import { NextResponse, type NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { exchangeCodeForToken, fetchUserinfo } from '@/lib/echoed';
import { setSession } from '@/lib/auth';

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

  const cookieStore = await cookies();
  const stored = cookieStore.get(STATE_COOKIE)?.value;
  cookieStore.delete(STATE_COOKIE);
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

  await setSession({
    userId: user.sub,
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: Math.floor(Date.now() / 1000) + token.expires_in,
  });

  return NextResponse.redirect(new URL('/dashboard', url));
}
