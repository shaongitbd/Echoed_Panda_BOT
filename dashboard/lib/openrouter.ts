// OpenRouter lookups for the AI moderation page: checking a key before it is
// saved, and listing the models the bot can use.

import 'server-only';

const BASE = 'https://openrouter.ai/api/v1';

export type KeyCheck = { ok: true; label: string | null } | { ok: false; reason: 'invalid' | 'unreachable' };

/** Ask OpenRouter whether this key works — before anything is stored. */
export async function checkOpenRouterKey(apiKey: string): Promise<KeyCheck> {
  try {
    const res = await fetch(`${BASE}/key`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401 || res.status === 403) return { ok: false, reason: 'invalid' };
    if (!res.ok) return { ok: false, reason: 'unreachable' };
    const body = (await res.json()) as { data?: { label?: string } };
    return { ok: true, label: body.data?.label ?? null };
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
}

export type { ModelOption } from './modelSearch';
import type { ModelOption } from './modelSearch';

let modelCache: { at: number; models: ModelOption[] } | null = null;
let inFlight: Promise<ModelOption[]> | null = null;
const MODEL_TTL_MS = 60 * 60_000;

/** OpenRouter's per-token price string → USD per million; routers say "-1". */
function perMillion(raw: string | undefined): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n * 1_000_000 : null;
}

/**
 * Models that can answer in a fixed JSON schema — the bot requires it (it
 * routes with require_parameters), so anything else would fail every call.
 * Held for an hour, one fetch at a time. Empty on failure; the page then
 * accepts a typed model id.
 */
export async function listStructuredModels(): Promise<ModelOption[]> {
  if (modelCache && Date.now() - modelCache.at < MODEL_TTL_MS) return modelCache.models;
  inFlight ??= fetchStructuredModels().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function fetchStructuredModels(): Promise<ModelOption[]> {
  try {
    const res = await fetch(`${BASE}/models`, { cache: 'no-store', signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return modelCache?.models ?? [];
    const body = (await res.json()) as {
      data?: {
        id?: string;
        name?: string;
        created?: number;
        context_length?: number;
        supported_parameters?: string[];
        pricing?: { prompt?: string; completion?: string };
      }[];
    };
    const models: ModelOption[] = (body.data ?? [])
      // `structured_outputs` = enforces a JSON schema. (`response_format`
      // alone can mean plain JSON mode, which the bot's strict schema
      // request would be refused on.)
      .filter((m) => m.id && (m.supported_parameters ?? []).includes('structured_outputs'))
      .map((m) => ({
        id: m.id!,
        name: m.name ?? m.id!,
        promptPerMillion: perMillion(m.pricing?.prompt),
        completionPerMillion: perMillion(m.pricing?.completion),
        contextLength: m.context_length && m.context_length > 0 ? m.context_length : null,
        created: m.created ?? 0,
      }))
      .sort((a, b) => a.id.localeCompare(b.id));
    modelCache = { at: Date.now(), models };
    return models;
  } catch {
    return modelCache?.models ?? [];
  }
}
