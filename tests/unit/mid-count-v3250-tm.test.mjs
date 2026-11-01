// v3.25.0 Test Manager (nr. 38): "N på midten · mere/mindre bold" ved formationsvælgeren (public/ui/tactics.js). Forfatterens test
// kaldte midCountOf for fem formationer (mod sig selv i samme import) – teksten, tærsklerne 5/3 og at den står i Taktik-fanen
// havde INGEN test. Her: ægte render med FakeEl for ALLE ti formationer, med bogstavelige tekster (4 = "normal", ikke "mere").
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; this.listeners = {}; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(k, fn) { this.listeners[k] = fn; }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };

const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { renderTactics, midCountOf } = await import('../../public/ui/tactics.js');
const { FORMATION_NAMES } = await import('../../public/engine/formations.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
function shown(formation, isOwn = true) {
  const team = createLeague(createRng(4)).teams[0];
  team.tactics.baseFormation = formation;
  const root = renderTactics({ team, isOwn, ui: { activePresetIndex: 0 }, on: new Proxy({}, { get: () => () => {} }) });
  const spans = all(root, (e) => e.attrs.id === 'mid-count');
  assert.equal(spans.length, 1, `${formation}: præcis ét #mid-count`);
  const sel = all(root, (e) => e.attrs.id === 'formation')[0];
  return { text: spans[0].textContent, tag: spans[0].tag, sameRow: all(root, (e) => e.className === 'row')[0].children.some((c) => c === spans[0]), sel };
}

// bogstaveligt: antal midtbanepladser efter ankrets dybde (3-5-2: LWB/RWB y 46 → 5; 5-3-2: LWB/RWB y 64 → 3)
const WANT = { '4-4-2': 4, '4-3-3': 3, '4-2-3-1': 5, '3-5-2': 5, '3-4-3': 4, '5-3-2': 3, '5-4-1': 4, '4-1-4-1': 5, '4-4-1-1': 4, '4-3-1-2': 4 };
const TXT = { 3: 'mindre bold', 4: 'normal boldbesiddelse', 5: 'mere bold' };

test('#mid-count for ALLE ti formationer: tal og tekst (5 → mere, 4 → normal, 3 → mindre – tærsklerne 5/3 binder begge sider)', () => {
  assert.deepEqual(Object.keys(WANT), FORMATION_NAMES, 'data: tabellen dækker alle formationer');
  for (const f of FORMATION_NAMES) {
    assert.equal(midCountOf(f), WANT[f], `midCountOf ${f}`);
    const r = shown(f);
    assert.equal(r.text, `${WANT[f]} på midten · ${TXT[WANT[f]]}`, f);
    assert.equal(r.tag, 'span'); assert.ok(r.sameRow, `${f}: står i formationsrækken`);
  }
  assert.equal(new Set(FORMATION_NAMES.map((f) => shown(f).text)).size, 3, 'data: alle tre tekster forekommer');
});

test('#mid-count vises også på modstanderens hold (skrivebeskyttet) og ukendt formation falder tilbage på 4-4-2 (4 på midten)', () => {
  assert.equal(shown('3-5-2', false).text, '5 på midten · mere bold');
  assert.equal(midCountOf('findes-ikke'), 4);
  assert.equal(midCountOf(undefined), 4);
});
