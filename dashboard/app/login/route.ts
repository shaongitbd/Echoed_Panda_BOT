import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { buildAuthorizeUrl } from '@/lib/echoed';

// Route Handler — generates a CSRF state, stashes it in a cookie, and
// redirects to Echoed's authorize endpoint. Lives as a route (not a
// page) because Next.js 14 forbids cookie writes from Server
// Components in production.
//
// IMPORTANT: cookies are attached to the NextResponse directly (not
// via cookies().set()). The cookies() helper is meant for page
// responses; in a Route Handler that returns a redirect, only cookies
// set on the response itself are emitted in the Set-Cookie header.

const STATE_COOKIE = 'panda_oauth_state';

export async function GET(): Promise<Response> {
  const state = crypto.randomBytes(16).toString('base64url');
  const response = NextResponse.redirect(buildAuthorizeUrl(state));
  response.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    // Short window — only needs to live until the user comes back.
    maxAge: 5 * 60,
  });
  return response;
}
