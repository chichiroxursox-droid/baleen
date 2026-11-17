import { test } from 'node:test';
import assert from 'node:assert/strict';
import { costPerMonth, sameDrugGroups, supplySource, toMetric } from './cost.ts';
import { mapApplication, pickLabel, pickWarnings, scoreLabel } from './fda.ts';
import { tierFor } from './evidence.ts';
import { finishVerdict, noDash, rank } from './verdict.ts';
import { brandWord, isProductPage, pageText, priceOnPage, statesAmount } from './discover.ts';
import type { Evidence, Product } from './types.ts';

const product = (id: string, o: Partial<Product> = {}): Product => ({
  id, brand: id, name: id, form: 'foam', actives: [{ name: 'minoxidil', strength: '5%' }],
  packageSize: null, dailyUse: null, price: null, rating: null, fda: null, costPerMonth: null, ...o,
});
const priced = (usd: number) => ({ usd, retailer: 'x', url: null, seenAt: '2026-09-26' });

test('toMetric converts US units and rejects junk', () => {
  assert.deepEqual(toMetric(2, 'fl oz'), { amount: 59.15, unit: 'ml' });
  assert.deepEqual(toMetric(6.33, 'oz'), { amount: 179.45, unit: 'g' });
  assert.deepEqual(toMetric(60, 'count'), { amount: 60, unit: 'count' });
  assert.equal(toMetric(0, 'ml'), null);
  assert.equal(toMetric(5, 'tbsp'), null);
});

test('costPerMonth does the math and never guesses', () => {
  const c = costPerMonth({ packageSize: { amount: 180, unit: 'g' }, dailyUse: { amount: 2, unit: 'g', source: 'label' }, price: priced(45) });
  assert.deepEqual([c?.monthsPerPackage, c?.usd], [3, 15]);
  assert.match(c!.formula, /180 g \/ \(2 g per day x 30 days\) = 3\.00 months\. \$45\.00 \/ 3\.00 months = \$15\.00 per month/);
  const pills = costPerMonth({ packageSize: { amount: 90, unit: 'count' }, dailyUse: { amount: 1, unit: 'count', source: 'label' }, price: priced(30) });
  assert.equal(pills?.usd, 10);
  const month = costPerMonth({ packageSize: { amount: 59.15, unit: 'ml' }, dailyUse: { amount: 1.97, unit: 'ml', source: 'label' }, price: priced(29.97) });
  assert.equal(month?.usd, 29.97, 'uses the rounded months the formula prints');
  const base = { packageSize: { amount: 60, unit: 'ml' as const }, dailyUse: { amount: 2, unit: 'ml' as const, source: 'label' }, price: priced(20) };
  assert.equal(costPerMonth({ ...base, price: null }), null);
  assert.equal(costPerMonth({ ...base, dailyUse: null }), null);
  assert.equal(costPerMonth({ ...base, packageSize: null }), null);
  assert.equal(costPerMonth({ ...base, dailyUse: { amount: 2, unit: 'g', source: 'label' } }), null, 'ml vs g is a mismatch');
  // Rogaine foam prints 6.33 oz (179.45 g). The worked-back daily amount rounds to 1.99 g, which used to give 3.01 months.
  const supply = costPerMonth({ packageSize: { amount: 179.45, unit: 'g' }, dailyUse: { amount: 1.99, unit: 'g', source: supplySource(3) }, price: priced(49.97) });
  assert.deepEqual([supply?.monthsPerPackage, supply?.usd], [3, 16.66]);
  assert.equal(supply?.formula, 'Package states a 3-month supply. $49.97 / 3 = $16.66 per month');
});

