// v3.33.0, Test Manager: det byggerens tests lod overleve ved mutation af committet kode.
//  1) bevægelsen i DYBDEN (applyDepth/driftOf) følger den tegnede plads – byggeren testede kun bredden (x). Mutant: applyDepth med
//     ankrets rolle (CAM i stedet for CM) forblev grøn i HELE suiten.
//  2) live-etiketten under træk på KANT-pladser ("→ back-plads") og at den IKKE kommer på pladser uden pladstype (ST, CB). Mutant:
//     etiketten kun for centrale roller forblev grøn.
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; this.listeners = {}; this.classList = { add: (c) => { this.className += ' ' + c; }, remove: (c) => { this.className = this.className.split(' ').filter((x) => x !== c).join(' '); }, toggle() {} }; }
  append(...c) { this.children.push(...c); }
  remove() { this.removed = true; }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(k, f) { this.listeners[k] = f; }
  removeEventListener() {}
  setPointerCapture() {}
  getBoundingClientRect() { return { left: 0, top: 0, width: 100, height: 100 }; }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };

const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { coupledPositions, driftAt } = await import('../../public/engine/positions.js');
const { setFormation, moveSlot } = await import('../../public/state/actions.js');
const { renderPitch } = await import('../../public/ui/pitch.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const fresh = (seed = 4) => { const L = createLeague(createRng(seed)); return { L, me: L.teams.find((t) => !t.isBot), opp: L.teams.find((t) => t.isBot) }; };

test('dybden i bevægelsen følger den tegnede plads: en OM trukket ned til y 46 glider op/ned som en CM (applyDepth), ikke som en CAM', () => {
  const { me, opp } = fresh(); setFormation(me, '4-2-3-1'); moveSlot(me, 8, { x: 50, y: 46 });
  let cm = 0, cam = 0, n = 0;
  for (let t = 1; t <= 80; t++) {
    const drift = { seed: 777, team: 1, t };
    const delta = coupledPositions(me.tactics, opp.tactics, { ballDrift: drift }).ball[8].y - coupledPositions(me.tactics, opp.tactics).ball[8].y;
    n++;
    if (delta === Math.round(driftAt(drift, 'CM', 8, me.tactics.phases)[1])) cm++;
    if (delta === Math.round(driftAt(drift, 'CAM', 8, me.tactics.phases)[1])) cam++;
  }
  // Målt 6/11: CM-dybden 67 af 80 ticks (resten fanget af rækkevagten/spejlet); CAM-dybden kun 16 (de 13 ticks hvor de afrunder ens + tilfældige).
  // Med ankrets rolle (CAM) er forholdet omvendt – derfor "mindst 55 CM-ticks" OG "færre CAM end CM": begge tal står her, ikke et bånd om dem.
  assert.ok(cm >= 55, `CM-dybde ${cm} af ${n} (ankrets CAM: ca. 16)`);
  assert.ok(cm - cam >= 35, `CM ${cm} mod CAM ${cam}`);
});

test('live-etiketten under træk på en KANTplads: "→ back-plads" / "→ kant-/back-plads" / "→ kant-plads" – og ingen etiket på ST og CB', () => {
  const { me } = fresh(); setFormation(me, '3-5-2');   // slot 4 = LWB@46 (anker: kant-plads), slot 9 = ST, slot 1 = CB
  const tok = (slot) => all(renderPitch({ team: me, isOwn: true, ui: {}, onMove() {}, onSelect() {}, onTokenSwap() {} }), (e) => e.dataset.slot === String(slot) && e.className.startsWith('token'))[0];
  const labels = (slot, ys) => {
    const t = tok(slot); t.listeners.pointerdown({ preventDefault() {}, pointerId: 1 });
    // QC (efter rettelserne): etiketten står i sin egen boks (.token-live – vokser indad ved kanten), og brikken er .dragging, så flagene skjules
    const box = t.children.find((c) => c instanceof FakeEl && c.className.includes('token-live')), seen = [];
    const live = box?.children.find((c) => c instanceof FakeEl && c.className.includes('kind-live'));
    if (live) for (const y of ys) { t.listeners.pointermove({ clientX: 20, clientY: y }); seen.push(live.textContent); }
    return { live, box, seen, t };
  };
  const w = labels(4, [64, 57, 46]);
  assert.ok(w.live, 'LWB: live-etiket under træk');
  const wm = me.squad.find((p) => p.id === me.tactics.lineupSlots[4]);
  assert.equal(wm.position, 'WM', 'data: en kant på LWB-pladsen');
  // ≥ 60 back (en kant dér: naboplads −2,5 %), 56–59 begge (✓), ≤ 55 kant (✓) – følgen for netop ham (v3.33.0-rettelse, Spilfører UI 1)
  assert.deepEqual(w.seen, ['→ back-plads · −2,5 %', '→ kant-/back-plads ✓', '→ kant-plads ✓']);
  assert.ok(w.t.className.split(' ').includes('dragging'), 'brikken er .dragging under trækket (flagene skjules)');
  w.t.listeners.pointerup();
  assert.ok(w.box.removed, 'etiketten (og dens boks) fjernes, når brikken slippes');
  assert.ok(!w.t.className.split(' ').includes('dragging'), 'og .dragging er væk efter slip');
  for (const slot of [9, 1]) assert.equal(labels(slot, [50]).live, undefined, `slot ${slot} (ST/CB) har ingen pladstype → ingen etiket`);
});

test('FIT_HELP (forklaringen ved listen): hver sætning om pladsen står bogstaveligt – kant, midten, mellemzonen og "CM→DM"', async () => {
  const { FIT_HELP } = await import('../../public/ui/labels.js');
  for (const s of ['Pladsen følger dybden – spilleren gør ikke.', 'Kantpladser (VB/HB/VKB/HKB/VM/HM): højt en kant-plads, dybt en back-plads.',
    'Midten (DM/CM/OM): dybt en DM-plads, i midten en CM-plads, højt en OM-plads.', 'Imellem passer begge; trækker du en spiller, følger prisen med (på midten også rollen: "CM→DM").'])
    assert.ok(FIT_HELP.includes(s), `mangler: ${s}`);
});

test('karakterarkets pladskode: kun en CENTRAL gemt rolle giver "X→Y" – en ukendt/gammel rolle på en central plads viser pladsens egen kode', async () => {
  const { placeLabel } = await import('../../public/ui/lineup.js');
  const E = (o) => ({ minIn: 1, minOut: 90, line: 'MID', ...o });
  assert.equal(placeLabel(E({ slot: 8, role: 'X' }), '4-2-3-1'), 'OM', 'gammel/ukendt rolle: ingen pil');
  assert.equal(placeLabel(E({ slot: 8, role: 'CM' }), '4-2-3-1'), 'OM→CM');
  assert.equal(placeLabel(E({ slot: 8, role: 'CAM' }), '4-2-3-1'), 'OM', 'samme rolle: ingen pil');
  assert.equal(placeLabel(E({ slot: 5, role: 'CM' }), '4-2-3-1'), 'DM→CM');
  assert.equal(placeLabel(E({ slot: 8, role: 'CM', minIn: 60 }), '4-2-3-1'), 'ind på OM', 'indskifter: pladsens kode, ingen pil');
});
