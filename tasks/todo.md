# Tasks — Baleen

**About:** OwlHacks 2026 app (theme: aquatic). Filters the shelf down to what actually works. Live research on skincare and hair loss products: same drug or not, evidence depth, FDA label warnings, cost per month, and a pick. Submissions close Sun 2026-09-27 10:00am EDT.

## Active

- **Submit on Devpost**
  - Priority: P0
  - Status: Draft ready (DEVPOST.md, 637 words)
  - Description: Closes Sun 2026-09-27 10:00am EDT. Paste DEVPOST.md, add screenshots from docs/screens/ (hair-loss-1280, acne-group-1280, run-live-fallback-1280), and add the repo link. Read the AI disclosure line and edit it to match what you did.
- **Choose track**
  - Priority: P0
  - Status: Waiting on Ethan
  - Description: DEVPOST.md starts with "Track: TBD (Ethan to choose)".
- **Deploy decision**
  - Priority: P0
  - Status: Waiting on Ethan
  - Description: Vercel or local demo. If Vercel, set ANTHROPIC_API_KEY, BALEEN_MODEL and OPENFDA_API_KEY. next.config.ts already ships data/cache with the API route. maxDuration 120. Live runs take 30 to 45s.
- **Top up Anthropic credits, then re-warm**
  - Priority: P0
  - Status: Blocked (key has no credits)
  - Description: Every live run fails until then. Chips still work from cache. Add credits and a spend cap, check with a 1-token call, run `npm run warm`, then read the 3 cache files by hand. The current caches were re-derived from the 9:53 PM discovery data (see STATE.md).
- **Price coverage on free-text queries**
  - Priority: P2
  - Status: Open
  - Description: The model spends its 5 searches on products, so many come back unpriced (Differin, PanOxyl, Kirkland in the chips). Options: a price-only search step, or raise maxUses (slower).
- **Stronger rate limit**
  - Priority: P2
  - Status: Open
  - Description: route.ts allows 6 uncached runs per IP per hour, but in memory per instance. Move to Vercel KV or the Vercel firewall before a public launch.

## Resolved

- 2026-09-26: Scaffolded Next.js 15.5 + Tailwind 4 + AI SDK v7, wrote lib/types.ts contract, .env.local, smoke-tested model + web search.
- 2026-09-26: Pipeline done. Discover (web search, URL grounding, low effort), FDA (openFDA label match + verbatim warnings), evidence (Europe PMC tiers), cost + same-drug groups, ranking in code + verdict, NDJSON route with demo cache, scripts/warm.ts. 9 node tests pass. A live hair loss run takes about 35s.
- 2026-09-26: Integration. Warmed all 3 chip caches. Fixed wrong-product prices (single-product pages that do not name the brand, eBay blocked), topical-only evidence query (stopped oral collagen and filler papers inflating "peptides" and "hyaluronic acid"), same-drug groups need 2+ priced members, cost formula now checks out on screen, verdict gets computed cost ranks and no longer leaks field names, clearer FDA stage text for cosmetics. Removed the synthetic UI fixture. 10 node tests pass, build passes, chips and one live run verified in Playwright at 1280 and 375.
- 2026-09-26: Review fixes. Failed live runs fall back to the cached run with a notice, and provider errors stay in the server log. Price pages are opened and checked (dropped the wrong CeraVe prices, a dead Acne Proofing link and a stale Hims price, moved Equate to a live page). openFDA matching fixed for store brands and sibling products (Equate wash, both Neutrogena washes). Europe PMC reviews must name the active in the title, and letters are excluded. Same-drug groups compare like with like. Stated month supply goes straight into the cost math. The ranking tie-break is approved application, then study count. Verdict sentences are checked for unknown dollar amounts, rank numbers and banned claims. Warnings keep their lead-ins. Abort on disconnect, per-IP live limit, results scroll into view, "FDA check failed" badge. 14 tests pass, tsc and build clean, Playwright checked at 1280 and 375.
- 2026-09-26: Re-derived all 3 caches with the final code from the saved discovery data. Verdict text went through the Claude Code CLI, since API credits ran out. New picks: anti-aging is now the RoC retinol cream, acne stays Differin, hair loss stays Equate foam.
- 2026-09-26: Docs. README.md, CLAUDE.md, STATE.md and a DEVPOST.md draft.
