// v3.24.6 Test Manager: forfatterens test (wide-slots-v3246) dækker formations.js, men mutanter overlevede i ledningen
// OMKRING den: tærsklerne (testen importerede WIDE_MID_Y/WIDE_BACK_Y og målte dem kun mod sig selv, så 55→54/56 og 60→59/61 var
// grønne), RM/RB/RW i WIDE_ROLES, repairLineup (career.js), arrangeLineup med flyttede y, outOfPositionCount (kun typeof),
// Taktiktavlen (pitch.js), spillerlisten (lineup-list.js) og kamprapportens fire blokke (matchcenter.js sheet-gap).
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; this.classList = { add: (c) => { this.className += ' ' + c; }, toggle() {} }; }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener() {}
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(String(v))]; }
}
globalThis.Node = FakeNode;
globalThis.document = { createElement: (t) => new FakeEl(t), createTextNode: (t) => new FakeText(t) };
const { FORMATIONS, FIT, fitOf, slotFitOf, slotPositionOf, slotKindText, WIDE_ROLES } = await import('../../public/engine/formations.js');
const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { setFormation, outOfPositionCount, moveSlot, arrangeLineup } = await import('../../public/state/actions.js');
const { repairLineup } = await import('../../public/engine/career.js');
const { renderPitch } = await import('../../public/ui/pitch.js');
const { renderLineupList } = await import('../../public/ui/lineup-list.js');
const { renderMatchCenter } = await import('../../public/ui/matchcenter.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const slotOf = (f, r) => FORMATIONS[f].findIndex((s) => s.r === r);
const fresh = (seed = 4) => { const L = createLeague(createRng(seed)); return L.teams.find((t) => !t.isBot); };
// Lægger spiller p på plads slot; den der stod der i forvejen byttes med p's gamle plads
const put = (t, p, slot) => { const s = t.tactics.lineupSlots, j = s.indexOf(p.id); if (j >= 0) s[j] = s[slot]; s[slot] = p.id; };
// En kant (WM) og en back (FB) fra truppen, lagt på hhv. venstre og højre wingback-plads
function wingScene(formation = '3-5-2') {
  const me = fresh(); setFormation(me, formation);
  const wm = me.squad.find((p) => p.position === 'WM'), fb = me.squad.find((p) => p.position === 'FB');
  assert.ok(wm && fb, 'data: truppen har både kant og back');
  const l = slotOf(formation, 'LWB'), r = slotOf(formation, 'RWB');
  put(me, wm, l); put(me, fb, r);
  return { me, wm, fb, l, r };
}

test('tærsklerne med bogstavelige tal: 55 er stadig kant, 60 er allerede back, imellem begge (±1 på hver tærskel er rødt)', () => {
  // WIDE_MID_Y 55 -> 54 gør y55 til WIDE; -> 56 gør y56 til WM. WIDE_BACK_Y 60 -> 59 gør y59 til FB; -> 61 gør y60 til WIDE.
  for (const r of ['LB', 'RB', 'LWB', 'RWB', 'LM', 'RM']) {
    assert.equal(slotPositionOf(r, 46), 'WM', r); assert.equal(slotPositionOf(r, 55), 'WM', `${r} 55`);
    assert.equal(slotPositionOf(r, 56), 'WIDE', `${r} 56`); assert.equal(slotPositionOf(r, 59), 'WIDE', `${r} 59`);
    assert.equal(slotPositionOf(r, 60), 'FB', `${r} 60`); assert.equal(slotPositionOf(r, 64), 'FB', r);
  }
});

test('alle seks kantpladser (LB/RB/LWB/RWB/LM/RM) følger dybden – og LW/RW og andre roller gør IKKE (RM, RB og RW manglede)', () => {
  assert.deepEqual([...WIDE_ROLES].sort(), ['LB', 'LM', 'LWB', 'RB', 'RM', 'RWB']);
  for (const r of ['LB', 'RB', 'LWB', 'RWB', 'LM', 'RM']) {
    assert.equal(fitOf('WM', r, 46), FIT.own, `${r} højt: kant 100 %`); assert.equal(fitOf('FB', r, 46), FIT.near, `${r} højt: back -2,5 %`);
    assert.equal(fitOf('FB', r, 64), FIT.own, `${r} dybt: back 100 %`); assert.equal(fitOf('WM', r, 64), FIT.near, `${r} dybt: kant -2,5 %`);
  }
  for (const r of ['LW', 'RW']) { assert.equal(fitOf('WM', r, 64), FIT.own, r); assert.equal(fitOf('FB', r, 64), FIT.near, `${r} dybt er stadig en kant`); assert.equal(slotPositionOf(r, 64), 'WM'); }
  assert.equal(slotPositionOf('CB', 46), 'CB'); assert.equal(slotPositionOf('ST', 64), 'ST'); assert.equal(slotPositionOf('GK', 55), 'GK');
});

test('slotKindText: ordene på brikkens title – kun for kantpladser', () => {
  assert.equal(slotKindText('LWB', 46), 'kant-plads'); assert.equal(slotKindText('RM', 64), 'back-plads'); assert.equal(slotKindText('LB', 57), 'kant-/back-plads');
  assert.equal(slotKindText('LW', 22), 'kant-plads'); assert.equal(slotKindText('CB', 75), null); assert.equal(slotKindText('GK', 90), null);
});

test('outOfPositionCount: en kant på 3-5-2-wingbacken er IKKE uden for position – trækkes han ned til back-dybde, tæller han (præcis +1)', () => {
  const { me, wm, l } = wingScene();
  const before = outOfPositionCount(me);
  assert.equal(slotFitOf(me.tactics, l, 'WM'), FIT.own);
  moveSlot(me, l, { x: FORMATIONS['3-5-2'][l].x, y: 68 });
  assert.equal(outOfPositionCount(me), before + 1, 'kanten på en back-plads tæller nu');
  moveSlot(me, l, { x: FORMATIONS['3-5-2'][l].x, y: 46 });
  assert.equal(outOfPositionCount(me), before);
  assert.equal(me.tactics.lineupSlots[l], wm.id);
});

test('arrangeLineup: pladsernes FLYTTEDE dybde styrer fordelingen – kant på kant-pladsen, back på back-pladsen', () => {
  const { me, wm, fb, l, r } = wingScene();
  moveSlot(me, l, { x: FORMATIONS['3-5-2'][l].x, y: 68 });   // venstre wingback trukket ned = back-plads; højre står højt = kant-plads
  // nu står kanten på back-pladsen og backen på kant-pladsen: begge -2,5 %. Ankrene (begge y46) ville lade dem stå.
  assert.equal(slotFitOf(me.tactics, l, 'WM'), FIT.near); assert.equal(slotFitOf(me.tactics, r, 'FB'), FIT.near);
  arrangeLineup(me);
  assert.equal(me.tactics.lineupSlots[l], fb.id, 'backen på den dybe plads'); assert.equal(me.tactics.lineupSlots[r], wm.id, 'kanten på den høje plads');
});

test('repairLineup: en tom wingback-plads fyldes med den, der passer på pladsens DYBDE – kant på 3-5-2, back på 5-3-2', () => {
  for (const [f, want] of [['3-5-2', 'WM'], ['5-3-2', 'FB']]) for (const r of ['LWB', 'RWB']) for (const order of [['WM', 'FB'], ['FB', 'WM']]) {
    const me = fresh(); setFormation(me, f);
    const slot = slotOf(f, r), base = me.squad.find((p) => !me.tactics.lineupSlots.includes(p.id) && p.line === 'DEF');
    // to ellers ens kandidater (samme evner, samme kæde) – kun positionen adskiller dem; ingen andre frie spillere
    const mk = (pos, k) => ({ ...structuredClone(base), id: `c_${pos}_${k}`, position: pos, line: 'DEF', shirtNumber: 80 + k });
    const cands = order.map((pos, k) => mk(pos, k));
    const keep = me.squad.filter((p) => me.tactics.lineupSlots.includes(p.id) && p.id !== me.tactics.lineupSlots[slot]);
    me.squad = [...keep, ...cands]; me.tactics.lineupSlots[slot] = 'gone';
    assert.ok(repairLineup(me));
    const got = me.squad.find((p) => p.id === me.tactics.lineupSlots[slot]);
    assert.equal(got.position, want, `${f} ${r} ${order}`);
  }
});

const pitchTokens = (me) => all(renderPitch({ team: me, isOwn: true, ui: {}, onMove() {}, onSelect() {}, onTokenSwap() {} }), (e) => e.dataset.slot !== undefined && e.className.startsWith('token'));
const tokenOf = (me, slot) => pitchTokens(me).find((e) => e.dataset.slot === String(slot));

test('Taktiktavlen: brikkens fit og title følger pladsens dybde (kant 1, back-straf 0.975, "(kant-plads)"/"(back-plads)")', () => {
  const { me, l, r } = wingScene();
  let a = tokenOf(me, l);
  const b = tokenOf(me, r);
  assert.equal(a.dataset.fit, '1'); assert.match(a.attrs.title, /^VKB \(kant-plads\) – /); assert.ok(!a.children.some((c) => /Uden for position/.test(c.textContent)));
  assert.equal(b.dataset.fit, '0.975'); assert.match(b.attrs.title, /^HKB \(kant-plads\) – /); assert.ok(b.children.some((c) => /Uden for position – kant-plads \(−2,5 %\)/.test(c.textContent)), b.textContent);   // QC v3.24.6: pladstypen i flaget
  moveSlot(me, l, { x: FORMATIONS['3-5-2'][l].x, y: 68 });
  a = tokenOf(me, l);
  assert.equal(a.dataset.fit, '0.975'); assert.match(a.attrs.title, /^VKB \(back-plads\) – /); assert.ok(a.children.some((c) => /Uden for position/.test(c.textContent)));
  assert.equal(tokenOf(me, slotOf('3-5-2', 'CAM')).attrs.title.includes('plads)'), false, 'ikke-kantplads: ingen plads-tekst');
});

test('Spillerlisten: "Plads"-cellen viser straf for backen på kant-pladsen, ikke for kanten – og følger pladsens dybde', () => {
  const { me, wm, fb, l } = wingScene();
  const place = (id) => all(renderLineupList({ team: me, isOwn: true, ui: { listLine: 'all' }, onPick() {}, onSort() {}, onBlocked() {}, onLine() {} }),
    (e) => e.tag === 'tr' && e.dataset.pid === id)[0].children[0];
  assert.ok(!place(wm.id).className.includes('off-pos')); assert.equal(place(wm.id).textContent, 'VKB');   // v3.31.2: danske pladskoder
  assert.ok(place(fb.id).className.includes('off-pos')); assert.equal(place(fb.id).textContent, 'HKB ⚠ −2,5 %');
  moveSlot(me, l, { x: FORMATIONS['3-5-2'][l].x, y: 68 });
  assert.equal(place(wm.id).textContent, 'VKB ⚠ −2,5 %', 'kanten trukket ned til back-dybde');
});

test('Kamprapporten: hvert karakterark har præcis fire blokke (titel, kort, opstilling, liste) – tomme pladser er sheet-gap', () => {
  const entry = (id, nr, extra = {}) => ({ playerId: id, shirtNumber: nr, shortName: 'S' + nr, place: 'CM', minIn: 0, minOut: 90, goals: 0, assists: 0, saves: 0, aerialWins: 0, yellowCard: false, injured: false, isMotM: false, rating: 6.5, stars: 3, gainedCounterXp: 0, ...extra });
  const ev = { min: 90, hG: 1, aG: 0, text: 'Slut', category: 'PLAY', type: 'FULLTIME', label: 'Slut', plot: false, stats: { hPoss: 60, aPoss: 40, hTacticSuccess: 1, aTacticSuccess: 2, hShots: 11, aShots: 12, hOnTarget: 5, aOnTarget: 6, hXg: 1.234, aXg: 0.5, hAerialWon: 3, aAerialWon: 4, hVarChecks: 0, aVarChecks: 1, hFouls: 7, aFouls: 8, hInjuries: 1, aInjuries: 2 } };
  const render = (m) => renderMatchCenter({ mc: { round: 1, matches: [{ homeId: 'h', awayId: 'a', homeName: 'Hjemme', awayName: 'Ude', homeTacticStr: '', awayTacticStr: '', homeGoals: 1, awayGoals: 0, events: [ev], ...m }], viewIdx: 0, filter: 'all', shownCount: 99, playing: false, gazette: null }, myTeamId: 'h', on: {} });
  const sheets = (root) => all(root, (e) => e.className === 'ratings');
  // uden formation/kort: begge blokke tomme på begge ark
  const bare = sheets(render({ ratings: { motm: null, home: [entry('a', 1)], away: [entry('b', 2)] } }));
  assert.equal(bare.length, 2);
  for (const s of bare) assert.deepEqual(s.children.map((c) => c.tag + '.' + c.className), ['h4.', 'div.sheet-gap', 'div.sheet-gap', 'table.']);
  // med startopstilling på hjemmeholdet: opstillingen (blok 3) er et rigtigt element, ikke et gap; udeholdet uden står stadig med 4
  const home = [entry('a', 1, { slot: 0, role: 'GK' }), entry('c', 3, { slot: 1 })];
  const two = sheets(render({ startFormations: { home: '4-4-2', away: null }, ratings: { motm: null, home, away: [entry('b', 2)] } }));
  assert.deepEqual(two[0].children.map((c) => c.className), ['', 'sheet-gap', 'minipitch-wrap', ''], 'hjem: kort tomt, opstilling til stede');
  assert.deepEqual(two[1].children.map((c) => c.className), ['', 'sheet-gap', 'sheet-gap', '']);
});
