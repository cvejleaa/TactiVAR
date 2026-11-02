// v3.30.0: "+N" i Trup-regnearket (sidste rundes +1), gainsByPlayer/gainWords som én kilde, træningstabellens markerede række og
// linjen øverst på Træning – og spillerkortets træningsblok, der ikke længere sætter fokus (kun "ændr i Træning ›").
// Med en FakeEl-DOM (som ban-v3270-tm) og BESTEMTE tal: en dublet (to +1 i samme evne) skal give "+2", ikke "+1" eller to mærker.
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
const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { renderMatrix, COLUMNS } = await import('../../public/ui/matrix.js');
const { gainsByPlayer, gainWords, renderTrainingTable, trainingNext } = await import('../../public/ui/training.js');
const { renderCard } = await import('../../public/ui/card.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const byId = (root, id) => all(root, (e) => e.id === id)[0] ?? null;
const own = (L) => L.teams.find((t) => !t.isBot);
const hasClass = (e, c) => e.className.split(/\s+/).includes(c);
const rowOf = (root, pid) => all(root, (e) => e.tag === 'tr' && e.dataset.pid === pid)[0];
const col = (key) => COLUMNS.findIndex((c) => c.key === key);
const ui = (over = {}) => ({ sortCol: 'pos', sortDesc: false, filter: 'all', ...over });
const draw = (team, over) => renderMatrix({ team, isOwn: true, ui: ui(over), notes: {}, onSort() {}, onSelect() {}, onSwap: null, onFilter() {}, onBlocked() {} });

test('gainsByPlayer: tom Map uden rapport; dubletter (samme spiller og evne) bevares – det er et antal, ikke et ja/nej', () => {
  assert.equal(gainsByPlayer(null).size, 0);
  assert.equal(gainsByPlayer({ gains: [] }).size, 0);
  const m = gainsByPlayer({ gains: [{ id: 'a', skill: 'finishing' }, { id: 'b', skill: 'pace' }, { id: 'a', skill: 'finishing' }, { id: 'a', skill: 'pace' }] });
  assert.deepEqual([...m], [['a', ['finishing', 'finishing', 'pace']], ['b', ['pace']]]);
  assert.equal(gainWords(['finishing', 'finishing', 'pace']), '+2 Afslutning, +1 Fart');
  assert.equal(gainWords([]), '');
});

test('Trup-regnearket: "+N" præcis på de evner, der steg – antal og fuldt evnenavn i title, tallet i cellen uændret', () => {
  const L = createLeague(createRng(31)), me = own(L), [p0, p1, p2] = me.squad;
  const gains = gainsByPlayer({ gains: [{ id: p0.id, skill: 'finishing' }, { id: p0.id, skill: 'finishing' }, { id: p1.id, skill: 'pace' }] });
  const mx = draw(me, { gains, gainRound: 3 });
  const marked = all(mx, (e) => e.tag === 'td' && hasClass(e, 'gain'));
  assert.equal(marked.length, 2, 'to celler: p0 FIN (to +1 = ét mærke) og p1 PAC – ikke alle evne-celler');
  const fin0 = rowOf(mx, p0.id).children[col('finishing')], pac0 = rowOf(mx, p0.id).children[col('pace')], pac1 = rowOf(mx, p1.id).children[col('pace')];
  assert.ok(hasClass(fin0, 'gain') && fin0.dataset.gain === '2', fin0.className);
  assert.equal(fin0.attrs.title, '+2 Afslutning efter runde 3');
  assert.equal(fin0.textContent, String(p0.skills.finishing), 'mærket er CSS (::after) – cellens tekst er stadig tallet');
  assert.ok(!hasClass(pac0, 'gain') && pac0.dataset.gain === undefined && pac0.attrs.title === undefined, 'p0 steg ikke i PAC');
  assert.equal(pac1.attrs.title, '+1 Fart efter runde 3');
  // mobilen: summen efter navnet, med alle evnerne i title – p2 uden +1 har intet
  const name0 = rowOf(mx, p0.id).children[col('name')], name2 = rowOf(mx, p2.id).children[col('name')];
  assert.ok(hasClass(name0, 'player-gain') && name0.dataset.gain === '2' && name0.attrs.title === '+2 Afslutning efter runde 3', JSON.stringify(name0.attrs));
  assert.ok(!hasClass(name2, 'player-gain') && name2.dataset.gain === undefined && name2.textContent === p2.shortName);
  assert.ok(!hasClass(name0, 'gain'), 'navnecellen tæller ikke som en evne-celle');
  // Spring/Luft/Gns har også heat – de får aldrig et mærke, selv med en "evne" af samme navn i rapporten
  const odd = draw(me, { gains: new Map([[p0.id, ['jump', 'aerial', 'avg']]]), gainRound: 3 });
  assert.equal(all(odd, (e) => e.tag === 'td' && hasClass(e, 'gain')).length, 0);
  // uden gains: ingen mærker overhovedet
  const none = draw(me, {});
  assert.equal(all(none, (e) => e.tag === 'td' && (hasClass(e, 'gain') || hasClass(e, 'player-gain'))).length, 0);
});

test('Træning-tabellen: "Sidste runde" samlet ("+2 Afslutning"), den markerede række (fra kortets link) og linjen øverst', () => {
  const L = createLeague(createRng(32)), me = own(L), [p0, p1] = me.squad;
  const report = { round: 5, gains: [{ id: p0.id, skill: 'finishing' }, { id: p0.id, skill: 'finishing' }, { id: p0.id, skill: 'pace' }], injuries: [] };
  const t = renderTrainingTable({ team: me, report, roundLabel: 2, selectedId: p1.id, onLine() {}, onFocus() {}, onFocusMany() {} });
  const r0 = rowOf(t, p0.id), r1 = rowOf(t, p1.id);
  assert.equal(r0.children.at(-1).textContent, '+2 Afslutning, +1 Fart');
  assert.equal(r1.children.at(-1).textContent, '');
  assert.deepEqual(all(t, (e) => e.tag === 'tr' && hasClass(e, 'selected')).map((e) => e.dataset.pid), [p1.id], 'præcis den valgte række');
  assert.ok(!byId(t, 'training-next').textContent.includes('Ingen +1'), 'der VAR +1 i runden');
  // tom runde: "Ingen +1 efter runde R" – sæsonens runde (roundLabel), ikke ligaens
  const empty = renderTrainingTable({ team: me, report: { round: 5, gains: [{ id: 'solgt', skill: 'pace' }], injuries: [] }, roundLabel: 2, onLine() {}, onFocus() {}, onFocusMany() {} });
  assert.ok(byId(empty, 'training-next').textContent.startsWith('Ingen +1 efter runde 2 · nærmest et +1: #'), byId(empty, 'training-next').textContent);
  assert.equal(all(empty, (e) => e.tag === 'tr' && hasClass(e, 'selected')).length, 0);
});

test('trainingNext: nærmest = den med færrest runder til næste +1 (evnen ved navn), og hvor mange der træner Alsidig', () => {
  const L = createLeague(createRng(33)), me = own(L);
  for (const p of me.squad) { p.trainingFocus = 'REST'; p.dev = {}; }
  const [a, b] = me.squad.filter((p) => p.line !== 'GK');
  a.trainingFocus = 'FINISH'; a.dev = { finishing: 0.999 }; a.skills.finishing = 10;
  b.trainingFocus = 'GENERAL';
  const txt = trainingNext(me, null, 4);
  assert.ok(txt.startsWith(`Nærmest et +1: #${a.shirtNumber} ${a.shortName} Afslutning om ~`), txt);
  assert.ok(txt.endsWith(' · 1 træner stadig Alsidig'), txt);
  assert.ok(!txt.includes('Ingen +1'), 'uden rapport (ingen runde spillet) siges intet om en tom runde');
  // alle hviler: ingen "nærmest" og ingen Alsidig → ingen linje
  b.trainingFocus = 'REST'; a.trainingFocus = 'REST';
  assert.equal(trainingNext(me, null, 4), null);
  assert.equal(trainingNext(me, { gains: [] }, 4), 'Ingen +1 efter runde 4');
});

test('spillerkortet: træningsblokken sætter IKKE fokus – ingen select, "Træner: X" og linket "ændr i Træning ›"', () => {
  const L = createLeague(createRng(34)), me = own(L), p = me.squad.find((x) => x.line === 'ATT');
  p.trainingFocus = 'FINISH';
  let clicked = 0;
  const card = renderCard({ player: p, team: me, isOwn: true, scouting: [], note: '', onNote() {}, onTrainLink: () => { clicked++; } });
  assert.equal(all(card, (e) => e.tag === 'select').length, 0, 'ingen #focus-select (eller anden select) på kortet');
  const box = byId(card, 'card-training'), note = byId(card, 'card-train-note'), link = byId(card, 'card-train-link');
  assert.ok(box && note && link, 'træningsblokken, linjen og linket findes');
  assert.ok(note.textContent.startsWith('Træner: Afslutning – ændr i Træning ›'), note.textContent);
  assert.ok(box.textContent.includes('Afslutning ') && /\/1,0/.test(box.textContent), 'fremdriftslinjerne står stadig');
  link.on.click(); assert.equal(clicked, 1);
  // uden link (fx et kort, der ikke kan navigere): teksten uden knap
  const plain = renderCard({ player: p, team: me, isOwn: true, scouting: [], note: '', onNote() {} });
  assert.equal(byId(plain, 'card-train-link'), null);
  assert.ok(byId(plain, 'card-train-note').textContent.startsWith('Træner: Afslutning – ændr i Træning'));
});
