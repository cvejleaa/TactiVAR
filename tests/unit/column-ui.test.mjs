// v3.14 Test Manager: klummens visning (matchcenter.js renderGazette/renderColumn) mod et minimalt DOM.
// e2e ser kun, at klummen findes (id'er og antal afsnit); her pinnes id'erne, linkene (hvilket indeks der åbnes), at
// modstanderens spiller kun vises med stjerner, og at gamle visninger uden klumme stadig får den gamle avis.
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; this.listeners = {}; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(t, fn) { (this.listeners[t] ||= []).push(fn); }
  click() { for (const fn of this.listeners.click ?? []) fn({}); }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };
const { renderGazette, renderMatchCenter } = await import('../../public/ui/matchcenter.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (el, id) => all(el, (e) => e.attrs.id === id)[0];
const txt = (el) => (el ? el.textContent : null);

const COL = {
  title: 'Hjem kørte over Ude',
  sections: [
    { id: 'col-mine', title: 'Din kamp', paras: ['Sejr til Hjem: 4-0 over Ude.', null, 'Løbene uden bold gav et mål.'] },
    { id: 'col-others', title: 'De øvrige kampe', others: [{ idx: 2, head: 'Alfa slår Beta 2-0', note: 'Alfa havde bolden det meste af tiden.' }, { idx: 3, head: 'Gamma og Delta skilles 1-1', note: '' }] },
    { id: 'col-stars', title: 'Rundens spiller og mål', player: { playerId: 'p1', teamId: 'a1', why: 'Begrundelse: 2 mål.' }, goal: true, defensive: null },
    { id: 'col-form', title: 'Formen', paras: ['Rundens overraskelse: nr. 7 U1 slog nr. 1 U2 2-1.', 'Dd har vundet 4 i træk.'] },
    { id: 'col-next', title: 'Næste runde', paras: ['Næste runde: Opp2 kommer på besøg.'] },
  ],
};
const G = (o = {}) => ({
  totalGoals: 7, totalVarChecks: 3, myResult: 'Resultat', headlines: ['Gammel overskrift'],
  playerOfTheRound: { playerId: 'p1', teamId: 'a1', shirtNumber: 9, shortName: 'Hansen', teamName: 'Ude', rating: 8.4, stars: 4 },
  goalOfTheRound: { kind: 'COUNTER', desc: 'Flot kontra', match: 'Hjem - Ude', matchIdx: 1 }, ...o,
});
const MATCHES = [{}, {}, {}, {}];

test('uden klumme får gamle visninger den gamle avis (ingen col-title), og uden avis (gazette) kommer intet', () => {
  const old = renderGazette(G(), 'h1', null, MATCHES);
  assert.equal(byId(old, 'col-title'), undefined);
  assert.ok(byId(old, 'headlines') && txt(byId(old, 'headlines')).includes('Gammel overskrift'));
  // v3.16.3: også den gamle avis viser modstanderens rundens spiller som "rundens bedste karakter" (ingen stjerner, intet tal)
  assert.equal(txt(byId(old, 'player-of-round')), '🏆 Rundens spiller: #9 Hansen (Ude) – rundens bedste karakter');
  assert.equal(txt(byId(renderGazette(G(), 'a1', null, MATCHES), 'player-of-round')), '🏆 Rundens spiller: #9 Hansen (Ude) – karakter 8,4');
  assert.equal(renderGazette(null, 'h1', null, MATCHES, COL), null, 'ingen gazette → intet, også selv om en klumme er givet');
  assert.equal(renderGazette(null, 'h1'), null);
});

test('klummen: overskrift, afsnit med id og titel i rækkefølge, tomme sætninger udelades, øvrige kampe med klik = referatets indeks', () => {
  const opened = [];
  const el = renderGazette(G(), 'h1', null, MATCHES, COL, (i) => opened.push(i));
  assert.equal(el.attrs.id, 'gazette');
  assert.match(el.className, /gazette/); assert.match(el.className, /column/);
  assert.equal(txt(byId(el, 'col-title')), 'Hjem kørte over Ude');
  assert.equal(byId(el, 'col-title').tag, 'h2');
  const secs = all(el, (e) => e.tag === 'section');
  assert.deepEqual(secs.map((s) => s.attrs.id), ['col-mine', 'col-others', 'col-stars', 'col-form', 'col-next']);
  assert.ok(secs.every((s) => s.className === 'col-sec'));
  assert.deepEqual(secs.map((s) => txt(all(s, (e) => e.tag === 'h4')[0])), ['Din kamp', 'De øvrige kampe', 'Rundens spiller og mål', 'Formen', 'Næste runde']);
  assert.deepEqual(all(secs[0], (e) => e.tag === 'p').map(txt), ['Sejr til Hjem: 4-0 over Ude.', 'Løbene uden bold gav et mål.'], 'tom sætning udelades');
  assert.deepEqual(all(secs[4], (e) => e.tag === 'p').map(txt), ['Næste runde: Opp2 kommer på besøg.']);
  assert.deepEqual(all(secs[3], (e) => e.tag === 'p').map(txt), ['Rundens overraskelse: nr. 7 U1 slog nr. 1 U2 2-1.', 'Dd har vundet 4 i træk.'], 'alle formens sætninger vises');
  // De øvrige kampe: #headlines med et punkt pr. kamp; overskriften er et link til DEN kamp
  const lis = all(byId(el, 'headlines'), (e) => e.tag === 'li');
  assert.deepEqual(lis.map(txt), ['Alfa slår Beta 2-0 – Alfa havde bolden det meste af tiden.', 'Gamma og Delta skilles 1-1'], 'sætningen efter tankestreg; ingen tankestreg uden sætning');
  const btns = lis.map((li) => all(li, (e) => e.tag === 'button' && e.className.includes('col-match'))[0]);
  assert.ok(btns.every(Boolean));
  assert.deepEqual(btns.map((b) => txt(b)), ['Alfa slår Beta 2-0', 'Gamma og Delta skilles 1-1']);
  btns[0].click(); btns[1].click();
  assert.deepEqual(opened, [2, 3], 'hver overskrift åbner sin egen kamp');
  // Uden åbn-funktion: ren tekst, ingen knapper
  const noLink = renderGazette(G(), 'h1', null, MATCHES, COL, null);
  assert.equal(all(byId(noLink, 'headlines'), (e) => e.tag === 'button').length, 0);
  assert.deepEqual(all(byId(noLink, 'headlines'), (e) => e.tag === 'strong').map(txt), ['Alfa slår Beta 2-0', 'Gamma og Delta skilles 1-1']);
  assert.match(txt(noLink), /Runden bød på 7 scoringer og 3 VAR-tjek på tværs af de 4 stadions\./);
  assert.match(txt(renderGazette(G(), 'h1', null, [{}, {}], COL)), /de 2 stadions/);
  assert.match(txt(renderGazette(G(), 'h1', null, null, COL)), /de 4 stadions/);
});

// v3.16.3 (Spilfører: "4 stjerner" til rundens bedste lød middelmådigt): modstanderens spiller får "rundens bedste karakter" i stedet for stjerner – stadig aldrig tallet
test('klummen, afsnit 3: modstanderens spiller med "rundens bedste karakter" (aldrig tallet, ingen stjerner), din egen med karakter; begrundelsen og målets link', () => {
  const opp = renderGazette(G(), 'h1', () => {}, MATCHES, COL);
  const p = byId(opp, 'player-of-round');
  assert.equal(txt(p), '🏆 Rundens spiller: #9 Hansen (Ude) – rundens bedste karakter • Begrundelse: 2 mål.');
  assert.doesNotMatch(txt(opp), /8\.4|karakter \d|★/, 'modstanderens karakter røbes ikke (og ingen stjerner)');
  const own = renderGazette(G(), 'a1', () => {}, MATCHES, COL);
  assert.equal(txt(byId(own, 'player-of-round')), '🏆 Rundens spiller: #9 Hansen (Ude) – karakter 8,4 • Begrundelse: 2 mål.');
  assert.equal(txt(byId(renderGazette(G(), 'h1', null, MATCHES, { ...COL, sections: [{ ...COL.sections[2], player: { playerId: 'p1', teamId: 'a1', why: '' } }] }), 'player-of-round')), '🏆 Rundens spiller: #9 Hansen (Ude) – rundens bedste karakter', 'uden begrundelse ingen •');
  // Rundens mål: type, beskrivelse og link til kampen (matchIdx), som åbner (indeks, mål)
  const opened = [];
  const g = G();
  const el = renderGazette(g, 'h1', (i, goal) => opened.push([i, goal]), MATCHES, COL);
  assert.equal(txt(byId(el, 'goal-of-round')), '🚀 Rundens mål (Kontra): Flot kontra 📺 Hjem – Ude');
  const link = byId(el, 'goal-of-round-match');
  assert.equal(link.tag, 'button');
  link.click();
  assert.equal(opened.length, 1); assert.equal(opened[0][0], 1, 'kampens indeks fra målet'); assert.equal(opened[0][1], g.goalOfTheRound, 'målet sendes med');
  // Uden åbn-funktion, eller når kampen ikke findes: ren tekst i parentes (ingen død knap)
  for (const e2 of [renderGazette(G(), 'h1', null, MATCHES, COL), renderGazette(G({ goalOfTheRound: { kind: 'COUNTER', desc: 'Flot kontra', match: 'Hjem - Ude' } }), 'h1', () => {}, [], COL)]) {
    assert.equal(byId(e2, 'goal-of-round-match'), undefined);
    assert.match(txt(byId(e2, 'goal-of-round')), /\(Hjem – Ude\)$/);
  }
  // Kampindeks 0 er et gyldigt link (ikke "falsk")
  const first = renderGazette(G({ goalOfTheRound: { kind: 'COUNTER', desc: 'x', match: 'Hjem - Ude', matchIdx: 0 } }), 'h1', () => {}, MATCHES, COL);
  assert.ok(byId(first, 'goal-of-round-match'));
  // Ukendt målkategori: ingen parentes
  assert.doesNotMatch(txt(byId(renderGazette(G({ goalOfTheRound: { kind: 'UKENDT', desc: 'x', match: 'a - b', matchIdx: 0 } }), 'h1', null, MATCHES, COL), 'goal-of-round')), /\(UKENDT\)|\(undefined\)/);
  // Uden rundens spiller: ingen linje
  assert.equal(byId(renderGazette(G({ playerOfTheRound: null }), 'h1', null, MATCHES, COL), 'player-of-round'), undefined);
});

test('klummen: defensiv aktion kun uden mål; overraskelsen er #upset (kun den sætning); sæsonslut og dit holds løber som bokse', () => {
  const noGoal = G({ goalOfTheRound: null, defensiveAction: { shirtNumber: 1, shortName: 'Mand', teamName: 'Ude' } });
  assert.match(txt(renderGazette(noGoal, 'h1', null, MATCHES, COL)), /🛡 Rundens defensive aktion: #1 Mand \(Ude\) holdt nullet\./);
  assert.doesNotMatch(txt(renderGazette(G({ defensiveAction: { shirtNumber: 1, shortName: 'Mand', teamName: 'Ude' } }), 'h1', null, MATCHES, COL)), /defensive aktion/, 'med et mål ingen defensiv aktion');
  const el = renderGazette(G(), 'h1', null, MATCHES, COL);
  assert.equal(all(el, (e) => e.attrs.id === 'upset').length, 1);
  assert.equal(txt(byId(el, 'upset')), 'Rundens overraskelse: nr. 7 U1 slog nr. 1 U2 2-1.');
  assert.equal(byId(renderGazette(G(), 'h1', null, MATCHES, { ...COL, sections: [{ id: 'col-form', title: 'Formen', paras: ['Dd har vundet 4 i træk.'] }] }), 'upset'), undefined);
  // Sæsonslut
  assert.equal(byId(el, 'season-end'), undefined);
  const se = { seasonNumber: 2, champion: { teamName: 'Mester', points: 33 }, myPos: 3, topScorer: { shirtNumber: 9, shortName: 'Skytte', teamName: 'Ude', goals: 17 } };
  const end = byId(renderGazette(G({ seasonEnd: se }), 'h1', null, MATCHES, COL), 'season-end');
  assert.equal(txt(end), '🏆 Sæson 2 er slut: Mester er mester med 33 point. Du sluttede nr. 3. Topscorer: #9 Skytte (Ude), 17 mål. En ny sæson starter med nulstillet tabel – se Tidligere sæsoner på Liga-fanen.');
  assert.equal(txt(byId(renderGazette(G({ seasonEnd: { seasonNumber: 1 } }), 'h1', null, MATCHES, COL), 'season-end')), '🏆 Sæson 1 er slut: En ny sæson starter med nulstillet tabel – se Tidligere sæsoner på Liga-fanen.');
  // Dit holds løber: kun for dit hold
  const run = { teamId: 'h1', shirtNumber: 8, shortName: 'Løber', distanceKm: 11.234, hiShare: 45.4, topSpeed: 31.56 };
  assert.equal(txt(byId(renderGazette(G({ myRunner: run }), 'h1', null, MATCHES, COL), 'my-runner')), '🏃 Dit holds løber: #8 Løber – 11,2 km, 45 % højintenst, topfart 31,6 km/t.');
  assert.equal(byId(renderGazette(G({ myRunner: run }), 'a1', null, MATCHES, COL), 'my-runner'), undefined, 'en anden seer ser ikke dit holds løber');
  assert.equal(txt(byId(renderGazette(G({ myRunner: { ...run, hiShare: null, topSpeed: 0 } }), 'h1', null, MATCHES, COL), 'my-runner')), '🏃 Dit holds løber: #8 Løber – 11,2 km.');
});

test('Match Center: klummen kommer med efter afspilningen (ikke under), og kampoverskrifterne åbner via on.view', () => {
  const st = { hPoss: 60, aPoss: 40, hTacticSuccess: 1, aTacticSuccess: 2, hShots: 11, aShots: 12, hOnTarget: 5, aOnTarget: 6, hXg: 1, aXg: 0.5, hAerialWon: 3, aAerialWon: 4, hVarChecks: 0, aVarChecks: 1, hFouls: 7, aFouls: 8, hInjuries: 1, aInjuries: 2 };
  const ev = { min: 90, hG: 1, aG: 0, text: 'Slut', category: 'PLAY', type: 'FULLTIME', label: 'Slut', plot: false, stats: st };
  const m = { homeId: 'h1', awayId: 'a1', homeName: 'Hjem', awayName: 'Ude', homeTacticStr: '', awayTacticStr: '', homeGoals: 1, awayGoals: 0, events: [ev], stats: st, ratings: { motm: null, home: [], away: [] } };
  const mc = (playing) => ({ round: 1, matches: [m, m, m, m], viewIdx: 0, filter: 'all', shownCount: 1, playing, gazette: G() });
  const viewed = [], goals = [];
  const on = { view: (i) => viewed.push(i), openGoal: (i, goal) => goals.push([i, goal]) };
  const done = renderMatchCenter({ mc: mc(false), myTeamId: 'h1', on, column: COL });
  assert.equal(txt(byId(done, 'col-title')), 'Hjem kørte over Ude');
  const btns = all(byId(done, 'headlines'), (e) => e.tag === 'button');
  btns[1].click(); assert.deepEqual(viewed, [3], 'on.view(indeks), ikke openGoal');
  byId(done, 'goal-of-round-match').click(); assert.deepEqual(goals.map((x) => x[0]), [1], 'målets link bruger on.openGoal');
  assert.equal(byId(renderMatchCenter({ mc: mc(true), myTeamId: 'h1', on, column: COL }), 'col-title'), undefined, 'under afspilningen ingen avis (ville afsløre runden)');
  const old = renderMatchCenter({ mc: mc(false), myTeamId: 'h1', on });
  assert.equal(byId(old, 'col-title'), undefined, 'uden klumme: den gamle avis');
  assert.ok(byId(old, 'gazette'));
});
