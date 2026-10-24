// Test Manager v3.12.1: huller fundet ved mutation af levende positioner, langskuds-reglen, modtager-
// konteksten og øjebliksbilledet ved mål. Hver test nævner, hvilken mutation den dræber.
// Forventede positioner står som BOGSTAVER (ikke kun livePositions() mod sig selv): ST trukket til
// (40, 28) står med bolden på (40, 22) = 28 − ADVANCE.ATT 6; en markspiller trukket til (50, 95)
// står med bolden på (50, 75) = 95 − 20 (back) og uden bolden/lav blok på (50, 95) (klemt ved 95).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch as simLive } from '../../public/engine/match.js';
import { livePositions, ADVANCE, RUNS_PUSH, SHAPE, BALL_PULL, FRONT_LIMIT, RUN_STEP } from '../../public/engine/positions.js';
// v3.13: friskheden falder i kampen (freshness.js). Denne fils tærskler forudsætter fuld friskhed hele
// kampen, så friskhed i kampen slås fra her – de nye tests i fatigue.test.mjs prøver den slået TIL.
const simulateMatch = (h, a, r, o = {}) => simLive(h, a, r, { liveEnergy: false, ...o });

// chance(p) afgøres af script[p] (true/false eller (n) => bool med nummeret på kaldet); next() er konstant.
function stubRng(script = {}, nextValue = 0.5) {
  const calls = {};
  return {
    next: () => nextValue,
    int: (a) => a,
    pick: (arr) => arr[0],
    chance: (p) => { const n = (calls[p] = (calls[p] ?? -1) + 1); const s = script[p]; return typeof s === 'function' ? s(n) : !!s; },
  };
}
const SK = (v) => ({ pace: v, stamina: v, strength: v, ballControl: v, passing: v, finishing: v, positioning: v, intercepting: v, goalkeeping: v });
const prep = (t) => {
  for (const p of t.squad) {
    p.skills = SK(10); p.aerialPower = 10; p.counterTactics = { vsPress: 25, vsLowBlock: 25, vsTrapLong: 25 };
    p.varProfile = { cynicism: 10, theatre: 10, varPulse: 10 }; p.injuryMatchesLeft = 0;
  }
  t.tactics.baseFormation = '4-4-2'; t.tactics.customCoords = {}; t.tactics.conditionalRules = []; t.subsLimit = 0; /* v3.13: ingen træthedsskift i test-arenaen */
  t.tactics.lineupSlots = t.squad.slice(0, 11).map((p) => p.id);
};
function arena({ home = {}, away = {} } = {}) {
  const L = createLeague(createRng(1));
  const [H, A] = [L.teams[0], L.teams[1]];   // H er dit hold (ikke bot), A er en bot
  for (const t of [H, A]) prep(t);
  const setPhases = (t, o) => {
    const ph = t.tactics.phases;
    Object.assign(ph.phase1_buildUp, { passingStyle: 'BALANCED', attackFocus: 'CENTRAL', offBallRuns: 'NORMAL' }, o.p1);
    Object.assign(ph.phase2_defending, { pressingHeight: 'MID_BLOCK', offsideTrap: 'OFF', tacklingIntensity: 'NORMAL' }, o.p2);
    Object.assign(ph.phase3_transition, { onBallWon: 'KEEP_POSSESSION', onBallLost: 'DROP_BACK' }, o.p3);
  };
  setPhases(H, home); setPhases(A, away);
  return { L, H, A };
}
const slot = (t, i) => t.squad.find((p) => p.id === t.tactics.lineupSlots[i]);
// Alle markspillere sættes langt væk (y 95); de udvalgte pladser trækkes derhen, man vil have. v3.16.1: hver sin x (14, 22, …, 86 – 8 fra
// hinanden ≥ MIN_APART 6, også efter boldsidens ±11,4), så de ikke står oven i hinanden og skubbes på tværs (spread) – billedet er så
// formens egne tal. (Før stod alle ni på (50, 95).)
const FAR = (i) => ({ x: 14 + 8 * (i - 1), y: 95 });
function layout(t, spots) { t.tactics.customCoords = {}; for (let i = 1; i <= 10; i++) t.tactics.customCoords[i] = spots[i] ?? FAR(i); }
const goalEvents = (m, ...types) => m.events.filter((e) => types.includes(e.type));
const mids = (t) => [5, 6, 7, 8].map((i) => slot(t, i));
function mine({ spots, home = {}, away = {}, script = {}, next = 0.5, setup = null } = {}) {
  const a = arena({ home, away });
  layout(a.H, spots);
  for (const p of mids(a.A)) p.skills.intercepting = 1;
  slot(a.A, 0).skills.goalkeeping = 1;
  if (setup) setup(a);
  const m = simulateMatch(a.H, a.A, stubRng({ 0.48: true, 0.3: true, ...script }, next));
  return { a, m };
}
const shots = (n) => (k) => k < n;
// ---------- Øjebliksbilledet ved mål (match.js snapshot) ----------
// ids i pladsrækkefølge 0..10 og forventede punkter [id, x, y]
const ids = (t) => [...Array(11).keys()].map((i) => slot(t, i).id);
const pts = (t, xy) => ids(t).map((id, i) => [id, ...xy[i]]);
test('dit mål (kombination): billedet har ALLE 11 pladser med de levende koordinater, scorer og oplæg, bolden på (50,20) – dræber snapshot-mutationerne pts/scorer/assist/ball/formation/events[0]', () => {
  const { a, m } = mine({ spots: { 9: { x: 40, y: 28 } } });
  const evs = goalEvents(m, 'GOAL');
  assert.ok(evs.length >= 25 && evs.every((e) => e.snapshot), 'hvert mål i åbent spil har et billede');
  const snap = evs[0].snapshot, g = (i) => slot(a.H, i).id;
  // GK uændret (50,90); back 95−20 = 75; CB 95−14 = 81; midtbane 95−16 = 79; ST2 95−6 = 89, x fra FAR (14, 22, …, 86). ST1 28−6 = 22
  // presses v3.16.1 sammen til offside-linjen: modstanderens stopper i mellemblok på y 73 → linje 100 − 73 = 27, + ONSIDE_GAP 1 = 28; de
  // andre ligger bag 28 + 12 og står. Oven i en modspiller skubbes man 6 på tværs (apartFrom): ST1 (40, 28) fra stopperen (spejlet (38, 27))
  // → 44; botten (ønsket 100 − 89 + 10 = 21) har angriberne spejlet på (62, 79) og (38, 79): plads 4 (38, 75) → 44, plads 7 (62, 79) → 68
  const want = pts(a.H, [[50, 90], [14, 75], [22, 81], [30, 81], [44, 75], [46, 79], [54, 79], [68, 79], [70, 79], [44, 28], [86, 89]]);
  assert.deepEqual(snap, { attacking: true, formation: '4-4-2', pts: want, scorer: g(9), assist: g(5), ball: [50, 20] });
  // Billedet hænger på målets egen hændelse (ikke den første i kampen) – alle andre hændelser har intet
  assert.ok(m.events.filter((e) => e.snapshot).every((e) => e.type === 'GOAL') && m.events[0].snapshot === undefined);
});
test('oplægsgiveren markeres ikke, når han selv scorer (helper === scorer) – dræber assist-vagten helper !== scorer', () => {
  // LM (plads 5) er både første midtbane (oplægsgiver) og den, der står nærmest: kombination uden eget oplæg
  const { a, m } = mine({ spots: { 5: { x: 50, y: 20 } } });
  const e = goalEvents(m, 'GOAL')[0];
  assert.equal(e.snapshot.scorer, slot(a.H, 5).id);
  assert.equal(e.snapshot.assist, null);
});
test('hovedstødsmål: bolden på (50,16), bold-siden (88) rykker holdet 11 mod højre, scorer og indlægsgiver – og et dødbolds-hovedstød har intet billede', () => {
  const { a, m } = mine({ spots: { 9: { x: 40, y: 28 } }, home: { p1: { attackFocus: 'HIGH_CROSSES' } }, script: { 0.52: true } });
  const e = goalEvents(m, 'HEADER_GOAL')[0];
  // x = x + (88 − 50)·0,3 = +11,4 → 14 → 25, 22 → 33, …, 86 → 97; GK står. Botten (bold 12: −11,4) har angriberne spejlet på (73, 79) og
  // (49, 79): plads 4 (49, 75) → 55, plads 7 (73, 79) → 79. v3.13 (brugerens eksempel): aktørerne står, hvor hændelsen var – indlæggeren
  // ude på kanten (88, 14), hovedstødsspilleren (plads 9) i feltet (50, 16). Indlæggeren er plads 6: lodtrækningen (0,5) over vægtene
  // exp(−afstand/16) til (88, 30) når halvdelen ved plads 6 (65, 79).
  assert.deepEqual(e.snapshot, { attacking: true, formation: '4-4-2', pts: pts(a.H, [[50, 90], [25, 75], [33, 81], [41, 81], [55, 75], [57, 79], [88, 14], [79, 79], [81, 79], [50, 16], [97, 89]]),
    scorer: slot(a.H, 9).id, assist: slot(a.H, 6).id, ball: [50, 16] });
  // Frisparksindlæg (dødbold): header-mål uden billede – kun åbent spil har billede (§3)
  const f = mine({ spots: { 9: { x: 40, y: 28 } }, script: { 0.061: true, 0.37: false }, setup: (b) => { for (const q of b.H.squad) q.aerialPower = 40; } });
  const sp = goalEvents(f.m, 'HEADER_GOAL');
  assert.ok(sp.length >= 2 && f.m.goalsPool.every((x) => x.kind === 'SETPIECE') && sp.every((x) => x.snapshot === undefined));
});
test('cutback-mål: bolden på (50,28) (ikke 20), oplægget er kantspilleren, holdet står mod boldsiden (88)', () => {
  const { a, m } = mine({ spots: { 9: { x: 40, y: 28 } }, home: { p1: { attackFocus: 'LOW_CUTBACKS' } }, script: { 0.38: true } });
  const e = goalEvents(m, 'GOAL')[0];
  assert.deepEqual(e.snapshot.ball, [50, 28]);
  // kantspilleren er plads 8: ingen inden for rækkevidden, og lodtrækningen (0,5) over vægtene til (88, 30) – nu også angriberen på
  // (55, 28) – når halvdelen ved plads 8 (81, 79)
  assert.equal(e.snapshot.scorer, slot(a.H, 9).id); assert.equal(e.snapshot.assist, slot(a.H, 8).id);
  // v3.13: kantspilleren (plads 8) ved baglinjen (88, 6), scoreren (plads 9) på pletten (50, 28) – resten i holdets form, +11,4 mod boldsiden
  // (som hovedstødsmålet: plads 4 → 55, plads 7 → 79 væk fra bottens angribere)
  assert.deepEqual(e.snapshot.pts.map(([, x]) => x), [50, 25, 33, 41, 55, 57, 65, 79, 88, 50, 97]);
  assert.deepEqual([e.snapshot.pts[8].slice(1), e.snapshot.pts[9].slice(1)], [[88, 6], [50, 28]]);
});
// QC-rettelsen (69dc916): kontramål får også billede – dit hold i angrebsform, når du mister bolden fremme.
test('straffe giver intet billede; kontramål giver – for dig med scorer, imod dig uden', () => {
  const pen = mine({ spots: { 9: { x: 40, y: 28 } }, script: { 0.011: true, 0.3: false } });
  assert.ok(pen.m.goalsPool.length >= 25 && pen.m.goalsPool.every((g) => g.kind === 'PENALTY'));
  assert.ok(goalEvents(pen.m, 'GOAL').every((e) => e.snapshot === undefined));
  // Kontra: både et kontramål FOR og IMOD dig
  for (const youCounter of [false, true]) {
    const b = arena(); layout(b.H, { 9: { x: 40, y: 28 } }); layout(b.A, { 9: { x: 40, y: 28 } });
    const [att, def] = youCounter ? [b.A, b.H] : [b.H, b.A];
    for (const q of mids(att)) q.skills.passing = 11;           // angriberen har bolden
    for (const q of mids(def)) q.skills.intercepting = 20;      // forsvaret vinder presset hver gang og kontrer (NORMAL · Fald tilbage · Hold på bolden: 3,2 %)
    slot(att, 0).skills.goalkeeping = 1; slot(def, 0).skills.goalkeeping = 1;
    const cm = simulateMatch(b.H, b.A, stubRng({ 0.48: true, 0.032: true }));
    const cg = goalEvents(cm, 'GOAL').filter((e) => /KONTRA/.test(e.text));
    assert.ok(cg.length >= 20 && cm.goalsPool.every((g) => g.kind === 'COUNTER'), `${cg.length} kontramål, ${cm.goalsPool.map((g) => g.kind).join()}`);
    assert.equal(youCounter ? cm.homeGoals > 20 : cm.awayGoals > 20, true, 'hvem kontrer');
    assert.ok(cg.every((e) => e.snapshot && e.snapshot.attacking === youCounter && (youCounter ? e.snapshot.scorer !== null : e.snapshot.scorer === null) && e.snapshot.pts.every(([id]) => b.H.squad.some((p) => p.id === id))), youCounter ? 'dit kontramål' : 'kontramål imod');
  }
});
// v3.15.1: VAR-chancetypen (VAR_GOAL) findes ikke mere – billedet ved et VAR-tjek af en holdkammerat (den tjekkede forrest,
// skytten bag ham) er bevist i var-front.test.mjs på seedede kampe med tvunget tjek.

