// v3.33.0-rettelserne efter QC, Spilfører UI og Spilfører motor (6/11): den EFFEKTIVE plads ("CM→DM") skal stå ens overalt – Match Centers
// minibane (QC 1 + UI 4), Trup-regnearket (QC 7) – og brikkens flag må ikke ligge oven i hinanden (UI 2). Teksterne er SKREVET her.
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; this.on = {}; this.classList = { add: (c) => { this.className += ' ' + c; }, toggle() {}, contains: (c) => this.className.split(' ').includes(c) }; }
  append(...c) { this.children.push(...c); }
  prepend(...c) { this.children.unshift(...c); }
  remove() { this.removed = true; }
  setAttribute(k, v) { this.attrs[k] = v; if (k === 'id') this.id = v; }
  addEventListener(k, f) { this.on[k] = f; }
  removeEventListener() {}
  setPointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t), createElementNS: (_, t) => new FakeEl(t) };

const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { simulateMatch } = await import('../../public/engine/match.js');
const { setFormation, moveSlot, swapPlayers } = await import('../../public/state/actions.js');
const { renderMatchCenter } = await import('../../public/ui/matchcenter.js');
const { renderMatrix, COLUMNS } = await import('../../public/ui/matrix.js');
const { renderPitch } = await import('../../public/ui/pitch.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const hasClass = (e, c) => e.className.split(/\s+/).includes(c);
const fresh = (seed = 4) => { const L = createLeague(createRng(seed)); return { L, me: L.teams.find((t) => !t.isBot) }; };

test('Match Centers minibane siger den effektive plads som listen: "CM→DM" i navn og title for en CM-plads trukket ned – "CM" for den utrukne', () => {
  const { L, me } = fresh(); const opp = L.teams.find((t) => t.isBot);
  setFormation(me, '4-3-3'); moveSlot(me, 6, { x: 32, y: 56 });
  const m = simulateMatch(me, opp, createRng(5));
  const e6 = m.ratings.home.find((x) => x.slot === 6 && x.minIn <= 1), e7 = m.ratings.home.find((x) => x.slot === 7 && x.minIn <= 1);
  assert.equal(e6.role, 'CDM', 'data: pladsen spilles som DM');
  const root = renderMatchCenter({ mc: { round: 1, matches: [m], gazette: null, viewIdx: 0, filter: 'all', shownCount: 0, playing: false, snap: null, pane: 'players' }, myTeamId: me.id, on: { snapshot() {}, view() {}, filter() {}, skip() {} } });
  const own = all(root, (e) => hasClass(e, 'mp-token') && e.dataset.slot != null).filter((e) => all(e, (c) => hasClass(c, 'mp-name'))[0]?.textContent.endsWith(e6.shortName) || all(e, (c) => hasClass(c, 'mp-name'))[0]?.textContent.endsWith(e7.shortName));
  const tok = (slot) => own.find((e) => e.dataset.slot === String(slot));
  assert.ok(tok(6) && tok(7), `data: begge brikker på minibanen (${own.length})`);
  const name = (t) => all(t, (c) => hasClass(c, 'mp-name'))[0].textContent;
  assert.equal(name(tok(6)), `CM→DM ${e6.shortName}`); assert.equal(tok(6).attrs.title, `CM→DM – #${e6.shirtNumber} ${e6.shortName}`);
  assert.equal(name(tok(7)), `CM ${e7.shortName}`); assert.equal(tok(7).attrs.title, `CM – #${e7.shirtNumber} ${e7.shortName}`);
});

test('Trup: Plads-kolonnen og navnecellens data-pos siger "CM→DM #n" for den trukne plads – som Plads-cellen på Taktik', () => {
  const { me } = fresh(); setFormation(me, '4-3-3'); moveSlot(me, 6, { x: 32, y: 56 });
  const id6 = me.tactics.lineupSlots[6], id7 = me.tactics.lineupSlots[7], p6 = me.squad.find((p) => p.id === id6), p7 = me.squad.find((p) => p.id === id7);
  const root = renderMatrix({ team: me, isOwn: true, ui: { sortCol: 'pos', sortDesc: false, filter: 'all' }, notes: {}, onSort() {}, onSelect() {}, onSwap: null, onFilter() {}, onBlocked() {} });
  const row = (pid) => all(root, (e) => e.tag === 'tr' && e.dataset.pid === pid)[0];
  const pos = COLUMNS.findIndex((c) => c.key === 'pos'), nm = COLUMNS.findIndex((c) => c.key === 'name');
  assert.equal(row(id6).children[pos].textContent, `CM→DM #${p6.shirtNumber}`); assert.equal(row(id6).children[nm].dataset.pos, 'CM→DM');
  assert.equal(row(id7).children[pos].textContent, `CM #${p7.shirtNumber}`); assert.equal(row(id7).children[nm].dataset.pos, 'CM');
});

test('brikkens flag: "✅ Custom pos" kun når der IKKE står et pladsflag; pladsflaget har den korte form "⚠ DM-plads −2,5 %" til mobilen', () => {
  const { me } = fresh(); setFormation(me, '4-3-3');
  const dm = me.squad.find((p) => p.position === 'DM' && !me.tactics.lineupSlots.includes(p.id));
  assert.equal(me.squad.find((p) => p.id === me.tactics.lineupSlots[6]).position, 'CM', 'data: en CM på plads 6');
  moveSlot(me, 6, { x: 32, y: 56 });
  const flags = () => { const t = all(renderPitch({ team: me, isOwn: true, ui: {}, onMove() {}, onSelect() {}, onTokenSwap() {} }), (e) => e.dataset.slot === '6' && e.className.startsWith('token'))[0];
    return all(t, (e) => hasClass(e, 'token-flag')).map((e) => ({ text: e.textContent, short: e.dataset.short ?? null })); };
  assert.deepEqual(flags(), [{ text: '⚠ Uden for position – DM-plads (−2,5 %)', short: '⚠ DM-plads\n−2,5 %' }], 'CM på DM-plads: kun pladsflaget');
  swapPlayers(me, me.tactics.lineupSlots[6], dm.id);
  assert.deepEqual(flags(), [{ text: '✅ Custom pos', short: null }], 'DM på DM-pladsen: intet pladsflag – så står Custom pos');
  // Uden pladstype (en CM-plads på ankret-dybden, en DM dér): den korte form uden plads
  moveSlot(me, 6, { x: 36, y: 44 });
  assert.deepEqual(flags(), [{ text: '⚠ Uden for position (−2,5 %)', short: '⚠ Uden for pos.\n−2,5 %' }]);
});
