// v3.20.0 – Test Managers huller: hvert sted, der vælger efter position, skal blive rødt, hvis fit fjernes.
// Proberne P1–P4 er Test Managers (bekræftet røde på mutationerne). Ingen alignPositions her: positionerne er de rigtige.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLeague } from '../../public/engine/generator.js';
import { createRng } from '../../public/engine/rng.js';
import { simulateMatch, pickForSlot } from '../../public/engine/match.js';
import { pickByFit, arrangeByFit, FORMATIONS, fitOf, FIT } from '../../public/engine/formations.js';
import { repairLineup, matchBenchOf, bestEleven } from '../../public/engine/career.js';
import { normalizeLeague } from '../../public/engine/sanitize.js';
import { playerSpan } from '../../public/engine/clock.js';
import * as act from '../../public/state/actions.js';

const league = (seed = 3) => createLeague(createRng(seed));
const tac = (form) => ({ baseFormation: form });

test('pickForSlot (ét valg for skade, rotation, udskiftning, træthed og pauseskift): score × fit – en lidt bedre DM taber til en OM på venstre kant (0,975 > 0,94)', () => {
  const t = league().teams[0], dm = t.squad.find((p) => p.position === 'DM'), am = t.squad.find((p) => p.position === 'AM');
  const lm = FORMATIONS['4-4-2'].findIndex((s) => s.r === 'LM');
  assert.equal(fitOf('AM', 'LM'), FIT.near); assert.equal(fitOf('DM', 'LM'), FIT.other);
  assert.equal(pickForSlot([dm, am], tac('4-4-2'), lm, (p) => (p === dm ? 10.2 : 10)), am);   // 10·0,975 = 9,75 > 10,2·0,94 = 9,59
  assert.equal(pickForSlot([dm, am], tac('4-4-2'), lm, (p) => (p === dm ? 11 : 10)), dm);     // 11·0,94 = 10,34 > 9,75 – score tæller
  assert.equal(pickForSlot([am, dm], tac('4-3-3'), FORMATIONS['4-3-3'].findIndex((s) => s.r === 'CDM')), dm, 'pladsen afgør (CDM)');
  assert.equal(pickForSlot([dm, am], tac('4-4-2'), FORMATIONS['4-4-2'].findIndex((s) => s.r === 'CM')), dm, 'ved lighed: listens rækkefølge');
  assert.equal(pickForSlot([], tac('4-4-2'), 1), undefined);
});

test('P1 kæden: ved lige score vælges kædens egne frem for en angriber på en kantplads (CHAIN_MISS)', () => {
  const sq = league().teams[0].squad;
  assert.ok(!pickByFit([sq[17], ...sq.slice(0, 17)], '4-4-2', () => 1).includes(sq[17]), '#18 (ANG-kæde, kant) valgt');
});

test('P2 skadet starter før kampen: erstattes af den, der passer på pladsen (OM på LM), ikke af en DM med lidt bedre evner', () => {
  const t = league().teams[0], sq = t.squad, bench = matchBenchOf(t).map((p) => p.shirtNumber);
  assert.ok(bench.includes(15) && bench.includes(16), 'data: bænk ' + bench);
  const lm = sq.find((p) => p.id === t.tactics.lineupSlots[5]); assert.equal(lm.position, 'WM');
  lm.injuryMatchesLeft = 2;
  const dm = sq.find((p) => p.shirtNumber === 15), am = sq.find((p) => p.shirtNumber === 16);
  for (const p of sq) p.freshness = 100;
  for (const k of Object.keys(dm.skills)) { dm.skills[k] = 12; am.skills[k] = 11; }
  const m = simulateMatch(t, league().teams[1], createRng(5));
  const line = m.events.map((e) => e.text ?? '').find((l) => l.includes('erstattes i startopstillingen'));
  assert.ok(line && line.includes('#16 '), String(line));
});

