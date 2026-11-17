import type { FdaStatus, Product } from './types.ts';

const LABELS = 'https://api.fda.gov/drug/label.json';

// ponytail: fixed list of topical drug actives for skin and hair. A product with none of these is a cosmetic.
// Add an ingredient here if a real drug product shows up as "Cosmetic".
const DRUG_ACTIVES = [
  'minoxidil', 'finasteride', 'ketoconazole', 'pyrithione zinc', 'selenium sulfide', 'coal tar',
  'salicylic acid', 'benzoyl peroxide', 'adapalene', 'tretinoin', 'sulfur', 'resorcinol', 'azelaic acid',
  'clindamycin', 'hydroquinone', 'hydrocortisone', 'avobenzone', 'homosalate', 'octisalate', 'octocrylene',
  'octinoxate', 'oxybenzone', 'zinc oxide', 'titanium dioxide', 'ensulizole',
];

export function mapApplication(app: string | null | undefined): FdaStatus {
  if (!app) return 'UNKNOWN';
  if (/^ANDA/i.test(app)) return 'ANDA';
  if (/^NDA/i.test(app)) return 'NDA';
  if (/^(M\d{3}|part\d{3})/i.test(app)) return 'OTC_MONOGRAPH';
  return 'UNKNOWN';
}

type Label = {
  set_id: string;
  active_ingredient?: string[];
  openfda?: { brand_name?: string[]; generic_name?: string[]; application_number?: string[]; manufacturer_name?: string[] };
  package_label_principal_display_panel?: string[];
  when_using?: string[];
  stop_use?: string[];
  warnings?: string[];
  adverse_reactions?: string[];
};