// Mål imod: KUN dit eget forsvar gemmes (anti-spionage §3) – modstanderens positioner røber pres og løb
function against({ focus = 'CENTRAL', script = {}, press = 'LOW_BLOCK' } = {}) {
  const a = arena({ away: { p1: { attackFocus: focus } }, home: { p2: { pressingHeight: press } } });
  layout(a.H, { 9: { x: 40, y: 28 } });
  a.A.tactics.baseFormation = '3-5-2';   // botten har en ANDEN formation end dig – billedet viser din (4-4-2)
  layout(a.A, { 9: { x: 30, y: 28 }, 10: { x: 70, y: 28 } });   // og står ANDRE steder – ses de i billedet, røbes de
  for (const p of mids(a.H)) p.skills.intercepting = 1;
  slot(a.H, 0).skills.goalkeeping = 1;
  const m = simulateMatch(a.A, a.H, stubRng({ 0.48: true, 0.3: true, ...script }));
  return { a, m, snap: goalEvents(m, 'GOAL', 'HEADER_GOAL', 'VAR_GOAL').find((e) => e.snapshot)?.snapshot };
}
// v3.16.1 (sammenpresning): dit forsvar presses sammen efter dit pres – de forreste PRESS_GAP.LOW_BLOCK 20 foran modstanderens
// dybeste markspiller. Botten (3-5-2, alle andre trukket til y 95) har stopperne på 95 − 14 = 81 → ønsket 100 − 81 + 20 = 39 (MIN_DEPTH:
// 95 − 18 = 77 begrænser ikke); din forreste (ST 28 + 10 = 38) → 39, alle andre (95) ligger bag 39 + 12 og står.
test('mål imod (åbent spil): dit forsvar i lav blok (alle +10, ST 28 + 10 = 38, presset til 39 – 20 foran bottens stoppere på 81), ingen scorer/oplæg, bolden spejlet (50,80), ingen af modstanderens spillere i billedet', () => {
  const { a, m, snap } = against();
  assert.ok(m.homeGoals >= 25 && snap);
  // ST: før 38 (livePositions), nu 39 (seen[mine] fra coupledPositions); x fra FAR (14, 22, …, 86)
  assert.deepEqual(snap, { attacking: false, formation: '4-4-2', pts: pts(a.H, [[50, 90], [14, 95], [22, 95], [30, 95], [38, 95], [46, 95], [54, 95], [62, 95], [70, 95], [40, 39], [86, 95]]), scorer: null, assist: null, ball: [50, 80] });
  const enemy = a.A.squad.map((p) => p.id);
  assert.ok(!enemy.some((id) => JSON.stringify(snap).includes(id)), 'modstanderens spiller-id i billedet');
});
test('mål imod på et indlæg fra højre (bold 88): dit forsvar forskydes mod den SPEJLEDE boldside (12 → −11,4) og bolden spejles til (50,84)', () => {
  const { a, snap } = against({ focus: 'HIGH_CROSSES', script: { 0.52: true } });
  // y som i testen ovenfor: ST 38 presset til 39; x − 11,4: 14 → 2,6 → klemt 3, 22 → 11, …, 86 → 75, ST 40 → 29 (mod 88: +11,4 → 25, …, 51)
  assert.deepEqual(snap.pts, pts(a.H, [[50, 90], [3, 95], [11, 95], [19, 95], [27, 95], [35, 95], [43, 95], [51, 95], [59, 95], [29, 39], [75, 95]]));
  assert.deepEqual([snap.attacking, snap.scorer, snap.assist, snap.ball], [false, null, null, [50, 84]]);
});
test('bot mod bot: ingen billeder (der er intet hold at vise) og ingen fejl', () => {
  const { m } = mine({ spots: { 9: { x: 40, y: 28 } }, setup: (a) => { a.H.isBot = true; } });
  assert.ok(m.goalsPool.length >= 25 && goalEvents(m, 'GOAL').length >= 25, 'testen har data');
  assert.ok(m.events.every((e) => e.snapshot === undefined));
});

