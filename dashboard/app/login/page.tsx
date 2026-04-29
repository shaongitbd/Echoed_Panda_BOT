import crypto from 'node:crypto';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { buildAuthorizeUrl } from '@/lib/echoed';

// Server component: generates a CSRF state, stashes it in a cookie,
// and redirects to Echoed's authorize endpoint. The user never sees
// any HTML on this route — it's pure redirect glue.

const STATE_COOKIE = 'panda_oauth_state';

export default async function LoginPage(): Promise<never> {
  const state = crypto.randomBytes(16).toString('base64url');
  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    // Short window — only needs to live until the user comes back.
    maxAge: 5 * 60,
  });
  redirect(buildAuthorizeUrl(state));
}
