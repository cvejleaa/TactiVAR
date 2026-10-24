// v3.15.1 Test Manager: UI-delen af "VAR som i virkeligheden" – nøglemomenter og tidslinjen. KEY_TYPES og ICON i
// ui/matchcenter.js havde ingen test for de nye hændelser (filterEvents-testene bruger kun TRIGGER/GOAL), så en VAR-kendelse
// kunne forsvinde fra "Kun nøglemomenter" eller få et punktum i tidslinjen med grøn suite.
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
const { renderMatchCenter, filterEvents } = await import('../../public/ui/matchcenter.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const ST = { hPoss: 60, aPoss: 40, hTacticSuccess: 1, aTacticSuccess: 2, hShots: 11, aShots: 12, hOnTarget: 5, aOnTarget: 6, hXg: 1.234, aXg: 0.5, hAerialWon: 3, aAerialWon: 4, hVarChecks: 0, aVarChecks: 1, hFouls: 7, aFouls: 8, hInjuries: 1, aInjuries: 2 };
const ev = (type, min, isHome, extra = {}) => ({ min, hG: 0, aG: 0, text: type, category: 'HIGHLIGHT', type, label: type, plot: false, isHome, stats: ST, ...extra });
function render(events) {
  const end = ev('FULLTIME', 90, true);
  const m = { homeId: 'h', awayId: 'a', homeName: 'Hjemme', awayName: 'Ude', homeTacticStr: '', awayTacticStr: '', homeGoals: 0, awayGoals: 0, events: [...events, end], ratings: { motm: null, home: [], away: [] } };
  return renderMatchCenter({ mc: { round: 1, matches: [m], viewIdx: 0, filter: 'all', shownCount: 99, playing: false, gazette: null }, myTeamId: 'h', on: {} });
}

test('nøglemomenter: VAR-tjek, VAR-straffe, VAR-røde kort, annullerede mål og røde kort står med; skud forbi, flag, redninger og gule kort gør ikke', () => {
  const types = ['GOAL', 'HEADER_GOAL', 'VAR_NO_GOAL', 'VAR_CHECK', 'VAR_PEN', 'VAR_RED', 'RED', 'INJURY', 'SUB', 'TRIGGER', 'MISS', 'OFFSIDE_FLAG', 'SAVE', 'FOUL', 'TACTIC_WIN', 'INFO'];
  const events = types.map((t, i) => ev(t, i + 1, true));
  assert.deepEqual(filterEvents(events, 'key').map((e) => e.type), ['GOAL', 'HEADER_GOAL', 'VAR_NO_GOAL', 'VAR_CHECK', 'VAR_PEN', 'VAR_RED', 'RED', 'INJURY', 'SUB', 'TRIGGER']);
  assert.equal(filterEvents(events, 'all').length, types.length);
});

test('tidslinjen: annulleret mål, VAR-straffe, VAR-rødt og udvisning får hver sit tegn på den rigtige side', () => {
  const events = [ev('VAR_NO_GOAL', 10, true, { plot: true }), ev('VAR_PEN', 20, false, { plot: true }), ev('VAR_RED', 30, true, { plot: true }), ev('RED', 40, false, { plot: true })];
  const marks = all(render(events), (e) => e.className.includes('tl-mark'));
  assert.deepEqual(marks.map((e) => e.textContent), ['📺', '📺', '📺', '🟥']);
  assert.deepEqual(marks.map((e) => /\bhome\b/.test(e.className)), [true, false, true, false]);
  // Et godkendt tjek (plot falsk) og et forbi-skud står ikke i tidslinjen
  assert.equal(all(render([ev('VAR_CHECK', 10, true), ev('MISS', 20, true), ev('OFFSIDE_FLAG', 30, true)]), (e) => e.className.includes('tl-mark')).length, 0);
});