// ---------- positions.js: luk hullerne (alle forventninger er bogstavelige tal) ----------
const tac = (o = {}, runs = 'NORMAL', press = 'MID_BLOCK') => ({ baseFormation: '4-4-2', customCoords: {}, phases: { phase1_buildUp: { offBallRuns: runs }, phase2_defending: { pressingHeight: press } }, ...o });
const xy = (arr) => arr.map(([x, y]) => ({ x, y }));
test('konstanterne står som i dokumentet (RUN_STEP 12, FRONT_LIMIT 8, BALL_PULL 0,3, RUNS_PUSH, SHAPE) – dræber RUN_STEP=13 og de øvrige konstantmutationer, positions.test.mjs kun tjekker dem mod sig selv', () => {
  assert.deepEqual([RUN_STEP, FRONT_LIMIT, BALL_PULL], [12, 8, 0.3]);
  assert.deepEqual(RUNS_PUSH, { FEW: -2, NORMAL: 0, MANY: 6 });
  assert.deepEqual(ADVANCE, { CB: 14, FB: 20, MID: 16, ATT: 6 });
  assert.deepEqual(SHAPE, { LOW_BLOCK: { all: 10, front: 0 }, MID_BLOCK: { all: 0, front: 0 }, HIGH_GEGENPRESS: { all: 0, front: -12 } });
});
test('3-5-2 med bolden og Mange løb: wingbacks 20 frem + 6 (LWB og RWB hver for sig), CDM 16 + 6, CAM 16 (ikke i RUNS_ROLES), ST 6 + 6 klemt ved 8 – dræber FB-sættet uden LWB/RWB', () => {
  const p = livePositions(tac({ baseFormation: '3-5-2' }, 'MANY'), { attacking: true });
  assert.deepEqual(p, xy([[50, 90], [25, 58], [50, 60], [75, 58], [12, 20], [38, 32], [62, 32], [88, 20], [50, 20], [38, 8], [62, 8]]));
});
test('4-4-1-1 med bolden og Mange løb: CF er angriber (6) og løber (6) → 30 − 12 = 18; ST 15 − 12 = 3 klemt ved 8', () => {
  const p = livePositions(tac({ baseFormation: '4-4-1-1' }, 'MANY'), { attacking: true });
  assert.deepEqual([p[9], p[10]], xy([[50, 18], [50, 8]]));
});
test('uden bold, alle ti pladser: højt gegenpres skubber midtbane og angreb 12 frem men IKKE backerne (4-4-2) eller wingbacks (3-5-2); lav blok 10 tilbage for alle – dræber "kun CB fritaget"', () => {
  assert.deepEqual(livePositions(tac({}, 'NORMAL', 'HIGH_GEGENPRESS'), { attacking: false }),
    xy([[50, 90], [15, 70], [38, 73], [62, 73], [85, 70], [15, 33], [38, 36], [62, 36], [85, 33], [38, 8], [62, 8]]));
  assert.deepEqual(livePositions(tac({ baseFormation: '3-5-2' }, 'NORMAL', 'HIGH_GEGENPRESS'), { attacking: false }),
    xy([[50, 90], [25, 72], [50, 74], [75, 72], [12, 46], [38, 42], [62, 42], [88, 46], [50, 24], [38, 8], [62, 8]]));
  assert.deepEqual(livePositions(tac({}, 'NORMAL', 'LOW_BLOCK'), { attacking: false }),
    xy([[50, 90], [15, 80], [38, 83], [62, 83], [85, 80], [15, 55], [38, 58], [62, 58], [85, 55], [38, 30], [62, 30]]));
});
test('målmanden står i målet uanset boldside; x klemmes 3–97 begge veje (bold 0 og 100) – dræber GK-skift og clamp x 97→100', () => {
  const right = livePositions(tac(), { attacking: true, ballX: 100 }), left = livePositions(tac(), { attacking: true, ballX: 0 });
  assert.deepEqual([right[0], left[0]], xy([[50, 90], [50, 90]]));
  // 15 + 15 = 30, 85 + 15 = 100 → 97; 15 − 15 = 0 → 3, 85 − 15 = 70
  assert.deepEqual(right.map((q) => q.x), [50, 30, 53, 77, 97, 30, 53, 77, 97, 53, 77]);
  assert.deepEqual(left.map((q) => q.x), [50, 3, 23, 47, 70, 3, 23, 47, 70, 23, 47]);
});
test('y klemmes ved 95 bagtil (lav blok på en spiller trukket til y 88 → 95, ikke 98 eller 90) og ved FRONT_LIMIT 8 fortil', () => {
  const low = livePositions(tac({ customCoords: { 1: { x: 15, y: 88 } } }, 'NORMAL', 'LOW_BLOCK'), { attacking: false });
  assert.equal(low[1].y, 95);
  const high = livePositions(tac({ customCoords: { 9: { x: 38, y: 12 } } }), { attacking: true });
  assert.equal(high[9].y, 8);
});
test('afrunding: trukne pladser med decimaler rundes til nærmeste heltal i x og y (.4 ned, .6 op) – dræber floor, ceil og ingen afrunding', () => {
  const p = livePositions(tac({ customCoords: { 9: { x: 40.6, y: 28.4 }, 10: { x: 60.4, y: 28.6 } } }), { attacking: true });
  // y: 28,4 − 6 = 22,4 → 22; 28,6 − 6 = 22,6 → 23. x: 40,6 → 41; 60,4 → 60
  assert.deepEqual([p[9], p[10]], xy([[41, 22], [60, 23]]));
});
test('ukendt formation, manglende faser og ukendte valg falder tilbage til 4-4-2, ingen ekstra løb og mellemblok – dræber fallbacks (?? 3, ?? LOW_BLOCK, uden 4-4-2)', () => {
  const base = livePositions(tac(), { attacking: true });
  assert.deepEqual(livePositions({ baseFormation: 'ukendt', customCoords: {}, phases: {} }, { attacking: true }), base);
  assert.deepEqual(livePositions(tac({}, 'UKENDT'), { attacking: true }), base);
  assert.deepEqual(livePositions({ baseFormation: '4-4-2', phases: {} }, { attacking: false }), xy([[50, 90], [15, 70], [38, 73], [62, 73], [85, 70], [15, 45], [38, 48], [62, 48], [85, 45], [38, 20], [62, 20]]));
  assert.deepEqual(livePositions(tac({}, 'NORMAL', 'UKENDT'), { attacking: false }).map((q) => q.y), [90, 70, 73, 73, 70, 45, 48, 48, 45, 20, 20]);
});

