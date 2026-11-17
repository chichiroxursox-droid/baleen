# Baleen: agent notes

Vercel project **baleen** (team chiethan), production https://baleen-taupe.vercel.app, first deployed 2026-09-27. Deploy with `vercel --prod --scope chiethan` from this folder. Prod env: `ANTHROPIC_API_KEY`, `BALEEN_MODEL`. No `OPENFDA_API_KEY` yet, so FDA lookups share Vercel's IP limit (one live run had all 8 fail, the next matched 7 of 8). Failures now log as `openFDA failed:` in `vercel logs`.

OwlHacks 2026 app. Live research on skincare and hair loss products: same drug or not, research depth, FDA label warnings, cost per month, and a pick. Read STATE.md for what works and what's open. Task list: tasks/todo.md.

## Rules

- MLH rule 9: every line is written during the hackathon. Never read or copy code from other repos (especially `~/Desktop/CLAUDE CODE/Medical Studies`).
- Don't commit, push or deploy unless Ethan asks. Keys live only in `.env.local` (gitignored). Never print them.
- No em dashes in UI copy or docs. Short sentences.
- The ponytail plugin is on: minimal code, fewest files, one small test for non-trivial logic.
- A hook blocks curl/wget in Bash. For live HTTP checks, write a tiny node script and run it with `node`.

## Stack

Next.js 15.5 App Router, React 19.1, TypeScript, Tailwind 4, Vercel AI SDK v7 (`ai`) with `@ai-sdk/anthropic` v4, zod 3. Node 24 runs the `.ts` files in `lib/` and `scripts/` directly. Check library APIs against `node_modules` types, not memory.

## Request flow

```
app/page.tsx  --POST {query, live?}-->  app/api/compare/route.ts  -->  lib/pipeline.ts compare()
                <--NDJSON StreamEvent--                                  |
                                                                         |- cached? replay stages, emit result
                                                                         '- runLive():
   lib/discover.ts   discover()      Claude + web search, URL grounding, verifyPrices() opens each price page
   lib/fda.ts        checkFda()      openFDA: 2 queries merged, scoreLabel + pickLabel, pickWarnings
   lib/evidence.ts   evidenceFor()   Europe PMC counts -> tier (research depth, not effect size)
   lib/cost.ts       costPerMonth(), sameDrugGroups()
   lib/verdict.ts    rank() in code, then writeVerdict() = verdictPrompt() -> generateText -> finishVerdict()
```

- `lib/types.ts` is the contract. Don't change its shape.
- A failed live run falls back to the cached run when one exists and emits `{type:'error'}` before the result. The page shows that as a notice, not an alert.
- Provider errors go to the server log only. The viewer sees "The live run failed. Try again in a minute."
- `req.signal` aborts the Anthropic calls when the viewer leaves.
- Uncached and `live:true` runs are limited to 6 per IP per hour (in-memory, route.ts). Cached chips are unlimited.

## Cache

- `data/cache/<slug>.json`, slug = `cacheSlug(query)`. Only the 3 chip queries are cached.
- `npm run warm` rebuilds them through `runLive()` (never through `compare()`, so a failed run can't rewrite a cache with an old one).
- `next.config.ts` ships `data/cache/**` with the API function via `outputFileTracingIncludes`.
- After warming, read the files by hand. Check prices against the cited pages, FDA set ids against the product, and verdict sentences against the numbers.

## Env

- `ANTHROPIC_API_KEY` (live runs), `BALEEN_MODEL` (default `claude-sonnet-5`), `OPENFDA_API_KEY` (optional).
- Credit check without printing the key: a node script that POSTs a 1-token message to `/v1/messages` with `node --env-file=.env.local`.

## Smoke test

```bash
npm test                       # 14 tests, all must pass
npx tsc --noEmit
rm -rf .next && npm run build  # iCloud makes "file 2.ts" copies in .next that break tsc and build
npx next start -p 3217
```

Then in a browser at 1280 and 375 wide:
1. Click each chip. Stages replay and a pick shows, scrolled into view.
2. Click Run live. It shows either a live result or the notice "The live run failed, so this is the cached run."
3. Search "hair loss serum" (uncached). You get a live result or the plain error box, never raw provider text.
4. No horizontal scroll at 375.

## Deliberate simplifications (marked `ponytail:` in code)

- `lib/fda.ts` DRUG_ACTIVES: a fixed list of topical drug actives. A product with none of them is a cosmetic.
- `lib/fda.ts` FILLER: words that never tell two sibling products apart, used by the sibling-label rule.
- `lib/discover.ts` isProductPage: URL shapes of single-product pages at big US retailers.
- `lib/discover.ts` verifyPrices: one GET per price, no retries. A blocked page keeps its price.
- `lib/cost.ts` supplySource: a stated month supply rides in `dailyUse.source` as an exact sentence, since the contract has no field for it.
- `app/api/compare/route.ts`: per-instance in-memory rate limit. Move to Vercel KV or the firewall if abused.
- `app/page.tsx` PLATES: fixed pseudo-random baleen plate lengths in the hero SVG.
