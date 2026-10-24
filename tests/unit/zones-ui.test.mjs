// v3.16.1 Test Manager: modstanderens zone-kort i Match Center (#heat-opp: 3 × 3 felter med procent og farvestyrke + hans afslutninger
// som prikker + noten). heat-ui.test.mjs kiggede kun på prikkerne i dit eget kort; felternes placering/størrelse/styrke/tekst,
// prikkernes sted/udfald/titel, målmandens udeladelse og noten overlevede alle ændringer (10 af 10 mutationer i thirdsLine).
// Håndbygget spor på en rigtig kamps spillere (som heat-ui), med KENDTE, forskellige tal pr. hold.
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; this.handlers = {}; this.hidden = false; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  addEventListener(k, f) { this.handlers[k] = f; }
  scrollIntoView() {}
  get id() { return this.attrs.id; }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };
const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { simulateMatch } = await import('../../public/engine/match.js');
const { renderMatchCenter } = await import('../../public/ui/matchcenter.js');
const { clearReplays } = await import('../../public/ui/replay.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id);
const cls = (e, c) => e.className.split(' ').includes(c);

const L = createLeague(createRng(4)), me = L.teams.find((t) => !t.isBot);
const base = simulateMatch(me, L.teams[(4 % 7) + 1], createRng(4 * 13));
const gk = (list) => list.find((e) => e.role === 'GK');
const [hGk, aGk] = [gk(base.ratings.home), gk(base.ratings.away)];
const [hA, hB] = base.ratings.home.filter((e) => e.role !== 'GK' && !e.red).slice(0, 2);
const [aA, aB] = base.ratings.away.filter((e) => e.role !== 'GK' && !e.red).slice(0, 2);
const P = (e, x, y) => [e.playerId, x, y];
// FÆLLES koordinater. Udeholdet (egne = 100 − fælles): P1 (20,90) og P2 (20,92) → eget (80,10), (80,8) = række 2, søjle 0; P3 (80,50) → eget (20,50)
// = række 1, søjle 2; målmanden (50,10) → eget (50,90) ville være række 0, søjle 1. Afslutningerne: mål (30,85) → eget (70,15) = række 2,
// søjle 0; redning (60,70) → eget (40,30) = række 2, søjle 1. I alt 5 punkter uden målmand: [2][0] 3 (60 %), [1][2] 1 (20 %), [2][1] 1 (20 %).
// Hjemmeholdet: Q1 (80,90) → række 0, søjle 0; Q2 (30,10) → række 2, søjle 2; målmanden (50,90) ikke med → 50 % i hver.
const trace = () => ({
  v: 1,
  frames: [{ t: 1, poss: 'h', ball: [50, 50], h: [P(hGk, 50, 90), P(hA, 80, 90), P(hB, 30, 10)], a: [P(aGk, 50, 10), P(aA, 20, 90), P(aB, 20, 92), P(aA, 80, 50)] }],
  moments: [
    { t: 3, ev: 1, kind: 'GOAL', side: 'a', ball: [30, 85], h: [], a: [P(aA, 30, 85)], shooter: aA.playerId, scorer: aA.playerId },
    { t: 4, ev: 2, kind: 'SAVE', side: 'a', ball: [60, 70], h: [], a: [P(aB, 60, 70)], shooter: aB.playerId },
  ],
});
const render = (myTeamId) => {
  clearReplays();
  const mc = { round: 1, matches: [{ ...base, trace: trace() }], gazette: { goalOfTheRound: null, totalGoals: 0, totalVarChecks: 0 }, viewIdx: 0, filter: 'all', shownCount: Infinity, playing: false };
  return renderMatchCenter({ mc, myTeamId, on: { skip() {}, view() {}, snapshot() {}, openGoal() {}, filter() {}, heat() {}, replay() {} } });
};
const ratingTables = (el) => all(el, (e) => cls(e, 'ratings'));
const cellsOf = (card) => all(card, (x) => cls(x, 'zone-cell')).map((c) => [c.style.left, c.style.top, c.style.width, c.style.height, c.style.background, c.textContent]);
const T = '33.333333333333336%', U = '66.66666666666667%';
const cell = (x, y, a, pc) => [x === 0 ? '0%' : x === 1 ? T : U, y === 0 ? '0%' : y === 1 ? T : U, T, T, `rgba(249, 115, 22, ${a})`, pc];

test('data: kampen har målmandsark og to markspillere pr. hold', () => {
  assert.ok(hGk && aGk && hA && hB && aA && aB);
});

test('modstanderens zone-kort (du er hjemme): 9 felter række for række – 60 / 20 / 20 / 0 % med farvestyrke 0,85 / 0,35 / 0,10 (det tætteste er 0,85) – målmanden ikke med; felternes placering og størrelse', () => {
  const card = byId(ratingTables(render(base.homeId))[1], 'heat-opp');
  assert.equal(card.length, 1);
  assert.equal(byId(ratingTables(render(base.homeId))[0], 'heat-opp').length, 0, 'dit eget ark har intet zone-kort');
  assert.deepEqual(cellsOf(card[0]), [
    cell(0, 0, '0.10', '0 %'), cell(1, 0, '0.10', '0 %'), cell(2, 0, '0.10', '0 %'),
    cell(0, 1, '0.10', '0 %'), cell(1, 1, '0.10', '0 %'), cell(2, 1, '0.35', '20 %'),
    cell(0, 2, '0.85', '60 %'), cell(1, 2, '0.35', '20 %'), cell(2, 2, '0.10', '0 %')]);
});

test('modstanderens zone-kort (du er ude): hjemmeholdets kort – 50 % i række 0 / søjle 0 og række 2 / søjle 2, begge med fuld styrke', () => {
  const card = byId(ratingTables(render(base.awayId))[0], 'heat-opp');
  assert.equal(card.length, 1);
  const c = cellsOf(card[0]);
  assert.deepEqual(c.filter((x) => x[5] !== '0 %'), [cell(0, 0, '0.85', '50 %'), cell(2, 2, '0.85', '50 %')]);
  assert.equal(c.length, 9);
});

test('modstanderens afslutninger som prikker: mål ⚽ på (30 %, 85 %) "9\'", redning ● på (60 %, 70 %) "12\'" – klasse, sted, tegn og titel – og noten tæller dem', () => {
  const card = byId(ratingTables(render(base.homeId))[1], 'heat-opp')[0];
  const dots = all(card, (x) => cls(x, 'heat-shot'));
  assert.deepEqual(dots.map((d) => [d.className, d.style.left, d.style.top, d.textContent, d.attrs.title]), [
    ['heat-shot goal', '30%', '85%', '⚽', "9'"], ['heat-shot save', '60%', '70%', '●', "12'"]]);
  assert.equal(byId(card, 'heat-opp-note')[0].textContent, 'Set fra din side: de angriber nedad mod dit mål; venstre = din venstre side. Felterne: hvor holdet stod (groft – ingen enkeltspillere). Prikker: deres 2 afslutninger i åbent spil.');
  // tredjedelslinjen står stadig øverst i kortet: egne y 10, 8, 50, 15, 30 → 0 i egen tredjedel, 1 i midten, 4 i angrebstredjedelen
  assert.equal(byId(card, 'heat-thirds')[0].textContent, '🔥 Tyngdepunkt (groft): egen tredjedel 0 % · midten 20 % · angrebstredjedelen 80 %');
});