// ---------- løb uden bold: løberen står RUN_STEP længere fremme i billedet ----------
function runGoal({ rm, custom = null, runs = 'NORMAL', slotNo = 8, next = 0.5 }) {
  const a = arena({ home: { p1: { attackFocus: 'CENTRAL', offBallRuns: runs } } });
  for (const i of [5, 6, 7, 8]) slot(a.A, i).skills.passing = 1;
  for (const i of [1, 2, 3, 4]) Object.assign(slot(a.A, i).skills, { positioning: 1, intercepting: 1, strength: 1 });
  slot(a.A, 0).skills.goalkeeping = 1;
  Object.assign(slot(a.H, slotNo).skills, rm); if (custom) a.H.tactics.customCoords = custom;
  const m = simulateMatch(a.H, a.A, stubRng({ 0.3: shots(2) }, next));
  return { a, m, evs: goalEvents(m, 'GOAL') };
}
// v3.16: LONGSHOT_Y 24 → 30, og skyttens y er den koblede (bag offside-linjen 27 + 1 = 28 mod mellemblok). Før: plads 30 → 24
// langskud, 29 → 23 kombination; nu: plads 36 → 30 langskud, 35 → 29 kombination.
test('langskud er skytten på koblet y ≥ 30 (ST 36 − 6 = 30 → langskud, 35 − 6 = 29 → kombination) og et langskud har intet oplæg i billedet – dræber LONGSHOT_Y 29/31, >= → > og solo-assist', () => {
  const at = (y) => mine({ spots: { 9: { x: 50, y } } });
  const lng = at(36), comb = at(35);
  assert.ok(lng.m.goalsPool.length >= 25 && lng.m.goalsPool.every((g) => g.kind === 'LONGSHOT'), lng.m.goalsPool.map((g) => g.kind).join());
  assert.ok(comb.m.goalsPool.length >= 25 && comb.m.goalsPool.every((g) => g.kind === 'COMBINATION'), comb.m.goalsPool.map((g) => g.kind).join());
  // Langskud: soloscoring → ingen oplægsmarkering trods en oplægsgiver (første midtbane) i truppen; kombination: oplægget er LM
  assert.ok(goalEvents(lng.m, 'GOAL').every((e) => e.snapshot.assist === null && e.snapshot.scorer === slot(lng.a.H, 9).id));
  assert.ok(goalEvents(comb.m, 'GOAL').every((e) => e.snapshot.assist === slot(comb.a.H, 5).id));
});
// v3.16: kanten vælges efter FORSVARETS pres (EDGE_BY_PRESS: lav blok 0,75, mellemblok 0,5 = EDGE_SHARE, gegenpres 0,35) – før
// altid EDGE_SHARE 0,5. Slot 9 står på kanten (38 − 6 = 32), slot 10 længere fremme (30 − 6 = 24; mod mellemblok/gegenpres klemt
// til linjen 27 + 1 = 28, mod lav blok – linje 17 – står han på 24). Terningen er både tærsklen og modtager-lodtrækningen, så
// afslutningsevnen (vægt 10 + FIN) er sat pr. pres, så kanten giver slot 9 og målet slot 10 på BEGGE sider af tærsklen.
test('almindelig afslutning: kanten (50,32) vælges efter forsvarets pres – mellemblok 0,48 → kanten / 0,52 → målet (50,20), lav blok 0,73 / 0,77, gegenpres 0,33 / 0,37, ukendt pres som mellemblok – dræber EDGE_BY_PRESS-værdierne ±0,03, fast EDGE_SHARE og spot-y', async () => {
  // v3.16: valget testes direkte (shotSpotFor) – før gennem hvem modtagerlodtrækningen landede på, som flyttede sig med hver
  // motorændring (SHOT_REACH, koblede linjer). At motoren bruger forsvarets pres, ikke angriberens, bevises nedenfor.
  const { shotSpotFor, SPOT, EDGE_SHARE } = await import('../../public/engine/match.js');
  assert.deepEqual([SPOT.EDGE, SPOT.GOAL, EDGE_SHARE], [{ x: 50, y: 32 }, { x: 50, y: 20 }, 0.5]);
  const y = (r, p) => shotSpotFor(r, p).y;
  assert.deepEqual([y(0.48, 'MID_BLOCK'), y(0.52, 'MID_BLOCK'), y(0.73, 'LOW_BLOCK'), y(0.77, 'LOW_BLOCK'), y(0.33, 'HIGH_GEGENPRESS'), y(0.37, 'HIGH_GEGENPRESS'), y(0.48, undefined), y(0.52, undefined)],
    [32, 20, 32, 20, 32, 20, 32, 20]);
  // Motoren bruger FORSVARETS pres (defPh), ikke angriberens – ét kald (læst i kilden; en lodtrækning kan ikke skelne dem
  // pålideligt, fordi presset også flytter forsvarets placering).
  const src = (await import('node:fs')).readFileSync(new URL('../../public/engine/match.js', import.meta.url), 'utf8');
  assert.equal(src.match(/shotSpotFor\(rng\.next\(\), defPh\.phase2_defending\.pressingHeight\)/g)?.length, 1);
});

