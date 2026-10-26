// v3.20.0: DM og "uden for position koster" – tabellen, fordelingen efter position og det målte bånd (tools/measure-position.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitOf, FIT, positionOfRole, arrangeByFit, FORMATIONS } from '../../public/engine/formations.js';
import { createLeague } from '../../public/engine/generator.js';
import { bestEleven } from '../../public/engine/career.js';
import { createRng } from '../../public/engine/rng.js';
import * as act from '../../public/state/actions.js';

test('fit-tabellen: egen plads 1, naboplads 0,975, anden markplads 0,94, målmand ⇄ markspiller 0,85 (begge veje)', () => {
  assert.deepEqual(FIT, { own: 1, near: 0.975, other: 0.94, keeper: 0.85 });
  assert.equal(fitOf('DM', 'CDM'), 1); assert.equal(fitOf('WM', 'LW'), 1); assert.equal(fitOf('FB', 'RWB'), 1); assert.equal(fitOf('AM', 'CF'), 1);
  for (const [a, b] of [['CB', 'FB'], ['CB', 'DM'], ['FB', 'WM'], ['DM', 'CM'], ['CM', 'AM'], ['CM', 'WM'], ['AM', 'ST'], ['AM', 'WM'], ['WM', 'ST']]) {
    const roleOf = (pos) => Object.keys(FORMATIONS).flatMap((f) => FORMATIONS[f].map((s) => s.r)).find((r) => positionOfRole(r) === pos);
    assert.equal(fitOf(a, roleOf(b)), FIT.near, `${a} på ${b}`); assert.equal(fitOf(b, roleOf(a)), FIT.near, `${b} på ${a}`);
  }
  assert.equal(fitOf('ST', 'CB'), FIT.other); assert.equal(fitOf('DM', 'ST'), FIT.other); assert.equal(fitOf('FB', 'CM'), FIT.other);
  assert.equal(fitOf('GK', 'CB'), FIT.keeper); assert.equal(fitOf('CB', 'GK'), FIT.keeper);
  assert.equal(fitOf(undefined, 'CB'), 1);   // ukendt position (gammelt gem før sanitize) straffes ikke
});

test('ny liga: dit 4-4-2 står uden én spiller uden for position, botterne højst 10 % (v3.19: 18 af 77 = 23 %), og ingen rask STAR bænkes', () => {
  for (const seed of [3, 9, 21]) {
    const L = createLeague(createRng(seed));
    let out = 0, n = 0;
    for (const t of L.teams) {
      const roles = FORMATIONS[t.tactics.baseFormation].map((s) => s.r), xi = t.tactics.lineupSlots.map((id) => t.squad.find((p) => p.id === id));
      const bad = xi.filter((p, i) => fitOf(p.position, roles[i]) < 1).length;
      if (!t.isBot) assert.equal(bad, 0, `dit hold seed ${seed}`); else { out += bad; n += 11; }
      for (const p of t.squad.filter((x) => x.roleTier === 'STAR')) assert.ok(t.tactics.lineupSlots.includes(p.id), `${t.name}: STAR ${p.shortName} på bænken`);
    }
    assert.ok(out / n <= 0.1, `seed ${seed}: ${out} af ${n}`);
  }
});

test('arrangeByFit: de samme 11 – målmanden i mål, flest på egen plads, og ved lighed på samme side (LB → LM, ikke RM)', () => {
  const t = createLeague(createRng(3)).teams[0], byId = new Map(t.squad.map((p) => [p.id, p]));
  const xi = t.tactics.lineupSlots.map((id) => byId.get(id));
  const to = arrangeByFit(xi, '3-4-3', '4-4-2'), roles = FORMATIONS['3-4-3'].map((s) => s.r);
  assert.deepEqual(to.map((p) => p.id).sort(), xi.map((p) => p.id).sort());
  assert.equal(to[0], xi[0]);
  // 4-4-2 → 3-4-3: 3 CB-pladser til 2 CB + en back; den anden back på kanten. LB (plads 1) må ikke ende på højre side
  const lb = xi[1], rb = xi[4], where = (p) => roles[to.indexOf(p)];
  assert.ok(!where(lb).startsWith('R') && !where(rb).startsWith('L'), `LB → ${where(lb)}, RB → ${where(rb)}`);
  const fits = (arr, form) => arr.filter((p, i) => fitOf(p.position, FORMATIONS[form][i].r) === 1).length;
  assert.ok(fits(to, '3-4-3') > fits(xi, '3-4-3'), `${fits(to, '3-4-3')} på egen plads mod ${fits(xi, '3-4-3')} uden fordeling`);
});

