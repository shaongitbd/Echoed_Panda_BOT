// Encryption for the OpenRouter API keys servers bring (AI moderation).
//
// The dashboard encrypts a key when the owner saves it; the bot decrypts it
// only to make a request. Both derive the same AES-256 key from
// PANDA_AI_KEY_SECRET, which lives in the two services' environments and
// nowhere in the database — so a database dump alone yields no usable key.
//
// AES-256-GCM, with the SERVER ID as associated data: a ciphertext only
// decrypts for the server it was written for. Copying one server's row into
// another's — by a bug, a bad migration or anyone with write access to the
// table — fails to decrypt instead of spending the first server's key on
// the second server's traffic.
//
// Format: v1:<iv b64>:<tag b64>:<ciphertext b64>. Mirrored, byte for byte,
// in dashboard/lib/secretBox.ts.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from '../config.js';

const VERSION = 'v1';

function keyFromSecret(): Buffer | null {
  const secret = config.aiKeySecret;
  if (!secret || secret.length < 32) return null;
  // The secret is a random string (see the deploy notes), not a password, so
  // a plain hash is a sound derivation and keeps the setup to "paste any
  // long random value".
  return createHash('sha256').update(secret, 'utf8').digest();
}

/** True when this process can encrypt / decrypt keys at all. */
export function secretBoxReady(): boolean {
  return keyFromSecret() !== null;
}

export function sealApiKey(serverId: string, plaintext: string): string {
  const key = keyFromSecret();
  if (!key) throw new Error('PANDA_AI_KEY_SECRET is not set (min 32 chars)');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(serverId, 'utf8'));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}

/** The plaintext key, or null when it can't be opened (wrong server, wrong secret, damaged). */
export function openApiKey(serverId: string, sealed: string): string | null {
  const key = keyFromSecret();
  if (!key) return null;
  const parts = sealed.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) return null;
  try {
    const [, ivB64, tagB64, ctB64] = parts as [string, string, string, string];
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
    decipher.setAAD(Buffer.from(serverId, 'utf8'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