// v3.16.1 (sammenpresning): angriberne (14) presses til offside-linjen – modstanderens stopper på 73 → 27 + ONSIDE_GAP 1 = 28 – og
// midtbanen bag dem ([14, 40] til [28, 40]: 29 → 35, 32 → 36); løberen er sluppet igennem og står foran linjen (17), uden for
// sammenpresningen. Oven i en modspiller skubbes man 6 på tværs: ST (49, 28)/(73, 28) fra stopperne (spejlet (49, 27)/(73, 27)) → 55/79,
// CM (49, 36)/(73, 36) fra bottens CM'er (spejlet y 41) → 55/79, LM (26, 35) fra RB (spejlet (26, 30)) → 32. Cutback-lodtrækningen
// (terning 0,5) lander på plads 6 (55, 36): vægtene exp(−afstand/16) til (50, 28) for plads 1–6 når netop halvdelen.
test('løber, højre kant (RM, bold 88): løberen står 12 foran sin levende plads (96, 29 − 12 = 17) – foran linjen, angriberne presset til den (14 → 28) – holdet 11 mod højre, bolden på (50,28), oplægget er løberen – dræber RUN_STEP, ballX-sidebytte, runner-ignoreret, løberen presset med', () => {
  const r = runGoal({ rm: { passing: 20, finishing: 1 } });
  assert.deepEqual(r.m.goalsPool.map((g) => g.kind), ['CUTBACK', 'CUTBACK']);
  const want = pts(r.a.H, [[50, 90], [26, 50], [49, 59], [73, 59], [96, 50], [32, 35], [55, 36], [79, 36], [96, 17], [55, 28], [79, 28]]);
  assert.deepEqual(r.evs[0].snapshot, { attacking: true, formation: '4-4-2', pts: want, scorer: slot(r.a.H, 6).id, assist: slot(r.a.H, 8).id, ball: [50, 28] });
});
// v3.16.1: angriberne 14 → 28 (bag linjen 27 + 1), midtbanen 32/29 → 36/35, løberen foran linjen; skubbet 6 på tværs fra modspillerne
// (spejlet): ST og CM 27 → 33, 51 → 57, RM (74, 35) fra LB (74, 30) → 80. Lodtrækningen (0,25) lander på plads 6 (33, 36).
test('løber, venstre kant (LM, bold 12): holdet 11 mod venstre (LB 15 → 4), løberen på (4, 45 − 16 − 12 = 17), angriberne presset til linjen (28)', () => {
  const r = runGoal({ rm: { passing: 20, finishing: 1 }, slotNo: 5, next: 0.25 });
  assert.deepEqual(r.m.goalsPool.map((g) => g.kind), ['CUTBACK', 'CUTBACK']);
  const want = pts(r.a.H, [[50, 90], [4, 50], [27, 59], [51, 59], [74, 50], [4, 17], [33, 36], [57, 36], [80, 35], [33, 28], [57, 28]]);
  assert.deepEqual(r.evs[0].snapshot, { attacking: true, formation: '4-4-2', pts: want, scorer: slot(r.a.H, 6).id, assist: slot(r.a.H, 5).id, ball: [50, 28] });
});

