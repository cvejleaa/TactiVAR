// v3.16.1 Test Manager: huller fundet ved mutation af grundbilledet (match.js tickFrame/kickoffFrame) og afsparket.
// Forfatterens tests (replay-shapes, trace-oracle) læser 80 seedede kampe og tillader enhver plads som opspiller/presser, så
// tre grene kunne fjernes/ændres med grøn suite: (1) "ude af zone"-grenen (continue springer det almindelige billede over – fjernes
// frame('press') dér, mangler hele tick'et i sporet), (2) offside-billedet skubbes fra målmanden (apartFrom med plads 0) og (3) IKKE
// fra en tom plads (on(def)), (4) afsparket med en tom plads (kickoffPositions får on). Hver test nævner, hvad den dræber.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';
import { coupledPositions, kickoffPositions, KICKOFF_Y } from '../../public/engine/positions.js';

function stubRng(script = {}, nextValue = 0.5) {
  const calls = {};
  return { next: () => nextValue, int: (a) => a, pick: (arr) => arr[0],
    chance: (p) => { const n = (calls[p] = (calls[p] ?? -1) + 1); const s = script[p]; return typeof s === 'function' ? s(n) : !!s; } };
}
const SK = (v) => ({ pace: v, stamina: v, strength: v, ballControl: v, passing: v, finishing: v, positioning: v, intercepting: v, goalkeeping: v });
// To ens hold (alle evner 10) – hjemmeholdet har bolden i hvert tick (stub-next 0,5: 4 ≥ 3,75).
function arena(fH = '4-4-2', fA = '4-4-2') {
  const L = createLeague(createRng(1));
  const [H, A] = [L.teams[0], L.teams[1]];
  for (const t of [H, A]) {
    for (const p of t.squad) { p.skills = SK(10); p.aerialPower = 10; p.counterTactics = { vsPress: 25, vsLowBlock: 25, vsTrapLong: 25 }; p.varProfile = { cynicism: 10, theatre: 10, varPulse: 10 }; p.injuryMatchesLeft = 0; p.freshness = 100; }
    t.tactics.customCoords = {}; t.tactics.conditionalRules = []; t.subsLimit = 0;
    t.tactics.lineupSlots = t.squad.slice(0, 11).map((p) => p.id);
    Object.assign(t.tactics.phases.phase1_buildUp, { passingStyle: 'BALANCED', attackFocus: 'CENTRAL', offBallRuns: 'NORMAL' });
    Object.assign(t.tactics.phases.phase2_defending, { pressingHeight: 'MID_BLOCK', offsideTrap: 'OFF', tacklingIntensity: 'NORMAL' });
    Object.assign(t.tactics.phases.phase3_transition, { onBallWon: 'KEEP_POSSESSION', onBallLost: 'DROP_BACK' });
  }
  H.tactics.baseFormation = fH; A.tactics.baseFormation = fA;
  return { H, A };
}
const slot = (t, i) => t.squad.find((p) => p.id === t.tactics.lineupSlots[i]);
// En tom plads uden udskifter: pladsen i startopstillingen peger på en spiller, der ikke findes, og bænken er tom (prepareSide).
function ghost(t, i) { const p = slot(t, i); t.squad = t.squad.filter((q) => q !== p).slice(0, 10); t.tactics.lineupSlots[i] = 'ghost'; }
const pt = (f, side, id) => f[side].find((q) => q[0] === id);

test('ude af zone: HVERT tick har sit billede, og det er en erobring (lost) – bolden hos presseren (udeholdets første midtbanespiller) – dræber frame(\'press\') i custom-grenen: fjernes kaldet, mangler alle 30 billeder (continue springer frame(none) over); frame(none) dér i stedet giver ingen lost', () => {
  const a = arena();
  a.H.tactics.customCoords = { 9: { x: 20, y: 95 } };   // en angriber 45 fra sin plads: uden for zonen (MAX_ANCHOR_RADIUS 28)
  const m = simulateMatch(a.H, a.A, stubRng({ 0.25: true }));   // alle tick: de trukne positioner vurderes
  assert.equal(m.trace.frames.length, 31);
  const presser = slot(a.A, 5).id;   // stub-pick = første midtbanespiller (LM)
  for (const f of m.trace.frames.slice(1)) {
    assert.equal(f.poss, 'h'); assert.equal(f.lost, true, `t ${f.t}`);
    assert.equal(f.run, undefined); assert.equal(f.offside, undefined);
    const q = pt(f, 'a', presser);
    assert.deepEqual(f.ball, [q[1], q[2]], `t ${f.t}: bolden hos presseren`);
  }
  assert.equal(m.events.filter((e) => e.label === 'Ude af zone').length, 30, 'data: alle 30 tick er ude-af-zone-hændelser');
});

