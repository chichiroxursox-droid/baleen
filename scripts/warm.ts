// Runs the live pipeline for the demo chip queries and writes data/cache/<slug>.json.
// Usage: npm run warm            (all three)
//        npm run warm -- "best acne treatment"   (just one)
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { CACHE_DIR, cacheSlug, runLive } from '../lib/pipeline.ts';

const CHIPS = ['best hair loss serum', 'best acne treatment', 'best anti-aging cream'];
const queries = process.argv.slice(2).length ? process.argv.slice(2) : CHIPS;

await mkdir(CACHE_DIR, { recursive: true });
for (const q of queries) {
  const t0 = Date.now();
  // runLive, not compare: a failed run must stop here, never fall back to the old cache and rewrite it.
  const result = await runLive(q, (e) => e.type === 'stage' && console.log(`  ${e.stage} ${e.status}${e.detail ? `: ${e.detail}` : ''}`));
  const file = path.join(CACHE_DIR, `${cacheSlug(q)}.json`);
  await writeFile(file, `${JSON.stringify(result, null, 2)}\n`);
  console.log(`${q}: ${result.products.length} products in ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${path.relative(process.cwd(), file)}`);
}
