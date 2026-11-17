import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { discover } from './discover.ts';
import { checkFda } from './fda.ts';
import { evidenceFor } from './evidence.ts';
import { costPerMonth, sameDrugGroups } from './cost.ts';
import { rank, writeVerdict } from './verdict.ts';
import type { CompareResult, Evidence, StageId, StreamEvent, Verdict } from './types.ts';

export const CACHE_DIR = path.join(process.cwd(), 'data', 'cache');
export const cacheSlug = (q: string) => q.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

type Emit = (e: StreamEvent) => void;
const NO_PRODUCTS = 'No products found for that search. Try naming a concern like hair loss or acne.';

export async function readCache(query: string): Promise<CompareResult | null> {
  const raw = await readFile(path.join(CACHE_DIR, `${cacheSlug(query)}.json`), 'utf8').catch(() => null);
  return raw ? { ...JSON.parse(raw), cached: true } : null;
}

// Serves a cached run when one exists for this query, unless live is asked for.
// A failed live run falls back to the cached run when there is one, so "Run live" never wipes a good result.
export async function compare(query: string, emit: Emit, live = false, signal?: AbortSignal): Promise<CompareResult> {
  const cached = await readCache(query);
  if (cached && !live) {
    for (const stage of ['discover', 'fda', 'evidence', 'cost', 'verdict'] as StageId[]) {
      emit({ type: 'stage', stage, status: 'start', detail: 'Replaying cached run' });
      await new Promise((r) => setTimeout(r, 150));
      emit({ type: 'stage', stage, status: 'done', detail: 'Replayed from cached run' });
    }
    emit({ type: 'result', result: cached });
    return cached;
  }
  try {
    const result = await runLive(query, emit, signal);
    emit({ type: 'result', result });
    return result;
  } catch (e) {
    // Provider errors (billing, rate limits) go to the server log only. The viewer gets one plain line.
    console.error('Live run failed:', e instanceof Error ? e.message : e);
    const message = e instanceof Error && e.message === NO_PRODUCTS ? NO_PRODUCTS : 'The live run failed. Try again in a minute.';
    if (!cached) throw new Error(message);
    emit({ type: 'error', message: 'The live run failed, so this is the cached run.' });
    emit({ type: 'result', result: cached });
    return cached;
  }
}

async function stage<T>(emit: Emit, id: StageId, fn: () => Promise<T>, detail: (t: T) => string): Promise<T> {
  emit({ type: 'stage', stage: id, status: 'start' });
  try {
    const t = await fn();
    emit({ type: 'stage', stage: id, status: 'done', detail: detail(t) });
    return t;
  } catch (e) {
    emit({ type: 'stage', stage: id, status: 'error' });
    throw e;
  }
}

export async function runLive(query: string, emit: Emit, signal?: AbortSignal): Promise<CompareResult> {
  const generatedAt = new Date().toISOString();
  const found = await stage(
    emit,
    'discover',
    async () => {
      const d = await discover(query, generatedAt, signal);
      if (!d.products.length) throw new Error(NO_PRODUCTS);
      return d;
    },
    (d) => `${d.products.length} products from ${d.sources.length} sources`,
  );
  const { condition, conditionTerms, sources } = found;

  const products = await stage(
    emit,
    'fda',
    () => Promise.all(found.products.map(async (p) => ({ ...p, fda: await checkFda(p).catch((e) => (console.error('openFDA failed:', e instanceof Error ? e.message : e), null)) }))),
    (ps) => {
      const cosmetics = ps.filter((p) => p.fda?.status === 'NOT_FDA_DRUG').length;
      const failed = ps.filter((p) => !p.fda).length;
      if (cosmetics === ps.length) return `All ${ps.length} are cosmetics, not FDA drugs`;
      const parts = [`${ps.filter((p) => p.fda?.labelUrl).length} of ${ps.length - cosmetics} drug products matched an FDA label`];
      if (failed) parts.push(`${failed} ${failed === 1 ? 'lookup' : 'lookups'} failed`);
      if (cosmetics) parts.push(`${cosmetics} ${cosmetics === 1 ? 'is a cosmetic' : 'are cosmetics'}, not FDA drugs`);
      return parts.join('. ');
    },
  );

  const evidence = await stage(
    emit,
    'evidence',
    async () => {
      const actives = [...new Set(products.flatMap((p) => p.actives.map((a) => a.name)))];
      const topical = (a: string) => products.some((p) => p.packageSize?.unit !== 'count' && p.actives.some((x) => x.name === a));
      const all = await Promise.all(actives.map((a) => evidenceFor(a, condition, conditionTerms, topical(a)).catch(() => null)));
      return all.filter((e): e is Evidence => e !== null);
    },
    (ev) => `${ev.length} actives checked in Europe PMC`,
  );

  const costed = await stage(
    emit,
    'cost',
    async () => {
      const ps = products.map((p) => ({ ...p, costPerMonth: costPerMonth(p) }));
      return { products: ps, groups: sameDrugGroups(ps) };
    },
    (c) => `${c.products.filter((p) => p.costPerMonth).length} of ${c.products.length} have a cost per month`,
  );

  const input = { query, condition, products: costed.products, evidence, groups: costed.groups };
  const ranked = rank(costed.products, evidence);
  let verdict: Verdict;
  try {
    verdict = await stage(emit, 'verdict', () => writeVerdict(input, ranked, signal), () => 'Verdict written');
  } catch (e) {
    if (signal?.aborted) throw e;
    // The pick is computed in code, so the result still stands without the written summary.
    const pick = costed.products.find((p) => p.id === ranked.pickId)!;
    verdict = {
      pickId: ranked.pickId,
      bestValueId: ranked.bestValueId,
      summary: `${pick.brand} ${pick.name} ranks first on research depth, FDA review and cost per month.`,
      perProduct: costed.products.map((p) => ({ id: p.id, points: [] })),
      caveats: ['The written verdict failed. The ranking is still computed from the data below.'],
    };
  }
  return { ...input, generatedAt, cached: false, ranking: ranked.ranking, verdict, sources };
}