test('sameDrugGroups groups by active + strength + form', () => {
  const cost = (usd: number) => ({ usd, monthsPerPackage: 1, formula: '' });
  const groups = sameDrugGroups([
    product('rogaine', { price: priced(49), costPerMonth: cost(16.33) }),
    product('kirkland', { price: priced(24.5), costPerMonth: cost(4.08), actives: [{ name: 'Minoxidil', strength: '5.0 %' }] }),
    product('equate', { costPerMonth: null }),
    product('solution', { form: 'solution' }),
    product('nostrength', { actives: [{ name: 'minoxidil', strength: null }] }),
    product('retinol', { form: 'serum', actives: [{ name: 'retinol', strength: '0.5%' }] }),
  ]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].productIds, ['rogaine', 'kirkland', 'equate']);
  assert.equal(groups[0].label, 'Minoxidil 5% foam');
  assert.equal(groups[0].cheapestId, 'kirkland');
  assert.equal(groups[0].monthlySavings, 12.25);
  const pkg = (amount: number) => ({ amount, unit: 'g' as const });
  const byUnitPrice = sameDrugGroups([
    product('big', { price: priced(30), packageSize: pkg(360) }),
    product('small', { price: priced(15), packageSize: pkg(60) }),
  ]);
  assert.equal(byUnitPrice[0].cheapestId, 'big', 'falls back to price per g');
  assert.equal(byUnitPrice[0].monthlySavings, null);
  assert.deepEqual(sameDrugGroups([product('a'), product('b')]), [], 'no price data, no cheapest claim');
  assert.deepEqual(sameDrugGroups([product('a', { price: priced(10), packageSize: pkg(150) }), product('b')]), [], 'one price, nothing to compare');
  // Only Rogaine has a stated supply. Same size, half the price: Amazon is cheaper, and there is no monthly saving to claim.
  const ml = { amount: 187.2, unit: 'ml' as const };
  const mixed = sameDrugGroups([
    product('rogaine', { price: priced(49.97), packageSize: ml, costPerMonth: cost(16.66) }),
    product('amazon', { price: priced(24.99), packageSize: ml }),
  ]);
  assert.deepEqual([mixed[0].cheapestId, mixed[0].monthlySavings], ['amazon', null]);
  const units = sameDrugGroups([product('grams', { price: priced(5), packageSize: pkg(500) }), product('mls', { price: priced(20), packageSize: ml })]);
  assert.deepEqual(units, [], 'g vs ml is not comparable');
});

test('mapApplication maps openFDA application numbers', () => {
  assert.equal(mapApplication('NDA021812'), 'NDA');
  assert.equal(mapApplication('ANDA091344'), 'ANDA');
  assert.equal(mapApplication('M006'), 'OTC_MONOGRAPH');
  assert.equal(mapApplication('part333D'), 'OTC_MONOGRAPH');
  assert.equal(mapApplication('BLA125057'), 'UNKNOWN');
  assert.equal(mapApplication(null), 'UNKNOWN');
});

test('scoreLabel requires the active and strength, prefers the right form', () => {
  const foam = product('f', { brand: 'Rogaine', name: "Men's Rogaine Foam" });
  const foamLabel = { set_id: 'a', active_ingredient: ['Active ingredient Minoxidil 5% w/w (without propellant)'], openfda: { brand_name: ['Mens rogaine'], generic_name: ['MINOXIDIL'] }, package_label_principal_display_panel: ['EASY-TO-USE FOAM'] };
  const solutionLabel = { ...foamLabel, active_ingredient: ['Minoxidil 5% w/v'], package_label_principal_display_panel: ['TOPICAL SOLUTION'] };
  const weakLabel = { ...foamLabel, active_ingredient: ['Minoxidil 2% w/v'] };
  assert.ok(scoreLabel(foam, foamLabel)! > scoreLabel(foam, solutionLabel)!);
  assert.equal(scoreLabel(foam, weakLabel), null);
  assert.equal(scoreLabel(foam, { ...foamLabel, active_ingredient: ['Benzoyl peroxide 5%'] }), null);
});