test('kontra: afslutteren er den FARTIGSTE nær målet (PAC), ikke den bedste afleverer – PAC 20/PAS 1 slår PAC 1/PAS 20 på samme sted – dræber skill → passing', () => {
  const a = arena();
  for (const t of [a.H, a.A]) layout(t, { 9: { x: 50, y: 26 }, 10: { x: 50, y: 26 } });
  Object.assign(slot(a.A, 9).skills, { pace: 20, passing: 1 }); Object.assign(slot(a.A, 10).skills, { pace: 1, passing: 20 });
  slot(a.H, 0).skills.goalkeeping = 1;
  // H har bolden og taber presset (A's midtbane INT 20 → A vinder og kontrer, 3,2 %)
  for (const q of mids(a.A)) q.skills.intercepting = 20;
  const m = simulateMatch(a.H, a.A, stubRng({ 0.48: true, 0.032: true }));
  const sc = new Set(m.goalsPool.map((g) => g.scorer));
  assert.ok(m.goalsPool.length >= 20 && m.goalsPool.every((g) => g.kind === 'COUNTER'));
  assert.deepEqual([...sc], [`#${slot(a.A, 9).shirtNumber} ${slot(a.A, 9).shortName}`]);
});
test('almindelig afslutning inde i feltet: dribletur vægtes af PAC og BAL hver for sig ((PAC+BAL)/2): PAC 8/BAL 28 og PAC 28/BAL 8 begge dribletur, 8/8 kombination – dræber pace·2', () => {
  const kinds = (sk) => { const r = mine({ spots: { 9: { x: 50, y: 28 } }, setup: (a) => Object.assign(slot(a.H, 9).skills, { finishing: 10, ...sk }) }); assert.ok(r.m.goalsPool.length >= 25); return [...new Set(r.m.goalsPool.map((g) => g.kind))]; };
  assert.deepEqual(kinds({ pace: 8, ballControl: 28 }), ['DRIBBLE']);     // (8 + 28)/2 − 8 = 10 → 4,5; r = 0,5·8,5 = 4,25 ≥ 4
  assert.deepEqual(kinds({ pace: 28, ballControl: 8 }), ['DRIBBLE']);
  assert.deepEqual(kinds({ pace: 8, ballControl: 8 }), ['COMBINATION']);
});

