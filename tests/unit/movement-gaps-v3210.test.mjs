// v3.21.0 Test Manager – applyDepth (positions.js) var kun bevist af golden-hashene: fade, spejl ved grænsen, MIN_DEPTH-tilbagerulningen og
// ROW_MAX-søgningen mod hans plads overlevede alle de målrettede tests. Fixturet er det samme gitter som movement-v3210.test.mjs
// (alle formationer × pres × boldside × seed), så tallene herunder er målt: base = koden nu, mutant = uden den regel.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coupledPositions, MIN_DEPTH, ONSIDE_GAP } from '../../public/engine/positions.js';
import { FORMATIONS } from '../../public/engine/formations.js';

const tac = (f, p = 'MID_BLOCK', r = 'NORMAL') => ({ baseFormation: f, customCoords: {}, phases: { phase1_buildUp: { offBallRuns: r }, phase2_defending: { pressingHeight: p } } });
const F = Object.keys(FORMATIONS), PRESS = ['LOW_BLOCK', 'MID_BLOCK', 'HIGH_GEGENPRESS'];
function grid(n) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const a = F[k % F.length], b = F[(k * 7 + 3) % F.length], p = PRESS[k % 3], x = [12, 50, 88][Math.floor(k / 3) % 3];
    const dr = (team) => ({ seed: 1000 + k, team, t: k % 31 });
    out.push({ r: coupledPositions(tac(a, p), tac(b, p), { ballX: x, ballDrift: dr(1), oppDrift: dr(2) }), r0: coupledPositions(tac(a, p), tac(b, p), { ballX: x }) });
  }
  return out;
}
const G = grid(3000);

test('fade: boldholdets spillere, der står PÅ offside-linjen, bliver stående med bevægelsen – og dæmpningen aftager over DEPTH_FADE (6) fra linjen', () => {
  let on = 0, stay = 0, near = 0, nearMoved = 0;
  for (const { r, r0 } of G) for (let i = 1; i < 11; i++) {
    const y0 = r0.ball[i].y, y1 = r.ball[i].y, d = y0 - (r0.line + ONSIDE_GAP);
    if (d === 0) { on++; if (y1 === y0) stay++; } else if (d > 0 && d <= 3) { near++; if (Math.abs(y1 - y0) >= 3) nearMoved++; }
  }
  assert.ok(on > 1000 && near > 300, `data: ${on} på linjen, ${near} inden for 3`);
  // base: 1512 af 1512 bliver stående. Uden fade (A03) 10 %, fade kun ned til 0,5 (A03b) 19 %
  assert.ok(stay / on >= 0.98, `${stay} af ${on} på linjen står stadig på linjen`);
  // base 139 af 432 = 0,32 flyttes ≥ 3. DEPTH_FADE 3 → 0,58, DEPTH_FADE 12 → 0,08, uden fade → 0,69
  assert.ok(nearMoved / near >= 0.25 && nearMoved / near <= 0.40, `${nearMoved} af ${near} inden for 3 fra linjen flyttes ≥ 3`);
});

test('spejl ved grænsen, ikke klemt: kun få flyttede lander præcis på linjen (boldholdet) eller på modstanderens dybeste (hans bagkæde)', () => {
  let moved = 0, atLine = 0, atDeep = 0;
  for (const { r, r0 } of G) for (let i = 1; i < 11; i++) {
    if (r.ball[i].y !== r0.ball[i].y) { moved++; if (r.ball[i].y === r.line + ONSIDE_GAP) atLine++; }
    if (r.opp[i].y !== r0.opp[i].y && r.opp[i].y === 100 - r.line) atDeep++;
  }
  assert.ok(moved > 20000, `data: ${moved} flyttede`);
  // base: 462 (1,9 %) på linjen og 533 (2,2 %) på bagkæden. Klemt i stedet for spejlet (lo: 2353 = 9,8 %; hi: 2517 = 10,4 %) giver rækker på linjen
  assert.ok(atLine / moved <= 0.04, `${atLine} af ${moved} på linjen`);
  assert.ok(atDeep / moved <= 0.04, `${atDeep} af ${moved} på modstanderens dybeste`);
});

// Gitteret (6000 tilfælde, find.mjs) rammer MIN_DEPTH-tilbagerulningen 2 gange: uden den har modstanderen 17 i dybden (grænsen er 18)
test('MIN_DEPTH-tilbagerulningen: de to billeder hvor bevægelsen ellers presser modstanderen sammen til 17 holder 18', () => {
  const cases = [
    [tac('4-1-4-1', 'HIGH_GEGENPRESS', 'MANY'), tac('4-2-3-1', 'MID_BLOCK'), 594, 9],
    [tac('4-2-3-1', 'HIGH_GEGENPRESS', 'FEW'), tac('4-1-4-1', 'LOW_BLOCK'), 521, 22],
  ];
  for (const [a, b, seed, t] of cases) {
    const r = coupledPositions(a, b, { ballX: 50, ballDrift: { seed, team: 1, t }, oppDrift: { seed, team: 2, t } });
    const ys = r.opp.slice(1).map((q) => q.y);
    assert.ok(Math.max(...ys) - Math.min(...ys) >= MIN_DEPTH, `dybde ${ys}`);
  }
});

