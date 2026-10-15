// OpenRouter chat completions, with structured (JSON-schema) output.
//
// Every call asks for a fixed JSON shape and tells OpenRouter to route only
// to providers that honour it (`require_parameters`). The answer is still
// treated as untrusted: callers validate every field themselves and fall back
// to "do nothing" on anything malformed. A model's reply is never executed as
// text — only as values picked out of a known vocabulary.

import { log } from '../log.js';

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const TIMEOUT_MS = 25_000;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export type CompletionResult =
  | { ok: true; json: unknown; promptTokens?: number; completionTokens?: number }
  | { ok: false; error: string; status?: number };

/**
 * One chat completion that must return JSON matching `schema`. Never throws:
 * network failures, HTTP errors and unparseable answers come back as
 * { ok: false } with a reason fit to show a server owner.
 */
export async function completeJson(input: {
  apiKey: string;
  model: string;
  messages: ChatMessage[];
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens: number;
}): Promise<CompletionResult> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
        // Attribution OpenRouter shows in the key owner's activity log.
        'HTTP-Referer': 'https://panda.echoed.gg',
        'X-Title': 'Panda moderation',
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: 0,
        max_tokens: input.maxTokens,
        response_format: {
          type: 'json_schema',
          json_schema: { name: input.schemaName, strict: true, schema: input.schema },
        },
        // Only providers that actually enforce the schema.
        provider: { require_parameters: true },
      }),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    return { ok: false, error: timedOut ? 'The model took too long to answer.' : 'Could not reach OpenRouter.' };
  }

  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? '';
    } catch {
      /* no JSON body */
    }
    return { ok: false, status: res.status, error: describeHttpError(res.status, detail) };
  }

  let body: {
    choices?: { message?: { content?: string | null } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return { ok: false, error: 'OpenRouter returned an unreadable response.' };
  }
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    return { ok: false, error: 'The model returned an empty answer.' };
  }
  const json = parseJsonLoose(content);
  if (json === undefined) {
    log.debug({ model: input.model, preview: content.slice(0, 200) }, 'AI answer was not JSON');
    return { ok: false, error: 'The model did not answer in the required format.' };
  }
  return {
    ok: true,
    json,
    promptTokens: body.usage?.prompt_tokens,
    completionTokens: body.usage?.completion_tokens,
  };
}

// ── Tool calling (the !panda agent) ────────────────────────────────────────

export interface ToolCall {
  id: string;
  name: string;
  /** Raw JSON text from the model — the caller parses and validates it. */
  arguments: string;
}

export type AgentMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }
  | { role: 'tool'; tool_call_id: string; content: string };

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the arguments. */
  parameters: Record<string, unknown>;
}

export type ToolTurnResult =
  | { ok: true; content: string; toolCalls: ToolCall[] }
  | { ok: false; error: string; status?: number };

/**
 * One step of a tool-using conversation: the model either asks for tools
 * (toolCalls) or answers (content). `toolChoice: 'none'` forces an answer.
 * Routed only to providers that support tools. Never throws.
 */
export async function completeWithTools(input: {
  apiKey: string;
  model: string;
  messages: AgentMessage[];
  tools: ToolSpec[];
  toolChoice: 'auto' | 'none';
  maxTokens: number;
}): Promise<ToolTurnResult> {
  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://panda.echoed.gg',
        'X-Title': 'Panda moderation',
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: 0,
        max_tokens: input.maxTokens,
        tools: input.tools.map((t) => ({ type: 'function', function: t })),
        tool_choice: input.toolChoice,
        provider: { require_parameters: true },
      }),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    return { ok: false, error: timedOut ? 'The model took too long to answer.' : 'Could not reach OpenRouter.' };
  }
  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body.error?.message ?? '';
    } catch {
      /* no JSON body */
    }
    return { ok: false, status: res.status, error: describeHttpError(res.status, detail) };
  }
  let body: {
    choices?: {
      message?: {
        content?: string | null;
        tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
      };
    }[];
  };
  try {
    body = (await res.json()) as typeof body;
  } catch {
    return { ok: false, error: 'OpenRouter returned an unreadable response.' };
  }
  const message = body.choices?.[0]?.message;
  const toolCalls: ToolCall[] = (message?.tool_calls ?? [])
    .filter((c) => c.id && c.function?.name)
    .map((c) => ({ id: c.id!, name: c.function!.name!, arguments: c.function!.arguments ?? '{}' }));
  const content = typeof message?.content === 'string' ? message.content : '';
  if (toolCalls.length === 0 && !content.trim()) {
    return { ok: false, error: 'The model returned an empty answer.' };
  }
  return { ok: true, content, toolCalls };
}

function describeHttpError(status: number, detail: string): string {
  switch (status) {
    case 401:
    case 403:
      return 'The OpenRouter key was rejected. The server owner should check it on the dashboard.';
    case 402:
      return 'The OpenRouter account is out of credits.';
    case 404:
      return 'The chosen model is unavailable, or no provider for it supports structured answers or tools.';
    case 408:
    case 504:
      return 'The model took too long to answer.';
    case 429:
      return 'OpenRouter is rate-limiting this key right now.';
    default:
      return `OpenRouter error ${status}${detail ? `: ${detail.slice(0, 120)}` : ''}.`;
  }
}

// Strict JSON first; then the same text without a ```json fence, which some
// providers add even in structured mode. Anything else is a failure.
function parseJsonLoose(text: string): unknown {
  const tryParse = (s: string): unknown => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };
  const direct = tryParse(text.trim());
  if (direct !== undefined) return direct;
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(text.trim());
  return fenced?.[1] ? tryParse(fenced[1]) : undefined;
}
