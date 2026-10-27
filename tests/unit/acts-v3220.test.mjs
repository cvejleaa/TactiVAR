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
  assert.deepEqual(r.combos, [{ t: 18, kind: 'cb', from: 'p1', to: 'p2', out: true, with: 'p2', ok: 2 }, { t: 21, kind: 'corner', from: 'p3', to: 'p1', out: false, with: 'p3', ok: 0 }]);
  assert.deepEqual(actsOf(acts, 'h', 'p2'), { won: 1, lost: 0, offside: 0, combos: [{ t: 18, kind: 'cb', from: 'p1', to: 'p2', out: false, with: 'p1', ok: 2 }] });
  // Holdet (playerId null, QC): alle holdets kombinationer – ingen erobringer pr. spiller, ikke modstanderens
  const team = actsOf(acts, 'h', null);
  assert.deepEqual([team.won, team.lost, team.offside, team.combos.map((c) => `${c.from}>${c.to}`)], [0, 0, 0, ['p1>p2', 'p3>p1']]);
  assert.equal(actsOf(null, 'h', 'p1'), null, 'ingen log (kamp fra før v3.22.0): intet tal – ikke 0');
});

test('viewActs: kun din side – dine poster og modstanderens erobringer fra dine spillere UDEN hans navn; hans kombinationer (cross/long røber stilen) aldrig', () => {
  const tr = M[0].trace, opp = (s) => (s === 'h' ? 'a' : 'h');
  for (const side of ['h', 'a']) {
    const v = viewActs(tr, side);
    assert.deepEqual(v.filter((x) => x[2] === side), tr.acts.filter((x) => x[2] === side), 'egne poster uændrede');
    const theirs = v.filter((x) => x[2] === opp(side));
    assert.deepEqual(theirs.map((x) => [x[0], x[1], x[4]]), tr.acts.filter((x) => x[2] === opp(side) && x[5] === null).map((x) => [x[0], x[1], x[4]]), 'hans erobringer – modparten (din spiller) står');
    assert.ok(theirs.every((x) => x[3] === null), 'hans spiller er fjernet');
    assert.ok(!v.some((x) => x[2] === opp(side) && x[5] !== null), 'ingen af hans kombinationer');
  }
  assert.ok(tr.acts.some((x) => x[5] !== null) && tr.acts.some((x) => x[5] === null), 'data: begge slags poster');
  assert.equal(viewActs(tr, null), null, 'ikke dit hold');
  assert.equal(viewActs({ v: 1, frames: [], moments: [] }, 'h'), null);
  // Bolde tabt tæller stadig rigtigt på den filtrerede log (actsOf bruger kun modparten)
  for (const m of M.slice(0, 20)) for (const e of m.ratings.home) assert.equal(actsOf(viewActs(m.trace, 'h'), 'h', e.playerId).lost, actsOf(m.trace.acts, 'h', e.playerId).lost);
});

test('gemmet: et spor med gyldig log er gyldigt; en ødelagt log afviser sporet; et spor uden log (før v3.22.0) er stadig gyldigt', () => {
  const tr = structuredClone(M[1].trace);
  assert.ok(isValidTrace(tr));
  assert.ok(isValidTrace({ ...tr, acts: undefined }));
  for (const bad of [[[1, 'toString', 'h', 'a', 'b', null]], [[1, 'press', 'h', {}, 'b', null]], [[1, 'press', 'x', 'a', 'b', null]], [[1, 'cb', 'h', 'a', 'b', 3]], [[-1, 'press', 'h', 'a', 'b', null]], [[1, 'press', 'h', 'a']], 'x', Array(401).fill([1, 'press', 'h', 'a', 'b', null])])
    assert.equal(isValidTrace({ ...tr, acts: bad }), false, JSON.stringify(bad).slice(0, 60));
});

// Gemmet fra forrige version (CLAUDE.md, Release Manager): tests/fixtures/save-v3.21.2.json er lavet med v3.21.2-koden (main ce6d0ff):
// ny liga (seed 19) + 6 runder + serialize. Sporet har ingen acts – det indlæses uændret (intet skema-bump), Kampens tal siger
// "findes fra v3.22.0" (null, ikke 0), og den næste runde, spillet med v3.22.0, får loggen og overlever gem → indlæs.
test('gem fra v3.21.2: indlæses uden migrering med sporene i behold; næste runde får handlingsloggen, og den overlever gem og indlæsning', async () => {
  const fs = await import('node:fs');
  const { parseSave, serialize } = await import('../../public/state/storage.js');
  const { playRound, commitRound } = await import('../../public/engine/season.js');
  const RAW = fs.readFileSync(new URL('../fixtures/save-v3.21.2.json', import.meta.url), 'utf8'), raw = JSON.parse(RAW);
  const r = parseSave(RAW);
  assert.ok(r.ok, r.error); assert.equal(r.migratedFrom, null);
  const L = r.state.league, before = raw.league.lastRound.matches;
  assert.equal(L.lastRound.matches.length, before.length);
  L.lastRound.matches.forEach((m, i) => { assert.deepEqual(m.trace, before[i].trace, 'sporet er urørt'); assert.equal(m.trace.acts, undefined); });
  const me = L.teams.find((t) => !t.isBot).id, mine = L.lastRound.matches.find((m) => m.homeId === me || m.awayId === me);
  const side = mine.homeId === me ? 'h' : 'a';
  assert.equal(actsOf(viewActs(mine.trace, side), side, (side === 'h' ? mine.ratings.home : mine.ratings.away)[0].playerId), null, 'ingen tal – ikke 0');
  const rng = createRng(7); commitRound(L, playRound(L, rng), rng);
  const back = parseSave(serialize({ league: L, notes: {}, ui: {} }));
  assert.ok(back.ok, back.error);
  const ms = back.state.league.lastRound.matches;
  assert.ok(ms.every((m) => Array.isArray(m.trace?.acts) && m.trace.acts.length > 0), 'den nye runde har loggen efter gem → indlæs');
  assert.deepEqual(ms.map((m) => m.trace.acts), L.lastRound.matches.map((m) => m.trace.acts));
});
