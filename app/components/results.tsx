import type { ReactNode } from "react";
import type { Active, CompareResult, Evidence, FdaStatus, Product, SameDrugGroup } from "@/lib/types";
import { unitPrice } from "@/lib/cost";

const FDA: Record<FdaStatus, [string, string]> = {
  NDA: ["FDA-approved brand", "bg-abyss text-foam"],
  ANDA: ["FDA-approved generic", "bg-abyss text-foam"],
  OTC_MONOGRAPH: ["OTC monograph, no product trials required", "border border-abyss text-abyss"],
  NOT_FDA_DRUG: ["Cosmetic, claims not FDA-reviewed", "bg-kelp text-abyss"],
  UNKNOWN: ["No FDA label matched", "border border-dashed border-drift text-drift"],
};

const DEPTH: Record<Evidence["tier"], [number, string]> = {
  deep: [3, "Deep research"],
  some: [2, "Some research"],
  thin: [1, "Thin research"],
  none: [0, "No research found"],
};

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const plural = (n: number, w: string) => `${n.toLocaleString("en-US")} ${w}${n === 1 ? "" : "s"}`;
const norm = (s: string) => s.trim().toLowerCase();
// Links come from web search, so only http(s) ever reaches an href.
const safe = (u: string | null | undefined) => (u && /^https?:\/\//i.test(u) ? u : undefined);
const actives = (p: Product) => p.actives.map((a) => (a.strength ? `${a.name} ${a.strength}` : a.name)).join(" + ");
const isProduct = (p: Product | undefined): p is Product => !!p;

function fmtDate(s: string, time = false) {
  const d = new Date(s);
  if (isNaN(d.getTime())) return s;
  if (time) return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  // A bare YYYY-MM-DD parses as UTC midnight; format it in UTC so it stays the same day.
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: s.length === 10 ? "UTC" : undefined });
}

function Ext({ href, children, className = "" }: { href: string | null | undefined; children: ReactNode; className?: string }) {
  const h = safe(href);
  if (!h) return <span className={className}>{children}</span>;
  return (
    <a
      href={h}
      target="_blank"
      rel="noopener noreferrer"
      className={`underline decoration-plate underline-offset-[3px] hover:decoration-abyss ${className}`}
    >
      {children}
    </a>
  );
}

type Row = { p: Product; rank: number; points: string[]; ev: [Active, Evidence | undefined][] };

