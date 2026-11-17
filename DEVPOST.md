Track: TBD (Ethan to choose)

# Baleen

**Filters the shelf down to what actually works.**

## Inspiration

I spend a lot of time asking Claude "what's the best hair loss serum" or "what acne product actually works". The answers sound sure, but I can't see where they come from. Is the store brand the same drug? Is there real research? What does it cost per month? I kept checking pages by hand. Baleen does that research live and shows its work.

Baleen whales filter krill out of seawater. This filters the skincare aisle.

## What it does

Type a need or tap a chip (Hair loss, Acne, Anti-aging). Baleen streams its work in 5 stages, then shows:

- **A pick and a best value,** ranked in code, not by the model.
- **Same drug, different price.** Rogaine foam and Equate foam are both 5% minoxidil foam. Equate saves $5.68 a month.
- **FDA status.** FDA-approved brand, FDA-approved generic, OTC monograph, or cosmetic. Each links to its DailyMed label, with side-effect warnings quoted word for word.
- **Research depth.** Reviews and randomized trials in Europe PMC for each active, with top citations. It shows how much research exists, not how well something works.
- **Cost per month, with the math.** "Package states a 3-month supply. $32.94 / 3 = $10.98 per month." No number means no guess.

## How we built it

Next.js 15, React 19, TypeScript and Tailwind 4. The Vercel AI SDK calls Claude twice per run:

1. Claude with web search finds 6 to 8 products sold in the US.
2. At the end, Claude writes a short verdict from the computed facts only, with no tools.

Everything between is plain code:

- open every price page and drop prices the page doesn't show
- match openFDA labels by active, strength and product name
- count Europe PMC studies
- do the cost math and rank

Code also checks the verdict. Any sentence with a dollar amount not in the data, or a banned claim like "effective", gets dropped.

**AI disclosure:** Baleen was built with Claude Code. I set the spec, the types contract and the data rules. Claude Code agents wrote the code, tested it against live data, and fixed what code reviews found. At runtime, Baleen uses Claude (Anthropic API) for product search and the written verdict.

## Challenges we ran into

The big one: **brand-level trials mostly don't exist.** I wanted "Rogaine vs Kirkland, which works better?" The research doesn't answer that. Studies test minoxidil, not a bottle. So Baleen ranks on what can be checked:

1. how much research exists on the active ingredient
2. whether the FDA reviewed the product
3. what it costs per month

Web data fought back too:

- **Wrong prices.** A CeraVe price pointed to a Walmart page showing a different number. Now code opens every price page first.
- **Wrong FDA labels.** One acne cleanser borrowed a sibling product's label. Now a label must carry the product's own name words.
- **Inflated research.** "Peptides" looked well studied because of oral supplement papers. Now counts need topical use.

## Accomplishments that we're proud of

- Every number traces to a source you can click: a retailer page, a DailyMed label or a PubMed paper.
- The cost math prints its arithmetic, and it adds up.
- It says "no price found" or "no FDA label matched" instead of guessing.
- It reads well on a phone.

## What's next

- A price-only search step, so more products get a monthly cost
- Sunscreen and dandruff comparisons
- A real rate limit and spend cap before a public launch

## Built with

Next.js, React, TypeScript, Tailwind CSS, Vercel AI SDK, Anthropic Claude (claude-sonnet-5) with web search, openFDA, DailyMed, Europe PMC, PubMed, Zod, Node test runner, Claude Code