// Offside-fælden mod en lav blok med en ENLIG angriber (5-4-1: ST x 50, trukket til 60 → 60 − 10,5 = 49,5 → 50): linjen 100 − 83 = 17,
// angriberen tegnes lige foran den (14 = 17 − 3), 3 fra stopperen (51, 17). Hans x er skubbet fra målmanden (50, 10) i coupledPositions
// (løbets y 8: 50 → 56) og skubbes i trap-grenen videre væk fra stopperen på hans nye y (56 → 57, 5,8 væk før).
function trapArena(withGhost) {
  const a = arena('5-4-1', '4-4-2');
  a.A.tactics.phases.phase2_defending.pressingHeight = 'LOW_BLOCK'; a.A.tactics.phases.phase2_defending.offsideTrap = 'NORMAL';
  a.H.tactics.customCoords = { 10: { x: 60, y: 16 } };
  for (let i = 1; i <= 10; i++) {
    Object.assign(slot(a.H, i).skills, { passing: 20, ballControl: 20 });   // hjemme har bolden, men presset (44) slår opbygningen (40)
    Object.assign(slot(a.A, i).skills, { passing: 1, ballControl: 1, intercepting: 20, positioning: 20, stamina: 20 });
  }
  if (withGhost) ghost(a.A, 2);
  const st = slot(a.H, 10).id;
  const m = simulateMatch(a.H, a.A, stubRng({ 0.48: true, 0.45: true }));
  return { a, m, st };
}

test('offside-fælden: angriberen lige foran linjen (14 = 17 − 3) står på x 57 (skubbet fra målmanden og derefter fra stopperen), bolden hos ham – dræber apartFrom i trap-grenen (x 56: stopperen 5,8 væk) og trap-grenen uden skub', () => {
  const { m, st } = trapArena(false);
  assert.equal(m.trace.frames.length, 31);
  const fr = m.trace.frames.slice(1);
  assert.equal(fr.filter((f) => f.offside).length, 30, 'data: alle tick er offside-fælder');
  for (const f of fr) {
    assert.deepEqual(pt(f, 'h', st), [st, 57, 14], `t ${f.t}`);
    assert.deepEqual(f.ball, [57, 14]);
    assert.deepEqual(pt(f, 'a', 'plr_t1_1').slice(1), [50, 10], 'målmanden står, hvor han stod');
  }
});

test('offside-fælden med en TOM plads i forsvaret (stopper 2, uden udskifter): angriberen skubbes ikke fra hans spøgelse – x 56, ikke 57 – dræber on(def) → ingen filtrering / on(att) i trap-grenen', () => {
  const { m, st, a } = trapArena(true);
  assert.equal(a.A.tactics.lineupSlots[2], 'ghost');
  const fr = m.trace.frames.slice(1);
  assert.equal(fr.filter((f) => f.offside).length, 30);
  for (const f of fr) {
    assert.equal(f.a.length, 10, 'data: udeholdet er en mand kort');
    assert.deepEqual(pt(f, 'h', st), [st, 56, 14], `t ${f.t}`);
    assert.deepEqual(f.ball, [56, 14]);
  }
});