// Real openFDA shapes: the Equate wash names "equate" only on its package panel, next to a "compare to" line.
const saLabel = (set_id: string, brand: string, maker: string, panel: string) => ({
  set_id, active_ingredient: ['Active ingredient Salicylic acid 2%'], package_label_principal_display_panel: [panel],
  openfda: { brand_name: [brand], generic_name: ['SALICYLIC ACID'], manufacturer_name: [maker] },
});
const apricot = saLabel('2b94', 'Equate Beauty Medicated Apricot Cleanser Acne Medication', 'WALMART INC.', 'Package Labeling: Label0');
const oilFree = saLabel('31e4', 'Oil Free Acne Wash', 'Walmart Inc.', 'PRINCIPAL DISPLAY PANEL equate™ Compare to Neutrogena® Oil-Free Acne Wash');
const sensitive = saLabel('1a43', 'Neutrogena Oil-Free Acne Wash Sensitive Skin Facial Cleanser Fragrance Free', 'Kenvue', 'Neutrogena');
const regular = saLabel('581e', 'Neutrogena Oil Free Acne Wash', 'Kenvue', 'Neutrogena');
const grapefruit = saLabel('9c2d', 'Neutrogena Oil-Free Acne Wash Pink Grapefruit', 'Kenvue', 'Neutrogena');

test('pickLabel: store brands on the panel, sibling products, ties', () => {
  const sa = (brand: string, name: string, strength: string | null = '2%') => ({ brand, name, form: 'wash', actives: [{ name: 'salicylic acid', strength }] });
  assert.equal(pickLabel(sa('Equate', 'Oil-Free Acne Wash with 2% Salicylic Acid'), [apricot, oilFree])?.set_id, '31e4');
  assert.equal(pickLabel(sa('Neutrogena', 'Oil-Free Acne Wash'), [sensitive, grapefruit, regular])?.set_id, '581e', 'closest name wins');
  assert.equal(pickLabel(sa('Neutrogena', 'Acne Proofing Daily Facial Gel Cleanser', null), [sensitive, grapefruit, regular]), null, 'no label says proofing');
  const sensitiveShort = saLabel('1a44', 'Neutrogena Oil-Free Acne Wash Sensitive Skin', 'Kenvue', 'Neutrogena');
  assert.equal(pickLabel(sa('Neutrogena', 'Oil-Free Acne Wash'), [sensitiveShort, grapefruit]), null, 'tie between two different products');
  assert.equal(pickLabel(sa('Neutrogena', 'Oil-Free Acne Wash'), [oilFree]), null, '"compare to Neutrogena" is not a Neutrogena label');
});

test('pickWarnings keeps short verbatim side-effect pieces', () => {
  const w = pickWarnings({ set_id: 'a', stop_use: ['Stop use and ask a doctor if chest pain, rapid heartbeat, faintness, or dizziness occurs sudden, unexplained weight gain occurs you do not see hair regrowth in 4 months'] });
  assert.deepEqual(w, ['Stop use and ask a doctor if chest pain, rapid heartbeat, faintness, or dizziness occurs', 'Stop use and ask a doctor if ... sudden, unexplained weight gain occurs']);
  // Differin's label arrives as one run-on string with the bullets lost.
  const differin = pickWarnings({ set_id: 'c', stop_use: ['Stop use and ask doctor if you become pregnant, while using the product you have symptoms of an allergic reaction (such as itching, rash, hives) irritation becomes severe you see no improvement after 3 months'] });
  assert.deepEqual(differin, ['Stop use and ask doctor if ... you have symptoms of an allergic reaction (such as itching, rash, hives)', 'Stop use and ask doctor if ... irritation becomes severe']);
  const bullets = pickWarnings({ set_id: 'd', do_not_use: [], warnings: ['Do not use if you ■ have very sensitive skin ■ are sensitive to benzoyl peroxide'] } as never);
  assert.deepEqual(bullets, ['Do not use if you ... have very sensitive skin', 'Do not use if you ... are sensitive to benzoyl peroxide']);
  const dup = pickWarnings({ set_id: 'b', when_using: ['When using this product skin irritation and dryness is more likely to occur'], warnings: ['Warnings For external use only When using this product skin irritation and dryness is more likely to occur'] });
  assert.deepEqual(dup, ['When using this product skin irritation and dryness is more likely to occur']);
});

