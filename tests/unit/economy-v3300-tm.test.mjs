// v3.30.0 del 2 – Test Manager: huller, som forfatterens economy-v3300.test.mjs lod stå åbne (fundet ved mutation):
// udtagelsens TIER_RANK (4/3/2/2/1) havde ingen test, der kunne se forskel på den og TIER_STARS (3,4/3,2/2,9/2,8/1);
// sanitize af att kun på ugyldige værdier (ikke grænsen 9.000/0); interpolationens kanter (5★, 1★, mellem alle trin);
// "💰 Til salg" på en række med +N-mærke.
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; if (k === 'id') this.id = v; }
  addEventListener() {}
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };
const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { playRound, commitRound } = await import('../../public/engine/season.js');
const { autoMatchBench, BENCH_SIZE, valueOfStars, publicValue, publicWage, VALUE_BY_STARS, TIER_STARS, TIER_RANK } = await import('../../public/engine/career.js');
const { parseSave, serialize } = await import('../../public/state/storage.js');
const { renderMatrix, COLUMNS } = await import('../../public/ui/matrix.js');
const { attText } = await import('../../public/ui/labels.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byCls = (root, c) => all(root, (e) => e.className.split(/\s+/).includes(c));

// ---------- Udtagelsen: TIER_RANK, ikke TIER_STARS ----------
// Ét ledigt bænkesæde (7): 6 obligatoriske (1 MV, 2 FOR, 2 MID, 1 ANG, alle prøvede 5★ frisk = 60) + to ANG – "ref" (prøvet) og "T"
// (ubeprøvet, tier T). Score = stjerner · 10 + friskhed / 10; den med højest score får sædet, ved lighed den, der står først (ref).
const prov = (id, line, stars, fresh = 100) => ({ id, line, roleTier: 'YOUTH', careerGames: 10, valueStars: stars, publicStars: stars, freshness: fresh, injuryMatchesLeft: 0, banMatches: 0 });
const unproved = (id, tier, fresh) => ({ id, line: 'ATT', roleTier: tier, careerGames: 0, valueStars: 0, publicStars: 0, freshness: fresh, injuryMatchesLeft: 0, banMatches: 0 });
const fillers = () => [prov('gk', 'GK', 5), prov('d1', 'DEF', 5), prov('d2', 'DEF', 5), prov('m1', 'MID', 5), prov('m2', 'MID', 5), prov('a0', 'ATT', 5)];
const seat = (ref, t) => {
  const team = { tactics: { lineupSlots: [] }, squad: [...fillers(), ref, t], matchBench: [] };
  autoMatchBench(team);
  assert.equal(team.matchBench.length, BENCH_SIZE, 'data: præcis ét sæde er ledigt');
  return team.matchBench.includes(ref.id) ? 'ref' : team.matchBench.includes(t.id) ? 'T' : '?';
};

test('TIER_RANK = 4/3/2/2/1 og er ikke TIER_STARS (udtagelsen er uændret fra før v3.30.0, lønnens startstjerner er ikke en rangering)', () => {
  assert.deepEqual(TIER_RANK, { STAR: 4, STARTER: 3, ROTATION: 2, TALENT: 2, YOUTH: 1 });
  assert.notDeepEqual(TIER_RANK, TIER_STARS);
});

for (const [tier, r] of [['STAR', 4], ['STARTER', 3], ['ROTATION', 2], ['TALENT', 2], ['YOUTH', 1]]) {
  test(`udtagelse: en ubeprøvet ${tier} vejer præcis ${r} stjerner – slår ${r - 1}★ (friskhed 100; ikke YOUTH) og taber til ${r}★ (friskhed 100), når han er træt`, () => {
    // T frisk 100: r · 10 + 10. Reference (r−1)★ frisk 100 = r · 10: T vinder (ved rank r − 1 var det uafgjort → ref først). YOUTH (r = 1) har
    // ingen 0★-reference; dens nedre grænse (ikke 2) pinnes af testen nedenfor
    if (r > 1) assert.equal(seat(prov('ref', 'ATT', r - 1), unproved('t', tier, 100)), 'T', `${tier} (rank ${r}) mod ${r - 1}★ frisk`);
    // T frisk 90: r · 10 + 9. Reference r★ frisk 100 = r · 10 + 10: ref vinder (ved rank r + 1 ville T vinde)
    assert.equal(seat(prov('ref', 'ATT', r), unproved('t', tier, 90)), 'ref', `${tier} (rank ${r}) mod ${r}★ frisk`);
  });
}

test('udtagelse: STAR på 40 % friskhed slår ROTATION på 100 % (rank 44 mod 30) – med TIER_STARS ville det blive 38 mod 39 og vende', () => {
  const team = { tactics: { lineupSlots: [] }, squad: [...fillers(), unproved('rot', 'ROTATION', 100), unproved('star', 'STAR', 40)], matchBench: [] };
  autoMatchBench(team);
  assert.ok(team.matchBench.includes('star') && !team.matchBench.includes('rot'), team.matchBench.join(','));
});

test('udtagelse: 3 kampe er grænsen mellem tier og offentlige stjerner (2 kampe: 5★ tæller ikke, tier YOUTH = 1; 3 kampe: 5★)', () => {
  // ref = ubeprøvet ROTATION frisk 100 = 30. P med valueStars 5 og tier YOUTH: 2 kampe → 10 + 10 = 20 (taber), 3 kampe → 50 + 10 (vinder)
  const P = (games) => ({ ...unproved('p', 'YOUTH', 100), careerGames: games, valueStars: 5, publicStars: 5 });
  assert.equal(seat(unproved('ref', 'ROTATION', 100), P(2)), 'ref');
  assert.equal(seat(unproved('ref', 'ROTATION', 100), P(3)), 'T');
  // Med 2 kampe rangeres en STAR som HELE 4 (frisk 100: 50) – ikke som starsForValue' 3,4 (44): mod en prøvet 4★ på 70 % (47) vinder STAR
  const S2 = { ...unproved('s', 'STAR', 100), careerGames: 2, valueStars: 1, publicStars: 1 };
  assert.equal(seat(prov('ref', 'ATT', 4, 70), S2), 'T', 'rank 4 · 10 + 10 = 50 mod 47 (3,4 · 10 + 10 = 44 ville tabe)');
});

// ---------- Interpolationen ----------
test('valueOfStars: tabellen i hele trin, lineært mellem alle trin (også ved 1★→2★ og 4★→5★), 5★ giver aldrig NaN', () => {
  assert.deepEqual(VALUE_BY_STARS.map((_, i) => valueOfStars(i)), VALUE_BY_STARS);
  assert.equal(valueOfStars(1.5), 450000, '300k + 0,5 · 300k');
  assert.equal(valueOfStars(2.8), 1080000, '600k + 0,8 · 600k (TALENT)');
  assert.ok(Math.abs(valueOfStars(3.2) - 1440000) < 1e-6, '1,2 mio. + 0,2 · 1,2 mio. (STARTER; flydende tal)');
  assert.equal(valueOfStars(4.5), 3450000, '2,4 mio. + 0,5 · 2,1 mio.');
  assert.equal(valueOfStars(5), 4500000);
  assert.ok(valueOfStars(4.99) < 4500000 && valueOfStars(4.99) > 4400000);
  // monoton: hver hundrededel stjerne er dyrere end den forrige
  for (let k = 0; k < 500; k++) assert.ok(valueOfStars((k + 1) / 100) >= valueOfStars(k / 100) - 1e-6, `s=${k / 100}`);
});

test('alle fem tiers: værdi og løn for en 25-årig ubeprøvet (alder 1,0) – 3,4★ 1.675.000 · 3,2★ 1.450.000 · 2,9★ 1.150.000 · 2,8★ 1.100.000 · 1★ 300.000', () => {
  // valueOfStars · 1,0 rundet til 25.000; løn 5,5 % rundet til 3.000
  const want = { STAR: [1675000, 93000], STARTER: [1450000, 81000], ROTATION: [1150000, 63000], TALENT: [1075000, 60000], YOUTH: [300000, 18000] };
  for (const [tier, [v, w]] of Object.entries(want)) {
    const p = { roleTier: tier, age: 25, careerGames: 0 };
    assert.equal(publicValue(p), v, `${tier} værdi`); assert.equal(publicWage(p), w, `${tier} løn`);
  }
});

// ---------- att i gemmet ----------
test('sanitize: grænserne på tilskuertallet – 9.000 (loftet nås i spillet) og 4.000 bliver, 0 er et helt tal og bliver, 9.001/-1/NaN/null/tekst slettes', () => {
  const L = createLeague(createRng(17)), rng = createRng(3);
  commitRound(L, playRound(L, rng), rng);
  const ms = L.lastRound.matches, vals = [9000, 4000, 0, 9001];
  ms.forEach((m, i) => { m.att = vals[i]; });
  let r = parseSave(serialize({ league: L, notes: {}, ui: {} }));
  assert.ok(r.ok, r.error);
  assert.deepEqual(r.state.league.lastRound.matches.map((m) => m.att), [9000, 4000, 0, undefined]);
  assert.ok(!('att' in r.state.league.lastRound.matches[3]));
  // NaN og null serialiseres som null; Infinity/NaN som null i JSON – begge må ikke overleve som tal
  for (const bad of [null, NaN, Infinity, -Infinity, '9000', true, [], {}]) {
    ms.forEach((m) => { m.att = bad; });
    r = parseSave(serialize({ league: L, notes: {}, ui: {} }));
    assert.ok(r.ok, r.error);
    assert.ok(r.state.league.lastRound.matches.every((m) => !('att' in m) || m.att === undefined), `ugyldig ${String(bad)}`);
  }
});

// ---------- Til salg ----------
test('Trup: "💰 Til salg" står også på en række med +N-mærke (player-gain), og et salgsmærke på et hold uden listed-felt kaster ikke', () => {
  const L = createLeague(createRng(31)), me = L.teams.find((t) => !t.isBot);
  const ui = { sortCol: 'pos', sortDesc: false, filter: 'all', gains: new Map([[me.squad[2].id, ['pace']]]), gainRound: 3 };
  const draw = () => renderMatrix({ team: me, isOwn: true, ui, notes: {}, onSort() {}, onSelect() {}, onSwap: null, onFilter() {}, onBlocked() {} });
  const nameCol = COLUMNS.findIndex((c) => c.key === 'name');
  me.listed = [me.squad[2].id];
  const row = all(draw(), (e) => e.tag === 'tr' && e.dataset.pid === me.squad[2].id)[0], td = row.children[nameCol];
  assert.ok(td.className.split(/\s+/).includes('player-gain'), 'data: rækken har +N');
  assert.deepEqual(byCls(td, 'listed-tag').map((e) => e.textContent), ['💰 Til salg']);
  assert.equal(td.textContent, `${me.squad[2].shortName}💰 Til salg`);
  delete me.listed;
  assert.equal(byCls(draw(), 'listed-tag').length, 0);
});

test('attText: kun et helt tal over 0 vises, med dansk tusindtalsprik; tekst, decimaltal, NaN, 0, negativt og manglende kamp giver intet', () => {
  assert.equal(attText({ att: 7840 }), '👥 7.840');
  assert.equal(attText({ att: 9000 }), '👥 9.000');
  assert.equal(attText({ att: 4000 }), '👥 4.000');
  for (const bad of ['7840', '7.840', 7840.5, NaN, 0, -5, null, undefined, {}]) assert.equal(attText({ att: bad }), null, String(bad));
  assert.equal(attText(null), null);
  assert.equal(attText(undefined), null);
  assert.equal(attText({}), null);
});