test('afsparket med en tom plads: pladsen tæller ikke som "forreste" – 5-4-1 uden angriberen (kickoffPositions får on): midtbanens kanter på KICKOFF_Y (53), ikke angriberen – dræber on-argumentet i kickoffFrame for begge hold', () => {
  const a = arena('5-4-1', '5-4-1');
  ghost(a.H, 10); ghost(a.A, 10);
  const m = simulateMatch(a.H, a.A, stubRng({}));
  const f = m.trace.frames[0];
  assert.deepEqual(f.h.map((q) => q.slice(1)), [[50, 90], [12, 64], [30, 73], [50, 75], [70, 73], [88, 64], [15, 53], [38, 56], [62, 56], [85, 53]]);
  assert.deepEqual(f.a.map((q) => q.slice(1)), [[50, 10], [88, 36], [70, 27], [50, 25], [30, 27], [12, 36], [85, 47], [62, 44], [38, 44], [15, 47]]);   // spejlet
  assert.equal(f.h.length, 10); assert.equal(f.a.length, 10);
  assert.equal(Math.min(...f.h.slice(1).map((q) => q[2])), KICKOFF_Y);
  // uden on: den manglende angriber (raw 18) var forreste og trak hele holdet 53 → midtbanen 60/61
  const withGhostCounted = kickoffPositions(a.H.tactics).slice(1, 10).map((q) => q.y);
  assert.notDeepEqual(withGhostCounted, f.h.slice(1).map((q) => q[2]));
});

// --- TM-fund v3.16.1, rettet i koden (KICKOFF_OWN; apartFrom for det fangede hold ved målmanden) ---

// Afsparket: brugeren trækker et holds bagkæde op på y 62 og angriberne til y 20 – alle inden for deres zone (ikke straffet). MIN_DEPTH (18)
// i kickoffPositions sænker så 'to' fra 53 til 62 − 18 = 44: angriberne står i MODSTANDERENS halvdel ved afspark.
test('afsparket: et højt trukket hold står stadig i egen halvdel (alle y ≥ 50)', () => {
  const t = { baseFormation: '4-4-2', phases: { phase2_defending: { pressingHeight: 'MID_BLOCK' } },
    customCoords: { 1: { x: 15, y: 62 }, 2: { x: 38, y: 62 }, 3: { x: 62, y: 62 }, 4: { x: 85, y: 62 }, 5: { x: 15, y: 40 }, 6: { x: 38, y: 40 }, 7: { x: 62, y: 40 }, 8: { x: 85, y: 40 }, 9: { x: 40, y: 20 }, 10: { x: 60, y: 20 } } };
  const ys = kickoffPositions(t).slice(1).map((q) => q.y);
  assert.ok(ys.every((y) => y >= 50), ys.join(','));
});

// Erobring (caught): holdet, der mistede bolden, står i angrebsform, og dets enlige angriber (x 50) står på y 10 – PRÆCIS på den
// modsatte målmand (løb Normal, afstand 0) eller 2 fra ham (løb Mange: y 8). apartFrom skubber kun BOLDHOLDETS markspillere, og
// målmanden (plads 0) er ikke blandt dem → en brik oven i en anden. 19 af 2480 billeder (0,77 %) i replay-shapes' 80 kampe (alle
// 'lost', alle x 50) – lige under dens grænse på 1 %, så båndet ser det ikke.
test('erobring (caught): modstanderens forreste står ikke oven i boldholdets målmand (afstand ≥ 4)', () => {
  for (const f of ['4-3-3', '3-4-3', '4-2-3-1', '5-4-1', '4-1-4-1', '4-4-1-1']) for (const runs of ['NORMAL', 'MANY']) {
    const T = (p) => ({ baseFormation: f, customCoords: {}, phases: { phase1_buildUp: { offBallRuns: runs }, phase2_defending: { pressingHeight: p } } });
    const k = coupledPositions(T('MID_BLOCK'), T('MID_BLOCK'), { ballX: 50, caught: true });
    const gk = k.ball[0];
    for (let i = 1; i < 11; i++) assert.ok(Math.hypot(gk.x - (100 - k.opp[i].x), gk.y - (100 - k.opp[i].y)) >= 4, `${f} ${runs}: angriber ${i} (${k.opp[i].x}, ${k.opp[i].y}) oven i målmanden (${gk.x}, ${gk.y})`);
  }
});
