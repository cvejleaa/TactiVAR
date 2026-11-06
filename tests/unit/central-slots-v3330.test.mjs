// v3.33.0 (brugeren 6/11: "hvis jeg trak en spiller ud af en standardopstilling, så det f.eks. gik fra at være en cm til en dm, så
// skulle spillet finde ud af det, og ikke give en straf til en dm spiller på den plads"): på de centrale midtbanepladser (CDM/CM/CAM)
// afgør den tegnede dybde pladsen – prisen OG rollen (løb, bevægelse, km). Tallene her er BOGSTAVELIGE (ikke importerede tærskler),
// så en flyttet tærskel (±1) eller en fjernet mellemzone bliver rød.
import { test } from 'node:test';
import assert from 'node:assert/strict';

class FakeNode {}
class FakeText extends FakeNode { constructor(t) { super(); this.t = t; } get textContent() { return this.t; } }
class FakeEl extends FakeNode {
  constructor(tag) { super(); this.tag = tag; this.children = []; this.className = ''; this.dataset = {}; this.style = {}; this.attrs = {}; this.listeners = {}; this.classList = { add: (c) => { this.className += ' ' + c; }, toggle() {} }; }
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

const F = await import('../../public/engine/formations.js');
const { FORMATIONS, FORMATION_NAMES, FIT, fitOf, slotFitOf, slotPositionOf, slotKindText, slotRoleAt, slotRoleOf, positionOfRole, lineOfRole, BOTH, WIDE_ROLES, arrangeByFit } = F;
const { createRng } = await import('../../public/engine/rng.js');
const { createLeague } = await import('../../public/engine/generator.js');
const { simulateMatch } = await import('../../public/engine/match.js');
const { livePositions, driftAt, ADVANCE, RUNS_PUSH } = await import('../../public/engine/positions.js');
const { setFormation, moveSlot, outOfPositionCount, swapPlayers, arrangeLineup, switchPreset } = await import('../../public/state/actions.js');
const { renderPitch } = await import('../../public/ui/pitch.js');
const { renderLineupList } = await import('../../public/ui/lineup-list.js');
const { placeLabel } = await import('../../public/ui/lineup.js');

const all = (el, pred, out = []) => { if (el instanceof FakeEl) { if (pred(el)) out.push(el); el.children.forEach((c) => all(c, pred, out)); } return out; };
const fresh = (seed = 4) => { const L = createLeague(createRng(seed)); return { L, me: L.teams.find((t) => !t.isBot) }; };
const CENTRAL = ['CDM', 'CM', 'CAM'];

test('zonerne med bogstavelige tal: ≥ 54 DM, 51–53 DM/CM, 41–50 CM, 38–40 CM/OM, ≤ 37 OM – skæringerne på halve tal (±1 er rødt)', () => {
  const want = [[82, 'DM'], [56, 'DM'], [54, 'DM'], [53.5, 'DM'], [53, 'DM-CM'], [52, 'DM-CM'], [51, 'DM-CM'], [50.5, 'DM-CM'], [50, 'CM'], [46, 'CM'],
    [41, 'CM'], [40.5, 'CM'], [40, 'CM-AM'], [39, 'CM-AM'], [38, 'CM-AM'], [37.5, 'CM-AM'], [37, 'AM'], [36.5, 'AM'], [34, 'AM'], [8, 'AM']];
  for (const r of CENTRAL) for (const [y, pos] of want) assert.equal(slotPositionOf(r, y), pos, `${r} y ${y}`);
  assert.equal(slotPositionOf('CM'), 'CM', 'uden y: rollens position som før'); assert.equal(slotPositionOf('CDM', null), 'DM');
});

test('fitOf på midten: DM 100 % på en CM-plads trukket til y 56, CM dér −2,5 %; i mellemzonen passer begge fuldt', () => {
  assert.equal(fitOf('DM', 'CM', 56), FIT.own); assert.equal(fitOf('CM', 'CM', 56), FIT.near);
  assert.equal(fitOf('CM', 'CDM', 48), FIT.own); assert.equal(fitOf('DM', 'CDM', 48), FIT.near);
  assert.equal(fitOf('AM', 'CAM', 46), FIT.near); assert.equal(fitOf('CM', 'CAM', 46), FIT.own); assert.equal(fitOf('AM', 'CM', 34), FIT.own);
  for (const y of [51, 52, 53]) { assert.equal(fitOf('DM', 'CM', y), FIT.own, `DM y ${y}`); assert.equal(fitOf('CM', 'CDM', y), FIT.own, `CM y ${y}`); }
  for (const y of [38, 39, 40]) { assert.equal(fitOf('CM', 'CAM', y), FIT.own, `CM y ${y}`); assert.equal(fitOf('AM', 'CM', y), FIT.own, `AM y ${y}`); }
  // mellemzonens naboer: nabo til en af de to
  assert.equal(fitOf('AM', 'CM', 52), FIT.near, 'AM-CM'); assert.equal(fitOf('CB', 'CM', 52), FIT.near, 'CB-DM'); assert.equal(fitOf('ST', 'CM', 52), FIT.other);
  assert.equal(fitOf('DM', 'CM', 39), FIT.near, 'DM-CM'); assert.equal(fitOf('ST', 'CM', 39), FIT.near, 'AM-ST'); assert.equal(fitOf('CB', 'CM', 39), FIT.other);
  assert.equal(fitOf('GK', 'CM', 56), FIT.keeper);
  assert.deepEqual(JSON.parse(JSON.stringify(BOTH)), { WIDE: ['WM', 'FB'], 'DM-CM': ['DM', 'CM'], 'CM-AM': ['CM', 'AM'] });
});

test('invarianten: intet anker i nogen formation skifter klasse – position, kæde, rolle og "ingen pladstekst" som før', () => {
  for (const f of FORMATION_NAMES) FORMATIONS[f].forEach(({ r, y }, i) => {
    if (WIDE_ROLES.has(r)) return;   // kantpladserne har deres egen dybde-regel (v3.24.6)
    assert.equal(slotPositionOf(r, y), positionOfRole(r), `${f} plads ${i} ${r} y ${y}`);
    assert.equal(lineOfRole(r, y), lineOfRole(r), `${f} ${r}`);
    assert.equal(slotRoleAt(r, y), r, `${f} ${r}: rollen på ankret er rollen`);
    if (CENTRAL.includes(r)) assert.equal(slotKindText(r, y), null, `${f} ${r}: ingen pladstekst på ankret`);
  });
  for (const r of CENTRAL) for (let y = 8; y <= 82; y += 0.5) assert.equal(lineOfRole(r, y), 'MID', `kæden følger ikke dybden: ${r} y ${y}`);
});

test('kun CDM/CM/CAM følger dybden: angriber (falsk 9\'er), CF, stopper og kanterne gør IKKE', () => {
  assert.equal(slotPositionOf('ST', 56), 'ST'); assert.equal(slotPositionOf('ST', 46), 'ST'); assert.equal(fitOf('ST', 'ST', 46), FIT.own, 'falsk 9\'er er lovlig');
  assert.equal(slotPositionOf('CF', 56), 'AM'); assert.equal(slotPositionOf('CB', 50), 'CB'); assert.equal(slotPositionOf('CB', 40), 'CB'); assert.equal(slotPositionOf('GK', 56), 'GK');
  assert.equal(slotRoleAt('ST', 56), 'ST'); assert.equal(slotRoleAt('CF', 56), 'CF'); assert.equal(slotRoleAt('CB', 40), 'CB');
  for (const r of ['LB', 'RB', 'LWB', 'RWB', 'LM', 'RM', 'LW', 'RW']) for (const y of [30, 46, 57, 64, 75]) assert.equal(slotRoleAt(r, y), r, `kanten ${r} y ${y}: kampens rolle følger rollenavnet (v3.24.6)`);
});

test('slotRoleAt: effektiv rolle efter dybden – mellemzonen beholder rollen, hvis den passer, ellers CM', () => {
  const cases = [['CM', 56, 'CDM'], ['CM', 54, 'CDM'], ['CM', 52, 'CM'], ['CDM', 52, 'CDM'], ['CAM', 52, 'CM'], ['CDM', 48, 'CM'], ['CAM', 46, 'CM'],
    ['CDM', 39, 'CM'], ['CAM', 39, 'CAM'], ['CM', 39, 'CM'], ['CM', 34, 'CAM'], ['CDM', 34, 'CAM'], ['CAM', 60, 'CDM']];
  for (const [r, y, want] of cases) assert.equal(slotRoleAt(r, y), want, `${r} y ${y}`);
  assert.equal(slotRoleAt('CM'), 'CM'); assert.equal(slotRoleAt('CM', null), 'CM');
});

test('slotKindText: central plads nævnes kun, når dybden gør den til noget andet end rollen – kanterne som før', () => {
  assert.equal(slotKindText('CM', 56), 'DM-plads'); assert.equal(slotKindText('CM', 46), null); assert.equal(slotKindText('CM', 52), 'DM-/CM-plads');
  assert.equal(slotKindText('CDM', 56), null); assert.equal(slotKindText('CDM', 48), 'CM-plads'); assert.equal(slotKindText('CAM', 34), null);
  assert.equal(slotKindText('CAM', 46), 'CM-plads'); assert.equal(slotKindText('CM', 34), 'OM-plads'); assert.equal(slotKindText('CM', 39), 'CM-/OM-plads');
  assert.equal(slotKindText('LWB', 46), 'kant-plads'); assert.equal(slotKindText('LW', 22), 'kant-plads'); assert.equal(slotKindText('LB', 57), 'kant-/back-plads');
  assert.equal(slotKindText('ST', 56), null); assert.equal(slotKindText('CF', 30), null); assert.equal(slotKindText('CB', 73), null);
});

test('Taktik: CM-pladsen trukket til y 56 → DM passer, CM får straffen, rollen bliver DM – og tilbage igen forsvinder det', () => {
  const { me } = fresh(); setFormation(me, '4-3-3');
  const slot = 6, dm = me.squad.find((p) => p.position === 'DM' && !me.tactics.lineupSlots.includes(p.id));
  assert.equal(FORMATIONS['4-3-3'][slot].r, 'CM'); assert.ok(dm, 'data: bænken har en DM');
  swapPlayers(me, me.tactics.lineupSlots[slot], dm.id);
  const before = outOfPositionCount(me);
  assert.equal(slotFitOf(me.tactics, slot, 'DM'), FIT.near); assert.equal(slotRoleOf(me.tactics, slot), 'CM');
  moveSlot(me, slot, { x: 32, y: 56 });
  assert.equal(slotFitOf(me.tactics, slot, 'DM'), FIT.own); assert.equal(slotFitOf(me.tactics, slot, 'CM'), FIT.near);
  assert.equal(slotRoleOf(me.tactics, slot), 'CDM'); assert.equal(F.slotPlaceLabel(me.tactics, slot), 'CM→DM');
  assert.equal(outOfPositionCount(me), before - 1, 'DM\'en tæller ikke længere');
  moveSlot(me, slot, { x: 32, y: 44 });
  assert.equal(slotFitOf(me.tactics, slot, 'DM'), FIT.near); assert.equal(slotRoleOf(me.tactics, slot), 'CM'); assert.equal(F.slotPlaceLabel(me.tactics, slot), 'CM');
  assert.equal(outOfPositionCount(me), before);
});

test('"Stil op efter position" og Hvis-Så bruger den tegnede dybde: DM\'en flyttes til den CM-plads, der er trukket ned', () => {
  const { me } = fresh(); setFormation(me, '4-3-3');
  const dm = me.squad.find((p) => p.position === 'DM' && !me.tactics.lineupSlots.includes(p.id));
  swapPlayers(me, me.tactics.lineupSlots[7], dm.id);   // DM'en på den højre CM-plads (ankret y 44)
  moveSlot(me, 6, { x: 32, y: 56 });   // den venstre CM-plads trukket ned i DM-zonen
  arrangeLineup(me);
  assert.equal(me.tactics.lineupSlots[6], dm.id, 'DM\'en står på den trukne plads');
});

test('Hvis-Så plan-skift: de 11 fordeles efter planens TEGNEDE dybder (refit med ys) – ikke ankrene', () => {
  const { L, me } = fresh(); const opp = L.teams.find((t) => t.isBot);
  setFormation(me, '4-4-2');
  const dm = me.squad.find((p) => p.position === 'DM' && !me.tactics.lineupSlots.includes(p.id));
  swapPlayers(me, me.tactics.lineupSlots[7], dm.id);   // DM'en på 4-4-2's højre CM-plads
  const byId = new Map(me.squad.map((p) => [p.id, p])), xi = me.tactics.lineupSlots.map((id) => byId.get(id));
  // Uden ys lander DM'en på en af 3-4-3's to CM-pladser (begge naboplads); planen trækker den ANDEN ned i DM-zonen
  const plain = arrangeByFit(xi, '3-4-3', '4-4-2'), dmAt = plain.indexOf(dm), other = dmAt === 5 ? 6 : 5;
  assert.ok([5, 6].includes(dmAt), `data: DM'en på en CM-plads uden ys (${dmAt})`);
  const plan = structuredClone(me.tactics); Object.assign(plan, { baseFormation: '3-4-3', customCoords: { [other]: { x: FORMATIONS['3-4-3'][other].x, y: 56 } } });
  me.tacticPresets[1] = plan;
  me.tactics.conditionalRules = [{ ruleId: 1, minuteTrigger: 1, condition: 'ANY', margin: 1, newFormation: '3-4-3', newPlan: 1 }];
  const m = simulateMatch(me, opp, createRng(11));
  assert.equal(m.endState.home.formation, '3-4-3');
  const end = m.endState.home.starters;
  assert.equal(end.indexOf(dm.id), other, 'DM\'en på den trukne plads (DM-zonen)');
  const ys = FORMATIONS['3-4-3'].map((c, i) => plan.customCoords[i]?.y ?? c.y);
  assert.equal(arrangeByFit(xi, '3-4-3', '4-4-2', ys).indexOf(dm), other, 'samme fordeling som arrangeByFit med planens dybder');
});

// QC 2 (v3.33.0-rettelse): et MANUELT planskift i Taktik (switchPreset → arrangeLineup) fordelte efter ankrene (ys = null, når formationen
// skiftede), mens Hvis-Så til samme plan fordeler efter planens tegnede dybder – samme plan gav to forskellige opstillinger.
test('samme plan giver samme opstilling i Taktik (switchPreset) og i kampen (Hvis-Så): de 11 efter planens TEGNEDE dybder', () => {
  const setup = () => {
    const { L, me } = fresh(); setFormation(me, '4-4-2');
    const dm = me.squad.find((p) => p.position === 'DM' && !me.tactics.lineupSlots.includes(p.id));
    swapPlayers(me, me.tactics.lineupSlots[7], dm.id);   // DM'en på 4-4-2's højre CM-plads
    const byId = new Map(me.squad.map((p) => [p.id, p])), plain = arrangeByFit(me.tactics.lineupSlots.map((id) => byId.get(id)), '3-4-3', '4-4-2');
    const other = plain.indexOf(dm) === 5 ? 6 : 5;   // den CM-plads, DM'en IKKE får efter ankrene – planen trækker den ned i DM-zonen
    const plan = structuredClone(me.tactics); Object.assign(plan, { baseFormation: '3-4-3', customCoords: { [other]: { x: FORMATIONS['3-4-3'][other].x, y: 56 } }, conditionalRules: [] });
    me.tacticPresets[1] = plan;
    return { L, me, dm, other, anchorAt: plain.indexOf(dm) };
  };
  const a = setup();
  assert.ok([5, 6].includes(a.anchorAt) && a.anchorAt !== a.other, `data: efter ankrene står DM'en på den anden CM-plads (${a.anchorAt})`);
  switchPreset(a.me, 0, 1);
  assert.equal(a.me.tactics.baseFormation, '3-4-3');
  assert.equal(a.me.tactics.lineupSlots.indexOf(a.dm.id), a.other, 'Taktik: DM\'en på den trukne plads (DM-zonen)');
  assert.equal(slotFitOf(a.me.tactics, a.other, 'DM'), FIT.own);
  const b = setup(); const opp = b.L.teams.find((t) => t.isBot);
  b.me.tactics.conditionalRules = [{ ruleId: 1, minuteTrigger: 1, condition: 'ANY', margin: 1, newFormation: '3-4-3', newPlan: 1 }];
  const m = simulateMatch(b.me, opp, createRng(11));
  assert.equal(m.endState.home.formation, '3-4-3');
  assert.deepEqual(m.endState.home.starters, a.me.tactics.lineupSlots, 'Hvis-Så = Taktik, plads for plads');
});

test('bevægelsen følger den tegnede plads: en OM trukket ned til y 46 rykker op og glider som en CM (RUNS_ROLES og DRIFT_AXES)', () => {
  const { me } = fresh(); setFormation(me, '4-2-3-1');
  me.tactics.phases.phase1_buildUp.offBallRuns = 'MANY';
  const t = me.tactics, at = (y) => { t.customCoords = { 8: { x: 50, y } }; return livePositions(t, { attacking: true, ballX: 50 })[8].y; };
  // CM er en løberolle (RUNS_ROLES): y 46 − ADVANCE.MID 16 − RUNS_PUSH.MANY 6 = 24. Som CAM (rollenavnet): 46 − 16 = 30.
  assert.equal(ADVANCE.MID, 16); assert.equal(RUNS_PUSH.MANY, 6);
  assert.equal(at(46), 24);
  assert.equal(at(39), 23, 'mellemzonen CM/OM: en OM-plads forbliver OM (39 − 16 = 23)');
  const drift = { seed: 12345, team: 1, t: 7 };
  t.customCoords = { 8: { x: 50, y: 46 } };
  const x = livePositions(t, { attacking: true, ballX: 50, drift })[8].x;
  assert.equal(x, Math.round(50 + driftAt(drift, 'CM', 8, t.phases)[0]), 'bredden glider med CM\'ens udslag');
  assert.notEqual(Math.round(50 + driftAt(drift, 'CM', 8, t.phases)[0]), Math.round(50 + driftAt(drift, 'CAM', 8, t.phases)[0]), 'data: CM og CAM glider forskelligt');
});

test('kampen: karakterarkets rolle og km følger den tegnede plads ("CM→DM"), og løbene uden bold vælger efter den', () => {
  const { L, me } = fresh(); const opp = L.teams.find((t) => t.isBot);
  setFormation(me, '4-3-3'); moveSlot(me, 6, { x: 32, y: 56 });
  const m = simulateMatch(me, opp, createRng(5)), e = m.ratings.home.find((x) => x.slot === 6 && x.minIn <= 1);
  assert.equal(e.role, 'CDM'); assert.equal(placeLabel(e, m.startFormations.home), e.line === 'MID' ? 'CM→DM' : `CM→DM (${{ DEF: 'FOR', ATT: 'ANG', GK: 'MV' }[e.line]})`);
  const e5 = m.ratings.home.find((x) => x.slot === 5 && x.minIn <= 1); assert.equal(e5.role, 'CDM', 'ankret: som før');
  // km: arkene registreres ved afspark, før noget kan gå forskelligt, så støjen er den samme – OM-pladsen trukket til y 46 løber som CM
  // (grund-km 11,8), på ankret som OM (10,8). distanceKm er afrundet til 0,1 km, derfor ± 0,02 på forholdet (1,093 – rollenavnet ville give 1)
  const drain = (y) => { const { L: L2, me: t } = fresh(); setFormation(t, '4-2-3-1'); if (y != null) moveSlot(t, 8, { x: 50, y }); return simulateMatch(t, L2.teams.find((x) => x.isBot), createRng(3)).ratings.home.find((x) => x.slot === 8 && x.minIn <= 1); };
  const d0 = drain(null), d1 = drain(46);
  assert.equal(d0.playerId, d1.playerId); assert.equal(d0.role, 'CAM'); assert.equal(d1.role, 'CM');
  assert.equal(d0.minOut - d0.minIn, d1.minOut - d1.minIn, 'data: samme minutter');
  assert.ok(Math.abs(d1.distanceKm / d0.distanceKm - 11.8 / 10.8) < 0.02, `${d1.distanceKm} / ${d0.distanceKm}`);
  // Løbsgruppen: en OM-plads trukket ned til y 46 er CM-gruppen (FEW: 1) – på ankret WIDE (FEW: 2). Samme hold og seeds: halvt så mange løb.
  const runs = (y) => {
    let n = 0;
    for (let s = 1; s <= 60; s++) {
      const { L: L2, me: t } = fresh(s); const o = L2.teams.find((x) => x.isBot);
      setFormation(t, '4-2-3-1'); t.tactics.phases.phase1_buildUp.offBallRuns = 'FEW';
      if (y != null) moveSlot(t, 8, { x: 50, y });
      const r = simulateMatch(t, o, createRng(s * 17)).ratings.home.find((x) => x.slot === 8 && x.minIn <= 1);
      n += r?.freeRuns ?? 0;
    }
    return n;
  };
  const cm = runs(46), cam = runs(39);   // 39: mellemzonen – OM-pladsen spilles stadig som OM (WIDE-gruppen)
  assert.ok(cam > 0 && cm < cam * 0.75, `CM-gruppen løber sjældnere: ${cm} mod ${cam}`);
});

// v3.33.0-rettelse (QC 4 + Spilfører UI 3): ringen er om ANKRET – teksten nævner ankrets plads og retningen. Før stod der "for langt fra
// sin DM-zone" om en CM-plads trukket til y 78 (den plads, han spilles som), hvilket læses, som om DM-pladsen var målet.
test('"er trukket for langt ned/frem fra sin CM-plads": teksten nævner ankrets plads og retningen – ikke den, han spilles som', () => {
  const hitAt = (y) => {
    for (let s = 1; s <= 30; s++) {
      const { L, me } = fresh(s); const opp = L.teams.find((t) => t.isBot);
      setFormation(me, '4-3-3'); moveSlot(me, 6, { x: 32, y });   // ±34 fra ankret (32, 44) – uden for zonen
      const hit = simulateMatch(me, opp, createRng(s)).events.find((e) => e.type === 'TACTIC_FAIL' && /er trukket for langt/.test(e.text));
      if (hit) return hit.text;
    }
    return null;
  };
  const down = hitAt(78), up = hitAt(10);
  assert.ok(down && up, 'data: en TACTIC_FAIL begge veje');
  assert.match(down, /er trukket for langt ned fra sin CM-plads, og /); assert.doesNotMatch(down, /DM-|zone|frem/);
  assert.match(up, /er trukket for langt frem fra sin CM-plads, og /); assert.doesNotMatch(up, /OM-|zone| ned /);
});

test('UI: brikkens title og flag, Plads-cellen og live-etiketten under træk siger den effektive plads', () => {
  const { me } = fresh(); setFormation(me, '4-3-3');
  const slot = 6, cmId = me.tactics.lineupSlots[slot], cm = me.squad.find((p) => p.id === cmId);
  assert.equal(cm.position, 'CM', 'data: en CM på CM-pladsen');
  const tok = () => all(renderPitch({ team: me, isOwn: true, ui: {}, onMove() {}, onSelect() {}, onTokenSwap() {} }), (e) => e.dataset.slot === String(slot) && e.className.startsWith('token'))[0];
  const place = () => all(renderLineupList({ team: me, isOwn: true, ui: { listLine: 'all' }, onPick() {}, onSort() {}, onBlocked() {}, onLine() {} }), (e) => e.tag === 'tr' && e.dataset.pid === cmId)[0].children[0];
  let t = tok();
  assert.match(t.attrs.title, /^CM – /); assert.equal(t.dataset.fit, '1'); assert.equal(place().textContent, 'CM');
  assert.ok(!t.children.some((c) => /Uden for position/.test(c?.textContent ?? '')));
  // live-etiketten under træk: pointerdown → pointermove til y 56 → "→ DM-plads"; tilbage til y 46 → "→ CM-plads"
  t.listeners.pointerdown({ preventDefault() {}, pointerId: 1 });
  const live = t.children.find((c) => c instanceof FakeEl && c.className.includes('kind-live'));
  assert.ok(live, 'live-etiket under træk');
  // v3.33.0-rettelse (Spilfører UI 1): følgen for netop ham – en CM: DM-pladsen koster −2,5 % (gul), mellemzonen og CM-pladsen passer (✓, grøn),
  // og 34 fra ankret står "ude af zone". Egen farveklasse (warn/ok) – ikke "Ude af zone"-flagets
  const at = (y) => { t.listeners.pointermove({ clientX: 32, clientY: y }); return [live.textContent, live.className.split(' ').filter((c) => c === 'warn' || c === 'ok').join()]; };
  assert.deepEqual(at(56), ['→ DM-plads · −2,5 %', 'warn']);
  assert.deepEqual(at(52), ['→ DM-/CM-plads ✓', 'ok']);
  assert.deepEqual(at(46), ['→ CM-plads ✓', 'ok']);
  assert.deepEqual(at(78), ['→ DM-plads · −2,5 % · ude af zone', 'warn']);
  assert.deepEqual(at(10), ['→ OM-plads · −2,5 % · ude af zone', 'warn']);
  assert.deepEqual(at(44), ['→ CM-plads ✓', 'ok']);
  moveSlot(me, slot, { x: 32, y: 56 });
  t = tok();
  assert.match(t.attrs.title, /^CM→DM \(DM-plads\) – /); assert.equal(t.dataset.fit, '0.975');
  assert.ok(t.children.some((c) => /Uden for position – DM-plads \(−2,5 %\)/.test(c?.textContent ?? '')), t.textContent);
  assert.equal(place().textContent, 'CM→DM ⚠ −2,5 %'); assert.match(place().attrs?.title ?? '', /på CM→DM \(DM-plads\) koster det −2,5 %/);
  moveSlot(me, slot, { x: 32, y: 44 });
  t = tok(); assert.match(t.attrs.title, /^CM – /); assert.doesNotMatch(t.attrs.title, /DM/); assert.equal(place().textContent, 'CM');
});

test('sporets invarianter holder med trukne midtbanepladser (målingens tre scenarier a/b/c, begge baner)', async () => {
  const { checkTrace } = await import('../../tools/trace-invariants.mjs');
  const { SCENARIOS } = await import('../../tools/measure-central.mjs');
  let n = 0;
  for (const name of ['a', 'b', 'c']) for (let s = 1; s <= 4; s++) {
    const sc = SCENARIOS[name], { L, me } = fresh(s * 53); setFormation(me, sc.f);
    if (sc.put) { const sub = me.squad.find((p) => p.position === sc.put[1] && !me.tactics.lineupSlots.includes(p.id)); if (!sub) continue; swapPlayers(me, me.tactics.lineupSlots[sc.put[0]], sub.id); }
    moveSlot(me, sc.drag[0], sc.drag[1]);
    assert.notEqual(slotRoleOf(me.tactics, sc.drag[0]), FORMATIONS[sc.f][sc.drag[0]].r, `data: ${name} skifter rolle`);
    const opp = L.teams.filter((t) => t.isBot)[s % 7];
    for (const m of [simulateMatch(me, opp, createRng(s * 31)), simulateMatch(opp, me, createRng(s * 37))]) { assert.deepEqual(checkTrace(m).errors, [], `${name} seed ${s}`); n++; }
  }
  assert.ok(n >= 18, `data: ${n} kampe`);
});
