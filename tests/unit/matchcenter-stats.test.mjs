// Kampstatistikken i Match Center (public/ui/matchcenter.js statsRows) mod et minimalt DOM.
// v3.10.1 Test Manager: e2e kører kun en NY kamp, så '–' for gamle kampe (uden dødbold-tal) og
// ombyttet hjemme/ude i de nye rækker var ubevist. Hver værdi her er forskellig (hjemme ≠ ude).
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener() {}
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };
const { renderMatchCenter } = await import('../../public/ui/matchcenter.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const BASE = { hPoss: 60, aPoss: 40, hTacticSuccess: 1, aTacticSuccess: 2, hShots: 11, aShots: 12, hOnTarget: 5, aOnTarget: 6, hXg: 1.234, aXg: 0.5, hAerialWon: 3, aAerialWon: 4, hVarChecks: 0, aVarChecks: 1, hFouls: 7, aFouls: 8, hInjuries: 1, aInjuries: 2 };
const NEW = { hFreeKicks: 3, aFreeKicks: 4, hCorners: 5, aCorners: 9, hPenalties: 2, aPenalties: 1, hPenaltyGoals: 1, aPenaltyGoals: 0, hYellows: 6, aYellows: 2 };
function rows(stats) {
  const ev = { min: 90, hG: 1, aG: 0, text: 'Slut', category: 'PLAY', type: 'FULLTIME', label: 'Slut', plot: false, stats };
  const m = { homeId: 'h', awayId: 'a', homeName: 'Hjemme', awayName: 'Ude', homeTacticStr: '', awayTacticStr: '', homeGoals: 1, awayGoals: 0, events: [ev], ratings: { motm: null, home: [], away: [] } };
  const root = renderMatchCenter({ mc: { round: 1, matches: [m], viewIdx: 0, filter: 'all', shownCount: 1, playing: true }, myTeamId: 'h', on: {} });
  const tbl = all(root, (e) => e.attrs.id === 'match-stats')[0];
  const body = all(tbl, (e) => e.tag === 'tbody')[0];
  return Object.fromEntries(body.children.map((tr) => [tr.children[1].textContent, [tr.children[0].textContent, tr.children[2].textContent]]));
}

test('kampstatistik: dødbolde og gule kort står med hjemme- og udeholdets eget tal (hjemme ≠ ude)', () => {
  const r = rows({ ...BASE, ...NEW });
  assert.deepEqual(r['Frispark i skudafstand'], ['3', '4']);
  assert.deepEqual(r['Hjørnespark'], ['5', '9']);
  assert.deepEqual(r['Straffe (mål)'], ['2 (1)', '1 (0)']);
  assert.deepEqual(r['Gule kort'], ['6', '2']);
  assert.deepEqual(r['Frispark begået / skader'], ['7 / 1', '8 / 2']);
  assert.equal(r['Frispark / skader'], undefined, 'den gamle etiket er omdøbt');
});

test('kampstatistik: gamle kampe uden dødbold-tal viser – (ikke 0 eller undefined); 0 er et rigtigt tal', () => {
  const old = rows(BASE);
  for (const l of ['Frispark i skudafstand', 'Hjørnespark', 'Straffe (mål)', 'Gule kort']) assert.deepEqual(old[l], ['–', '–'], l);
  // Halvt manglende: hver side og hver række afgør sit eget (en ombyttet h/a-nøgle ville vise 0 eller tal på den forkerte side)
  const half = rows({ ...BASE, hFreeKicks: 3, hCorners: 5, hPenalties: 2, hPenaltyGoals: 1, hYellows: 6 });
  assert.deepEqual(half['Frispark i skudafstand'], ['3', '–']); assert.deepEqual(half['Hjørnespark'], ['5', '–']);
  assert.deepEqual(half['Straffe (mål)'], ['2 (1)', '–']); assert.deepEqual(half['Gule kort'], ['6', '–']);
  const other = rows({ ...BASE, aFreeKicks: 4, aCorners: 9, aPenalties: 1, aPenaltyGoals: 0, aYellows: 2 });
  assert.deepEqual(other['Frispark i skudafstand'], ['–', '4']); assert.deepEqual(other['Hjørnespark'], ['–', '9']);
  assert.deepEqual(other['Straffe (mål)'], ['–', '1 (0)']); assert.deepEqual(other['Gule kort'], ['–', '2']);
  const zero = rows({ ...BASE, hFreeKicks: 0, aFreeKicks: 0, hCorners: 0, aCorners: 0, hPenalties: 0, aPenalties: 0, hPenaltyGoals: 0, aPenaltyGoals: 0, hYellows: 0, aYellows: 0 });
  assert.deepEqual(zero['Gule kort'], ['0', '0']); assert.deepEqual(zero['Straffe (mål)'], ['0 (0)', '0 (0)']);
  assert.deepEqual(zero['Hjørnespark'], ['0', '0']); assert.deepEqual(zero['Frispark i skudafstand'], ['0', '0']);
});
