// v3.16 Test Manager: heatmap.js mod et HÅNDBYGGET spor med kendte tal. replay-ui.test.mjs kaldte heatGrid/shotsOf/thirds på en
// seedet kamp og tjekkede kun formen (9×6, max 1, summen 1): spejlingen af udeholdet, felt-indekseringen, målmandens
// udeladelse, spillerfilteret, udfaldene (mål/redning/forbi/offside/annulleret) og oplæggene kunne alle ændres med grøn suite
// (~32 af 41 mutationer overlevede). Koordinater regnes i holdets egne (lille y = ved modstanderens mål); kortet er 6 × 9 felter
// (x/16,67, y/11,11) – punkterne her ligger bevidst midt i felterne, ikke på en kant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heatGrid, heatCounts, tracePaths, blur, PATH_WEIGHT, shotsOf, thirds, tracePoints, COLS, ROWS } from '../../public/engine/heatmap.js';

// Spillere: 1 = hjemmemålmand, 2/3 = hjemme, 11 = udemålmand, 12/13 = ude. Udeholdets punkter står i FÆLLES koordinater (spejlet).
const trace = {
  v: 1,
  frames: [
    { t: 0, poss: null, ball: [50, 50], h: [[1, 50, 90], [2, 8, 8], [3, 8, 14]], a: [[11, 50, 10], [12, 92, 92], [13, 70, 40]] },
    { t: 1, poss: 'h', ball: [50, 50], h: [[1, 50, 90], [2, 8, 8], [3, 92, 92]], a: [[11, 50, 10], [12, 92, 92], [13, 70, 40]] },
  ],
  moments: [
    // hjemmemål: 3 scorer (står på 41/24), 2 lægger op (står på 25/60)
    { t: 1, ev: 4, kind: 'GOAL', side: 'h', ball: [41, 24], h: [[1, 50, 90], [2, 25, 60], [3, 41, 24]], a: [[11, 50, 10], [12, 92, 92], [13, 70, 40]], shooter: 3, scorer: 3, assist: 2 },
    // udeholdets redning mod hjemmeholdets skud: afslutningen er hjemmeholdets (shooter 3)
    { t: 2, ev: 7, kind: 'SAVE', side: 'h', ball: [50, 20], h: [[1, 50, 90], [2, 8, 8], [3, 41, 30]], a: [[11, 50, 10], [12, 92, 92], [13, 70, 40]], shooter: 3 },
    // udeholdets forbi (spejlet): 13 står i fælles (70, 40) = i sit eget (30, 60); bolden i fælles (50, 80)
    { t: 3, ev: 9, kind: 'MISS', side: 'a', ball: [50, 80], h: [[1, 50, 90], [2, 8, 8], [3, 8, 14]], a: [[11, 50, 10], [12, 92, 92], [13, 70, 40]], shooter: 13 },
  ],
};

test('tracePoints: grundbilleder og øjeblikke for holdet i holdets egne koordinater (udeholdet spejlet), én spiller kan vælges', () => {
  const h = tracePoints(trace, 'h');
  assert.equal(h.length, 3 + 3 + 3 + 3 + 3, 'to billeder + tre øjeblikke à 3 spillere');
  assert.deepEqual(h.slice(0, 3), [[1, 50, 90], [2, 8, 8], [3, 8, 14]], 'hjemme: som de står');
  assert.deepEqual(h.slice(6, 9), [[1, 50, 90], [2, 25, 60], [3, 41, 24]], 'øjeblikkene kommer efter billederne');
  const a = tracePoints(trace, 'a');
  assert.equal(a.length, 15);
  assert.deepEqual(a.slice(0, 3), [[11, 50, 90], [12, 8, 8], [13, 30, 60]], 'ude: (100 − x, 100 − y)');
  assert.deepEqual(tracePoints(trace, 'h', 2), [[2, 8, 8], [2, 8, 8], [2, 25, 60], [2, 8, 8], [2, 8, 8]]);
  assert.deepEqual(tracePoints(trace, 'a', 13).length, 5);
  assert.deepEqual(tracePoints(null, 'h'), []);
  assert.deepEqual(tracePoints({ frames: [], moments: [] }, 'h'), []);
});

