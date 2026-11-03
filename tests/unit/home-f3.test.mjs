// v3.31.0 (UI-ombygningen F3): Hjem får kampens spiller 👑, 📰-kortet med rundens overskrift og modstanderens form som piller.
// renderHome tegnes med en FakeEl-DOM (som home-f1-tm.test.mjs). Hver test assertér på INDHOLDET og på det, der IKKE må stå:
// modstanderens karakter, "undefined", et tomt kort – og under afspilning: at overskriften slet ikke er hentet (klummen bygges ikke).
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; this.on = {}; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; if (k === 'id') this.id = v; }
  addEventListener(t, f) { this.on[t] = f; }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };
const { renderHome } = await import('../../public/ui/home.js');
const { viewRatingEntry } = await import('../../public/engine/visibility.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (root, id) => all(root, (e) => e.id === id)[0] ?? null;
const text = (root, id) => byId(root, id)?.textContent ?? null;

const calls = [];
const on = { kamp: () => calls.push('kamp'), liga: () => calls.push('liga'), klub: () => {}, traening: () => {}, taktik: () => {}, opp: () => {}, fix: () => {}, paper: () => calls.push('paper') };
// Rating-poster som motoren laver dem (ratings.js): karakter, stjerner og private felter – kun ejeren ser rating
const ENTRY = (o) => ({ playerId: 'p9', shirtNumber: 9, shortName: 'G. Kristensen', teamId: 'mine', teamName: 'Bibamus United', rating: 8.1, stars: 4, distanceKm: 11.2, isMotM: true, ...o });
const OPP = ENTRY({ playerId: 'q4', shirtNumber: 4, shortName: 'Holm', teamId: 'opp', teamName: 'Lyngby', rating: 7.6, stars: 3 });
const base = () => ({
  club: { name: 'Bibamus United', cash: 1234567, delta: 4321 },
  last: { idx: 0, round: 6, text: 'Bibamus United 3 – 1 Lyngby', result: 'won', scorers: ['Kjær'], move: 2, att: null, motm: viewRatingEntry(ENTRY(), true) },
  place: 4, ended: false, roundsPlayed: 6,
  next: { k: 7, of: 14, name: 'Esbjerg FC', home: false, place: 9, form: ['V', 'T', 'U'] },
  issues: [], youth: 0, training: null,
  table: [{ pos: 4, name: 'Bibamus United', points: 18, mine: true }],
  playing: false, paper: () => 'Kristensen sender Bibamus til tops', on,
});
const render = (over = {}) => renderHome({ ...base(), ...over });

test('👑 dit hold: "#9 G. Kristensen · karakter 8,1" – med tal, uden holdnavn', () => {
  const r = render();
  assert.equal(text(r, 'home-motm'), '👑 Kampens spiller: #9 G. Kristensen · karakter 8,1');
  assert.ok(!text(r, 'home-motm').includes('Bibamus United'), 'dit eget holdnavn står ikke ved ham');
  // står i Sidste runde-kortet, efter resultatlinjen
  assert.ok(byId(byId(r, 'home-last'), 'home-motm'));
});

test('👑 modstanderen (gennem viewRatingEntry): "#4 Holm (Lyngby)" – UDEN karakter, stjerner eller andre private tal', () => {
  const r = render({ last: { ...base().last, motm: viewRatingEntry(OPP, false) } });
  const t = text(r, 'home-motm');
  assert.equal(t, '👑 Kampens spiller: #4 Holm (Lyngby)');
  for (const leak of ['karakter', '7,6', '7.6', '11,2', 'undefined', '★']) assert.ok(!t.includes(leak), `"${leak}" må ikke stå ved modstanderens kampens spiller`);
  // modbevis: samme post vist SOM EJER giver tallet – det er visibility.js, der fjerner det, ikke home.js der glemmer det
  assert.equal(text(render({ last: { ...base().last, motm: viewRatingEntry(OPP, true) } }), 'home-motm'), '👑 Kampens spiller: #4 Holm · karakter 7,6');
});

test('👑 uden kampens spiller (fx alle udvist i et gammelt gem): intet felt, intet 👑 og ingen "undefined"', () => {
  const r = render({ last: { ...base().last, motm: null } });
  assert.equal(byId(r, 'home-motm'), null);
  assert.ok(!/👑|undefined|null/.test(text(r, 'home-last')), text(r, 'home-last'));
});

test('📰-kortet: netop overskriften fra paper() og "Læs hele avisen ›", der kalder on.paper – i venstre kolonne efter "Før du spiller"', () => {
  const r = render();
  assert.equal(text(r, 'home-paper'), '📰 AvisenKristensen sender Bibamus til topsLæs hele avisen ›');
  assert.equal(text(r, 'home-paper-title'), 'Kristensen sender Bibamus til tops');
  calls.length = 0; byId(r, 'home-paper-link').on.click(); assert.deepEqual(calls, ['paper'], 'linket går til avisen (Liga), ikke "Hele tabellen"');
  assert.deepEqual(r.children[1].children.map((c) => c.id), ['home-last', 'home-todo', 'home-paper']);
  assert.ok(!r.children[2].children.some((c) => c.id === 'home-paper'), 'ikke i højre kolonne');
});

test('📰-kortet findes ikke uden en runde (paper() giver null) eller uden paper – og efterlader intet tomt kort', () => {
  for (const paper of [() => null, null, undefined]) {
    const r = render({ paper, last: null, roundsPlayed: 0 });
    assert.equal(byId(r, 'home-paper'), null);
    assert.ok(!r.textContent.includes('📰') && !r.textContent.includes('Læs hele avisen'), r.textContent.slice(0, 200));
    assert.deepEqual(r.children[1].children.map((c) => c.id), ['home-first', 'home-todo']);
  }
});

test('UNDER afspilning: paper() kaldes ALDRIG (klummen er for den runde, der spilles) – intet 📰, ingen overskrift, intet 👑', () => {
  let n = 0;
  const r = render({ playing: true, paper: () => { n++; return 'Kristensen sender Bibamus til tops'; } });
  assert.equal(n, 0, 'overskriften må ikke hentes under afspilning');
  for (const id of ['home-paper', 'home-motm', 'home-paper-link']) assert.equal(byId(r, id), null, id);
  for (const leak of ['📰', 'Kristensen', 'Læs hele avisen', '👑', 'Kampens spiller']) assert.ok(!r.textContent.includes(leak), `"${leak}" lækker under afspilning`);
  // positivt modstykke: samme data uden afspilning henter overskriften præcis én gang
  n = 0; render({ paper: () => { n++; return 'x'; } }); assert.equal(n, 1);
});

test('Formpillerne: én pr. kamp i rækkefølgen (ældste → nyeste), klasse efter resultat og title set fra modstanderen', () => {
  const pills = all(byId(render({ next: { ...base().next, form: ['V', 'T', 'U'] } }), 'home-opp-form'), (e) => e.className.startsWith('form-pill'));
  assert.deepEqual(pills.map((p) => p.textContent), ['V', 'T', 'U']);
  assert.deepEqual(pills.map((p) => p.className), ['form-pill form-V', 'form-pill form-T', 'form-pill form-U']);
  assert.deepEqual(pills.map((p) => p.attrs.title), ['Esbjerg FC: Vundet', 'Esbjerg FC: Tabt', 'Esbjerg FC: Uafgjort']);
  const two = all(byId(render({ next: { ...base().next, form: ['T', 'T'] } }), 'home-opp-form'), (e) => e.className.startsWith('form-pill'));
  assert.deepEqual(two.map((p) => p.className), ['form-pill form-T', 'form-pill form-T']);
  // ingen kampe: ingen piller og ingen "(ældste → nyeste)" uden noget at læse
  const none = byId(render({ next: { ...base().next, form: [] } }), 'home-opp-form');
  assert.equal(all(none, (e) => e.className.startsWith('form-pill')).length, 0);
  assert.equal(none.textContent, 'Nr. 9 · seneste 3: ingen kampe i sæsonen endnu');
});

test('"N ting" tæller GRUPPER (én række = ét link), ikke spillere: 2 grupper med 3 spillere → "2 ting" og 2 rækker', () => {
  const issues = [
    { kind: 'ban', ids: ['p9'], nrs: [9], pill: '⛔ #9', text: '#9 er udelukket' },
    { kind: 'tired', ids: ['p2', 'p5'], nrs: [2, 5], pill: '⚠ 2', text: '2 startere under din grænse' }];
  const r = render({ issues });
  const rows = all(byId(r, 'home-todo'), (e) => e.className === 'todo-row' && e.dataset.kind);
  const count = all(byId(r, 'home-todo'), (e) => / ting$/.test(e.textContent) && e.className.startsWith('pill'));
  assert.equal(rows.length, 2);
  assert.deepEqual(count.map((e) => e.textContent), ['2 ting']);
  assert.ok(!text(r, 'home-todo').includes('3 ting'), 'spillerne (3) tælles ikke');
});
