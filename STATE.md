# Baleen: state

Last updated 2026-09-26, about 11pm EDT. Submissions close Sun 2026-09-27 at 10:00am EDT.

## Blocker

**The Anthropic API key is out of credits.** A 1-token call returns "Your credit balance is too low". Until it's topped up:

- The three chips work. They serve cached runs.
- "Run live" fails and falls back to the cached run, with a notice.
- Any other search shows "The live run failed. Try again in a minute."

Fix: add credits, set a spend cap on the key, then confirm with a 1-token call right before judging.

## What works

- The full 6-step pipeline: discover, price check, FDA, research, cost, rank and verdict. Streams to the page as NDJSON.
- Chips replay their cached run in about 1 second. The results scroll into view.
- Failure paths are plain. Provider errors stay in the server log. A failed live run never wipes a cached result.
- Checks (last run 2026-09-26):
  - `npm test`: 14 of 14 pass.
  - `npx tsc --noEmit`: clean.
  - `npm run build`: clean.
  - Playwright at 1280 and 375 on all three chips, the Run live fallback, and one uncached search. No horizontal scroll and 0 console errors.

## What's cached

The discovery data (products, sources) comes from the warm run at 9:53 to 9:55 PM. Everything after discovery was re-derived at about 10:40 PM with the final code: price checks, FDA matches, research counts, cost, groups and ranking. The verdict text was regenerated through the Claude Code CLI (claude-sonnet-5), with the same prompt, schema and code checks as the app, because the API key had no credits. Re-run `npm run warm` once credits are back.

| Chip | Pick | Cost story | Notes |
|---|---|---|---|
| Hair loss | Equate 5% minoxidil foam, ANDA091344, $10.98/mo | Pick is also best value. "Minoxidil 5% foam" group saves $5.68/mo vs Rogaine. 4 of 8 have a monthly cost. | Best demo. Hims price dropped: the cited page now shows $14.96, not $13.62. |
| Acne | Differin adapalene 0.1% gel, NDA020380 | No monthly costs (labels say "pea-sized"). Salicylic acid 2% wash group: Equate $2.45 vs Neutrogena $3.70 per 100 ml. | Differin has no price. Neutrogena Acne Proofing is now "No FDA label matched" (it had borrowed a sibling's label). |
| Anti-aging | RoC Retinol Correxion firming night cream, $21.97 at Walmart | No monthly costs. 1 of 8 priced. | All cosmetics. Retinol and vitamin C are both "some" research. The two CeraVe prices were wrong and are dropped. |

## Known gaps

- **Few prices on free-text queries.** The model spends its 5 searches on products. The chips have the same gap (Differin, PanOxyl, Kirkland unpriced).
- **Vegamour's $49 is the subscription price.** One-time is $64. The discovery prompt now asks for one-time prices. It takes effect on the next warm.
- **Verdict wording isn't fully checked.** Code checks dollar amounts, rank numbers and banned claims. It doesn't check every word.
- **Off-topic citations.** A few hits still slip in. Hyaluronic acid for acne is "thin" because of one atopic dermatitis trial.
- **Warnings can still join bullets.** Example: "your hands or feet swell scalp irritation or redness occurs" on the Rogaine label, where openFDA lost the bullets.
- **Wrong units in the package data.** Rogaine foam cans are 60 g, but discovery reported fl oz. Costs still hold, because they use the stated month supply.
- **Weak rate limit.** It's per server instance and resets on a cold start.
- **Unchecked prices.** A price with no URL, or on a blocked page, stays in.
- **Deployed 2026-09-27** to https://baleen-taupe.vercel.app (Vercel project baleen, team chiethan). Cached chips and live runs verified on prod. No `OPENFDA_API_KEY` yet, so live FDA lookups can fail on Vercel's shared IP.

## Next steps

1. Top up credits, set a spend cap, and run the 1-token check.
2. `npm run warm`, then read the 3 cache files by hand (prices vs cited pages, FDA set ids, verdict sentences).
3. Decide on deploy. If yes: Vercel, set `ANTHROPIC_API_KEY`, `BALEEN_MODEL` and `OPENFDA_API_KEY`.
4. Choose the track, finish DEVPOST.md, and submit before 10:00am.
5. Demo order: Hair loss first. It has the full cost story.