// v3.20.2: kortet er 12 × 18 felter (x/8,33, y/5,56; før 6 × 9), punkterne tælles i heatCounts – vejen mellem to billeder
// (tracePaths) med vægt 0,5 – og heatGrid udglatter (blur, 1-2-1) og sætter det tætteste felt til 1. Placeringen prøves uden veje.
test('heatCounts: 18 rækker × 12 søjler; felt = (y/5,56, x/8,33) i holdets egne koordinater; målmanden tæller ikke i holdets kort', () => {
  assert.deepEqual([ROWS, COLS], [18, 12]);
  const g = heatCounts(trace, 'h', null, 1, { paths: false });
  // Hjemme uden målmand 1: spiller 2 står på (8,8) fire gange og (25,60) én; spiller 3 på (8,14) to gange, (92,92), (41,24) og (41,30)
  // (8,8) → række 1, søjle 0 ·  (8,14) → række 2, søjle 0 ·  (92,92) → række 16, søjle 11 ·  (25,60) → række 10, søjle 3
  // (41,24) → række 4, søjle 4 ·  (41,30) → række 5, søjle 4 (i 6 × 9 var de to samme felt)
  assert.equal(g[1][0], 4); assert.equal(g[2][0], 2); assert.equal(g[16][11], 1); assert.equal(g[10][3], 1);
  assert.equal(g[4][4], 1); assert.equal(g[5][4], 1);
  assert.equal(g.flat().filter((v) => v > 0).length, 6, 'ingen andre felter er ramt – målmandens (50, 90) er udeladt');
  // Med målmanden som "spiller" tæller hans punkter (50, 90 → række 16, søjle 6)
  const gk = heatCounts(trace, 'h', 1, 1, { paths: false });
  assert.equal(gk[16][6], 5); assert.equal(gk.flat().filter((v) => v > 0).length, 1);
  assert.equal(heatCounts(trace, 'h', null, null, { paths: false })[16][6], 5, 'uden at angive målmanden tæller (50, 90) med');
});

test('heatCounts: udeholdet spejlet ind i sine egne koordinater; en spiller for sig; kanten (100, 100) lander i det sidste felt, og et tomt spor giver kun nuller', () => {
  const a = heatCounts(trace, 'a', null, 11, { paths: false });
  // 12: fælles (92, 92) → eget (8, 8) → række 1, søjle 0 ×5 ·  13: fælles (70, 40) → eget (30, 60) → række 10, søjle 3 ×5
  assert.equal(a[1][0], 5); assert.equal(a[10][3], 5);
  assert.equal(a.flat().filter((v) => v > 0).length, 2);
  const p = heatCounts(trace, 'h', 3, 1, { paths: false });
  assert.equal(p[1][0], 0, 'kun spiller 3: ikke (8, 8) fra spiller 2');
  assert.equal(p[2][0], 2); assert.equal(p[16][11], 1); assert.equal(p[4][4], 1); assert.equal(p[5][4], 1);
  const e = heatCounts({ frames: [{ t: 0, h: [[2, 100, 100], [3, 0, 0]], a: [] }], moments: [] }, 'h');
  assert.equal(e[17][11], 1, '(100, 100) i det sidste felt, ikke uden for kortet'); assert.equal(e[0][0], 1);
  const none = heatGrid({ frames: [], moments: [] }, 'h');
  assert.equal(none.length, 18); assert.equal(none[0].length, 12); assert.ok(none.flat().every((v) => v === 0));
  assert.ok(heatGrid(null, 'h').flat().every((v) => v === 0));
});

test('heatCounts: hver søjle og række har sin plads (ikke byttet om): (20, 20) er række 3, søjle 2 og (45, 95) er række 17, søjle 5', () => {
  const g = heatCounts({ frames: [{ t: 0, h: [[2, 20, 20], [3, 45, 95]], a: [] }], moments: [] }, 'h');
  assert.equal(g[3][2], 1); assert.equal(g[17][5], 1);
  assert.equal(g.flat().filter((v) => v > 0).length, 2);
});

