// v3.28.0 Test Manager (UI-ombygningen F1): ui/home.js havde NUL unit-tests – kun e2e, der ikke kan se, hvilke af de skjulte felter
// under afspilning der lækker ENKELTVIST, fortegnet på kasseændringen, ↑/↓, ental/flertal i træningslinjen, "Holdet er klar" vs.
// ungdomstilbud, ' ting'-pillens farve, minitabellens markering og linkenes handlere. Her tegnes renderHome med en FakeEl-DOM og
// ALLE tal er forskellige (så en byttet kilde ses). Afspilningsvagten testes felt for felt: INTET af det bogførte må stå i teksten.
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
const { kr } = await import('../../public/ui/labels.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (root, id) => all(root, (e) => e.id === id)[0] ?? null;
const text = (root, id) => byId(root, id)?.textContent ?? null;

const calls = [];
const on = { kamp: () => calls.push('kamp'), liga: () => calls.push('liga'), klub: () => calls.push('klub'), traening: () => calls.push('traening'), taktik: () => calls.push('taktik'), opp: () => calls.push('opp'), fix: (ids) => calls.push(['fix', ids]) };
const base = () => ({
  club: { name: 'Bibamus United', cash: 1234567, delta: 4321 },
  last: { idx: 0, round: 6, text: 'Bibamus United 3 – 1 Lyngby', result: 'won', scorers: ['Kjær', 'Holm (2)'], move: 2 },
  place: 4, ended: false, roundsPlayed: 6,
  next: { k: 7, of: 14, name: 'Esbjerg FC', home: false, place: 9, form: ['V', 'T', 'U'] },
  issues: [
    { kind: 'ban', ids: ['p9'], nrs: [9], pill: '⛔ #9', text: '#9 Larsen er udelukket – erstattes automatisk' },
    { kind: 'tired', ids: ['p2', 'p5'], nrs: [2, 5], pill: '⚠ 2', text: '2 startere under din grænse (70 %) – skiftes ud tidligt: #2 A er 61 % frisk, #5 B er 55 % frisk' }],
  youth: 0, training: { round: 6, gains: 5, injuries: 1, strong: 2 },
  table: [{ pos: 2, name: 'Odense', points: 21, mine: false }, { pos: 3, name: 'Vejle', points: 19, mine: false }, { pos: 4, name: 'Bibamus United', points: 18, mine: true },
    { pos: 5, name: 'Aalborg', points: 16, mine: false }, { pos: 6, name: 'Randers', points: 15, mine: false }],
  playing: false, on,
});
const render = (over = {}) => renderHome({ ...base(), ...over });
const HIDDEN = ['home-last', 'home-place', 'cash-delta', 'home-todo', 'home-table', 'home-opp-form', 'home-ready', 'youth-pending', 'home-training'];

test('Hjem, ikke under afspilning: alle felter står med de rigtige tal (hvert tal er forskelligt)', () => {
  const r = render();
  assert.equal(text(r, 'club-name'), 'Bibamus United');
  assert.equal(text(r, 'club-link'), `${kr(1234567)} 💼`);
  assert.equal(text(r, 'cash-delta'), `+${kr(4321)} siden sidste runde`);
  assert.equal(text(r, 'home-last').includes('Sidste runde · runde 6'), true);
  assert.ok(text(r, 'home-last').includes('Bibamus United 3 – 1 Lyngby') && text(r, 'home-last').includes('Sejr · Mål: Kjær, Holm (2)'), text(r, 'home-last'));
  assert.equal(text(r, 'home-place'), 'Nr. 4 ↑2');
  assert.ok(text(r, 'home-last').includes('i tabellen') && !text(r, 'home-last').includes('slutstilling'));
  assert.equal(text(r, 'home-next'), 'Næste kamp · runde 7 af 14Esbjerg FC · udeNr. 9 · seneste 3: V T U🔍 Se Esbjerg FC – kun offentlige data ›');
  assert.equal(text(r, 'home-opp-form'), 'Nr. 9 · seneste 3: V T U');
  assert.equal(text(r, 'home-table').includes('Tabellen'), true);
  const rows = all(byId(r, 'home-table'), (e) => e.tag === 'tr');
  assert.deepEqual(rows.map((x) => x.textContent), ['2Odense21', '3Vejle19', '4Bibamus United18', '5Aalborg16', '6Randers15']);
  assert.deepEqual(rows.map((x) => x.className), ['', '', 'mine', '', ''], 'kun dit hold er markeret');
  assert.ok(text(r, 'home-todo').startsWith('Før du spiller runde 7'), text(r, 'home-todo'));
});

test('Hjem, UNDER afspilning: hvert bogført felt er væk ENKELTVIST, og intet af tallene står noget sted i teksten', () => {
  const r = render({ playing: true });
  for (const id of HIDDEN) assert.equal(byId(r, id), null, `${id} må ikke stå under afspilning`);
  const t = r.textContent;
  for (const leak of ['Bibamus United 3', 'Sejr', 'Kjær', 'Nr. 4', '↑', '4.321', '+', 'siden sidste runde', 'Larsen', '⛔', 'Før du spiller', 'Odense', 'Vejle', '18', 'Nr. 9', 'seneste 3', 'V T U', 'fremskridt', 'Holdet er klar']) assert.ok(!t.includes(leak), `"${leak}" lækker under afspilning`);
  // det der SKAL stå: klubhoved med kassen, vagt-beskeden, næste kamp og linket til modstanderen
  assert.equal(text(r, 'club-link'), `${kr(1234567)} 💼`);
  assert.ok(text(r, 'home-playing').startsWith('📺 Runden spilles i Kamp-fanen'), text(r, 'home-playing'));
  assert.equal(text(r, 'home-next'), 'Næste kamp · runde 7 af 14Esbjerg FC · ude🔍 Se Esbjerg FC – kun offentlige data ›');
  assert.equal(byId(r, 'home-playing').tag, 'div');
  const link = all(byId(r, 'home-playing'), (e) => e.tag === 'button')[0];
  calls.length = 0; link.on.click(); assert.deepEqual(calls, ['kamp'], '"Se kampen ›" under afspilning går til Kamp');
});

test('Hjem: kasseændringens fortegn (+ / − / ±) og at den kun står, når der er et regnskab', () => {
  assert.equal(text(render({ club: { ...base().club, delta: 4321 } }), 'cash-delta'), `+${kr(4321)} siden sidste runde`);
  assert.equal(text(render({ club: { ...base().club, delta: -4321 } }), 'cash-delta'), `−${kr(4321)} siden sidste runde`, 'minus-tegnet U+2212 og beløbet uden fortegn');
  assert.equal(text(render({ club: { ...base().club, delta: 0 } }), 'cash-delta'), `±${kr(0)} siden sidste runde`);
  assert.equal(byId(render({ club: { ...base().club, delta: null } }), 'cash-delta'), null);
});

test('Hjem: ↑/↓ regnes med fortegn og står kun ved en ændring', () => {
  const mv = (move) => render({ last: { ...base().last, move } });
  assert.equal(text(mv(3), 'home-place'), 'Nr. 4 ↑3'); assert.equal(byId(mv(3), 'home-move').className, 'up');
  assert.equal(text(mv(-2), 'home-place'), 'Nr. 4 ↓2'); assert.equal(byId(mv(-2), 'home-move').className, 'down');
  assert.equal(text(mv(0), 'home-place'), 'Nr. 4'); assert.equal(byId(mv(0), 'home-move'), null);
  assert.equal(text(mv(null), 'home-place'), 'Nr. 4'); assert.equal(byId(mv(null), 'home-move'), null);
});

test('Hjem: resultatordet (Sejr/Uafgjort/Nederlag) og målscorerne – eller "ingen af dine mål"', () => {
  const l = (result, scorers) => text(render({ last: { ...base().last, result, scorers } }), 'home-last');
  assert.ok(l('won', ['A']).includes('Sejr · Mål: A'));
  assert.ok(l('drawn', ['A', 'B (2)']).includes('Uafgjort · Mål: A, B (2)'));
  assert.ok(l('lost', []).includes('Nederlag · ingen af dine mål'));
  assert.ok(!l('lost', []).includes('Mål:'));
});

test('Hjem: slutstillingen efter sæsonslut hedder det, ikke "Tabellen"/"i tabellen"', () => {
  const r = render({ ended: true });
  assert.ok(text(r, 'home-last').includes('slutstilling') && !text(r, 'home-last').includes('i tabellen'), text(r, 'home-last'));
  assert.ok(text(r, 'home-table').startsWith('Slutstillingen'), text(r, 'home-table'));
  assert.ok(text(render(), 'home-table').startsWith('Tabellen'));
});

test('Hjem: uden sidste runde – før sæsonen og midt i den (ingen "Sidste runde"-kort)', () => {
  const none = (roundsPlayed) => render({ last: null, roundsPlayed, place: 5 });
  assert.equal(byId(none(0), 'home-last'), null);
  assert.ok(text(none(0), 'home-first').includes('Sæsonen er ikke begyndt') && text(none(0), 'home-first').includes('▶ Spil runde'), text(none(0), 'home-first'));
  assert.ok(text(none(1), 'home-first').includes('Nr. 5 i tabellen.') && !text(none(1), 'home-first').includes('ikke begyndt'), 'efter ÉN spillet runde er sæsonen i gang: ' + text(none(1), 'home-first'));
  assert.ok(text(none(3), 'home-first').includes('Nr. 5 i tabellen.') && !text(none(3), 'home-first').includes('ikke begyndt'), text(none(3), 'home-first'));
});

test('Hjem "Før du spiller": rækker pr. advarsel (slags + #numre + tekst), antal-pillen, og "Holdet er klar" kun uden advarsler og ungdomstilbud', () => {
  const r = render();
  const rows = all(byId(r, 'home-todo'), (e) => e.className === 'todo-row');
  assert.deepEqual(rows.map((x) => [x.dataset.kind, x.dataset.nrs]).slice(0, 2), [['ban', '9'], ['tired', '2,5']]);
  assert.ok(rows[0].textContent.includes('#9 Larsen er udelukket – erstattes automatisk') && rows[0].textContent.includes('⛔ #9') && rows[0].textContent.endsWith('Taktik ›'), rows[0].textContent);
  assert.ok(rows[1].textContent.startsWith('⚠ 2'), rows[1].textContent);
  const count = all(byId(r, 'home-todo'), (e) => e.className.startsWith('pill pill-ban'));
  assert.ok(count.some((e) => e.textContent === '2 ting'), 'antal-pillen siger 2 ting og er farvet efter det værste (første)');
  assert.equal(byId(r, 'home-ready'), null, 'ikke "klar" med advarsler');
  // klikket på en række giver spillernes id'er til fixIssue
  calls.length = 0; all(rows[1], (e) => e.tag === 'button')[0].on.click(); assert.deepEqual(calls, [['fix', ['p2', 'p5']]]);
  // uden advarsler: kun "klar"
  const clear = render({ issues: [] });
  assert.equal(text(clear, 'home-ready'), '✔Holdet er klar');
  assert.ok(!text(clear, 'home-todo').includes('ting'), 'ingen antal-pille uden advarsler');
  // ungdomstilbud alene: ikke "klar" (der er noget at gøre), og linket går til Liga
  const youth = render({ issues: [], youth: 2 });
  assert.equal(byId(youth, 'home-ready'), null);
  assert.equal(text(youth, 'youth-pending'), '🧒2 ungdomstilbud venter i sæsonrapportenLiga ›');
  calls.length = 0; all(byId(youth, 'youth-pending'), (e) => e.tag === 'button')[0].on.click(); assert.deepEqual(calls, ['liga']);
  // advarsler OG ungdomstilbud: begge, "klar" ikke
  const both = render({ youth: 1 });
  assert.ok(text(both, 'youth-pending').includes('1 ungdomstilbud') && byId(both, 'home-ready') === null);
});

test('Hjem: træningsudfaldet i én linje – ental/flertal, kun det der er, og linket til Træning (kun stærke par: Taktik)', () => {
  const tr = (training) => render({ training });
  assert.equal(text(tr({ round: 6, gains: 5, injuries: 1, strong: 2 }), 'home-training'), '🏋️Efter runde 6: 5 fremskridt · 1 skadet i træningen · 2 nye stærke parTræning ›');
  assert.ok(text(tr({ round: 3, gains: 0, injuries: 0, strong: 1 }), 'home-training').includes('Efter runde 3: 1 nyt stærkt par') && !text(tr({ round: 3, gains: 0, injuries: 0, strong: 1 }), 'home-training').includes('fremskridt'));
  assert.ok(text(tr({ round: 3, gains: 2, injuries: 0, strong: 0 }), 'home-training').includes('Efter runde 3: 2 fremskridt') && !text(tr({ round: 3, gains: 2, injuries: 0, strong: 0 }), 'home-training').includes('skadet'));
  assert.ok(text(tr({ round: 3, gains: 0, injuries: 4, strong: 0 }), 'home-training').includes('Efter runde 3: 4 skadet i træningen'));
  assert.equal(byId(tr(null), 'home-training'), null);
  calls.length = 0; all(byId(tr({ round: 1, gains: 1, injuries: 0, strong: 0 }), 'home-training'), (e) => e.tag === 'button')[0].on.click(); assert.deepEqual(calls, ['traening']);
  // v3.30.0 (Spilfører UI): kun skader → stadig Træning; KUN nye stærke par → "Taktik ›" (stregerne står dér), ikke Træning
  calls.length = 0; all(byId(tr({ round: 1, gains: 0, injuries: 2, strong: 0 }), 'home-training'), (e) => e.tag === 'button')[0].on.click(); assert.deepEqual(calls, ['traening']);
  const onlyStrong = byId(tr({ round: 1, gains: 0, injuries: 0, strong: 1 }), 'home-training');
  assert.ok(onlyStrong.textContent.endsWith('1 nyt stærkt parTaktik ›'), onlyStrong.textContent);
  calls.length = 0; all(onlyStrong, (e) => e.tag === 'button')[0].on.click(); assert.deepEqual(calls, ['taktik']);
});

test('Hjem: næste kamp – hjemme/ude, modstanderens form (eller "ingen kampe i sæsonen endnu") og 🔍-linket', () => {
  const n = (over) => render({ next: { ...base().next, ...over } });
  assert.ok(text(n({ home: true }), 'home-next').includes('Esbjerg FC · hjemme') && !text(n({ home: true }), 'home-next').includes('· ude'));
  assert.ok(text(n({ home: false }), 'home-next').includes('Esbjerg FC · ude'));
  assert.equal(text(n({ form: [], place: 3 }), 'home-opp-form'), 'Nr. 3 · seneste 3: ingen kampe i sæsonen endnu');
  assert.equal(text(n({ form: ['T'] }), 'home-opp-form'), 'Nr. 9 · seneste 3: T');
  // QC/Spilfører UI: modstanderens placering først fra sæsonens 2. runde og ikke efter sæsonslut (dér var den sidste sæsons)
  assert.equal(text(render({ roundsPlayed: 0, next: { ...base().next, form: [] } }), 'home-opp-form'), 'seneste 3: ingen kampe i sæsonen endnu');
  assert.equal(text(render({ ended: true, next: { ...base().next, form: [] } }), 'home-opp-form'), 'seneste 3: ingen kampe i sæsonen endnu');
  calls.length = 0; byId(render(), 'home-opp-link').on.click(); assert.deepEqual(calls, ['opp']);
});

test('Hjem: rækkefølgen – klubben øverst, så sidste runde og "Før du spiller" | næste kamp og tabellen', () => {
  const r = render(), ids = (el) => el.children.map((c) => c.id);
  assert.deepEqual(ids(r), ['home-club', undefined, undefined]);
  assert.deepEqual(ids(r.children[1]), ['home-last', 'home-todo']);
  assert.deepEqual(ids(r.children[2]), ['home-next', 'home-table']);
});

test('Hjem: linkene kalder de rigtige handlere (kasse → klub, kamp, hele tabellen → liga)', () => {
  const r = render();
  calls.length = 0;
  byId(r, 'club-link').on.click(); byId(r, 'home-kamp').on.click(); byId(r, 'home-table-link').on.click();
  assert.deepEqual(calls, ['klub', 'kamp', 'liga']);
});

// v3.30.0 (QC): din kamps tilskuertal står på Hjem ved "Sidste runde" – og intet felt, når kampen ikke har et tal (ældre gem)
test('Hjem: "👥 7.840 tilskuere" ved sidste runde, når kampen har tallet – ellers intet felt', () => {
  const med = render({ last: { ...base().last, att: '👥 7.840' } });
  assert.equal(text(med, 'home-att'), '👥 7.840 tilskuere');
  const uden = render({ last: { ...base().last, att: null } });
  assert.equal(byId(uden, 'home-att'), null);
  assert.ok(!/👥|undefined|null/.test(text(uden, 'home-last')), text(uden, 'home-last'));
});
