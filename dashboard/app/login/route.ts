import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { buildAuthorizeUrl } from '@/lib/echoed';

// Route Handler — generates a CSRF state, stashes it in a cookie, and
// redirects to Echoed's authorize endpoint. Lives as a route (not a
// page) because Next.js 14 forbids cookie writes from Server
// Components in production.

const STATE_COOKIE = 'panda_oauth_state';

export async function GET(): Promise<Response> {
  const state = crypto.randomBytes(16).toString('base64url');
  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    // Short window — only needs to live until the user comes back.
    maxAge: 5 * 60,
  });
  return NextResponse.redirect(buildAuthorizeUrl(state));
}