test('tracePaths: vejen mellem to billeder tælles – (10, 10) → (90, 10) tænder rækken (før kun 2 felter); kun mellem billeder, han er med i begge; billederne i tidsorden', () => {
  const run = { frames: [{ t: 0, h: [[2, 10, 10]], a: [] }, { t: 1, h: [[2, 90, 10]], a: [] }], moments: [] };
  const pts = tracePaths(run, 'h');
  assert.equal(pts.length, 39, '80 enheder / skridt 2 = 40 stykker → 39 punkter imellem');
  assert.ok(pts.every(([id, , y]) => id === 2 && y === 10));
  const g = heatCounts(run, 'h'), lit = g[1].filter((v) => v > 0).length;
  assert.ok(lit >= 10, `${lit} af 12 søjler`);
  assert.equal(heatCounts(run, 'h', null, null, { paths: false })[1].filter((v) => v > 0).length, 2, 'uden veje: kun de to billeder');
  // (10, 10) → række 1, søjle 1: billedet (1) + vejens punkter i samme felt (x < 16,67) à PATH_WEIGHT
  assert.equal(g[1][1], 1 + PATH_WEIGHT * pts.filter(([, x]) => x < 200 / 12).length, 'vejen vejer PATH_WEIGHT pr. punkt');
  // Kun i det ene billede (indskiftet / udskiftet): ingen streg ind fra bænken
  const one = { frames: [{ t: 0, h: [[2, 10, 10]], a: [] }, { t: 1, h: [[3, 90, 10]], a: [] }], moments: [] };
  assert.deepEqual(tracePaths(one, 'h'), []);
  // Billederne i omvendt rækkefølge i sporet: vejen går stadig 0 → 1 → 2, ikke direkte 0 → 2
  const back = { frames: [{ t: 2, h: [[2, 10, 90]], a: [] }, { t: 0, h: [[2, 10, 10]], a: [] }, { t: 1, h: [[2, 90, 10]], a: [] }], moments: [] };
  assert.ok(tracePaths(back, 'h').some(([, x]) => x > 80), 'via (90, 10)');
  // Udeholdet spejlet: fælles (90, 90) → (10, 90) er eget (10, 10) → (90, 10)
  const away = { frames: [{ t: 0, h: [], a: [[12, 90, 90]] }, { t: 1, h: [], a: [[12, 10, 90]] }], moments: [] };
  assert.ok(tracePaths(away, 'a').every(([, , y]) => y === 10));
  assert.deepEqual(tracePaths(run, 'h', 3), [], 'kun den valgte spiller');
  assert.deepEqual(tracePaths(null, 'h'), []);
});

test('blur: 1-2-1-kernen, delt med de vægte, der er inden for kortet; heatGrid = udglattet og tætteste felt 1', () => {
  const b = blur([[0, 0, 0], [0, 1, 0], [0, 0, 0]]);
  assert.equal(b[1][1], 4 / 16); assert.equal(b[0][0], 1 / 9); assert.equal(b[0][1], 2 / 12);
  assert.deepEqual(blur([[3, 3], [3, 3]]), [[3, 3], [3, 3]], 'en jævn flade er uændret (også i hjørnerne)');
  const g = heatGrid(trace, 'h', null, 1);
  assert.equal(Math.max(...g.flat()), 1);
  // Udglatningen spreder: et felt ved siden af (8, 8) får farve, selvom intet punkt lå dér
  assert.equal(heatCounts(trace, 'h', null, 1)[0][1], 0); assert.ok(g[0][1] > 0);
});

test('shotsOf: afslutninger med udfald (mål, redning, forbi) i holdets koordinater, hvor skytten stod; udeholdets spejlet; VAR-tjek uden udfald er ikke med', () => {
  const h = shotsOf(trace, 'h');
  assert.deepEqual(h, [{ x: 41, y: 24, t: 1, outcome: 'goal', ev: 4 }, { x: 41, y: 30, t: 2, outcome: 'save', ev: 7 }]);
  const a = shotsOf(trace, 'a');
  assert.deepEqual(a, [{ x: 30, y: 60, t: 3, outcome: 'miss', ev: 9 }], 'ude: 13 står fælles (70, 40) → eget (30, 60)');
});

test('shotsOf: alle udfald – HEADER_GOAL = mål, OFFSIDE_FLAG = offside, VAR_NO_GOAL = annulleret, VAR_CHECK og ukendte typer udelades, en afslutning uden skytte udelades', () => {
  const m = (kind, extra = {}) => ({ t: 5, ev: 1, kind, side: 'h', ball: [50, 20], h: [[3, 40, 30]], a: [], shooter: 3, ...extra });
  const tr = { frames: [], moments: [m('GOAL'), m('HEADER_GOAL'), m('SAVE'), m('MISS'), m('OFFSIDE_FLAG'), m('VAR_NO_GOAL'), m('VAR_CHECK'), m('YELLOW'), m('SAVE', { shooter: null }), m('SAVE', { side: 'a', a: [[13, 40, 30]], h: [], shooter: 13 })] };
  assert.deepEqual(shotsOf(tr, 'h').map((s) => s.outcome), ['goal', 'goal', 'save', 'miss', 'offside', 'disallowed']);
  assert.deepEqual(shotsOf(tr, 'a').map((s) => s.outcome), ['save']);
  assert.deepEqual(shotsOf(null, 'h'), []);
});