test('P3 repairLineup: den tomme kantplads fyldes af den, der passer (OM, nabo), ikke DM\'en – ved samme offentlige score', () => {
  const t = league().teams[0], slots = t.tactics.lineupSlots.slice(), gone = t.squad.find((p) => p.id === slots[5]);
  t.squad = t.squad.filter((p) => p !== gone);
  for (const p of t.squad) { p.freshness = 100; p.injuryMatchesLeft = 0; p.careerGames = 0; p.roleTier = 'ROTATION'; }
  repairLineup(t, new Map([[gone.id, 'MID']]));
  assert.equal(t.squad.find((p) => p.id === t.tactics.lineupSlots[5]).shirtNumber, 16);
});

test('P4 formationsskift bevarer siden: LB bliver på venstre og RB på højre (4-4-2 → 3-4-3 og → 4-2-3-1)', () => {
  for (const form of ['3-4-3', '4-2-3-1']) {
    const t = league().teams[0], lb = t.tactics.lineupSlots[1], rb = t.tactics.lineupSlots[4];
    act.setFormation(t, form);
    const roles = FORMATIONS[form].map((s) => s.r), at = (id) => roles[t.tactics.lineupSlots.indexOf(id)];
    assert.ok(!at(lb).startsWith('R') && !at(rb).startsWith('L'), `${form}: LB → ${at(lb)}, RB → ${at(rb)}`);
    assert.ok(at(rb).startsWith('R') || at(rb) === 'CB', `${form}: RB → ${at(rb)}`);
  }
});

test('plan-skift til en plan med SAMME formation (andre faser): din opstilling rokeres ikke – hverken i Taktik eller i kampen', () => {
  const t = league().teams[0];
  [t.tactics.lineupSlots[1], t.tactics.lineupSlots[9]] = [t.tactics.lineupSlots[9], t.tactics.lineupSlots[1]];   // bevidst: ANG på LB
  const lineup = t.tactics.lineupSlots.slice();
  t.tacticPresets[1] = { ...structuredClone(t.tactics), phases: { ...structuredClone(t.tactics.phases), phase2_defending: { ...t.tactics.phases.phase2_defending, pressingHeight: 'LOW_BLOCK' } } };
  act.switchPreset(t, 0, 1);
  assert.deepEqual(t.tactics.lineupSlots, lineup, 'Taktik');
  act.switchPreset(t, 1, 0);
  t.tactics.conditionalRules = [{ ruleId: 1, minuteTrigger: 3, condition: 'ANY', margin: 1, newFormation: '5-4-1', newPlan: 1, slotRemapping: [...Array(11).keys()], action: 'SHIFT', subOut: null, subIn: null }];
  const r = createRng(2), m = simulateMatch(t, league().teams[1], { ...r, chance: (p) => (p === 0.06 ? false : r.chance(p)) });
  assert.ok(m.events.some((e) => e.type === 'TRIGGER'), 'data: planskiftet sker');
  assert.deepEqual(m.endState.home.starters, lineup, 'kampen');
});

test('en bot med identitets-ombytning fordeles efter position ved formationsskift (som dit hold) – kun en ÆGTE ombytning bevares', () => {
  const L = league(), b = L.teams[1], byId = new Map(b.squad.map((p) => [p.id, p]));
  b.tactics.baseFormation = '4-4-2'; b.tactics.lineupSlots = bestEleven(b.squad, '4-4-2'); b.subsLimit = 0;
  for (const p of b.squad) { p.freshness = 100; p.injuryMatchesLeft = 0; }   // ingen rotation, ingen træthedsskift: slutopstillingen = skiftet
  b.tactics.conditionalRules = [{ ruleId: 1, minuteTrigger: 3, condition: 'ANY', margin: 1, newFormation: '3-4-3', newPlan: null, slotRemapping: [...Array(11).keys()], action: 'SHIFT', subOut: null, subIn: null }];
  const r = createRng(2), m = simulateMatch(L.teams[0], b, { ...r, chance: (p) => (p === 0.06 ? false : r.chance(p)) });
  const roles = FORMATIONS['3-4-3'].map((s) => s.r), xi = m.endState.away.starters.map((id) => byId.get(id) ?? null);
  assert.notDeepEqual(m.endState.away.starters, b.tactics.lineupSlots, 'data: der flyttes');
  void roles; void xi;
  const want = arrangeByFit(b.tactics.lineupSlots.map((id) => byId.get(id)), '3-4-3', '4-4-2').map((p) => p.id);
  const end = m.endState.away.starters;   // en udvist står som null – de andre pladser skal være skiftets
  assert.ok(end.filter(Boolean).length >= 10, 'data');
  assert.deepEqual(end.map((id, i) => (id ? id : want[i])), want, 'fordelt efter position (arrangeByFit), ikke bevaret');
});