// ROW_MAX-søgningen går FØRST mod hans plads (y0), ikke altid bagud: 2 af 80000 gitter-tilfælde (find.mjs) hvor retningen afgør (51 af 80000 rammer den)
test('ROW_MAX: står han stadig i en fuld række, søger han den nærmeste ledige dybde mod sin plads – ikke i den anden retning', () => {
  const r1 = coupledPositions(tac('5-4-1', 'LOW_BLOCK'), tac('5-3-2', 'LOW_BLOCK'), { ballX: 30, ballDrift: { seed: 578, team: 1, t: 9 }, oppDrift: { seed: 578, team: 2, t: 9 } });
  assert.equal(r1.opp[4].y, 85, `modstanderens plads 4 (mutant: 81): ${r1.opp.map((q) => q.y)}`);
  const r2 = coupledPositions(tac('4-3-3', 'LOW_BLOCK', 'MANY'), tac('4-4-2', 'HIGH_GEGENPRESS'), { ballX: 30, ballDrift: { seed: 533, team: 1, t: 23 }, oppDrift: { seed: 533, team: 2, t: 23 } });
  assert.equal(r2.ball[7].y, 34, `boldholdets plads 7 (mutant: 32): ${r2.ball.map((q) => q.y)}`);
});

// driftAt (positions.js): hash, perioder, blanding, km-faktor, pres og løb overlevede alle movement-v3210.test.mjs (kun bånd og største udslag) og
// blev kun fanget af golden-hashene. Her er funktionen pinnet: (seed 77, hold 1, tick 5, CM, plads 6) er den samme størrelse overalt, så kvotienterne
// er de aftalte faktorer (spec §Bevægelse): pres LOW 0,85 / MID 1 / HIGH 1,2, løb FEW 0,9 / NORMAL 1 / MANY 1,15.
test('driftAt: pinnede værdier og faktorer (pres, løb, rolle, hold, plads, tick)', async () => {
  const { driftAt } = await import('../../public/engine/positions.js');
  const near = (got, want, msg) => got.forEach((v, i) => assert.ok(Math.abs(v - want[i]) < 0.002, `${msg}: ${got.map((x) => x.toFixed(3))} mod ${want}`));
  const d = { seed: 77, team: 1, t: 5 };
  const ph = (p, r) => ({ ...(p ? { phase2_defending: { pressingHeight: p } } : {}), ...(r ? { phase1_buildUp: { offBallRuns: r } } : {}) });
  near(driftAt(d, 'CM', 6), [14.227, -3.684], 'CM');
  near(driftAt({ ...d, t: 6.5 }, 'CM', 6), [-4.089, 13.528], 'tick 6,5');
  near(driftAt({ ...d, team: 2 }, 'CM', 6), [-2.233, -4.954], 'hold 2');
  near(driftAt(d, 'CM', 7), [1.084, -9.162], 'plads 7');
  near(driftAt(d, 'CB', 2), [-4.356, 2.923], 'CB');
  near(driftAt(d, 'LB', 1), [0.496, 8.662], 'LB');
  near(driftAt({ seed: 77, team: 2, t: 11.3 }, 'ST', 10), [2.016, -0.322], 'ST');
  near(driftAt({ seed: 4242, team: 1, t: 17 }, 'RW', 9), [-8.199, -3.852], 'RW');
  const base = driftAt(d, 'CM', 6);
  for (const [p, r, f] of [['HIGH_GEGENPRESS', null, 1.2], ['LOW_BLOCK', null, 0.85], ['MID_BLOCK', null, 1], [null, 'MANY', 1.15], [null, 'FEW', 0.9], [null, 'NORMAL', 1], ['HIGH_GEGENPRESS', 'MANY', 1.2 * 1.15], ['LOW_BLOCK', 'FEW', 0.85 * 0.9]]) {
    near(driftAt(d, 'CM', 6, ph(p, r)), base.map((v) => v * f), `${p}/${r} × ${f}`);
  }
});

// apartFrom(resolve) kører KUN med bevægelsen ("uden er billederne som før" – test-arenaerne og gamle replays). 1002 af 20000 gitter-billeder uden
// bevægelse ændres, hvis resolve altid kører (R11); ét pinnet (gitter-nr. 26 i find.mjs NODRIFT): plads 8 står på x 62 (med resolve: 70).
test('uden bevægelsen kører apartFrom uden resolve: billedet er som før v3.21 (pinnet)', () => {
  const r = coupledPositions(tac('5-4-1', 'HIGH_GEGENPRESS', 'FEW'), tac('5-3-2', 'LOW_BLOCK'), { ballX: 30 });
  assert.equal(r.ball.map((q) => q.x).join(','), '50,6,24,44,64,82,12,38,62,76,50');
});

