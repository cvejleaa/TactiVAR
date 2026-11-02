// v3.30.0 (brugeren 2026-11-02): ærlige startstjerner + løn 5,5 %, 9.000 tilskuere kan nås, tilskuerne på hver kamp og
// "💰 Til salg" i Trup. Båndene er skrevet, så den GAMLE kode giver rødt – begge tal står ved hver (CLAUDE.md, Testprincipper).
// Målingerne bag tallene: tools/measure-star-fit.mjs, tools/measure-star-catchup.mjs, tools/measure-economy.mjs (docs/spec.md §2).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

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
const { attendance, publicValue, publicWage, valueOfStars, starsForValue, wagesPerRound, TIER_STARS, WAGE_SHARE, GATE_MAX } = await import('../../public/engine/career.js');
const { parseSave, serialize } = await import('../../public/state/storage.js');
const { renderLastRound } = await import('../../public/ui/rounds.js');
const { renderMatchCenter } = await import('../../public/ui/matchcenter.js');
const { renderMatrix, COLUMNS } = await import('../../public/ui/matrix.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byCls = (root, c) => all(root, (e) => e.className.split(/\s+/).includes(c));
const byId = (root, id) => all(root, (e) => e.id === id)[0] ?? null;
const own = (L) => L.teams.find((t) => !t.isBot);

test('tilskuerne: 1. hjemme mod 2. efter tre sejre = 9.000 (gammel formel 300/150/120: 8.080); bunden og midten med præcise tal', () => {
  assert.equal(GATE_MAX, 9000);
  assert.equal(attendance(1, 2, 9), 9000, 'gammel: 4000 + 2100 + 900 + 1080 = 8080');
  assert.equal(attendance(1, 1, 9), 9000, 'loftet holder (ny formel gav 9.190 uden)');
  assert.equal(attendance(8, 8, 0), 4000, 'bunden er uændret');
  assert.equal(attendance(4.5, 4.5, 0), 5943, 'ny liga: 4000 + 370·3,5 + 185·3,5 = 5942,5 → 5943 (gammel 5575)');
  assert.equal(attendance(3, 6, 4), 6800, '4000 + 1850 + 370 + 580 (gammel 4000 + 1500 + 300 + 480 = 6280)');
});

test('startstjerner = de forventede kampstjerner; værdien interpoleres mellem hele stjerner; løn 5,5 %', () => {
  assert.deepEqual(TIER_STARS, { STAR: 3.4, STARTER: 3.2, ROTATION: 2.9, TALENT: 2.8, YOUTH: 1 }, 'før 4/3/2/2/1');
  assert.equal(WAGE_SHARE, 0.055, 'før 0,06');
  assert.equal(valueOfStars(3), 1200000, 'hele stjerner er tabellen');
  assert.equal(valueOfStars(2.9), 1140000, '600k + 0,9 · 600k');
  assert.equal(valueOfStars(3.4), 1680000, '1,2 mio. + 0,4 · 1,2 mio.');
  // En ubeprøvet ROTATION på 25 år (alder 1,0): 1.140.000 → 1.150.000 (25k-trin); løn 5,5 % = 63.250 → 63.000 (3k-trin).
  // Gammel kode: 2★ = 600.000 og løn 36.000. Med 6 % på den nye værdi: 69.000 – så lønnen fanger også WAGE_SHARE alene.
  const p = { roleTier: 'ROTATION', age: 25, careerGames: 0 };
  assert.equal(starsForValue(p), 2.9);
  assert.equal(publicValue(p), 1150000);
  assert.equal(publicWage(p), 63000);
  // STAR 24 år: 3,4★ = 1.680.000 (gammel 4★ = 2.400.000); løn 92.400 → 93.000 (gammel 144.000, 6 % af ny 102.000)
  const s = { roleTier: 'STAR', age: 24, careerGames: 2 };
  assert.equal(publicValue(s), 1675000);
  assert.equal(publicWage(s), 93000);
  // Prøvede spillere (≥ 3 kampe) bruger stadig hele, offentlige stjerner – ingen 3,4★ på dem
  assert.equal(starsForValue({ roleTier: 'STAR', age: 24, careerGames: 3, valueStars: 2.6 }), 3);
});

test('lønhoppet S1→S2 er væk: snitlønnen pr. runde efter sæson 1 stiger under 20k (gammel kode: +60.500, 410k → 471k)', () => {
  // tools/measure-star-catchup.mjs: med 4/3/2/2 gik 59 % af ROTATION/TALENT 2★→3★ efter 3 kampe, og lønnen fordobledes.
  // Liga 101/rng 7: ny kode 472.000 → 444.625 (−27.375). Gammel kode 410.250 → 470.750 (+60.500).
  const L = createLeague(createRng(101)), rng = createRng(7);
  const mean = () => L.teams.reduce((a, t) => a + wagesPerRound(t), 0) / L.teams.length;
  const w0 = mean();
  for (let r = 0; r < 14; r++) commitRound(L, playRound(L, rng), rng);
  const d = mean() - w0;
  assert.ok(w0 > 440000 && w0 < 500000, `S1-løn ${w0} (gammel 410.250)`);
  assert.ok(d < 20000 && d > -60000, `S1→S2 ${d} (gammel +60.500)`);
});

test('tilskuerne står på kampen: league.lastRound.matches[i].att = hjemmeholdets billettal i regnskabet; gemmet bevarer det', () => {
  const L = createLeague(createRng(17)), rng = createRng(3);
  commitRound(L, playRound(L, rng), rng);
  commitRound(L, playRound(L, rng), rng);
  const ms = L.lastRound.matches;
  assert.equal(ms.length, 4);
  for (const m of ms) {
    const home = L.teams.find((t) => t.id === m.homeId), led = home.finance.ledger.at(-1);
    assert.ok(Number.isInteger(m.att) && m.att >= 4000 && m.att <= 9000, `att ${m.att}`);
    assert.equal(m.att, led.att, 'samme tal som regnskabets');
    assert.equal(m.att * 90, led.gate);
  }
  const r = parseSave(serialize({ league: L, notes: {}, ui: {} }));
  assert.ok(r.ok, r.error);
  assert.deepEqual(r.state.league.lastRound.matches.map((m) => m.att), ms.map((m) => m.att), 'sanitize smider det ikke væk');
});

test('sanitize: et ugyldigt tilskuertal slettes (tekst, negativt, over 9.000, decimaltal) – et gyldigt bliver', () => {
  const L = createLeague(createRng(17)), rng = createRng(3);
  commitRound(L, playRound(L, rng), rng);
  const [a, b, c, d] = L.lastRound.matches;
  a.att = '7.840'; b.att = -1; c.att = 9001; d.att = 6000.5;
  let r = parseSave(serialize({ league: L, notes: {}, ui: {} }));
  assert.ok(r.ok, r.error);
  assert.ok(r.state.league.lastRound.matches.every((m) => !('att' in m)));
  a.att = 7840;
  r = parseSave(serialize({ league: L, notes: {}, ui: {} }));
  assert.equal(r.state.league.lastRound.matches[0].att, 7840);
});

test('gem fra v3.26.1 (tests/fixtures/save-v3.26.1.json, kampe uden att): indlæses uden migrering, og Liga/referatet viser intet tilskuertal', () => {
  const RAW = fs.readFileSync(new URL('../fixtures/save-v3.26.1.json', import.meta.url), 'utf8'), raw = JSON.parse(RAW);
  const rawMs = raw.league.lastRound?.matches ?? [];
  assert.ok(rawMs.length === 4 && rawMs.every((m) => m.att === undefined), 'data: fixturet har en runde uden att');
  const r = parseSave(RAW);
  assert.ok(r.ok, r.error);
  const lr = r.state.league.lastRound;
  assert.ok(lr.matches.every((m) => !('att' in m)));
  const el = renderLastRound({ round: lr, myTeamId: lr.matches[0].homeId, onOpen() {}, seasonRound: 1 });
  assert.equal(byCls(el, 'fixture').length, 4, 'resultatkortene er tegnet');
  assert.equal(byCls(el, 'fx-att').length, 0);
  assert.ok(!/👥|undefined|NaN/.test(el.textContent), el.textContent);
});

test('Liga: "👥 7.840" under resultatet på netop den kamp, der har tallet; 0 og manglende viser intet', () => {
  const m = (h, a, att) => ({ homeId: h, awayId: a, homeName: h, awayName: a, homeGoals: 1, awayGoals: 0, ...(att === undefined ? {} : { att }) });
  const el = renderLastRound({ round: { round: 3, matches: [m('A', 'B', 7840), m('C', 'D'), m('E', 'F', 9000), m('G', 'H', 0)] }, myTeamId: 'A', onOpen() {}, seasonRound: 3 });
  const fx = byCls(el, 'fixture');
  assert.deepEqual(fx.map((f) => byCls(f, 'fx-att').map((e) => e.textContent)), [['👥 7.840'], [], ['👥 9.000'], []]);
  assert.ok(!/undefined|👥 0/.test(el.textContent));
});

const ST = { hPoss: 60, aPoss: 40, hTacticSuccess: 1, aTacticSuccess: 2, hShots: 11, aShots: 12, hOnTarget: 5, aOnTarget: 6, hXg: 1.2, aXg: 0.5, hAerialWon: 3, aAerialWon: 4, hVarChecks: 0, aVarChecks: 1, hFouls: 7, aFouls: 8, hInjuries: 0, aInjuries: 0 };
test('referatet: "👥 7.840" i resultatfeltet (#attendance) – også under afspilningen; en kamp uden tallet har intet felt', () => {
  const ev = { min: 90, hG: 2, aG: 1, text: 'Slut', category: 'PLAY', type: 'FULLTIME', label: 'Slut', plot: false, stats: ST };
  const match = (extra) => ({ homeId: 'h', awayId: 'a', homeName: 'Hjemme', awayName: 'Ude', homeTacticStr: '', awayTacticStr: '', homeGoals: 2, awayGoals: 1, events: [ev], ratings: { motm: null, home: [], away: [] }, ...extra });
  const draw = (m, playing = false) => renderMatchCenter({ mc: { round: 1, matches: [m], viewIdx: 0, filter: 'all', shownCount: 99, playing, gazette: null }, myTeamId: 'h', on: {} });
  const a = byId(draw(match({ att: 7840 })), 'attendance');
  assert.ok(a, 'feltet findes');
  assert.equal(a.textContent, '👥 7.840 tilskuere');
  assert.equal(byId(draw(match({ att: 7840 }), true), 'attendance')?.textContent, '👥 7.840 tilskuere');
  const none = draw(match({}));
  assert.equal(byId(none, 'attendance'), null);
  assert.ok(!/👥|undefined/.test(byId(none, 'scoreboard').textContent));
});

test('Trup: "💰 Til salg" efter navnet på netop dine spillere til salg – ingen andre, og aldrig på et andet holds salgsliste', () => {
  const L = createLeague(createRng(31)), me = own(L), bot = L.teams.find((t) => t.isBot);
  me.listed = [me.squad[2].id, me.squad[5].id];
  bot.listed = [bot.squad[0].id];   // en anden klubs salgsliste er ejerens (visibility.js viewTeam) – vises aldrig
  const ui = { sortCol: 'pos', sortDesc: false, filter: 'all' }, nameCol = COLUMNS.findIndex((c) => c.key === 'name');
  const draw = (team, isOwn) => renderMatrix({ team, isOwn, ui, notes: {}, onSort() {}, onSelect() {}, onSwap: null, onFilter() {}, onBlocked() {} });
  const mx = draw(me, true), rows = all(mx, (e) => e.tag === 'tr' && e.dataset.pid);
  const tagged = rows.filter((tr) => byCls(tr.children[nameCol], 'listed-tag').length).map((tr) => tr.dataset.pid);
  assert.deepEqual(tagged.sort(), [...me.listed].sort());
  const tag = byCls(rows.find((tr) => tr.dataset.pid === me.squad[2].id).children[nameCol], 'listed-tag')[0];
  assert.equal(tag.textContent, '💰 Til salg');
  assert.equal(tag.attrs.title, 'Sat til salg – andre klubber byder, når vinduet er åbent');
  assert.equal(rows.find((tr) => tr.dataset.pid === me.squad[3].id).children[nameCol].textContent, me.squad[3].shortName, 'ikke til salg: kun navnet');
  assert.equal(byCls(draw(bot, false), 'listed-tag').length, 0, 'et andet hold: intet mærke');
  me.listed = [];
  assert.equal(byCls(draw(me, true), 'listed-tag').length, 0);
});
