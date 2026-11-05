// v3.24.5 Test Manager: målmandens 🧤 "9 (2 svære)" på ALLE de steder, tallet vises – karakterarket (eget og modstanderens),
// avisen (gammel og klumme) og klummens begrundelse. gk-saves-v3245.test.mjs pinner kun finalizeSheet og savesText;
// mutationer af nowrap, savesIcon-ledningen, avis-feats, klummens savesText og legenden overlevede alle.
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
const { renderMatchCenter, renderGazette } = await import('../../public/ui/matchcenter.js');
const { buildColumn } = await import('../../public/engine/column.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id)[0];
const entry = (id, nr, extra = {}) => ({ playerId: id, shirtNumber: nr, shortName: 'Spiller' + nr, place: 'GK', minIn: 1, minOut: 90, goals: 0, assists: 0, saves: 0, aerialWins: 0, yellowCard: false, injured: false, isMotM: false, rating: 6.5, stars: 3, gainedCounterXp: 0, ...extra });
const ST = { hPoss: 60, aPoss: 40, hTacticSuccess: 1, aTacticSuccess: 2, hShots: 11, aShots: 12, hOnTarget: 5, aOnTarget: 6, hXg: 1.234, aXg: 0.5, hAerialWon: 3, aAerialWon: 4, hVarChecks: 0, aVarChecks: 1, hFouls: 7, aFouls: 8, hInjuries: 1, aInjuries: 2 };
function sheet(home, away) {
  const ev = { min: 90, hG: 1, aG: 0, text: 'Slut', category: 'PLAY', type: 'FULLTIME', label: 'Slut', plot: false, stats: ST };
  const m = { homeId: 'h', awayId: 'a', homeName: 'Hjemme', awayName: 'Ude', homeTacticStr: '', awayTacticStr: '', homeGoals: 1, awayGoals: 0, events: [ev], ratings: { motm: null, home, away } };
  return renderMatchCenter({ mc: { round: 1, matches: [m], viewIdx: 0, filter: 'all', shownCount: 99, playing: false, gazette: null, pane: 'players' }, myTeamId: 'h', on: {} });   // v3.32.1: "👥 Spillerne"
}
const saveIcons = (root) => all(root, (e) => e.className.includes('ricon') && e.textContent.startsWith('🧤'));

test('karakterarket: 🧤 med de svære i ét nowrap-stykke – dit hold OG modstanderens (hjemme ≠ ude) – og uden opdeling hvor feltet mangler/alle var svære', () => {
  const root = sheet([entry('g1', 1, { saves: 9, bigSaves: 2 })], [entry('g2', 1, { saves: 4, bigSaves: 0 })]);
  const ic = saveIcons(root);
  assert.deepEqual(ic.map((e) => e.textContent), ['🧤9 (2 svære)', '🧤4 (alle lette)']);   // før: "🧤9" / "🧤4"
  for (const e of ic) assert.match(e.className, /\bnowrap\b/, 'ét stykke: "(2" og "svære)" deles ikke på mobil');
  assert.match(ic[0].attrs.title, /^9 redninger \(2 svære\)\./); assert.match(ic[1].attrs.title, /^4 redninger \(alle lette\)\./);
  // ental, og ingen opdeling: gammel kamp (intet felt) og alle svære – ren 🧤-tal uden nowrap, og uden "(…)"
  const one = saveIcons(sheet([entry('g1', 1, { saves: 5, bigSaves: 1 })], []));
  assert.equal(one[0].textContent, '🧤5 (1 svær)');
  const plain = saveIcons(sheet([entry('g1', 1, { saves: 3 })], [entry('g2', 1, { saves: 3, bigSaves: 3 })]));
  assert.deepEqual(plain.map((e) => e.textContent), ['🧤3', '🧤3']);
  for (const e of plain) { assert.doesNotMatch(e.className, /nowrap/); assert.doesNotMatch(e.attrs.title, /svære|lette\)/); }
  assert.deepEqual(saveIcons(sheet([entry('f', 9, { saves: 0 })], [])), [], 'ingen redninger: intet 🧤');
});

test('legenden forklarer svære/lette (mobil har ingen hover)', () => {
  const leg = byId(sheet([entry('g1', 1)], []), 'icon-legend').textContent;
  assert.match(leg, /🧤9 \(2 svære\) = 9 redninger, heraf 2 svære/);
  assert.match(leg, /de lette .* løfter karakteren lidt, de svære meget/);
});

const G = (p) => ({ totalGoals: 1, totalVarChecks: 0, myResult: 'R', headlines: ['H'], playerOfTheRound: { playerId: 'p1', teamId: 'a1', shirtNumber: 1, shortName: 'Mand', teamName: 'Ude', rating: 7.1, stars: 4, ...p }, goalOfTheRound: null });
test('den gamle avis: rundens spiller – "9 redninger (2 svære)" (også modstanderens målmand), uden opdeling når feltet mangler', () => {
  const t = (p, my = 'h1') => byId(renderGazette(G(p), my, null, [{}]), 'player-of-round').textContent;
  assert.match(t({ saves: 9, bigSaves: 2 }), / • 9 redninger \(2 svære\)$/);   // modstander (a1 ≠ h1): delt, men uden karakter
  assert.doesNotMatch(t({ saves: 9, bigSaves: 2 }), /7,1/);
  assert.match(t({ saves: 9, bigSaves: 2 }, 'a1'), /karakter 7,1.* 9 redninger \(2 svære\)$/);
  assert.match(t({ saves: 4 }), / • 4 redninger$/);
});

test('klummen: begrundelsen for rundens målmand rummer "(2 svære)" – hele vejen gennem RATING_PUBLIC og buildColumn – og vises på siden', () => {
  const RT = (o) => ({ playerId: 'p1', shirtNumber: 1, shortName: 'Mand', teamId: 'a1', teamName: 'Ude', line: 'GK', goals: 0, assists: 0, saves: 0, aerialWins: 0, stars: 4, isMotM: false, ...o });
  const col = (o) => buildColumn({ matches: [{ homeId: 'h1', awayId: 'a1', homeName: 'Hjem', awayName: 'Ude', homeGoals: 1, awayGoals: 0, events: [], goalsPool: [], ratings: { home: [], away: [RT(o)] } }],
    gazette: { playerOfTheRound: { playerId: 'p1', teamId: 'a1' }, goalOfTheRound: null, defensiveAction: null }, history: [], table: [], next: [], viewerTeamId: 'h1', round: 5 });
  const why = (o) => col(o).sections.find((s) => s.id === 'col-stars').player.why;
  assert.equal(why({ saves: 9, bigSaves: 2 }), 'Begrundelse: 9 redninger (2 svære).');   // før: "9 redninger."
  assert.equal(why({ saves: 4, bigSaves: 0 }), 'Begrundelse: 4 redninger (alle lette).');
  assert.equal(why({ saves: 6, bigSaves: 1 }), 'Begrundelse: 6 redninger (1 svær).');
  assert.equal(why({ saves: 5 }), 'Begrundelse: 5 redninger.');
  const el = renderGazette(G({ saves: 9, bigSaves: 2 }), 'h1', null, [{}], col({ saves: 9, bigSaves: 2 }), null);
  assert.match(byId(el, 'player-of-round').textContent, / • Begrundelse: 9 redninger \(2 svære\)\.$/);
});
