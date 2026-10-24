// v3.16 Test Manager: heatmap.js mod et HÅNDBYGGET spor med kendte tal. replay-ui.test.mjs kaldte heatGrid/shotsOf/thirds på en
// seedet kamp og tjekkede kun formen (9×6, max 1, summen 1): spejlingen af udeholdet, felt-indekseringen, målmandens
// udeladelse, spillerfilteret, udfaldene (mål/redning/forbi/offside/annulleret) og oplæggene kunne alle ændres med grøn suite
// (~32 af 41 mutationer overlevede). Koordinater regnes i holdets egne (lille y = ved modstanderens mål); kortet er 6 × 9 felter
// (x/16,67, y/11,11) – punkterne her ligger bevidst midt i felterne, ikke på en kant.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heatGrid, shotsOf, thirds, tracePoints, COLS, ROWS } from '../../public/engine/heatmap.js';

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

test('heatGrid: 9 rækker × 6 søjler; felt = (y/11,11, x/16,67) i holdets egne koordinater; det tætteste felt er 1, resten er andel af det; målmanden tæller ikke i holdets kort', () => {
  assert.deepEqual([ROWS, COLS], [9, 6]);
  const g = heatGrid(trace, 'h', null, 1);
  // Hjemme uden målmand 1: spiller 2 står på (8,8) fire gange og (25,60) én; spiller 3 på (8,14) to gange, (92,92), (41,24) og (41,30)
  // (8,8) → række 0, søjle 0: 4 gange ·  (8,14) → række 1, søjle 0: 2 ·  (92,92) → række 8, søjle 5: 1 ·  (25,60) → række 5, søjle 1: 1
  // (41,24) → række 2, søjle 2: 1 ·  (41,30) → række 2, søjle 2: samme felt → 2 i alt
  const want = (r, c) => g[r][c];
  assert.equal(want(0, 0), 1, 'det tætteste felt (4 punkter) er 1');
  assert.equal(want(1, 0), 0.5);
  assert.equal(want(2, 2), 0.5);
  assert.equal(want(8, 5), 0.25);
  assert.equal(want(5, 1), 0.25);
  const nonzero = g.flat().filter((v) => v > 0).length;
  assert.equal(nonzero, 5, 'ingen andre felter er ramt – målmandens (50, 90) er udeladt');
  // Med målmanden som "spiller" tæller hans punkter (række 8, søjle 3)
  const gk = heatGrid(trace, 'h', 1, 1);
  assert.equal(gk[8][3], 1);
  assert.equal(gk.flat().filter((v) => v > 0).length, 1);
  // Uden at angive målmanden tæller (50, 90) med
  assert.ok(heatGrid(trace, 'h', null, null)[8][3] > 0);
});

test('heatGrid: udeholdet spejlet ind i sine egne koordinater; en spiller for sig; kanten (100, 100) lander i det sidste felt, og et tomt spor giver kun nuller', () => {
  const a = heatGrid(trace, 'a', null, 11);
  // 12: fælles (92, 92) → eget (8, 8) → (0, 0) ×5 ·  13: fælles (70, 40) → eget (30, 60) → række 5, søjle 1 ×5
  assert.equal(a[0][0], 1); assert.equal(a[5][1], 1);
  assert.equal(a.flat().filter((v) => v > 0).length, 2);
  const p = heatGrid(trace, 'h', 3, 1);
  assert.equal(p[0][0], 0, 'kun spiller 3: ikke (8, 8) fra spiller 2');
  assert.equal(p[1][0], 1); assert.equal(p[2][2], 1, '(41, 24) og (41, 30) i samme felt: 2 af 2 = max');
  const edge = { frames: [{ t: 0, h: [[2, 100, 100], [3, 0, 0]], a: [] }], moments: [] };
  const e = heatGrid(edge, 'h');
  assert.equal(e[8][5], 1, '(100, 100) i det sidste felt, ikke uden for kortet'); assert.equal(e[0][0], 1);
  const none = heatGrid({ frames: [], moments: [] }, 'h');
  assert.equal(none.length, 9); assert.ok(none.flat().every((v) => v === 0));
  assert.ok(heatGrid(null, 'h').flat().every((v) => v === 0));
});

test('heatGrid: hver søjle og række har sin plads (ikke byttet om): x = 20 er søjle 1 og y = 20 er række 1', () => {
  const t = { frames: [{ t: 0, h: [[2, 20, 20], [3, 45, 95]], a: [] }], moments: [] };
  const g = heatGrid(t, 'h');
  assert.equal(g[1][1], 1); assert.equal(g[8][2], 1);
  assert.equal(g.flat().filter((v) => v > 0).length, 2);
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
