// GET /api/ai-models?q=deepseek%20flash&sort=cheapest&limit=20
//
// OpenRouter's models that Panda can use (they enforce a JSON schema),
// searched and sorted. The list is fetched from OpenRouter at most once an
// hour (lib/openrouter.ts), so a search here is a filter over memory.
// Logged-in users only — it's public data, but this shouldn't be an open
// proxy to OpenRouter for the internet.

import { NextResponse, type NextRequest } from 'next/server';
import { getSession } from '@/lib/auth';
import { listStructuredModels } from '@/lib/openrouter';
import { searchModels, type ModelSort } from '@/lib/modelSearch';

const SORTS: ReadonlySet<ModelSort> = new Set(['match', 'cheapest', 'newest']);

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!(await getSession())) {
    return NextResponse.json({ error: 'Log in first.' }, { status: 401 });
  }

  const params = req.nextUrl.searchParams;
  const q = (params.get('q') ?? '').slice(0, 100);
  const rawSort = params.get('sort') as ModelSort | null;
  const sort: ModelSort = rawSort && SORTS.has(rawSort) ? rawSort : 'match';
  const rawLimit = Number(params.get('limit'));
  // No limit → everything (a few hundred rows; the picker searches it locally).
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 1000) : 1000;

  const all = await listStructuredModels();
  const hits = searchModels(all, q, sort);
  return NextResponse.json(
    {
      // Empty with total 0 means OpenRouter couldn't be reached.
      available: all.length > 0,
      total: hits.length,
      models: hits.slice(0, limit),
    },
    { headers: { 'Cache-Control': 'private, max-age=300' } },
  );
}
