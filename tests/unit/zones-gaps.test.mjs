// v3.16.1 Test Manager: modstanderens zone-kort (heatmap.js zones/zoneShots + matchcenter.js thirdsLine/#heat-opp). Forfatterens
// test (replay-shapes) satte kun punkter ved yderkanterne (y 5, 10, 90, 92) og kun for udeholdet; heat-ui kiggede kun på prikkerne i
// kortet. Felternes grænser (66,7 / 33,3), spejlingen for begge hold, felternes placering/styrke/tekst/størrelse og prikkernes
// sted/udfald/titel var ubundne (~20 af 35 mutationer overlevede).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { zones, zoneShots } from '../../public/engine/heatmap.js';

const rounded = (z) => z.map((r) => r.map((v) => +v.toFixed(4)));
const SIXTH = +(1 / 6).toFixed(4);

// Punkter i HOLDETS egne koordinater (lille y = ved modstanderens mål); grænserne 66,7 og 33,3 (>=) for rækker, 100 − x mod 33,3/66,7 (<).
const OWN = [
  [2, 67, 66.7],     // række 0 (y ≥ 66,7 præcis), søjle 0 (100 − 67 = 33 < 33,3)
  [3, 66.7, 66.6],   // række 1, søjle 1 (100 − 66,7 = 33,3 er IKKE < 33,3)
  [4, 33.3, 33.3],   // række 1 (y ≥ 33,3 præcis), søjle 2 (100 − 33,3 = 66,7 er IKKE < 66,7)
  [5, 33.5, 33.2],   // række 2 (y < 33,3), søjle 1 (66,5 < 66,7)
  [6, 90, 31],       // række 2, søjle 0
  [7, 10, 90],       // række 0, søjle 2
];
const WANT = [[SIXTH, 0, SIXTH], [0, SIXTH, SIXTH], [SIXTH, SIXTH, 0]];

test('zones: felternes grænser (66,7 / 33,3 / 100 − x) og spejlingen set fra din side, for hjemmeholdet – målmanden (plads 1 ved 50,50) tæller ikke med', () => {
  const trace = { frames: [{ t: 0, h: [[1, 50, 50], ...OWN], a: [] }], moments: [] };
  assert.deepEqual(rounded(zones(trace, 'h', 1)), WANT);
  // uden målmanden udpeget tæller han i midterfeltet (7 punkter: 1/7 i [1][1] og 2/7 der)
  assert.equal(zones(trace, 'h')[1][1], 2 / 7);
});

test('zones: udeholdet har fælles koordinater (hjemmeholdet angriber mod y 0, udeholdet mod y 100) – samme punkter spejlet (100 − x, 100 − y) giver samme kort', () => {
  const trace = { frames: [{ t: 0, h: [], a: [[1, 50, 50], ...OWN.map(([id, x, y]) => [id, 100 - x, 100 - y])] }], moments: [] };
  assert.deepEqual(rounded(zones(trace, 'a', 1)), WANT);
});

test('zones: tomt spor giver nuller (ikke NaN), og punkterne fra afslutningerne (moments) tæller med', () => {
  assert.deepEqual(zones({ frames: [], moments: [] }, 'a', 1), [[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
  assert.deepEqual(zones(null, 'a', 1), [[0, 0, 0], [0, 0, 0], [0, 0, 0]]);
  const z = zones({ frames: [], moments: [{ side: 'h', kind: 'MISS', t: 1, ev: 1, shooter: 2, h: [[2, 10, 90]], a: [], ball: [10, 90] }] }, 'h', 1);
  assert.deepEqual(z, [[0, 0, 1], [0, 0, 0], [0, 0, 0]]);
});

test('zoneShots: afslutningerne spejlet til din side (100 − x, 100 − y), udeholdets i åbent spil – mål, redning og forbi med deres udfald og minut', () => {
  const mo = (kind, t, ev, shooter, x, y) => ({ side: 'a', kind, t, ev, shooter, a: [[shooter, x, y]], h: [], ball: [x, y] });
  const trace = { frames: [], moments: [mo('GOAL', 3, 1, 2, 30, 85), mo('SAVE', 4, 2, 3, 60, 70), mo('MISS', 5, 3, 4, 10, 20), { side: 'h', kind: 'MISS', t: 6, ev: 4, shooter: 9, h: [[9, 50, 20]], a: [], ball: [50, 20] }] };
  // udeholdets fælles (30,85) → eget (70,15) → din visning (30,85): ved dit mål (nederst), på din venstre side
  assert.deepEqual(zoneShots(trace, 'a').map((s) => [s.x, s.y, s.t, s.outcome]), [[30, 85, 3, 'goal'], [60, 70, 4, 'save'], [10, 20, 5, 'miss']]);
  assert.equal(zoneShots(trace, 'h').length, 1);
});