test('tierFor thresholds', () => {
  assert.equal(tierFor(3, 5), 'deep');
  assert.equal(tierFor(3, 4), 'some');
  assert.equal(tierFor(1, 0), 'some');
  assert.equal(tierFor(0, 3), 'some');
  assert.equal(tierFor(0, 2), 'thin');
  assert.equal(tierFor(0, 1), 'thin');
  assert.equal(tierFor(0, 0), 'none');
});

test('rank: research depth, then FDA review, then cost; best value is cheapest in top tier', () => {
  const ev = (active: string, tier: Evidence['tier']): Evidence => ({ active, condition: 'c', reviews: 0, trials: 0, tier, top: [], queryUrl: '' });
  const fda = (status: 'NDA' | 'ANDA' | 'UNKNOWN') => ({ status, applicationNumber: null, labelUrl: null, warnings: [] });
  const cost = (usd: number) => ({ usd, monthsPerPackage: 1, formula: '' });
  const products = [
    product('cosmetic', { actives: [{ name: 'peptides', strength: null }], costPerMonth: cost(1) }),
    product('brand', { fda: fda('NDA'), costPerMonth: cost(16) }),
    product('nocost', { fda: fda('ANDA') }),
    product('generic', { fda: fda('ANDA'), costPerMonth: cost(4) }),
    product('unmatched', { fda: fda('UNKNOWN'), costPerMonth: cost(2) }),
  ];
  const r = rank(products, [ev('minoxidil', 'deep'), ev('peptides', 'thin')]);
  assert.deepEqual(r.ranking, ['generic', 'brand', 'nocost', 'unmatched', 'cosmetic']);
  assert.equal(r.pickId, 'generic');
  assert.equal(r.bestValueId, 'unmatched');
  // Same tier, no FDA review, no cost: more studies wins, not the order discovery listed them in.
  const counts = (active: string, reviews: number, trials: number): Evidence => ({ ...ev(active, 'some'), reviews, trials });
  const tie = rank([product('vitc', { actives: [{ name: 'vitamin c', strength: null }] }), product('retinol', { actives: [{ name: 'retinol', strength: null }] })], [counts('vitamin c', 2, 11), counts('retinol', 0, 16)]);
  assert.deepEqual(tie.ranking, ['retinol', 'vitc']);
  // An approved application beats a monograph drug before study counts do (Differin NDA over a BPO wash with more studies).
  const drugs = rank([product('bpo', { actives: [{ name: 'benzoyl peroxide', strength: '10%' }], fda: { ...fda('UNKNOWN'), status: 'OTC_MONOGRAPH' } }), product('differin', { actives: [{ name: 'adapalene', strength: '0.1%' }], fda: fda('NDA') })], [{ ...ev('benzoyl peroxide', 'deep'), trials: 126 }, { ...ev('adapalene', 'deep'), trials: 103 }]);
  assert.equal(drugs.pickId, 'differin');
});

test('finishVerdict drops sentences that break the rules', () => {
  const products = [product('a', { price: priced(9.97) }), product('b', { price: priced(24.54) })];
  const r = { ranking: ['a', 'b'], pickId: 'a', bestValueId: null };
  const v = finishVerdict({ products, groups: [] }, r, {
    summary: 'A is the pick. Washes are solid options too. Retinol has a somewhat shallower research base.',
    perProduct: [
      { id: 'a', points: ['Priced at $9.97 at Walmart', 'Priced at $19.16 at Walmart', 'Higher cost per month, ranked 4 of 5'] },
      { id: 'b', points: ['Results in 2–4 months', 'Highest monthly cost of the group'] },
      { id: 'ghost', points: ['not a real product'] },
    ],
    caveats: ['Prices change — check the date.'],
  });
  assert.equal(v.summary, 'A is the pick.');
  assert.deepEqual(v.perProduct, [{ id: 'a', points: ['Priced at $9.97 at Walmart'] }, { id: 'b', points: ['Results in 2 to 4 months'] }]);
  assert.deepEqual(v.caveats, ['Prices change, check the date.']);
  assert.equal(noDash('Use 3–6 weeks — then stop'), 'Use 3 to 6 weeks, then stop');
});