test('bestEleven: stjerner vejer tungere end en naboplads – en STAR CM spiller CDM frem for en ROTATION DM', () => {
  const t = createLeague(createRng(3)).teams[0], star = t.squad.find((p) => p.roleTier === 'STAR' && p.line === 'MID'), dm = t.squad.find((p) => p.position === 'DM');
  const ids = bestEleven(t.squad, '4-2-3-1'), roles = FORMATIONS['4-2-3-1'].map((s) => s.r);
  assert.ok(ids.includes(star.id) && roles[ids.indexOf(star.id)] === 'CDM', `STAR på ${roles[ids.indexOf(star.id)]}`);
  assert.ok(!ids.includes(dm.id), 'ROTATION-DM\'en sidder over');
});

test('formationsskift i Taktik fordeler de 11 efter position; "Stil op efter position" retter en ombytning og melder, om noget flyttede', () => {
  const t = createLeague(createRng(3)).teams[0], before = t.tactics.lineupSlots.slice();
  assert.equal(act.arrangeLineup(t), false, 'står allerede bedst');
  [t.tactics.lineupSlots[1], t.tactics.lineupSlots[9]] = [t.tactics.lineupSlots[9], t.tactics.lineupSlots[1]];   // LB ⇄ ST
  assert.equal(act.arrangeLineup(t), true);
  assert.deepEqual(t.tactics.lineupSlots, before);
  act.setFormation(t, '4-2-3-1');
  const roles = FORMATIONS['4-2-3-1'].map((s) => s.r), xi = t.tactics.lineupSlots.map((id) => t.squad.find((p) => p.id === id));
  assert.deepEqual([...t.tactics.lineupSlots].sort(), [...before].sort(), 'de samme 11');
  assert.ok(xi.filter((p, i) => fitOf(p.position, roles[i]) < 1).length <= 3);
});

// tools/measure-position.mjs (100 seeds = 1400 kampe): dit hold med 8 mand byttet inden for kæden (LB↔CB, CB↔RB, LM↔CM, CM↔RM).
// Ombytningen koster i v3.19.0 0,51 mål pr. kamp (rollerne alene) – v3.20.0: 0,85 (4200 kampe; 0,94 ved 1400) – positionsstraffen
// oveni ombytningen med v3.20-opstillingerne (uden straf: 0,56) er 0,29 (formations.js). Botternes
// startere uden for position: v3.19.0-opstillingerne 23 %, nu 8 %. Dit holds andel af ligaens point: v3.19.0 0,127, nu 0,12–0,14.
test('målt: 8 mand på naboplads koster mere end ombytningen selv (≤ −0,68 mål pr. kamp; v3.19: −0,51), og balancen holder', async () => {
  const { measurePosition } = await import('../../tools/measure-position.mjs');
  const r = await measurePosition(100);
  assert.ok(r.games >= 1400, `data: ${r.games}`);
  assert.ok(r.delta <= -0.68 && r.delta >= -1.2, `ombyttet ${r.delta}`);   // nedre grænse: en for hård straf (fx fit to gange) er også en fejl (QC K5)
  assert.ok(r.botOutOfPos <= 0.12, `botter uden for position ${r.botOutOfPos}`);
  assert.ok(r.myPointShare >= 0.10 && r.myPointShare <= 0.16, `dit holds andel ${r.myPointShare}`);
});

test('Hvis-Så til den formation, du spiller (med trukne positioner): kun trækkene nulstilles – din bevidste opstilling rokeres ikke (QC K1)', async () => {
  const { simulateMatch } = await import('../../public/engine/match.js');
  const L = createLeague(createRng(4)), me = L.teams[0];
  [me.tactics.lineupSlots[1], me.tactics.lineupSlots[9]] = [me.tactics.lineupSlots[9], me.tactics.lineupSlots[1]];   // bevidst: ANG på LB
  const lineup = me.tactics.lineupSlots.slice();
  me.tactics.customCoords = { 5: { x: 20, y: 40 } };
  me.tactics.conditionalRules = [{ ruleId: 1, minuteTrigger: 3, condition: 'ANY', margin: 1, newFormation: '4-4-2', newPlan: null, slotRemapping: [...Array(11).keys()], action: 'SHIFT', subOut: null, subIn: null }];
  const rng = createRng(2), m = simulateMatch(me, L.teams[1], { ...rng, chance: (p) => (p === 0.06 ? false : rng.chance(p)) });
  assert.ok(m.events.some((e) => e.type === 'TRIGGER'), 'data: reglen udløses');
  assert.deepEqual(m.endState.home.customCoords, {});
  assert.deepEqual(m.endState.home.starters, lineup);
  // Med en ANDEN formation fordeles de: ANG'en står ikke længere på en back-plads
  me.tactics.conditionalRules[0].newFormation = '4-3-3';
  const r2 = createRng(2), m2 = simulateMatch(me, L.teams[1], { ...r2, chance: (p) => (p === 0.06 ? false : r2.chance(p)) });
  const st = me.squad.find((p) => p.id === lineup[1]), roles = FORMATIONS['4-3-3'].map((s) => s.r);
  assert.ok(!['LB', 'RB'].includes(roles[m2.endState.home.starters.indexOf(st.id)]), `ANG på ${roles[m2.endState.home.starters.indexOf(st.id)]}`);
});
