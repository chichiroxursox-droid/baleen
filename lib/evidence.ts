import type { Evidence } from './types.ts';

const EPMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';
const REVIEWS = '(PUB_TYPE:"Meta-Analysis" OR PUB_TYPE:"Systematic Review")';
const TRIALS = 'PUB_TYPE:"Randomized Controlled Trial"';
// Letters and comments are tagged "Systematic Review" too often (a caffeine letter counted as a hair loss review).
const NOISE = ' NOT (PUB_TYPE:"Letter" OR PUB_TYPE:"Comment" OR PUB_TYPE:"Editorial")';

// Research depth, not effect size.
export function tierFor(reviews: number, trials: number): Evidence['tier'] {
  if (reviews >= 3 && trials >= 5) return 'deep';
  if (reviews >= 1 || trials >= 3) return 'some';
  if (trials >= 1) return 'thin';
  return 'none';
}

type Hit = { pmid?: string; title?: string; pubYear?: string; citedByCount?: number };

async function search(query: string): Promise<{ count: number; hits: Hit[] }> {
  const params = new URLSearchParams({ query, format: 'json', resultType: 'lite', pageSize: '2', sort: 'CITED desc' });
  const res = await fetch(`${EPMC}?${params}`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Europe PMC ${res.status}`);
  const json = await res.json();
  return { count: json.hitCount ?? 0, hits: json.resultList?.result ?? [] };
}

const phrase = (s: string) => `TITLE_ABS:"${s.replace(/"/g, '')}"`;

// Without this, "peptides" or "hyaluronic acid" for skin aging count oral collagen supplements and injected fillers.
const TOPICAL = ' AND (TITLE_ABS:"topical" OR TITLE_ABS:"topically")';

// terms = the condition plus synonyms that research titles use (e.g. "acne", "acne vulgaris").
// topical = the active is sold here as something applied to skin or scalp, not only as pills or gummies.
export async function evidenceFor(active: string, condition: string, terms: string[], topical = true): Promise<Evidence> {
  const cond = [...new Set([condition, ...terms].map((t) => t.toLowerCase().trim()).filter(Boolean))];
  const rest = ` AND (${cond.map(phrase).join(' OR ')})${topical ? TOPICAL : ''}`;
  // Reviews must name the active in the title. Otherwise a glutathione review counted toward vitamin C.
  // Live check: minoxidil, adapalene, benzoyl peroxide and salicylic acid all stay deep with this.
  const reviewQ = `(TITLE:"${active.replace(/"/g, '')}")${rest} AND ${REVIEWS}${NOISE}`;
  const trialQ = `(${phrase(active)})${rest} AND ${TRIALS}${NOISE}`;
  const [r, t] = await Promise.all([search(reviewQ), search(trialQ)]);
  const top = [...r.hits, ...t.hits]
    .filter((h, i, all) => h.pmid && h.title && all.findIndex((x) => x.pmid === h.pmid) === i)
    .sort((a, b) => (b.citedByCount ?? 0) - (a.citedByCount ?? 0))
    .slice(0, 2)
    .map((h) => ({
      pmid: h.pmid!,
      title: h.title!.replace(/<[^>]+>/g, ''),
      year: h.pubYear ? Number(h.pubYear) : null,
      url: `https://pubmed.ncbi.nlm.nih.gov/${h.pmid}/`,
    }));
  return {
    active,
    condition,
    reviews: r.count,
    trials: t.count,
    tier: tierFor(r.count, t.count),
    top,
    queryUrl: `https://europepmc.org/search?query=${encodeURIComponent(`(${reviewQ}) OR (${trialQ})`)}`,
  };
}
