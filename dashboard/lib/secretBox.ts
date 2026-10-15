// Seals a server's OpenRouter key before it is stored — the dashboard half
// of the bot's src/ai/secretBox.ts. Same derivation (SHA-256 of
// PANDA_AI_KEY_SECRET), same AES-256-GCM, same server-id binding, same
// v1:<iv>:<tag>:<ciphertext> format: keep the two in step.
//
// The dashboard only ever SEALS. It never needs the plaintext back — the
// page shows the saved key's last 4 characters, stored separately.

import 'server-only';
import { createCipheriv, createHash, randomBytes } from 'node:crypto';
import { config } from './config';

export function secretBoxReady(): boolean {
  return config.aiKeySecret.length >= 32;
}

export function sealApiKey(serverId: string, plaintext: string): string {
  if (!secretBoxReady()) throw new Error('PANDA_AI_KEY_SECRET is not set (min 32 chars)');
  const key = createHash('sha256').update(config.aiKeySecret, 'utf8').digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(serverId, 'utf8'));
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), ct.toString('base64')].join(':');
}
