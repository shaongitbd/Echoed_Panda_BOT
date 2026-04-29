'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  addRedditSub,
  removeRedditSub,
  addTwitchSub,
  removeTwitchSub,
  addYouTubeSub,
  removeYouTubeSub,
} from '@/lib/queries/notifications';
import { requireOwner, parseChannelId } from '@/lib/forms';
import { getSession } from '@/lib/auth';
import { fetchUserinfo } from '@/lib/echoed';

const SUBREDDIT_RE = /^[a-zA-Z0-9_]{2,21}$/;
const TWITCH_LOGIN_RE = /^[a-zA-Z0-9_]{4,25}$/;
const YT_CHANNEL_RE = /^UC[a-zA-Z0-9_-]{22}$/;

async function callerId(): Promise<string> {
  const session = await getSession();
  if (!session) redirect('/login');
  const user = await fetchUserinfo(session.accessToken);
  return user.sub;
}

interface AddResult {
  ok: boolean;
  error?: string;
}

// ─── Reddit ────────────────────────────────────────────────────────────

export async function addReddit(serverId: string, formData: FormData): Promise<AddResult> {
  await requireOwner(serverId);
  const channelId = parseChannelId(formData.get('channelId'));
  const rawSub = formData.get('subreddit');
  const subreddit =
    typeof rawSub === 'string'
      ? rawSub.trim().replace(/^\/?r\//i, '').toLowerCase()
      : '';

  if (!channelId) return { ok: false, error: 'Channel is required.' };
  if (!SUBREDDIT_RE.test(subreddit)) {
    return { ok: false, error: 'Subreddit must be 2-21 chars (alphanumeric + underscore).' };
  }

  const userId = await callerId();
  await addRedditSub({ serverId, channelId, subreddit, createdBy: userId });
  revalidatePath(`/dashboard/${serverId}/notifications`);
  return { ok: true };
}

export async function removeReddit(serverId: string, id: number): Promise<void> {
  await requireOwner(serverId);
  await removeRedditSub(serverId, id);
  revalidatePath(`/dashboard/${serverId}/notifications`);
}

// ─── Twitch ────────────────────────────────────────────────────────────

export async function addTwitch(serverId: string, formData: FormData): Promise<AddResult> {
  await requireOwner(serverId);
  const channelId = parseChannelId(formData.get('channelId'));
  const rawLogin = formData.get('twitchLogin');
  const twitchLogin =
    typeof rawLogin === 'string'
      ? rawLogin
          .trim()
          .replace(/^https?:\/\/(?:www\.)?twitch\.tv\//i, '')
          .replace(/\/.*$/, '')
          .toLowerCase()
      : '';

  if (!channelId) return { ok: false, error: 'Channel is required.' };
  if (!TWITCH_LOGIN_RE.test(twitchLogin)) {
    return { ok: false, error: 'Twitch username must be 4-25 chars (alphanumeric + underscore).' };
  }

  const userId = await callerId();
  await addTwitchSub({ serverId, channelId, twitchLogin, createdBy: userId });
  revalidatePath(`/dashboard/${serverId}/notifications`);
  return { ok: true };
}

export async function removeTwitch(serverId: string, id: number): Promise<void> {
  await requireOwner(serverId);
  await removeTwitchSub(serverId, id);
  revalidatePath(`/dashboard/${serverId}/notifications`);
}

// ─── YouTube ───────────────────────────────────────────────────────────

export async function addYouTube(serverId: string, formData: FormData): Promise<AddResult> {
  await requireOwner(serverId);
  const channelId = parseChannelId(formData.get('channelId'));
  const rawYt = formData.get('youtubeChannelId');
  let youtubeChannelId = typeof rawYt === 'string' ? rawYt.trim() : '';
  // Accept a /channel/UC... URL or the bare ID; @handle URLs need
  // an API key to resolve so we reject those upfront.
  const fromUrl = /\/channel\/(UC[a-zA-Z0-9_-]{22})/.exec(youtubeChannelId);
  if (fromUrl?.[1]) youtubeChannelId = fromUrl[1];

  if (!channelId) return { ok: false, error: 'Channel is required.' };
  if (!YT_CHANNEL_RE.test(youtubeChannelId)) {
    return {
      ok: false,
      error:
        'YouTube channel ID must start with UC (24 chars). @handle URLs aren\'t supported — find the UC ID in the channel page source.',
    };
  }

  const userId = await callerId();
  await addYouTubeSub({ serverId, channelId, youtubeChannelId, createdBy: userId });
  revalidatePath(`/dashboard/${serverId}/notifications`);
  return { ok: true };
}

export async function removeYouTube(serverId: string, id: number): Promise<void> {
  await requireOwner(serverId);
  await removeYouTubeSub(serverId, id);
  revalidatePath(`/dashboard/${serverId}/notifications`);
}