test('statesAmount only trusts directions with a number and a unit', () => {
  assert.ok(statesAmount('apply 1 mL twice a day'));
  assert.ok(statesAmount('Apply one milliliter directly to the scalp'));
  assert.ok(statesAmount('take 2 gummies daily'));
  assert.ok(!statesAmount('Apply once daily after cleansing'));
  assert.ok(!statesAmount('apply half a capful twice daily'));
  assert.ok(!statesAmount('Use every morning and evening'));
});

test('price pages: product-page shapes and brand words', () => {
  assert.ok(isProductPage('https://www.walmart.com/ip/Esfolio-Milk-Cleansing-foam/1307283418'));
  assert.ok(isProductPage('https://www.amazon.com/dp/B0000'));
  assert.ok(isProductPage('https://www.ulta.com/p/azelaic-acid-suspension-pimprod2007104?sku=2551154'));
  assert.ok(isProductPage('https://www.walgreens.com/store/c/olay-cream/ID=prod6189202-product'));
  assert.ok(!isProductPage('https://www.walmart.com/c/kp/retinol-aging'));
  assert.ok(!isProductPage('https://www.walmart.com/browse/shop-by-brand/rogaine/3734780'));
  assert.equal(brandWord('Equate Beauty'), 'equate');
  assert.equal(brandWord('The Ordinary'), 'ordinary');
  assert.equal(brandWord('La Roche-Posay'), 'roche');
  assert.equal(brandWord('RoC'), 'roc');
});

test('pageText ignores the store name, so store brands cannot match every page', () => {
  const has = (url: string, title: string, brand: string) => pageText(url, title).includes(`-${brandWord(brand)}-`);
  assert.ok(!has('https://www.amazon.com/Rogaine-Minoxidil-Foam/dp/B0012BNVE8', 'Amazon.com: Rogaine Men\'s 5% Minoxidil Foam', 'Amazon Basic Care'));
  assert.ok(!has('https://www.cvs.com/shop/rogaine-mens-foam-prodid-1234', 'Rogaine Men\'s Foam - CVS Pharmacy', 'CVS Health'));
  assert.ok(!has('https://www.walgreens.com/store/c/rogaine-foam/ID=prod6189202-product', 'Rogaine Foam | Walgreens', 'Walgreens'));
  assert.ok(!has('https://www.walmart.com/ip/Esfolio-Milk-Cleansing-foam/1307283418', 'Esfolio Milk Cleansing Foam - Walmart.com', 'Equate'));
  assert.ok(has('https://www.amazon.com/Amazon-Basic-Care-Minoxidil/dp/B07', 'Amazon.com: Amazon Basic Care Minoxidil', 'Amazon Basic Care'));
  assert.ok(has('https://www.cvs.com/shop/cvs-health-minoxidil-prodid-9', 'CVS Health Minoxidil - CVS Pharmacy', 'CVS Health'));
});

test('priceOnPage: a list page must show the price right after the brand', () => {
  const list = 'https://www.walmart.com/c/kp/cerave-skin-renewing-serum';
  const html = '<h3>CeraVe Skin Renewing Vitamin C Serum, 1 fl oz From $23.86</h3><h3>Olay Serum $19.16</h3>';
  assert.equal(priceOnPage(html, list, 23.86, 'CeraVe'), 'ok');
  assert.equal(priceOnPage(html, list, 19.16, 'CeraVe'), 'wrong', 'the cached $19.16 was not on the page next to CeraVe');
  assert.equal(priceOnPage(html, list, 21.97, 'RoC'), 'unverified', 'page never names the brand');
  assert.equal(priceOnPage('<p>Vegamour GRO</p><span>$49</span>', 'https://vegamour.com/products/gro-hair-serum', 49, 'Vegamour'), 'ok');
});
