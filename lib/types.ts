export type Unit = 'ml' | 'g' | 'count';
export type FdaStatus = 'NDA' | 'ANDA' | 'OTC_MONOGRAPH' | 'NOT_FDA_DRUG' | 'UNKNOWN';
export type StageId = 'discover' | 'fda' | 'evidence' | 'cost' | 'verdict';
export interface Active { name: string; strength: string | null }            // strength like "5%" or "0.1%"
export interface Product {
  id: string; brand: string; name: string; form: string;                       // form: foam | solution | gel | cream | serum | wash | shampoo | other
  actives: Active[];
  packageSize: { amount: number; unit: Unit } | null;
  dailyUse: { amount: number; unit: Unit; source: string } | null;             // source = label/directions text or URL it came from
  price: { usd: number; retailer: string; url: string | null; seenAt: string } | null;
  rating: { stars: number; count: number | null; source: string; url: string | null } | null;
  fda: { status: FdaStatus; applicationNumber: string | null; labelUrl: string | null; warnings: string[] } | null;
  costPerMonth: { usd: number; monthsPerPackage: number; formula: string } | null;
}
export interface Evidence { active: string; condition: string; reviews: number; trials: number; tier: 'deep' | 'some' | 'thin' | 'none'; top: { pmid: string; title: string; year: number | null; url: string }[]; queryUrl: string }
export interface SameDrugGroup { key: string; label: string; productIds: string[]; cheapestId: string; monthlySavings: number | null }
export interface Verdict { pickId: string; bestValueId: string | null; summary: string; perProduct: { id: string; points: string[] }[]; caveats: string[] }
export interface CompareResult { query: string; condition: string; generatedAt: string; cached: boolean; products: Product[]; evidence: Evidence[]; groups: SameDrugGroup[]; ranking: string[]; verdict: Verdict; sources: { url: string; title: string }[] }
export type StreamEvent =
  | { type: 'stage'; stage: StageId; status: 'start' | 'done' | 'error'; detail?: string }
  | { type: 'result'; result: CompareResult }
  | { type: 'error'; message: string };
