// Taktik-fanens v3.13-dele (public/ui/tactics.js) mod et minimalt DOM: udskiftningsgrænsen, Hvis-Så-udskiftningens
// vælgere og advarsler. e2e rører kun "vælg begge spillere" og 70/80/0 – resten (kanterne, mål-vælgeren, advarsler om
// en opstilling der er ændret, hvem der kan vælges) er bundet her (Test Manager v3.13).
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
const { renderTactics } = await import('../../public/ui/tactics.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const cls = (el, c) => all(el, (e) => e.className.split(' ').includes(c));
const opts = (sel) => all(sel, (e) => e.tag === 'option');
const val = (o) => o.value ?? o.attrs.value;
const selectedOf = (sel) => opts(sel).filter((o) => o.attrs.selected === '').map(val);

function setup({ isOwn = true, limit = 70, rules } = {}) {
  const L = createLeague(createRng(4));
  const team = L.teams[0];
  team.subsLimit = limit;
  if (rules) team.tactics.conditionalRules = rules;
  const calls = [];
  const on = new Proxy({}, { get: (_, k) => (...a) => calls.push([k, ...a]) });
  const root = renderTactics({ team, isOwn, ui: { activePresetIndex: 0 }, on });
  return { L, team, root, calls };
}
const rule = (team, o) => ({ ruleId: 1, minuteTrigger: 60, condition: 'ANY', margin: 1, newFormation: '5-4-1', newPlan: null, slotRemapping: [...Array(11).keys()], action: 'SUB', subOut: null, subIn: null, ...o });

test('udskiftningsgrænsen: Fra + 50…85 i skridt på 5, valgt = holdets grænse (0 = Fra), og et valg sendes som TAL', () => {
  for (const [limit, want] of [[80, '80'], [0, '0'], [50, '50'], [85, '85']]) {
    const { root } = setup({ limit });
    const sel = all(root, (e) => e.attrs.id === 'subs-limit')[0];
    assert.deepEqual(opts(sel).map(val), ['0', '50', '55', '60', '65', '70', '75', '80', '85']);
    assert.equal(opts(sel)[0].textContent, 'Fra – kun skadesskift');
    assert.equal(opts(sel)[5].textContent, '70 %');
    assert.deepEqual(selectedOf(sel), [want]);
  }
  const { root, calls } = setup({ limit: 70 });
  const sel = all(root, (e) => e.attrs.id === 'subs-limit')[0];
  sel.listeners.change({ target: { value: '65' } });
  assert.deepEqual(calls.at(-1), ['subs', 65]);
  assert.equal(typeof calls.at(-1)[1], 'number');
});
test('udskiftningsgrænsen er skjult for modstanderens hold, og forklaringen nævner 5 skift i 3 pauser', () => {
  const opp = setup({ isOwn: false });
  assert.equal(all(opp.root, (e) => e.attrs.id === 'subs' || e.attrs.id === 'subs-limit').length, 0);
  assert.ok(opp.root.textContent.includes('Hvis-Så-regler og udskiftningsgrænse er skjulte'));
  const mine = setup();
  assert.ok(all(mine.root, (e) => e.attrs.id === 'subs-help')[0].textContent.includes('højst 5 udskiftninger i højst 3 pauser'));
  assert.ok(all(mine.root, (e) => e.attrs.id === 'subs-help')[0].textContent.includes('Målmanden skiftes kun ved skade'));
});
test('Hvis-Så: "Udskiftning" står først i mål-vælgeren og er valgt for en SUB-regel; planskift/formation sender action SHIFT', () => {
  const { team } = setup({});
  const m = setup({ rules: [rule(team, {})] });
  const target = cls(m.root, 'rule-target')[0];
  assert.equal(val(opts(target)[0]), 'sub:');
  assert.equal(opts(target)[0].textContent, '🔄 Udskiftning');
  assert.deepEqual(selectedOf(target), ['sub:']);
  target.listeners.change({ target: { value: 'plan:1' } });
  target.listeners.change({ target: { value: 'form:3-5-2' } });
  target.listeners.change({ target: { value: 'sub:' } });
  assert.deepEqual(m.calls, [['rule', 0, { action: 'SHIFT', newPlan: 1 }], ['rule', 0, { action: 'SHIFT', newPlan: null, newFormation: '3-5-2' }], ['rule', 0, { action: 'SUB', newPlan: null }]]);
  const shift = setup({ rules: [rule(team, { action: 'SHIFT', newFormation: '3-5-2' })] });
  assert.deepEqual(selectedOf(cls(shift.root, 'rule-target')[0]), ['form:3-5-2']);
  assert.equal(cls(shift.root, 'rule-sub').length, 0, 'ingen spillervælgere ved et planskift');
});
test('Hvis-Så: antal mål vises ved bagud/foran, men ikke ved uafgjort og "uanset stilling"', () => {
  const t = setup().team;
  const margins = (cond) => cls(setup({ rules: [rule(t, { condition: cond })] }).root, 'rule-margin').length;
  assert.deepEqual(['TRAILING', 'LEADING', 'DRAW', 'ANY'].map(margins), [1, 1, 0, 0]);
  const conds = cls(setup({ rules: [rule(t, {})] }).root, 'rule-cond')[0];
  assert.deepEqual(opts(conds).map(val), ['TRAILING', 'LEADING', 'DRAW', 'ANY']);
  assert.equal(opts(conds)[3].textContent, 'Uanset stilling');
});
test('udskiftnings-vælgerne: ud = startere undtagen målmanden, ind = hele bænken (ikke startere); valg gemmes som id, tomt → null', () => {
  const { team } = setup();
  const ids = team.tactics.lineupSlots, benchIds = team.squad.filter((p) => !ids.includes(p.id)).map((p) => p.id);
  const m = setup({ rules: [rule(team, { subOut: ids[3], subIn: benchIds[1] })] });
  const out = cls(m.root, 'rule-sub-out')[0], inn = cls(m.root, 'rule-sub-in')[0];
  assert.deepEqual(opts(out).map(val), ['', ...ids.slice(1)]);
  assert.deepEqual(opts(inn).map(val), ['', ...benchIds]);
  assert.deepEqual(selectedOf(out), [ids[3]]); assert.deepEqual(selectedOf(inn), [benchIds[1]]);
  assert.equal(cls(m.root, 'rule-warn').length, 0, 'gyldig regel: ingen advarsel');
  out.listeners.change({ target: { value: ids[5] } }); out.listeners.change({ target: { value: '' } });
  inn.listeners.change({ target: { value: benchIds[2] } }); inn.listeners.change({ target: { value: '' } });
  assert.deepEqual(m.calls, [['rule', 0, { subOut: ids[5] }], ['rule', 0, { subOut: null }], ['rule', 0, { subIn: benchIds[2] }], ['rule', 0, { subIn: null }]]);
  assert.equal(opts(out)[1].textContent, `ud: #${team.squad.find((p) => p.id === ids[1]).shirtNumber} ${team.squad.find((p) => p.id === ids[1]).shortName}`);
});
test('advarsler: mangler en spiller, eller opstillingen er ændret siden reglen blev lavet – hver med sin egen tekst', () => {
  const { team } = setup();
  const ids = team.tactics.lineupSlots, benchIds = team.squad.filter((p) => !ids.includes(p.id)).map((p) => p.id);
  const nm = (id) => { const p = team.squad.find((x) => x.id === id); return `#${p.shirtNumber} ${p.shortName}`; };
  const warn = (o) => cls(setup({ rules: [rule(team, o)] }).root, 'rule-warn').map((e) => e.textContent);
  assert.deepEqual(warn({}), [' ⚠ vælg begge spillere']);
  assert.deepEqual(warn({ subOut: ids[2] }), [' ⚠ vælg begge spillere'], 'kun én valgt');
  assert.deepEqual(warn({ subIn: benchIds[0] }), [' ⚠ vælg begge spillere'], 'kun én valgt');
  assert.deepEqual(warn({ subOut: benchIds[0], subIn: benchIds[1] }), [` ⚠ ${nm(benchIds[0])} står ikke i startopstillingen`], 'ud-spilleren er på bænken nu');
  assert.deepEqual(warn({ subOut: ids[2], subIn: ids[4] }), [` ⚠ ${nm(ids[4])} står ikke på bænken`], 'ind-spilleren er startet nu');
  assert.deepEqual(warn({ subOut: benchIds[0], subIn: ids[4] }), [` ⚠ ${nm(benchIds[0])} står ikke i startopstillingen; ${nm(ids[4])} står ikke på bænken`]);
  assert.deepEqual(warn({ subOut: 'findes_ikke', subIn: benchIds[0] }), [' ⚠ #? spilleren står ikke i startopstillingen']);
});