export function Results({ result: r, onRunLive }: { result: CompareResult; onRunLive: () => void }) {
  const byId = new Map(r.products.map((p) => [p.id, p]));
  const ranked = [...r.ranking.map((id) => byId.get(id)).filter(isProduct), ...r.products.filter((p) => !r.ranking.includes(p.id))];
  const rows: Row[] = ranked.map((p, i) => ({
    p,
    rank: i + 1,
    points: r.verdict.perProduct.find((x) => x.id === p.id)?.points ?? [],
    ev: p.actives.map((a) => [a, r.evidence.find((e) => norm(e.active) === norm(a.name))]),
  }));
  const pick = rows.find((x) => x.p.id === r.verdict.pickId) ?? rows[0];
  const best = r.verdict.bestValueId ? byId.get(r.verdict.bestValueId) : undefined;
  const groups = r.groups.filter((g) => g.productIds.length > 1);
  const tags = { pick: pick?.p.id, best: best?.id };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-plate pb-4">
        <p className="text-drift">
          Results for “{r.query}”, read as <span className="font-semibold text-abyss">{r.condition}</span>.
        </p>
        {r.cached && (
          <div className="flex flex-wrap items-center gap-3 text-sm text-drift">
            <span>Cached run from {fmtDate(r.generatedAt, true)}</span>
            <button
              type="button"
              onClick={onRunLive}
              className="rounded-full border border-abyss px-3.5 py-1.5 font-semibold text-abyss hover:bg-abyss hover:text-foam"
            >
              Run live
            </button>
          </div>
        )}
      </div>

      {pick && (
        <section aria-labelledby="pick-h" className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] lg:gap-12">
          <div>
            <p className="font-semibold text-krill-ink">Baleen&apos;s pick</p>
            <h2 id="pick-h" className="mt-1 text-3xl font-extrabold leading-[1.05] tracking-tight md:text-[2.75rem]">
              {pick.p.brand} {pick.p.name}
            </h2>
            <p className="mt-5 max-w-[60ch] text-lg leading-relaxed md:text-xl">{r.verdict.summary}</p>
            {best && best.id !== pick.p.id && (
              <p className="mt-4 max-w-[60ch]">
                Best value: <span className="font-semibold">{best.brand} {best.name}</span>
                {best.costPerMonth && `, ${usd(best.costPerMonth.usd)} a month`}.
              </p>
            )}
            {best && best.id === pick.p.id && (
              <p className="mt-4 max-w-[60ch] text-drift">
                It is also the best value: the lowest cost per month among the products with the most research.
              </p>
            )}
            {r.verdict.caveats.length > 0 && (
              <>
                <h3 className="mt-7 font-bold">Keep in mind</h3>
                <ul className="mt-2 max-w-[60ch] list-disc space-y-1 pl-5 text-drift marker:text-plate">
                  {r.verdict.caveats.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
          <dl aria-label="Why this pick" className="grid content-start gap-5 self-start rounded-lg bg-shell p-5 sm:grid-cols-2 lg:grid-cols-1">
            <Fact label="FDA review"><FdaBadge p={pick.p} /></Fact>
            <Fact label="Research depth"><Depth ev={pick.ev} /></Fact>
            <Fact label="Per month"><Cost p={pick.p} /></Fact>
            <Fact label="Price"><Price p={pick.p} /></Fact>
          </dl>
        </section>
      )}

      {groups.length > 0 && (
        <section aria-labelledby="same-h" className="mt-16">
          <h2 id="same-h" className="text-2xl font-bold">Same drug, different price</h2>
          <p className="mt-1 max-w-[60ch] text-drift">Each set has the same active ingredient, strength and form.</p>
          <div className="mt-5 grid gap-5 md:grid-cols-2">
            {groups.map((g) => (
              <SameDrug key={g.key} g={g} byId={byId} />
            ))}
          </div>
        </section>
      )}

      <section aria-labelledby="all-h" className="mt-16">
        <h2 id="all-h" className="text-2xl font-bold">Every product, ranked</h2>
        <p className="mt-1 max-w-[60ch] text-drift">Ranked by research depth, then FDA review, then cost per month.</p>

        <ol className="mt-5 space-y-3 lg:hidden">
          {rows.map((row) => (
            <li key={row.p.id} className="rounded-lg bg-shell p-4">
              <div className="flex gap-3">
                <Rank row={row} pickId={tags.pick} />
                <div className="min-w-0 flex-1">
                  <Name row={row} tags={tags} />
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5 border-t border-kelp pt-4">
                <Fact label="FDA review"><FdaBadge p={row.p} /></Fact>
                <Fact label="Per month"><Cost p={row.p} /></Fact>
                <Fact label="Research depth"><Depth ev={row.ev} /></Fact>
                <Fact label="Price"><Price p={row.p} /></Fact>
              </dl>
              <div className="mt-4 border-t border-kelp pt-3">
                <Warnings p={row.p} />
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-5 hidden overflow-hidden rounded-lg bg-shell lg:block">
          <table className="w-full text-left">
            <caption className="sr-only">Products ranked by research depth, then FDA review, then cost per month</caption>
            <thead className="text-sm text-drift">
              <tr className="[&>th]:px-4 [&>th]:pb-3 [&>th]:pt-4 [&>th]:font-semibold">
                <th scope="col" className="w-12"><span className="sr-only">Rank</span></th>
                <th scope="col" className="w-[27%]">Product</th>
                <th scope="col">FDA review</th>
                <th scope="col">Research depth</th>
                <th scope="col">Per month</th>
                <th scope="col">Price</th>
                <th scope="col">Label warnings</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.p.id} className="border-t border-kelp align-top [&>*]:px-4 [&>*]:py-5">
                  <td><Rank row={row} pickId={tags.pick} /></td>
                  <th scope="row" className="font-normal"><Name row={row} tags={tags} /></th>
                  <td><FdaBadge p={row.p} /></td>
                  <td><Depth ev={row.ev} /></td>
                  <td><Cost p={row.p} /></td>
                  <td><Price p={row.p} /></td>
                  <td><Warnings p={row.p} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {r.evidence.length > 0 && (
        <section aria-labelledby="research-h" className="mt-16">
          <h2 id="research-h" className="text-2xl font-bold">Reading the research</h2>
          <p className="mt-1 max-w-[62ch] text-drift">
            Depth counts systematic reviews and randomized trials in Europe PMC. It shows how much has been studied, not how well
            a product works.
          </p>
          <div className="mt-6 grid gap-x-12 gap-y-10 md:grid-cols-2">
            {r.evidence.map((e) => (
              <article key={`${e.active}|${e.condition}`}>
                <h3 className="text-lg font-bold">
                  {e.active} for {e.condition}
                </h3>
                <div className="mt-2">
                  <Depth ev={[[{ name: e.active, strength: null }, e]]} />
                </div>
                {e.top.length > 0 && (
                  <ol className="mt-4 space-y-3 border-l-2 border-plate pl-4">
                    {e.top.map((t) => (
                      <li key={t.pmid} className="text-sm leading-snug">
                        <Ext href={t.url}>{t.title}</Ext>
                        <span className="mt-0.5 block text-drift">
                          {t.year ?? "Year unknown"}, PMID {t.pmid}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
                <p className="mt-3 text-sm">
                  <Ext href={e.queryUrl}>See the full search on Europe PMC</Ext>
                </p>
              </article>
            ))}
          </div>
        </section>
      )}

      {r.sources.length > 0 && (
        <details className="mt-16">
          <summary className="font-semibold">Pages Baleen read ({r.sources.length})</summary>
          <ul className="mt-3 space-y-1.5 text-sm">
            {r.sources.map((s, i) => (
              <li key={s.url + i} className="break-words">
                <Ext href={s.url}>{s.title || s.url}</Ext>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="mb-1.5 text-xs font-semibold text-drift">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Rank({ row, pickId }: { row: Row; pickId?: string }) {
  return (
    <span className={`block text-2xl font-extrabold leading-none ${row.p.id === pickId ? "text-krill-ink" : "text-plate"}`}>
      <span className="sr-only">Rank </span>
      {row.rank}
    </span>
  );
}

function Name({ row, tags }: { row: Row; tags: { pick?: string; best?: string } }) {
  const { p } = row;
  return (
    <div>
      <p className="text-sm text-drift">{p.brand}</p>
      <p className="font-semibold leading-snug">{p.name}</p>
      <p className="mt-1 text-sm">
        {actives(p)} <span className="text-drift">{p.form}</span>
      </p>
      {(p.id === tags.pick || p.id === tags.best) && (
        <p className="mt-2 flex flex-wrap gap-1.5 text-xs font-bold">
          {p.id === tags.pick && <span className="rounded bg-krill px-1.5 py-0.5 text-white">Pick</span>}
          {p.id === tags.best && <span className="rounded border border-krill-ink px-1.5 py-0.5 text-krill-ink">Best value</span>}
        </p>
      )}
      {row.points.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-4 text-sm text-drift marker:text-plate">
          {row.points.map((pt, i) => (
            <li key={i}>{pt}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FdaBadge({ p }: { p: Product }) {
  // null = the openFDA lookup itself failed (timeout or rate limit), which is not the same as "no label matched".
  const [label, cls] = p.fda ? FDA[p.fda.status] : ["FDA check failed", "border border-dashed border-krill-ink text-krill-ink"];
  return (
    <div>
      <span className={`inline-block rounded px-2 py-1 text-xs font-semibold leading-tight ${cls}`}>{label}</span>
      {p.fda?.applicationNumber && <p className="mt-1 text-xs text-drift">{p.fda.applicationNumber}</p>}
    </div>
  );
}

function Gauge({ level }: { level: number }) {
  return (
    <span aria-hidden className="mt-1 flex shrink-0 flex-col gap-[3px]">
      {[1, 2, 3].map((n) => (
        <span key={n} className={`block h-[3px] w-5 rounded-full ${n <= level ? "bg-abyss" : "bg-plate/60"}`} />
      ))}
    </span>
  );
}

function Depth({ ev }: { ev: Row["ev"] }) {
  return (
    <div className="space-y-2.5">
      {ev.map(([a, e]) => {
        const [level, label] = e ? DEPTH[e.tier] : [0, "Not checked"];
        return (
          <div key={a.name} className="flex items-start gap-2.5 text-sm leading-snug">
            <Gauge level={level} />
            <div>
              <span className="whitespace-nowrap font-semibold">{label}</span>
              {ev.length > 1 && <span className="text-drift"> for {a.name}</span>}
              {e && <span className="block text-drift">{plural(e.reviews, "review")}, {plural(e.trials, "trial")}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Cost({ p }: { p: Product }) {
  const c = p.costPerMonth;
  if (!c) {
    const miss = [!p.price && "price", !p.packageSize && "package size", !p.dailyUse && "daily amount"].filter(Boolean);
    return (
      <p className="text-sm leading-snug">
        <span className="font-semibold">Not enough data</span>
        <span className="block text-drift">{miss.length ? `No ${miss.join(" or ")} found.` : "Label units don't match."}</span>
      </p>
    );
  }
  const src = p.dailyUse?.source;
  return (
    <details className="group">
      <summary title={c.formula} className="list-none [&::-webkit-details-marker]:hidden">
        <span className="text-xl font-extrabold">{usd(c.usd)}</span>
        <span className="block text-xs text-drift underline decoration-dotted underline-offset-2">
          <span className="group-open:hidden">Show the math</span>
          <span className="hidden group-open:inline">Hide the math</span>
        </span>
      </summary>
      <p className="mt-2 text-xs leading-relaxed text-drift">{c.formula}</p>
      {/* A stated supply is already in the formula. Directions text came from the web, so it stays plain text, never a link. */}
      {src && !c.formula.includes(src) && <p className="mt-1.5 text-xs text-drift">Daily amount from the label directions: “{src}”</p>}
    </details>
  );
}

function Price({ p }: { p: Product }) {
  if (!p.price) return <p className="text-sm text-drift">No US price found</p>;
  const r = p.rating;
  return (
    <div className="text-sm leading-snug">
      <Ext href={p.price.url} className="font-semibold lg:whitespace-nowrap">
        {usd(p.price.usd)} at {p.price.retailer}
      </Ext>
      <span className="block text-drift">
        {p.packageSize && `${p.packageSize.amount} ${p.packageSize.unit}, `}seen {fmtDate(p.price.seenAt)}
      </span>
      {r && (
        <span className="mt-1.5 block text-drift">
          <Ext href={r.url}>{r.stars.toFixed(1)} of 5</Ext>
          {r.count ? ` from ${plural(r.count, "rating")}` : ""} on {r.source}
        </span>
      )}
    </div>
  );
}

function Warnings({ p }: { p: Product }) {
  const f = p.fda;
  if (!f) return <p className="text-sm text-drift">FDA check failed, so no label</p>;
  if (f.status === "NOT_FDA_DRUG") return <p className="text-sm text-drift">Cosmetic, so there is no drug label.</p>;
  if (!f.warnings.length)
    return (
      <p className="text-sm text-drift">
        {f.labelUrl ? <Ext href={f.labelUrl}>Label on DailyMed</Ext> : "No label warnings found"}
      </p>
    );
  return (
    <details className="text-sm">
      <summary className="font-semibold lg:whitespace-nowrap">Label warnings ({f.warnings.length})</summary>
      <ul className="mt-2 space-y-1.5 border-l-2 border-abyss pl-3">
        {f.warnings.map((w, i) => (
          <li key={i}>“{w}”</li>
        ))}
      </ul>
      {f.labelUrl && (
        <p className="mt-2">
          <Ext href={f.labelUrl}>Full label on DailyMed</Ext>
        </p>
      )}
    </details>
  );
}

function SameDrug({ g, byId }: { g: SameDrugGroup; byId: Map<string, Product> }) {
  const members = g.productIds.map((id) => byId.get(id)).filter(isProduct);
  // With monthly savings the group was compared on cost per month. Otherwise on price per ml, g or count.
  const monthly = g.monthlySavings != null;
  const value = (m: Product) => (monthly ? (m.costPerMonth?.usd ?? null) : unitPrice(m));
  const unit = byId.get(g.cheapestId)?.packageSize?.unit ?? "ml";
  const compared = members.filter((m) => value(m) != null && (monthly || m.packageSize?.unit === unit));
  const max = Math.max(0, ...compared.map((m) => value(m)!));
  const cheapest = byId.get(g.cheapestId);
  const priciest = compared.reduce((a, b) => (value(b)! > value(a)! ? b : a), compared[0]);
  const per = (n: number) => (unit === "count" ? `${usd(n)} per unit` : `${usd(n * 100)} per 100 ${unit}`);
  return (
    <div className="rounded-lg bg-shell p-5">
      <h3 className="text-lg font-bold">{g.label}</h3>
      {cheapest && priciest && priciest.id !== cheapest.id && (
        <p className="mt-1">
          {monthly ? (
            <>
              <span className="font-semibold text-krill-ink">Save {usd(g.monthlySavings!)} a month</span> with {cheapest.brand} instead of{" "}
              {priciest.brand}.
            </>
          ) : (
            <>
              <span className="font-semibold text-krill-ink">{cheapest.brand} costs less per {unit === "count" ? "unit" : unit}</span> than{" "}
              {priciest.brand}. No monthly cost, since the label gives no daily amount.
            </>
          )}
        </p>
      )}
      <ul className="mt-4 space-y-3.5">
        {members.map((m) => {
          const v = compared.includes(m) ? value(m) : null;
          return (
            <li key={m.id}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="font-semibold">{m.brand}</span> <span className="text-drift">{m.name}</span>
                </span>
                <span className="shrink-0 text-right font-semibold">
                  {v == null ? (
                    <span className="font-normal text-drift">{m.price ? `${usd(m.price.usd)}, not comparable` : "No price found"}</span>
                  ) : monthly ? (
                    `${usd(v)} a month`
                  ) : (
                    <>
                      {per(v)}
                      <span className="block text-xs font-normal text-drift">
                        {usd(m.price!.usd)} for {m.packageSize!.amount} {m.packageSize!.unit}
                      </span>
                    </>
                  )}
                </span>
              </div>
              {v != null && max > 0 && (
                <div aria-hidden className="mt-1.5 h-2 rounded-full bg-kelp">
                  <div className={`h-2 rounded-full ${m.id === g.cheapestId ? "bg-krill" : "bg-drift"}`} style={{ width: `${(v / max) * 100}%` }} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
