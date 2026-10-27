// v3.22.0 – Kampens tal (brugeren viste en landstræners InStat-ark: "hvordan spillerne arbejder sammen"). match.js logger i
// trace.acts det, motoren selv afgjorde; heatmap.js actsOf lægger det sammen pr. spiller; visibility.js viewActs giver det
// kun til ejeren. Kampene er uændrede (fingerprint.test.mjs: full og noprose står stille – loggen trækker intet rng).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';
import { actsOf, COMBO_LABEL } from '../../public/engine/heatmap.js';
import { viewActs } from '../../public/engine/visibility.js';
import { isValidTrace } from '../../public/engine/sanitize.js';

const matches = (n) => Array.from({ length: n }, (_, i) => { const s = i + 1, L = createLeague(createRng(s)); return simulateMatch(L.teams[s % 8], L.teams[(s + 3) % 8], createRng(s * 31)); });
const M = matches(120);
const ids = (m, side) => new Set((side === 'h' ? m.ratings.home : m.ratings.away).map((e) => e.playerId));

test('handlingsloggen: hver post har sit hold rigtigt – den, der vandt/kombinerede, er på postens hold, modparten i en erobring på det andet', () => {
  let n = 0, wins = 0, combos = 0;
  for (const m of M) for (const [t, kind, s, a, b, ok] of m.trace.acts) {
    n++;
    const mine = ids(m, s), theirs = ids(m, s === 'h' ? 'a' : 'h');
    assert.ok(mine.has(a), `${kind} ${t}': spilleren er på holdet`);
    if (COMBO_LABEL[kind]) { combos++; assert.ok(mine.has(b) && a !== b, `${kind}: kombinationen er mellem to medspillere`); assert.ok([0, 1, 2].includes(ok)); }
    else { wins++; assert.ok(theirs.has(b), `${kind}: modparten er modstanderen`); assert.equal(ok, null); }
  }
  assert.ok(n > 120 * 8 && wins > 300 && combos > 300, `data: ${n} poster, ${wins} erobringer, ${combos} kombinationer`);
});

test('kombinationen er den samme som kampens øjeblik: afslutningen i åbent spil har modtageren som skytte, og målet har afleveringen som oplæg', () => {
  let shots = 0, goals = 0;
  for (const m of M) for (const [t, kind, s, a, b, ok] of m.trace.acts) {
    if (!['cb', 'run', 'cross', 'long'].includes(kind) || ok === 0) continue;
    const mo = m.trace.moments.filter((x) => x.side === s && x.t === t / 3 && x.shooter === b);
    assert.ok(mo.length >= 1, `${kind} ${t}': et øjeblik med ${b} som skytte`); shots++;
    if (ok === 2) {
      const g = m.trace.moments.find((x) => x.side === s && x.t === t / 3 && x.scorer === b);
      if (g) { assert.equal(g.assist, a, `${kind} ${t}': oplægget er afleveringens spiller`); goals++; }
    }
  }
  assert.ok(shots > 150 && goals > 40, `data: ${shots} afslutninger, ${goals} mål`);
});

test('actsOf: erobringer, bolde tabt, offside og kombinationer begge veje – på et kendt sæt poster', () => {
  const acts = [[3, 'press', 'h', 'p1', 'x1', null], [6, 'trap', 'h', 'p1', 'x2', null], [9, 'press', 'a', 'x3', 'p1', null], [12, 'trap', 'a', 'x4', 'p1', null],
    [15, 'tackle', 'a', 'x5', 'p1', null], [18, 'cb', 'h', 'p1', 'p2', 2], [21, 'corner', 'h', 'p3', 'p1', 0], [24, 'press', 'h', 'p2', 'x1', null], [27, 'cross', 'a', 'x1', 'x2', 1]];
  const r = actsOf(acts, 'h', 'p1');
  assert.deepEqual({ won: r.won, lost: r.lost, offside: r.offside }, { won: 2, lost: 2, offside: 1 });
  assert.deepEqual(r.combos, [{ t: 18, kind: 'cb', out: true, with: 'p2', ok: 2 }, { t: 21, kind: 'corner', out: false, with: 'p3', ok: 0 }]);
  assert.deepEqual(actsOf(acts, 'h', 'p2'), { won: 1, lost: 0, offside: 0, combos: [{ t: 18, kind: 'cb', out: false, with: 'p1', ok: 2 }] });
  assert.equal(actsOf(null, 'h', 'p1'), null, 'ingen log (kamp fra før v3.22.0): intet tal – ikke 0');
});

test('viewActs: kun ejeren får handlingsloggen; et spor uden log giver null', () => {
  const tr = M[0].trace;
  assert.equal(viewActs(tr, true), tr.acts); assert.ok(tr.acts.length > 0);
  assert.equal(viewActs(tr, false), null);
  assert.equal(viewActs({ v: 1, frames: [], moments: [] }, true), null);
});

test('gemmet: et spor med gyldig log er gyldigt; en ødelagt log afviser sporet; et spor uden log (før v3.22.0) er stadig gyldigt', () => {
  const tr = structuredClone(M[1].trace);
  assert.ok(isValidTrace(tr));
  assert.ok(isValidTrace({ ...tr, acts: undefined }));
  for (const bad of [[[1, 'press', 'x', 'a', 'b', null]], [[1, 'cb', 'h', 'a', 'b', 3]], [[-1, 'press', 'h', 'a', 'b', null]], [[1, 'press', 'h', 'a']], 'x', Array(401).fill([1, 'press', 'h', 'a', 'b', null])])
    assert.equal(isValidTrace({ ...tr, acts: bad }), false, JSON.stringify(bad).slice(0, 60));
});