// Pinnede billeder fra gitter-søgningen (find.mjs: 20000 tilfælde × hver mutation, første forskel). Hver er det første billede, hvor en realistisk fejl
// giver et andet billede; kun [ball|opp][X|Y] ved den plads, der skiller dem ad, og det samme som koden nu giver. Kommentaren siger mutanten.
test('pinnede billeder: apartFrom-fladen (caught, højre først, 3–97), ROW_MAX-kandidaterne, MIN_DEPTH på hele holdet, modstanderens fade', () => {
  const run = (a, pa, ra, b, pb, x, seed, t, caught = false) => coupledPositions(tac(a, pa, ra), tac(b, pb), { ballX: x, caught, ballDrift: { seed, team: 1, t }, oppDrift: { seed, team: 2, t } });
  const col = (pts, k) => pts.map((q) => q[k]).join(',');
  // apartFrom(opp) ved en erobring (caught) skal også finde en ledig plads: uden resolve står plads 9 på 62 (mutant R02), med på 68
  assert.equal(col(run('5-4-1', 'LOW_BLOCK', 'FEW', '5-3-2', 'LOW_BLOCK', 30, 591, 17, true).opp, 'x'), '50,18,36,58,77,94,34,61,80,68,62');
  // søgningen går først mod venstre (x − d) ved lige afstand: plads 8 på 37 (mutant R09: 71)
  assert.equal(col(run('4-2-3-1', 'MID_BLOCK', 'MANY', '4-1-4-1', 'HIGH_GEGENPRESS', 50, 522, 7).ball, 'x'), '50,13,39,58,85,26,66,26,37,86,53');
  // ledige pladser ligger inden for 3–97, ikke 0–100: plads 4 på 59 (mutant R10: 98)
  assert.equal(col(run('4-4-1-1', 'HIGH_GEGENPRESS', 'NORMAL', '4-3-1-2', 'HIGH_GEGENPRESS', 70, 508, 11, true).ball, 'x'), '50,17,37,80,59,11,34,74,86,57,54');
  // ROW_MAX: kandidaterne [−d, d/2, −d/2, 0, 2d, −2d]: opp plads 5 på 74 (mutant A05k, kun −d: 77); boldhold plads 1 på 38 (mutant A05l, uden 0: 44)
  assert.equal(col(run('4-2-3-1', 'HIGH_GEGENPRESS', 'FEW', '4-1-4-1', 'LOW_BLOCK', 50, 502, 26).opp, 'y'), '90,78,83,80,68,74,65,67,56,68,64');
  assert.equal(col(run('5-4-1', 'MID_BLOCK', 'MANY', '5-3-2', 'HIGH_GEGENPRESS', 30, 518, 8).ball, 'y'), '90,38,61,62,56,49,28,27,28,29,26');
  // MIN_DEPTH måles på hele holdet (rowIdx), ikke kun de bevægede (A06b): modstanderens y i dette billede
  assert.equal(col(run('4-4-2', 'LOW_BLOCK', 'FEW', '3-5-2', 'MID_BLOCK', 12, 543, 15).opp, 'y'), '90,68,74,68,56,56,55,61,60,55,51');
  // modstanderen får ikke fade (C12: hans forreste ville dæmpes ved boldholdets bageste): plads 8–10 på 25,16,23 (mutant 24,18,18)
  assert.equal(col(run('4-4-2', 'LOW_BLOCK', 'FEW', '3-5-2', 'LOW_BLOCK', 12, 500, 0, true).opp, 'y'), '90,56,60,60,40,37,44,42,25,16,23');
});

// Boldholdets dybde (applyDepth på ball) var kun bevist af golden-hashene: uden kaldet flyttede tests stadig bredden og modstanderens dybde.
test('dybden flytter begge hold: boldholdets og modstanderens markspillere står oftest på en anden y end uden bevægelsen', () => {
  let n = 0, ballY = 0, oppY = 0;
  for (const { r, r0 } of G) for (let i = 1; i < 11; i++) { n++; if (r.ball[i].y !== r0.ball[i].y) ballY++; if (r.opp[i].y !== r0.opp[i].y) oppY++; }
  // base: boldholdet 0,80, modstanderen 0,83. Boldholdets applyDepth fjernet: 0,00 / 0,83. Modstanderens fjernet: 0,80 / 0,51
  assert.ok(ballY / n >= 0.6, `boldhold ${ballY / n}`);
  assert.ok(oppY / n >= 0.7, `modstander ${oppY / n}`);
});

// Rækkefølgen squeeze → applyDepth → spread (ikke spread før applyDepth): spredningen ser den bevægede dybde. Én pinnet sag (gitter-nr. 4 i find.mjs):
// spread-først giver x 94 og 89 for plads 7 og 10 (her 93 og 86) – ingen invariant skiller dem ad (MIN_APART-brud 66 begge veje).
test('rækkefølge: spredningen på tværs sker EFTER dybden (pinnet billede)', () => {
  const r = coupledPositions(tac('3-4-3', 'MID_BLOCK', 'FEW'), tac('4-3-3', 'MID_BLOCK'), { ballX: 88, ballDrift: { seed: 504, team: 1, t: 21 }, oppDrift: { seed: 504, team: 2, t: 21 } });
  assert.equal(r.ball.map((q) => q.x).join(','), '50,34,61,91,22,38,66,93,43,57,86');
});
