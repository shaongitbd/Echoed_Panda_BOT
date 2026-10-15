'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireOwner, parseBool, parseBoundedInt, parseChannelId } from '@/lib/forms';
import { getServerChannels } from '@/lib/botApi';
import { checkOpenRouterKey, listStructuredModels } from '@/lib/openrouter';
import { secretBoxReady } from '@/lib/secretBox';
import {
  AI_ACTIONS,
  ALL_CHANNELS,
  addAiChannel,
  getAiSettings,
  listAiChannels,
  removeAiChannel,
  saveAiChannel,
  saveAiSettings,
  type AiAction,
} from '@/lib/queries/aiModeration';

// A leading `~` is OpenRouter's "latest" alias (`~deepseek/deepseek-flash-latest`);
// those are in the model list, so refusing the `~` made them unsavable.
const MODEL_RE = /^~?[a-z0-9._\-/:]{3,100}$/i;
const MAX_CONTEXT = 2000;

function back(serverId: string, query: string): never {
  revalidatePath(`/dashboard/${serverId}/ai`);
  redirect(`/dashboard/${serverId}/ai?${query}`);
}

export async function saveAiSettingsAction(serverId: string, formData: FormData): Promise<void> {
  await requireOwner(serverId);

  const current = await getAiSettings(serverId);
  const enabled = parseBool(formData.get('enabled'));
  const removeKey = parseBool(formData.get('removeKey'));
  const rawKey = String(formData.get('apiKey') ?? '').trim();
  const rawModel = String(formData.get('model') ?? '').trim();

  // ── The key: checked with OpenRouter BEFORE it is stored ──
  let apiKey: string | null | undefined;
  if (rawKey) {
    if (!secretBoxReady()) back(serverId, 'error=unavailable');
    if (rawKey.length < 20 || rawKey.length > 200 || /\s/.test(rawKey)) back(serverId, 'error=key-format');
    const check = await checkOpenRouterKey(rawKey);
    if (!check.ok) back(serverId, check.reason === 'invalid' ? 'error=key-invalid' : 'error=key-unreachable');
    apiKey = rawKey;
  } else if (removeKey) {
    apiKey = null;
  }

  // ── The model: one that enforces a JSON schema (the bot requires it) ──
  let model: string | null = null;
  if (rawModel) {
    if (!MODEL_RE.test(rawModel)) back(serverId, 'error=model');
    const models = await listStructuredModels();
    // An empty list means OpenRouter couldn't be reached — accept the typed id.
    if (models.length > 0 && !models.some((m) => m.id === rawModel)) back(serverId, 'error=model-unsupported');
    model = rawModel;
  }

  const willHaveKey = apiKey !== null && (apiKey !== undefined || current.keyHint !== null);
  if (enabled && (!willHaveKey || !model)) back(serverId, 'error=needs-key');

  await saveAiSettings(
    serverId,
    {
      enabled,
      model,
      dailyCheckCap: parseBoundedInt(formData.get('dailyCheckCap'), 2000, 0, 100_000),
      maxKickbanPerHour: parseBoundedInt(formData.get('maxKickbanPerHour'), 5, 0, 100),
    },
    apiKey,
  );
  back(serverId, 'saved=settings');
}

/** Turn on the every-channel rule (it starts on the safe defaults, like a new channel). */
export async function addAllChannelsAction(serverId: string): Promise<void> {
  await requireOwner(serverId);
  await addAiChannel(serverId, ALL_CHANNELS);
  back(serverId, 'saved=all');
}

export async function addAiChannelAction(serverId: string, formData: FormData): Promise<void> {
  await requireOwner(serverId);
  const channelId = parseChannelId(formData.get('channelId'));
  if (!channelId) back(serverId, 'error=channel');
  // Only a text channel that actually belongs to this server.
  const channels = await getServerChannels(serverId);
  if (!channels.some((c) => c.id === channelId && c.type === 'text')) back(serverId, 'error=channel');
  await addAiChannel(serverId, channelId);
  back(serverId, 'saved=channel');
}

export async function saveAiChannelAction(serverId: string, channelId: string, formData: FormData): Promise<void> {
  await requireOwner(serverId);
  // Only a channel this server already has a rule for.
  const existing = (await listAiChannels(serverId)).find((c) => c.channelId === channelId);
  if (!existing) back(serverId, 'error=channel');

  const context = String(formData.get('context') ?? '').trim();
  if (context.length > MAX_CONTEXT) back(serverId, 'error=context');
  const actions = formData
    .getAll('actions')
    .map(String)
    .filter((a): a is AiAction => (AI_ACTIONS as readonly string[]).includes(a));

  await saveAiChannel(serverId, {
    channelId,
    enabled: parseBool(formData.get('enabled')),
    context,
    historySize: parseBoundedInt(formData.get('historySize'), 8, 0, 20),
    allowedActions: [...new Set(actions)],
    timeoutMaxMinutes: parseBoundedInt(formData.get('timeoutMaxMinutes'), 60, 1, 40_320),
    minConfidence: parseBoundedInt(formData.get('minConfidence'), 80, 50, 100),
    kickbanMinConfidence: parseBoundedInt(formData.get('kickbanMinConfidence'), 95, 50, 100),
  });
  back(serverId, 'saved=channel');
}

export async function removeAiChannelAction(serverId: string, channelId: string): Promise<void> {
  await requireOwner(serverId);
  await removeAiChannel(serverId, channelId);
  back(serverId, 'saved=removed');
}