test('fit-tabellen: et par, der IKKE er naboer, er "anden plads" (CB–CM, ANG–Back, DM–Kant, GK kun mod GK)', () => {
  assert.equal(fitOf('CB', 'CM'), FIT.other); assert.equal(fitOf('ST', 'LB'), FIT.other); assert.equal(fitOf('FB', 'ST'), FIT.other);
  assert.equal(fitOf('DM', 'RM'), FIT.other); assert.equal(fitOf('AM', 'CB'), FIT.other); assert.equal(fitOf('GK', 'GK'), FIT.own);
});

test('bestEleven: begge målmænd skadede – en målmand står stadig i mål (score-gulv 1), ingen markspiller', () => {
  const t = league().teams[0];
  for (const p of t.squad.filter((x) => x.position === 'GK')) p.injuryMatchesLeft = 3;
  const gk = t.squad.find((p) => p.id === bestEleven(t.squad, '4-4-2')[0]);
  assert.equal(gk.position, 'GK');
});

test('ungdom: sanitize fylder en for lille trup op med den manglende position (backs), og tilbuddene tæller med i neededPosition', async () => {
  const { neededPosition } = await import('../../public/engine/generator.js');
  const L = league(), me = L.teams[0];
  me.squad = me.squad.filter((p) => p.position !== 'FB');   // 15 tilbage, ingen backs
  const before = new Set(me.squad.map((p) => p.id));
  normalizeLeague(L);
  const added = me.squad.filter((p) => !before.has(p.id));
  assert.equal(added.length, 3, 'data: fyldt op til 18');
  assert.deepEqual(added.map((p) => [p.line, p.position]), [['DEF', 'FB'], ['DEF', 'FB'], ['DEF', 'FB']]);
  // Tilbuddene tæller med: efter en ny WM er næste MID ikke også WM
  const t = league().teams[0]; t.squad = t.squad.filter((p) => p.position !== 'WM' || p.line !== 'MID');
  const first = neededPosition(t, 'MID'); assert.equal(first, 'WM');
  // Med tre nye kanter (3 af 2 ønskede) er kanten ikke længere den mest manglende – uden tilbuddene ville svaret stadig være WM
  assert.notEqual(neededPosition(t, 'MID', [1, 2, 3].map(() => ({ line: 'MID', position: 'WM' }))), 'WM');
});

test('playerSpan: indskiftet i 1. halvlegs tillægstid (45+2) og ude igen ved pausen: ingen slutfløjt-ur (kun 2. halvleg)', () => {
  const r = { playerId: 'p', shirtNumber: 7, shortName: 'N. M', minIn: 45, minOut: 90 };
  const ev = [{ type: 'SUB', min: 45, label: '🔄 #7 N. M ind for #9 X', clock: { m: 45, plus: 2 } }, { type: 'END', min: 90, clock: { m: 90, plus: 4 } }];
  assert.deepEqual(playerSpan(ev, [r]).get('p'), { in: { m: 45, plus: 2 } });
  // og ind i 2. halvlegs tillægstid, men UDE før slut (minOut 90 med en udskiftningslinje): hans eget udminut
  const q = { ...r, minIn: 90 }, ev2 = [{ type: 'SUB', min: 90, label: '🔄 #7 N. M ind for #9 X', clock: { m: 90, plus: 1 } }, { type: 'SUB', min: 90, label: '🔄 #12 Y ind for #7 N. M', clock: { m: 90, plus: 3 } }, ev[1]];
  assert.deepEqual(playerSpan(ev2, [q]).get('p'), { in: { m: 90, plus: 1 }, out: { m: 90, plus: 3 } });
});