const words = (s: string) => s.toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean);
const hasAll = (text: string, name: string) => {
  const t = new Set(words(text));
  return words(name).every((w) => t.has(w));
};
const isDrugActive = (name: string) => DRUG_ACTIVES.some((d) => hasAll(name, d));
const percents = (s: string) => [...s.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((m) => Number(m[1]));

const FORM_WORDS: Record<string, RegExp> = {
  foam: /foam|aerosol/i, solution: /solution/i, gel: /\bgel\b/i, cream: /cream/i,
  serum: /serum/i, wash: /wash|cleanser/i, shampoo: /shampoo/i,
};

async function search(q: string): Promise<Label[]> {
  const key = process.env.OPENFDA_API_KEY ? `&api_key=${process.env.OPENFDA_API_KEY}` : '';
  const res = await fetch(`${LABELS}?search=${encodeURIComponent(q)}&limit=100${key}`, { signal: AbortSignal.timeout(10_000) });
  if (res.status === 404) return []; // openFDA answers "no matches" with 404
  if (!res.ok) throw new Error(`openFDA ${res.status}`);
  return (await res.json()).results ?? [];
}

// ponytail: words that never tell two products of one brand apart. Add one if a real match shows up as UNKNOWN.
const FILLER = new Set(
  'acne facial face daily treatment hair regrowth loss men mens women womens for with and topical extra maximum max strength medicated medication skin care scalp the usp percent month supply count pack foam foaming aerosol solution liquid gel cream serum wash cleanser shampoo lotion bpo'.split(' '),
);
// Name words that set this product apart from its siblings, e.g. "oil free" or "proofing".
const distinctive = (p: Pick<Product, 'brand' | 'name' | 'actives'>) =>
  words(p.name).filter((w) => w.length > 2 && !/\d/.test(w) && !FILLER.has(w) && !words(p.brand).includes(w) && !p.actives.some((a) => words(a.name).includes(w)));
// Store brands often print their name only on the package panel. "Compare to Neutrogena Oil-Free Acne Wash" names someone else.
const panelOf = (l: Label) => (l.package_label_principal_display_panel ?? []).join(' ').replace(/compare to.{0,80}/gi, ' ');
const labelWords = (l: Label) => new Set(words(`${l.openfda?.brand_name?.[0] ?? ''} ${panelOf(l)}`));

// Score a label for a product. null = rejected: another company's label, or a drug active or its strength is missing.
export function scoreLabel(p: Pick<Product, 'brand' | 'name' | 'form' | 'actives'>, label: Label): number | null {
  const brandName = label.openfda?.brand_name?.[0] ?? '';
  const maker = hasAll(`${brandName} ${label.openfda?.manufacturer_name?.[0] ?? ''}`, p.brand);
  if (!maker && !hasAll(panelOf(label), p.brand)) return null;
  const ai = (label.active_ingredient ?? []).join(' ');
  const drugs = p.actives.filter((a) => isDrugActive(a.name));
  for (const a of drugs) {
    if (!hasAll(ai, a.name)) return null;
    const want = a.strength ? percents(a.strength)[0] : undefined;
    if (want !== undefined && !percents(ai).includes(want)) return null;
  }
  const generics = (label.openfda?.generic_name?.[0] ?? '').split(/,| and /i).map((g) => g.trim()).filter(Boolean);
  const extra = generics.filter((g) => !drugs.some((a) => hasAll(g, a.name))).length;
  const formHit = FORM_WORDS[p.form]?.test(`${brandName} ${panelOf(label)} ${ai}`) ? 1 : 0;
  const lw = labelWords(label);
  const hits = distinctive(p).filter((w) => lw.has(w)).length;
  // Closest brand name wins: "Oil-Free Acne Wash" over "Oil-Free Acne Wash Sensitive Skin Fragrance Free".
  const own = new Set(words(`${p.brand} ${p.name} ${p.actives.map((a) => a.name).join(' ')}`));
  const bn = words(brandName);
  const near = bn.filter((w) => own.has(w)).length * 0.1 - bn.filter((w) => !own.has(w)).length * 0.05;
  return drugs.length * 2 - extra + formHit + hits + (maker ? 0.3 : 0) + near;
}

// The best label, or null when the pick would be a guess between sibling products.
export function pickLabel(p: Pick<Product, 'brand' | 'name' | 'form' | 'actives'>, labels: Label[]): Label | null {
  const scored = labels
    .flatMap((l) => {
      const s = scoreLabel(p, l);
      return s === null ? [] : [{ l, s, name: words(l.openfda?.brand_name?.[0] ?? '').join(' ') }];
    })
    .sort((a, b) => b.s - a.s);
  const best = scored[0];
  if (!best) return null;
  // Several products of this brand share the active. The label must carry one of this product's own name words.
  // (Seen live: "Acne Proofing Gel Cleanser" matched an "Oil-Free Acne Wash Sensitive Skin" label.)
  const want = distinctive(p);
  const siblings = new Set(scored.map((x) => x.name)).size > 1;
  if (siblings && want.length && !want.some((w) => labelWords(best.l).has(w))) return null;
  if (scored.some((x) => x.name !== best.name && best.s - x.s < 0.01)) return null; // tied with a different product
  return best.l;
}

const SIDE_EFFECT = /irritat|redness|itch|burn|dryness|peel|swell|rash|hives|dizz|faint|chest pain|heartbeat|weight gain|hair growth|hair color|allerg|sting|blister|sensitiv|headache|bleach|worsen/i;

// Label bullets often arrive glued into one run-on string. Split on punctuation, bullet marks, and the lead-ins that start a bullet.
const PIECES = /(?<=[.;:!?]|\boccurs?)\s+|\s*[•■▪]\s*|\s+(?=(?:when using this product|stop use and ask|do not use|keep out of reach|you (?:have|become|see|notice)\b))|(?<!\bif)\s+(?=irritation (?:becomes|\())/i;
const LEAD = /^(stop use and ask (?:a )?doctor if|when using this product|do not use(?: if you)?|ask a doctor before use if(?: you)?)\b/i;

// Up to 4 short verbatim pieces that name side effects. Clean pieces win. A long run-on only gets an "..." window when nothing clean exists.
export function pickWarnings(label: Label): string[] {
  const clean: string[] = [];
  const windowed: string[] = [];
  const add = (list: string[], s: string) => {
    if (![...clean, ...windowed].some((o) => o.includes(s) || s.includes(o))) list.push(s); // labels repeat a line inside a longer one
  };
  const texts = [label.stop_use, label.when_using, label.warnings, label.adverse_reactions].flatMap((t) => t ?? []);
  for (const text of texts) {
    let lead = '';
    for (let s of text.split(PIECES)) {
      s = s.trim();
      lead = s.match(LEAD)?.[0] ?? lead;
      const m = s.match(SIDE_EFFECT);
      if (!m || s.length < 15) continue;
      // A bare bullet like "have very sensitive skin" keeps its section lead-in, with "..." marking the cut.
      if (s.length <= 180) add(clean, lead && /^[a-z]/.test(s) ? `${lead} ... ${s}` : s);
      else {
        const start = s.lastIndexOf(' ', Math.max(0, m.index! - 60));
        const end = s.indexOf(' ', Math.min(s.length, m.index! + 110));
        add(windowed, `${start > 0 ? '...' : ''}${s.slice(start + 1, end < 0 ? undefined : end)}${end < 0 ? '' : '...'}`);
      }
    }
  }
  return (clean.length ? clean : windowed).slice(0, 4);
}

export async function checkFda(p: Product): Promise<Product['fda']> {
  const drugs = p.actives.filter((a) => isDrugActive(a.name));
  if (!drugs.length) return { status: 'NOT_FDA_DRUG', applicationNumber: null, labelUrl: null, warnings: [] };
  const brand = words(p.brand).join(' ');
  const generic = words(drugs[0].name).join(' ');
  // Both queries always run. Store brands split across fields (brand "Oil Free Acne Wash", maker Walmart, "equate" on the panel),
  // so the brand query alone found another Equate label and stopped there.
  const found = await Promise.all([
    search(`openfda.brand_name:"${brand}" AND openfda.generic_name:"${generic}"`),
    search(`openfda.generic_name:"${generic}" AND (openfda.brand_name:(${brand}) OR openfda.manufacturer_name:(${brand}) OR package_label_principal_display_panel:(${brand}))`),
  ]);
  const best = pickLabel(p, [...new Map(found.flat().map((l) => [l.set_id, l])).values()]);
  if (!best) return { status: 'UNKNOWN', applicationNumber: null, labelUrl: null, warnings: [] };
  const app = best.openfda?.application_number?.[0] ?? null;
  return {
    status: mapApplication(app),
    applicationNumber: app,
    labelUrl: `https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${best.set_id}`,
    warnings: pickWarnings(best),
  };
}
