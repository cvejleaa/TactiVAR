// v3.16.1 Test Manager: huller fundet ved mutation af spread() og apartFrom() i positions.js. Forfatterens tests ser dem kun gennem
// statistik over seedede kampe (< 1 % brikker oven i hinanden) og gennem opstillinger, hvor ingen står tæt: passene (3), afrundingen
// af skubbet (ceil), grænsen præcis på MIN_APART, sidelinje-klemmen (3 / 97) og vendingen ved sidelinjen overlevede alle ændringer.
// Her står tallene bogstaveligt, med de trukne pladser (customCoords) som kilde til tætte spillere. Hver test nævner, hvad den dræber.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kickoffPositions, apartFrom, MIN_APART, KICKOFF_Y, MIN_DEPTH, SQUEEZE_SPAN } from '../../public/engine/positions.js';

// Afsparket bruger spread() uden apartFrom: 4-4-2 i mellemblok, brugeren har trukket nogle pladser til y 80–95 (bag squeeze-kanten
// KICKOFF_Y + SQUEEZE_SPAN = 65, så sammenpresningen ikke rører dem) – de er de eneste tætte par.
const T = (customCoords) => ({ baseFormation: '4-4-2', customCoords, phases: { phase2_defending: { pressingHeight: 'MID_BLOCK' } } });
const at = (list, ...slots) => slots.map((s) => [list[s].x, list[s].y]);

test('konstanter: MIN_APART 6, KICKOFF_Y 53, MIN_DEPTH 18, SQUEEZE_SPAN 12 (literal – testene herunder regner med dem)', () => {
  assert.deepEqual([MIN_APART, KICKOFF_Y, MIN_DEPTH, SQUEEZE_SPAN], [6, 53, 18, 12]);
});

test('spread: tre spillere i en klump (x 23, 25, 26) skubbes fra hinanden i TRE gennemløb (19,24,31 → 18,25,31 efter nr. 3) – dræber pass < 1 / < 2; sidelinje-klemmen: (4, 5) → (3, 9) og (95, 96) → (91, 97) – dræber klemmen 0..100 for begge', () => {
  const k = kickoffPositions(T({ 1: { x: 4, y: 95 }, 2: { x: 5, y: 95 }, 3: { x: 95, y: 95 }, 4: { x: 96, y: 95 }, 5: { x: 23, y: 80 }, 6: { x: 25, y: 80 }, 7: { x: 26, y: 80 } }));
  // gennemløb 1: 20,24,30 · 2: 19,24,31 · 3: 18,25,31 (stabil); (4,5): 3 klemt + 8 → 3 + 9; (95,96): 92 + 99 klemt til 97 → 91 + 97
  assert.deepEqual(at(k, 5, 6, 7), [[18, 80], [25, 80], [31, 80]]);
  assert.deepEqual(at(k, 1, 2, 3, 4), [[3, 95], [9, 95], [91, 95], [97, 95]]);
});

test('spread: et skub på tværs er ceil((6 − afstand) / 2) hver: (30, 33) → (28, 35) – ikke (29, 34) (floor) – og præcis MIN_APART væk (50,89 / 50,95: afstand 6 i y) røres ikke', () => {
  const k = kickoffPositions(T({ 5: { x: 30, y: 95 }, 6: { x: 33, y: 95 }, 7: { x: 50, y: 89 }, 8: { x: 50, y: 95 } }));
  assert.deepEqual(at(k, 5, 6), [[28, 95], [35, 95]]);
  assert.deepEqual(at(k, 7, 8), [[50, 89], [50, 95]]);
});

// apartFrom(pts, idx, other, oidx): pts i dette holds koordinater, other i modstanderens (spejles: 100 − x, 100 − y).
const away = (bx, by, others) => { const pts = [{ x: bx, y: by }]; apartFrom(pts, [0], others.map(([x, y]) => ({ x: 100 - x, y: 100 - y })), others.map((o, i) => i)); return pts[0]; };

test('apartFrom: en kæde af tre modspillere (46, 40, 34 på y 39–40) kræver tre gennemløb: 37 → 40 → 46 → 52 – dræber pass < 3', () => {
  // gennemløb 1: fra (40,39) til 34, derefter fra (34,40) til 40 · 2: fra (40,39) til 46 · 3: fra (46,39) til 52 (stabil)
  assert.deepEqual(away(37, 40, [[46, 39], [40, 39], [34, 40]]), { x: 52, y: 40 });
});

test('apartFrom: skubbes MIN_APART på tværs, væk fra siden han står på; lige x → mod højre; præcis MIN_APART væk (50,40 / 50,46) røres ikke; y røres aldrig – dræber >= → >, retningen, sammenligningen p.x >= q.x, y fra modspilleren', () => {
  assert.deepEqual(away(50, 40, [[50, 40]]), { x: 56, y: 40 });   // lige x: højre
  assert.deepEqual(away(50, 40, [[53, 40]]), { x: 47, y: 40 });   // modspilleren til højre: venstre
  assert.deepEqual(away(55, 40, [[50, 40]]), { x: 56, y: 40 });   // 5 væk: ud til 6
  assert.deepEqual(away(50, 40, [[50, 46]]), { x: 50, y: 40 });   // præcis 6 væk (i y): urørt
  assert.deepEqual(away(44, 40, [[50, 40]]), { x: 44, y: 40 });   // præcis 6 væk (i x): urørt
  assert.deepEqual(away(50, 40, [[50, 45]]), { x: 56, y: 40 });   // y 40 beholdes (modspillerens y er 45)
});

test('apartFrom ved sidelinjen: skubbet ud over 97 / under 3 vendes til den anden side (96 mod 92 → 86; 6 mod 8 → 14), men 8 er ikke "for tæt på kanten" (13 mod 14 → 8) – dræber vendingen uden/for bred/for smal/kun en side', () => {
  assert.deepEqual(away(96, 40, [[92, 40]]), { x: 86, y: 40 });   // 98 > 97
  assert.deepEqual(away(6, 40, [[8, 40]]), { x: 14, y: 40 });     // 2 < 3
  assert.deepEqual(away(13, 40, [[14, 40]]), { x: 8, y: 40 });    // 8: ingen vending
  assert.deepEqual(away(94, 40, [[91, 40]]), { x: 97, y: 40 });   // 97 er præcis på grænsen (ikke > 97): ingen vending
  assert.deepEqual(away(9, 40, [[12, 40]]), { x: 6, y: 40 });
  assert.deepEqual(away(6, 40, [[9, 40]]), { x: 3, y: 40 });      // 3 er præcis på grænsen (ikke < 3)
});

test('kickoffPositions(on): en tom plads tæller hverken som forreste eller i sammenpresningen – 5-4-1 uden angriberen: kanterne på 53 (med ham: 60/61 og angriberen på 53); pladsen røres ikke', () => {
  const t = { baseFormation: '5-4-1', customCoords: {}, phases: { phase2_defending: { pressingHeight: 'MID_BLOCK' } } };
  const on = Array.from({ length: 11 }, (_, i) => i !== 10);
  assert.deepEqual(kickoffPositions(t, on).map((q) => [q.x, q.y]), [[50, 90], [12, 64], [30, 73], [50, 75], [70, 73], [88, 64], [15, 53], [38, 56], [62, 56], [85, 53], [50, 18]]);
  assert.deepEqual(kickoffPositions(t).map((q) => [q.x, q.y]), [[50, 90], [10, 65], [30, 73], [50, 75], [70, 73], [90, 65], [17, 60], [38, 61], [62, 61], [83, 60], [50, 53]]);
});
