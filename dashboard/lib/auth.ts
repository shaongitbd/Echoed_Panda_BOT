import { cookies } from 'next/headers';
import crypto from 'node:crypto';
import { config } from './config';

// Session model: we sign a small JSON payload with HMAC-SHA256 and
// stuff it into an HTTP-only cookie. No server-side store — keeps
// dashboard stateless and lets us scale horizontally without sharing
// session state across instances.
//
// The signed payload contains:
//   - userId (Echoed user ID)
//   - accessToken (Echoed OAuth access token)
//   - refreshToken (optional — only when offline_access scope was granted)
//   - expiresAt (unix seconds; we refresh past this point)
//
// `accessToken` is in the cookie deliberately — the dashboard uses it
// to call Echoed's user endpoints on the user's behalf. It never
// leaves the cookie and never appears in the browser console / DOM.

export interface Session {
  userId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}

const COOKIE_NAME = 'panda_session';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function sign(payload: string): string {
  return crypto
    .createHmac('sha256', config.sessionSecret)
    .update(payload)
    .digest('base64url');
}

function encode(session: Session): string {
  const json = JSON.stringify(session);
  const payload = Buffer.from(json).toString('base64url');
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

function decode(token: string): Session | null {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  // Constant-time compare to avoid timing attacks. Both sides are
  // base64url so length is bounded and predictable.
  const a = Buffer.from(sig, 'base64url');
  const b = Buffer.from(expected, 'base64url');
  if (a.length !== b.length) return null;
  if (!crypto.timingSafeEqual(a, b)) return null;
  try {
    const json = Buffer.from(payload, 'base64url').toString('utf8');
    return JSON.parse(json) as Session;
  } catch {
    return null;
  }
}

export async function getSession(): Promise<Session | null> {
  const cookie = (await cookies()).get(COOKIE_NAME);
  if (!cookie) return null;
  const session = decode(cookie.value);
  if (!session) return null;
  // We don't auto-refresh here — the page can detect an expired token
  // and redirect to /login. Refresh tokens are post-MVP polish.
  return session;
}

// Two flavours intentionally:
//   - setSession(...): for use inside Server Actions (e.g. saving a
//     login that doesn't redirect). cookies().set() is correct there.
//   - setSessionOn(response, ...): for Route Handlers that return a
//     redirect — cookies set via cookies() are dropped on a redirect
//     response, so we mutate the response directly. Same logic for
//     clear (clearSessionOn).
const COOKIE_OPTIONS = (): {
  httpOnly: true;
  secure: boolean;
  sameSite: 'lax';
  path: '/';
  maxAge: number;
} => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: COOKIE_MAX_AGE,
});

export async function setSession(session: Session): Promise<void> {
  const token = encode(session);
  (await cookies()).set(COOKIE_NAME, token, COOKIE_OPTIONS());
}

export function setSessionOn(
  response: { cookies: { set: (n: string, v: string, opts: ReturnType<typeof COOKIE_OPTIONS>) => void } },
  session: Session,
): void {
  response.cookies.set(COOKIE_NAME, encode(session), COOKIE_OPTIONS());
}

export async function clearSession(): Promise<void> {
  (await cookies()).delete(COOKIE_NAME);
}
