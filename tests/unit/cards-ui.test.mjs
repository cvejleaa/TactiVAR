// v3.15 Test Manager: 🟥 i tidslinjen, rækken "Røde kort" i kampstatistikken, 🟥 i karakterarket og forklaringen
// under arket – ingen af dem var dækket (cards.test.mjs kører kun motoren). Hver værdi er forskellig hjemme ≠ ude.
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
const ST = { hPoss: 60, aPoss: 40, hTacticSuccess: 1, aTacticSuccess: 2, hShots: 11, aShots: 12, hOnTarget: 5, aOnTarget: 6, hXg: 1.234, aXg: 0.5, hAerialWon: 3, aAerialWon: 4, hVarChecks: 0, aVarChecks: 1, hFouls: 7, aFouls: 8, hInjuries: 1, aInjuries: 2 };
const entry = (id, nr, extra = {}) => ({ playerId: id, shirtNumber: nr, shortName: 'Spiller' + nr, place: 'CM', minIn: 1, minOut: 90, goals: 0, assists: 0, saves: 0, aerialWins: 0, yellowCard: false, injured: false, isMotM: false, rating: 6.5, stars: 3, gainedCounterXp: 0, ...extra });
function render(stats, { home = [], away = [], events = [] } = {}) {
  const ev = { min: 90, hG: 1, aG: 0, text: 'Slut', category: 'PLAY', type: 'FULLTIME', label: 'Slut', plot: false, stats };
  const m = { homeId: 'h', awayId: 'a', homeName: 'Hjemme', awayName: 'Ude', homeTacticStr: '', awayTacticStr: '', homeGoals: 1, awayGoals: 0, events: [...events, ev], ratings: { motm: null, home, away } };
  return renderMatchCenter({ mc: { round: 1, matches: [m], viewIdx: 0, filter: 'all', shownCount: 99, playing: false, gazette: null }, myTeamId: 'h', on: {} });
}
const statRows = (root) => Object.fromEntries(all(all(root, (e) => e.attrs.id === 'match-stats')[0], (e) => e.tag === 'tbody')[0].children.map((tr) => [tr.children[1].textContent, [tr.children[0].textContent, tr.children[2].textContent]]));

test('kampstatistik: "Røde kort" står med hjemme- og udeholdets eget tal (hjemme ≠ ude); gamle kampe uden tallet viser –; 0 er et tal', () => {
  assert.deepEqual(statRows(render({ ...ST, hReds: 2, aReds: 1 }))['Røde kort'], ['2', '1']);
  assert.deepEqual(statRows(render({ ...ST, hReds: 1, aReds: 3 }))['Røde kort'], ['1', '3']);
  assert.deepEqual(statRows(render(ST))['Røde kort'], ['–', '–']);
  assert.deepEqual(statRows(render({ ...ST, hReds: 1 }))['Røde kort'], ['1', '–']);
  assert.deepEqual(statRows(render({ ...ST, aReds: 1 }))['Røde kort'], ['–', '1']);
  assert.deepEqual(statRows(render({ ...ST, hReds: 0, aReds: 0 }))['Røde kort'], ['0', '0']);
});

test('tidslinjen: en udvisning får 🟥 (ikke punktum) på den rigtige side og i det rigtige minut; en almindelig hændelse beholder sit eget tegn', () => {
  const red = { min: 30, hG: 0, aG: 0, text: '🟥 [Ude] Direkte rødt kort', category: 'HIGHLIGHT', type: 'RED', label: '🟥 Udvist: #3 X', plot: true, isHome: false, stats: ST };
  const yellow = { min: 60, hG: 0, aG: 0, text: '🟨 gult', category: 'PLAY', type: 'FOUL', label: 'Gult kort', plot: true, isHome: true, stats: ST };
  const marks = all(render(ST, { events: [red, yellow] }), (e) => e.className.includes('tl-mark'));
  assert.deepEqual(marks.map((e) => e.textContent), ['🟥', '🟨'], 'ikonerne i rækkefølge');
  assert.match(marks[0].className, /\baway\b/); assert.match(marks[1].className, /\bhome\b/); assert.match(marks[0].attrs.title, /^30' /);
});

test('karakterarket: 🟥 står ved den udviste og kun ved ham (ikke ved gult kort alene); forklaringen nævner "Udvist"', () => {
  const home = [entry(1, 1), entry(2, 2, { red: 'DIRECT', minOut: 30 }), entry(3, 3, { yellowCard: true, yellows: 1, red: null })];
  const root = render(ST, { home, away: [entry(4, 4, { red: 'SECOND_YELLOW', yellowCard: true, yellows: 2 })] });
  const tables = all(root, (e) => e.tag === 'table' && e.attrs.id !== 'match-stats');
  assert.equal(tables.length, 2);
  const icons = (tbl) => all(tbl, (e) => e.tag === 'tr').map((tr) => [tr.children[0].textContent.split(' ')[0], all(tr, (e) => e.className === 'ricon').map((s) => s.textContent).join('')]);
  assert.deepEqual(icons(tables[0]), [['#1', ''], ['#2', '🟥'], ['#3', '🟨']]);
  assert.deepEqual(icons(tables[1]), [['#4', '🟨🟥']]);
  const legend = all(root, (e) => e.attrs.id === 'icon-legend')[0].textContent;
  assert.match(legend, /🟥 Udvist/);
});