// v3.16: langskud fordi løberen står på 34 ≥ LONGSHOT_Y 30 (før: zonen afgjorde). v3.16.1: angriberne presset til linjen 14 → 28,
// midtbanen bag dem 29/32 → 35/36; LM, CM'erne og angriberne skubbet 6 på tværs fra modspillerne (15 → 21, 38 → 44, 62 → 68).
test('løb der ender i et skud: løberen står stadig 12 foran (RM trukket til (50,62): 62 − 16 − 12 = 34 ≥ 30 → langskud, ikke 46 → 38 = LONGSHOT_FAR) – billedet bruger løbets øjeblik, ikke skytte-kastet før – dræber "run seen ikke sat/uden runner"', () => {
  const r = runGoal({ rm: { finishing: 20, passing: 1, pace: 1, ballControl: 1 }, custom: { 8: { x: 50, y: 62 } } });
  assert.deepEqual(r.m.goalsPool.map((g) => g.kind), ['LONGSHOT', 'LONGSHOT']);
  const want = pts(r.a.H, [[50, 90], [15, 50], [38, 59], [62, 59], [85, 50], [21, 35], [44, 36], [68, 36], [50, 34], [44, 28], [68, 28]]);
  // Solo-mål: bolden står ved skytten (QC-rettelsen), ikke på (50, 20)
  assert.deepEqual(r.evs[0].snapshot, { attacking: true, formation: '4-4-2', pts: want, scorer: slot(r.a.H, 8).id, assist: null, ball: [50, 34] });
});
// TM v3.14.3: langskuddets cap (LONGSHOT_FAR = 38) med x bevaret og de andre spillere urørt. Den gamle test ovenfor
// står på 34 (< 38), så den beviser ikke selve loftet – her er løberen trukket så langt tilbage, at loftet er det, der virker.
test('langskud fra egen banehalvdel: løberen står i billedet højst på y 38 med sin egen x (30, ikke 50) – de andre spillere og grænsen (live 37 → 37, 38 → 38, 39 → 38) – dræber x-konstant, min→max, FAR 37/39', () => {
  const at = (y) => { const r = runGoal({ rm: { finishing: 20, passing: 1, pace: 1, ballControl: 1 }, custom: { 8: { x: 30, y } } }); assert.deepEqual(r.m.goalsPool.map((g) => g.kind), ['LONGSHOT', 'LONGSHOT']); const s = r.evs[0].snapshot; return { s, me: s.pts.find(([id]) => id === s.scorer), id: s.scorer }; };
  const base = at(60);                    // live 60 − 28 = 32: under loftet, uberørt – giver løberens egen x (ikke 50)
  assert.notEqual(base.me[1], 50); assert.equal(base.me[2], 32);
  for (const [y, want] of [[65, 37], [66, 38], [67, 38], [90, 38]]) {   // live y = y − 28
    const r = at(y);
    assert.deepEqual(r.me, [base.id, base.me[1], want], `spot y ${y}`);
    assert.deepEqual(r.s.ball, [base.me[1], want]);
    assert.deepEqual(r.s.pts.filter(([id]) => id !== r.id), base.s.pts.filter(([id]) => id !== base.id), 'de andre spillere flyttes ikke');
  }
});
test('dribletur efter et løb flyttes IKKE af langskudsloftet: løber fra y 82 står på 54 (> 38) i billedet', () => {
  const r = runGoal({ rm: { pace: 20, ballControl: 20, finishing: 10, passing: 1 }, custom: { 8: { x: 30, y: 82 } } });
  assert.deepEqual(r.m.goalsPool.map((g) => g.kind), ['DRIBBLE', 'DRIBBLE']);
  const s = r.evs[0].snapshot, me = s.pts.find(([id]) => id === s.scorer);
  assert.equal(me[2], 54); assert.deepEqual(s.ball, [me[1], 54]);
});
function runAgainst(rm) {
  const a = arena({ away: { p1: { attackFocus: 'CENTRAL' } } });
  for (const i of [5, 6, 7, 8]) slot(a.H, i).skills.passing = 1;
  for (const i of [1, 2, 3, 4]) Object.assign(slot(a.H, i).skills, { positioning: 1, intercepting: 1, strength: 1 });
  slot(a.H, 0).skills.goalkeeping = 1;
  Object.assign(slot(a.A, 8).skills, rm);
  const m = simulateMatch(a.A, a.H, stubRng({ 0.3: shots(2) }));
  return { a, m, snap: goalEvents(m, 'GOAL')[0].snapshot };
}
test('et løb imod dig på højre kant (bold 88): dit forsvar står forskudt 11 mod venstre (LB 15 → 4) og bolden er spejlet – både når løbet ender i en aflevering (cutback) og i et skud – dræber "run seenX ikke sat"', () => {
  const pass = runAgainst({ passing: 20, finishing: 1 });
  assert.deepEqual(pass.m.goalsPool.map((g) => g.kind), ['CUTBACK', 'CUTBACK']);
  // v3.16.1 (sammenpresning, dit pres mellemblok): botten har stopperne på 73 − 14 = 59 → dine forreste skal stå 100 − 59 + PRESS_GAP 10
  // = 51; [20, 63] til [51, 63]: angreb 20 → 51, midtbane 45/48 → 58/59 (klemt v3.16: 61/64), forsvaret (≥ 63) står.
  const want = pts(pass.a.H, [[50, 90], [4, 70], [27, 73], [51, 73], [74, 70], [4, 58], [27, 59], [51, 59], [74, 58], [27, 51], [51, 51]]);
  assert.deepEqual(pass.snap, { attacking: false, formation: '4-4-2', pts: want, scorer: null, assist: null, ball: [50, 72] });
  // Skud fra kanten: ingen receiver-kald i løbs-grenen – bold-siden kommer kun fra løbets eget kald
  const shot = runAgainst({ finishing: 20, passing: 1, pace: 1, ballControl: 1 });
  assert.ok(shot.m.goalsPool.every((g) => g.kind === 'LONGSHOT' || g.kind === 'COMBINATION'), shot.m.goalsPool.map((g) => g.kind).join());
  assert.deepEqual(shot.snap.pts.map(([, x]) => x), [50, 4, 27, 51, 74, 4, 27, 51, 74, 27, 51]);
  assert.deepEqual([shot.snap.attacking, shot.snap.scorer], [false, null]);
});
test('et hjørnespark-hovedstød efter en reddet afslutning i samme tick giver INTET billede (setPiece-vagten, ikke kun "ingen positioner") – dræber "header også dødbold"', () => {
  const c = mine({ spots: { 9: { x: 40, y: 28 } }, script: { 0.9: true }, setup: (b) => { for (const q of b.H.squad) q.aerialPower = 60; slot(b.A, 0).skills.goalkeeping = 40; } });
  assert.ok(c.m.goalsPool.length >= 20 && c.m.goalsPool.every((g) => g.kind === 'CORNER'), c.m.goalsPool.map((g) => g.kind).join());
  const hs = goalEvents(c.m, 'HEADER_GOAL');
  assert.ok(hs.length >= 20 && hs.every((e) => e.snapshot === undefined));
});
// v3.13 (brugerens eksempel: "#4 J. Petersen når baglinjen og lægger den lavt tilbage" – en CB, der i billedet stod
// på egen halvdel). Den, der slår cutbacken, skal stå højst RECEIVE_REACH (25) fra kanten. Rul 0,01: cutbacken går
// til venstre (12, 30), og det vægtede valg lander på den første i rækken – CB'en (plads 2, levende (27, 59), 32 væk)
// uden rækkevidden. Med den: angriberen trukket ud til venstre (plads 10, levende (9, 34), 5 væk).
test('cutback: en stopper på egen halvdel kan ikke "nå baglinjen" – kun en spiller inden for rækkevidde af kanten', () => {
  const { a, m } = mine({ spots: { 2: { x: 38, y: 73 }, 10: { x: 20, y: 40 } }, home: { p1: { attackFocus: 'LOW_CUTBACKS' } }, script: { 0.38: true }, next: 0.01 });
  const ev = goalEvents(m, 'GOAL');
  assert.ok(ev.length >= 2, `mål ${ev.length}`);
  const st = slot(a.H, 10), cb = slot(a.H, 2);
  assert.ok(ev.every((e) => e.text.includes(`MÅÅÅL! #${st.shirtNumber} ${st.shortName} når baglinjen`)), ev[0].text);
  assert.ok(ev.every((e) => !e.text.includes(`#${cb.shirtNumber} ${cb.shortName} når baglinjen`)));
});

