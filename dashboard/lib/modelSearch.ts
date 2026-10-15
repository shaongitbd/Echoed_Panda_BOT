// Searching OpenRouter's model list. Shared by the /api/ai-models endpoint
// and the model picker, so typing in the picker ranks results exactly as the
// endpoint would — the picker just does it locally, with no round trip per
// keystroke.

export interface ModelOption {
  id: string;
  /** "DeepSeek: DeepSeek V4 Flash" — the provider prefix is OpenRouter's. */
  name: string;
  /** USD per million input tokens; null when OpenRouter prices it per request (routers). */
  promptPerMillion: number | null;
  /** USD per million output tokens; null as above. */
  completionPerMillion: number | null;
  /** Tokens; null when not published. */
  contextLength: number | null;
  /** Unix seconds — when OpenRouter added it. */
  created: number;
}

export type ModelSort = 'match' | 'cheapest' | 'newest';

const norm = (s: string) => s.toLowerCase();

/**
 * Every word of the query has to appear in the id or the name ("deep flash",
 * "claude haiku", "free"). Ranked: exact id, then id/name starting with the
 * query, then the rest — or by price or age when asked.
 */
export function searchModels(models: ModelOption[], query: string, sort: ModelSort = 'match'): ModelOption[] {
  const q = norm(query.trim());
  const words = q.split(/\s+/).filter(Boolean);
  const hits = words.length === 0
    ? models.slice()
    : models.filter((m) => {
        const hay = `${norm(m.id)} ${norm(m.name)}`;
        return words.every((w) => hay.includes(w));
      });

  const score = (m: ModelOption): number => {
    if (!q) return 0;
    const id = norm(m.id);
    const name = norm(m.name);
    // "deepseek-v4-flash" should find deepseek/deepseek-v4-flash first.
    const bare = id.slice(id.indexOf('/') + 1);
    const nameAfterProvider = name.slice(name.indexOf(':') + 1).trim();
    if (id === q || bare === q) return 0;
    if (id.startsWith(q) || bare.startsWith(q) || nameAfterProvider.startsWith(q) || name.startsWith(q)) return 1;
    if (id.includes(q) || name.includes(q)) return 2;
    return 3;
  };
  const price = (m: ModelOption) => (m.promptPerMillion ?? Infinity) + (m.completionPerMillion ?? Infinity);

  return hits.sort((a, b) => {
    if (sort === 'cheapest') return price(a) - price(b) || a.id.localeCompare(b.id);
    if (sort === 'newest') return b.created - a.created || a.id.localeCompare(b.id);
    return score(a) - score(b) || b.created - a.created || a.id.localeCompare(b.id);
  });
}

/** "$0.15", "$3", "free", or null for "priced per request". */
export function formatPerMillion(usd: number | null): string | null {
  if (usd === null) return null;
  if (usd === 0) return 'free';
  if (usd < 0.01) return `$${usd.toFixed(3)}`;
  return `$${usd < 10 ? usd.toFixed(2).replace(/\.00$/, '') : Math.round(usd)}`;
}

/** 131072 → "131k", 1048576 → "1M". */
export function formatContext(tokens: number | null): string | null {
  if (!tokens) return null;
  if (tokens >= 1_000_000) return `${+(tokens / 1_048_576).toFixed(1)}M`;
  return `${Math.round(tokens / 1000)}k`;
}