test('shotsOf for en spiller: hans egne afslutninger OG hans oplæg (på hans plads i øjeblikket); andres afslutninger ikke; ukendt plads → bolden', () => {
  const s3 = shotsOf(trace, 'h', 3), s2 = shotsOf(trace, 'h', 2);
  assert.deepEqual(s3.map((s) => s.outcome), ['goal', 'save']);
  assert.deepEqual(s2, [{ x: 25, y: 60, t: 1, outcome: 'assist', ev: 4 }], 'oplægsgiveren står på (25, 60) i målets øjeblik – og får ikke redningen (skytten var 3)');
  assert.deepEqual(shotsOf(trace, 'h', 1), [], 'målmanden har ingen afslutninger');
  assert.deepEqual(shotsOf(trace, 'a', 3), [], '3 er hjemmespiller');
  // Spilleren står ikke i øjeblikkets billede (udgået): bolden bruges
  const lost = { frames: [], moments: [{ t: 2, ev: 3, kind: 'GOAL', side: 'h', ball: [33, 22], h: [[3, 41, 24]], a: [], shooter: 3, scorer: 3, assist: 9 }] };
  assert.deepEqual(shotsOf(lost, 'h', 9), [{ x: 33, y: 22, t: 2, outcome: 'assist', ev: 3 }]);
  // Udeholdets oplæg spejles
  const away = { frames: [], moments: [{ t: 2, ev: 3, kind: 'GOAL', side: 'a', ball: [60, 78], h: [], a: [[13, 59, 76], [14, 80, 70]], shooter: 13, scorer: 13, assist: 14 }] };
  assert.deepEqual(shotsOf(away, 'a', 14), [{ x: 20, y: 30, t: 2, outcome: 'assist', ev: 3 }]);
  assert.deepEqual(shotsOf(away, 'a', 13), [{ x: 41, y: 24, t: 2, outcome: 'goal', ev: 3 }]);
});

test('thirds: andel af holdets punkter i egen tredjedel (y ≥ 66,7), midten (33,3 ≤ y < 66,7) og angrebet (y < 33,3) – målmanden ikke med; udeholdet spejlet; tomt spor → nuller', () => {
  const t = { frames: [{ t: 0, h: [[1, 50, 90], [2, 10, 66.7], [3, 10, 66.6], [4, 10, 33.3], [5, 10, 33.2], [6, 10, 10], [7, 10, 20]], a: [[11, 50, 10], [12, 90, 90], [13, 90, 80]] }], moments: [] };
  const h = thirds(t, 'h', 1);
  // egen tredjedel: (66.7); midten: (66.6) og (33.3); angreb: (33.2), (10), (20) → 1 / 2 / 3 af 6
  assert.deepEqual([h.defence, h.middle, h.attack], [1 / 6, 2 / 6, 3 / 6]);
  const withGk = thirds(t, 'h', null);
  assert.deepEqual([withGk.defence, withGk.middle, withGk.attack], [2 / 7, 2 / 7, 3 / 7], 'uden gkId tæller målmanden (y 90) med i egen tredjedel');
  // ude: fælles (90, 90) og (90, 80) står i eget (10, 10) og (10, 20) = angreb; målmand 11 udeladt
  const a = thirds(t, 'a', 11);
  assert.deepEqual([a.defence, a.middle, a.attack], [0, 0, 1]);
  assert.deepEqual(thirds({ frames: [], moments: [] }, 'h'), { defence: 0, middle: 0, attack: 0 });
  assert.deepEqual(thirds(null, 'h'), { defence: 0, middle: 0, attack: 0 });
});

// tools/measure-heat.mjs (20 kampe, dit holds CM): før 7 tændte felter (6 × 9), nu 34 (12 × 18). Med 6 × 9 igen ville "nu" være ≈ 7 → rødt.
test('målt: en midtbanespillers kort tænder mindst 25 felter (v3.20.1: 7), og andelen af banen falder ikke', async () => {
  const { measureHeat } = await import('../../tools/measure-heat.mjs');
  const r = await measureHeat(20);
  assert.ok(r.games >= 18, `data: ${r.games}`);
  assert.ok(r.afterMedian >= 25, `nu ${r.afterMedian}`);
  assert.ok(r.beforeMedian <= 10, `før ${r.beforeMedian}`);
  assert.ok(r.afterShareMedian >= r.beforeShareMedian, `andel ${r.afterShareMedian} mod ${r.beforeShareMedian}`);
});
