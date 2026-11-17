import type { Product, SameDrugGroup, Unit } from './types.ts';

const round2 = (n: number) => Math.round(n * 100) / 100;

// Discovery may report US units. Convert to the metric units the contract uses.
export function toMetric(amount: number, unit: string): { amount: number; unit: Unit } | null {
  if (!(amount > 0)) return null;
  if (unit === 'ml' || unit === 'g' || unit === 'count') return { amount: round2(amount), unit };
  if (unit === 'fl oz') return { amount: round2(amount * 29.5735), unit: 'ml' };
  if (unit === 'oz') return { amount: round2(amount * 28.3495), unit: 'g' };
  return null;
}

// ponytail: the Product contract has no field for a stated supply, so discovery writes this exact sentence into
// dailyUse.source and the cost math reads the months back out. Add a contract field if a second source type appears.
export const supplySource = (months: number) => `Package states a ${months}-month supply`;
const SUPPLY = /^Package states a (\d+(?:\.\d+)?)-month supply$/;

// Never guesses: any missing input or unit mismatch (ml vs g) gives null.
export function costPerMonth(p: Pick<Product, 'packageSize' | 'dailyUse' | 'price'>): Product['costPerMonth'] {
  const { packageSize: pkg, dailyUse: daily, price } = p;
  if (!pkg || !daily || !price || pkg.unit !== daily.unit) return null;
  if (!(pkg.amount > 0) || !(daily.amount > 0) || !(price.usd > 0)) return null;
  const $ = (n: number) => `$${n.toFixed(2)}`;
  // A stated supply is the label fact. Use its months as given, not a daily amount worked back from them.
  const stated = daily.source.match(SUPPLY);
  if (stated) {
    const months = Number(stated[1]);
    const usd = price.usd / months;
    return { usd: round2(usd), monthsPerPackage: months, formula: `${daily.source}. ${$(price.usd)} / ${months} = ${$(usd)} per month` };
  }
  // Divide by the rounded months the formula shows, so the printed arithmetic checks out ($29.97 / 1.00 = $29.97, not $29.94).
  const months = round2(pkg.amount / (daily.amount * 30));
  if (!(months > 0)) return null;
  const usd = price.usd / months;
  const u = pkg.unit === 'count' ? '' : ` ${pkg.unit}`;
  return {
    usd: round2(usd),
    monthsPerPackage: months,
    formula: `${pkg.amount}${u} / (${daily.amount}${u} per day x 30 days) = ${months.toFixed(2)} months. ${$(price.usd)} / ${months.toFixed(2)} months = ${$(usd)} per month`,
  };
}

// Price per ml, g or count, for comparing two packages of the same drug.
export const unitPrice = (p: Pick<Product, 'price' | 'packageSize'>) => (p.price && p.packageSize ? p.price.usd / p.packageSize.amount : null);

const normName = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const normStrength = (s: string) => {
  const m = s.match(/(\d+(?:\.\d+)?)\s*(%|mg|mcg|g|ml)?/i);
  return m ? `${Number(m[1])}${(m[2] ?? '').toLowerCase()}` : normName(s);
};

// Same active(s) + same strength(s) + same form = same drug. Products with an unknown strength are left out.
export function sameDrugGroups(products: Product[]): SameDrugGroup[] {
  const byKey = new Map<string, Product[]>();
  for (const p of products) {
    if (!p.actives.length || p.actives.some((a) => !a.strength)) continue;
    const key = [...p.actives.map((a) => `${normName(a.name)} ${normStrength(a.strength!)}`).sort(), p.form].join(' | ');
    byKey.set(key, [...(byKey.get(key) ?? []), p]);
  }
  const groups: SameDrugGroup[] = [];
  for (const [key, members] of byKey) {
    if (members.length < 2) continue;
    // Compare like with like. Cost per month only when every priced member has one. Otherwise price per unit, among members
    // sold in the same unit. Fewer than 2 comparable members = no "cheapest" claim. (A $16.66/mo Rogaine used to beat a
    // $24.99 bottle of the same size, just because only Rogaine had a monthly cost.)
    const priced = members.filter((m) => m.price);
    const monthly = priced.length > 1 && priced.every((m) => m.costPerMonth);
    const units = priced.flatMap((m) => (m.packageSize ? [m.packageSize.unit] : []));
    const unit = units.sort((a, b) => units.filter((u) => u === b).length - units.filter((u) => u === a).length)[0];
    const comparable = monthly ? priced : priced.filter((m) => m.packageSize?.unit === unit);
    if (comparable.length < 2) continue;
    const value = (m: Product) => (monthly ? m.costPerMonth!.usd : unitPrice(m)!);
    const cheapest = comparable.reduce((a, b) => (value(b) < value(a) ? b : a));
    const costs = comparable.map(value);
    const first = members[0];
    const actives = first.actives.map((a) => `${a.name.charAt(0).toUpperCase()}${a.name.slice(1).toLowerCase()} ${normStrength(a.strength!)}`).join(' + ');
    groups.push({
      key,
      label: `${actives} ${first.form}`,
      productIds: members.map((m) => m.id),
      cheapestId: cheapest.id,
      monthlySavings: monthly ? round2(Math.max(...costs) - Math.min(...costs)) : null,
    });
  }
  return groups;
}
