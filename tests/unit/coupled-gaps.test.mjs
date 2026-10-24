// v3.16 Test Manager: huller fundet ved mutation af de koblede linjer (positions.js coupledPositions og match.js momentAt/shapes).
// Forfatterens tests (positions-coupled, trace-lines) tjekker linjerne STATISTISK over 150 kampe ("ingen bag linjen", "scoreren ≤ 12") –
// de kunne ikke se, om offside-billedet efter kendelsen (momentCheck), tomme pladser (ballOn/oppOn), x-klemningen eller afsparksbilledet
// var forkerte. Her står tallene bogstaveligt på en kendt opstilling: ST alene på (40, 20), alle andre på y 95, mod en 4-4-2 i
// mellemblok, hvis dybeste markspiller (stopperne) står på y 73 → offside-linjen 100 − 73 = 27. Hver test nævner, hvad den dræber.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';
import { VAR_RULES, MISS_P, MISS_BLOCK_SHARE } from '../../public/engine/match-rules.js';
import { coupledPositions } from '../../public/engine/positions.js';

function stubRng(script = {}, nextValue = 0.5) {
  const calls = {};
  return { next: () => nextValue, int: (a) => a, pick: (arr) => arr[0],
    chance: (p) => { const n = (calls[p] = (calls[p] ?? -1) + 1); const s = script[p]; return typeof s === 'function' ? s(n) : !!s; } };
}
const SK = (v) => ({ pace: v, stamina: v, strength: v, ballControl: v, passing: v, finishing: v, positioning: v, intercepting: v, goalkeeping: v });
function arena() {
  const L = createLeague(createRng(1));
  const [H, A] = [L.teams[0], L.teams[1]];
  for (const t of [H, A]) {
    for (const p of t.squad) { p.skills = SK(10); p.aerialPower = 10; p.counterTactics = { vsPress: 25, vsLowBlock: 25, vsTrapLong: 25 }; p.varProfile = { cynicism: 10, theatre: 10, varPulse: 10 }; p.injuryMatchesLeft = 0; p.freshness = 100; }
    t.tactics.baseFormation = '4-4-2'; t.tactics.customCoords = {}; t.tactics.conditionalRules = []; t.subsLimit = 0;
    t.tactics.lineupSlots = t.squad.slice(0, 11).map((p) => p.id);
    Object.assign(t.tactics.phases.phase1_buildUp, { passingStyle: 'BALANCED', attackFocus: 'CENTRAL', offBallRuns: 'NORMAL' });
    Object.assign(t.tactics.phases.phase2_defending, { pressingHeight: 'MID_BLOCK', offsideTrap: 'OFF', tacklingIntensity: 'NORMAL' });
    Object.assign(t.tactics.phases.phase3_transition, { onBallWon: 'KEEP_POSSESSION', onBallLost: 'DROP_BACK' });
  }
  return { H, A };
}
const slot = (t, i) => t.squad.find((p) => p.id === t.tactics.lineupSlots[i]);
const T = (f, press = 'MID_BLOCK', cc = {}) => ({ baseFormation: f, customCoords: cc, phases: { phase1_buildUp: { offBallRuns: 'NORMAL' }, phase2_defending: { pressingHeight: press } } });
const ys = (l) => l.map((p) => p.y);
const off = (...idx) => Array.from({ length: 11 }, (_, i) => !idx.includes(i));   // besatte pladser: alle undtagen idx (udvist)

// ---------- positions.js: tomme pladser, løberen, ukendt pres ----------
test('tomme pladser (oppOn): den udviste stopper er ikke linjen – 4-4-2 mod 4-4-2 uden slot 2 og 3: linjen 100 − 70 = 30, ikke 27; uden hele bagkæden 100 − 48 = 52 – dræber oppOn ignoreret', () => {
  const full = coupledPositions(T('4-4-2'), T('4-4-2'));
  assert.equal(full.line, 27);
  const noCbs = coupledPositions(T('4-4-2'), T('4-4-2'), { oppOn: off(2, 3) });
  assert.equal(noCbs.line, 30);   // backerne på 70
  assert.deepEqual(ys(noCbs.ball), [90, 50, 59, 59, 50, 31, 32, 32, 31, 31, 31]);   // 30 + ONSIDE_GAP 1 (før 28/29)
  const noBack4 = coupledPositions(T('4-4-2'), T('4-4-2'), { oppOn: off(1, 2, 3, 4) });
  assert.equal(noBack4.line, 52);   // midtbanen på 48
  assert.deepEqual(ys(noBack4.ball), [90, 53, 59, 59, 53, 53, 53, 53, 53, 53, 53]);
});

test('tomme pladser (oppOn) i presset: modstanderens forreste, der er udvist, tæller ikke som "forreste" – lav blok uden begge angribere: hele blokken på 61 (ønsket), ikke midtbanen på 71/74 – dræber front uden oppOn', () => {
  const r = coupledPositions(T('4-4-2'), T('4-4-2', 'LOW_BLOCK'), { oppOn: off(9, 10) });
  assert.deepEqual(ys(r.opp), [90, 80, 83, 83, 80, 61, 61, 61, 61, 61, 61]);
  assert.deepEqual(ys(coupledPositions(T('4-4-2'), T('4-4-2', 'LOW_BLOCK')).opp), [90, 80, 83, 83, 80, 71, 74, 74, 71, 61, 61]);
});

test('tomme pladser (ballOn): boldholdets udviste bagspiller tæller ikke som "dybeste" – lav blok mod 4-4-2 uden stopperne: ønsket 100 − 32 + 20 = 88 hvis hele bagkæden mangler, 75 hvis kun stopperne – dræber deepest uden ballOn', () => {
  const full = coupledPositions(T('4-4-2'), T('4-4-2', 'LOW_BLOCK'));
  assert.deepEqual(ys(full.opp), [90, 80, 83, 83, 80, 71, 74, 74, 71, 61, 61]);   // deepest = stopperne 59 → ønsket 61
  const noCbs = coupledPositions(T('4-4-2'), T('4-4-2', 'LOW_BLOCK'), { ballOn: off(2, 3) });
  assert.deepEqual(ys(noCbs.opp), [90, 80, 83, 83, 80, 75, 78, 78, 75, 70, 70]);   // deepest = backerne 50 → ønsket 70
  const noBack4 = coupledPositions(T('4-4-2'), T('4-4-2', 'LOW_BLOCK'), { ballOn: off(1, 2, 3, 4) });
  assert.deepEqual(ys(noBack4.opp), [90, 88, 88, 88, 88, 88, 88, 88, 88, 88, 88]);   // deepest = midtbanen 32 → ønsket 88
});

test('løberen, der er sluppet igennem, er ikke boldholdets "dybeste": stopperen på 81 (trukket til y 95) løber 12 frem til 69, og blokken rykkes efter den næstdybeste (59 → ønsket 61), ikke efter 69 (→ 51)', () => {
  const ball = T('4-4-2', 'MID_BLOCK', { 2: { x: 50, y: 95 } });
  const r = coupledPositions(ball, T('4-4-2', 'LOW_BLOCK'), { runner: 2 });
  assert.equal(r.ball[2].y, 69);
  assert.deepEqual(ys(r.opp), [90, 80, 83, 83, 80, 71, 74, 74, 71, 61, 61]);
});

test('ukendt eller manglende pres rykker som mellemblok (PRESS_GAP.MID_BLOCK 10) – ikke som lav blok (20)', () => {
  const mid = [90, 70, 73, 73, 70, 61, 64, 64, 61, 51, 51];
  assert.deepEqual(ys(coupledPositions(T('4-4-2'), T('4-4-2', 'MID_BLOCK')).opp), mid);
  assert.deepEqual(ys(coupledPositions(T('4-4-2'), T('4-4-2', 'UKENDT')).opp), mid);
  assert.deepEqual(ys(coupledPositions(T('4-4-2'), { baseFormation: '4-4-2', customCoords: {}, phases: {} }).opp), mid);
});

// ---------- match.js baseFrame: afsparket og grundbilledet ----------
const col = (f, side, k) => f[side].map((q) => q[k]);
test('afspark og første grundbillede, bogstaveligt: begge hold i egen halvdel (midtbane og angreb højst frem til 52, bagkæden urørt 70/73) – bagefter holdet med bolden på/bag linjen, modstanderen som blok (4-4-2 mod 4-4-2, mellemblok) – dræber kickoff-klemmen 50/55/uden, attacking:true, byttet boldhold/modstander', () => {
  const a = arena();
  const m = simulateMatch(a.H, a.A, stubRng({ 0.3: false }, 0.5));
  const [f0, f1] = m.trace.frames;
  assert.equal(f0.poss, null);
  assert.deepEqual(col(f0, 'h', 2), [90, 70, 73, 73, 70, 52, 52, 52, 52, 52, 52]);
  assert.deepEqual(col(f0, 'a', 2), [10, 30, 27, 27, 30, 48, 48, 48, 48, 48, 48]);   // udeholdet spejlet: 100 − 52 = 48
  assert.equal(f1.poss, 'h');
  assert.deepEqual(col(f1, 'h', 2), [90, 50, 59, 59, 50, 29, 32, 32, 29, 28, 28]);   // angrebet på linjen 27 + 1
  assert.deepEqual(col(f1, 'a', 2), [10, 30, 27, 27, 30, 39, 36, 36, 39, 49, 49]);   // blokken: ønsket 100 − 59 + 10 = 51 (spejlet 49)
});

// ---------- udvist: tomme pladser tæller ikke som linjen (onOf) ----------
// En udvisning i 3. minut (skade-frispark + direkte rødt til den første forsvarer – slot 1 – hos det hold, der begår frisparket).
function red({ side = 'A', hLB = null, aLB = null } = {}) {
  const a = arena(); slot(a.A, 0).skills.goalkeeping = 1;
  if (side === 'H') for (const p of a.H.squad) { p.skills.passing = 20; p.skills.ballControl = 20; }   // ti mand beholder bolden
  if (aLB) a.A.tactics.customCoords = { 1: { x: 50, y: aLB } };
  if (hLB) a.H.tactics.customCoords = { ...Object.fromEntries([2, 3, 4, 5, 6, 7, 8, 9, 10].map((j) => [j, { x: 50, y: 60 }])), 1: { x: 50, y: hLB } };
  const script = { 0.06: (n) => n === 0, 0.4: (n) => n === 0, 0.07: true, 0.3: side === 'A' ? (n) => n < 1 : false, ...(side === 'A' ? { 0.5: true } : {}) };
  const m = simulateMatch(a.H, a.A, stubRng(script, 0.5));
  return { a, m, reds: m.events.filter((e) => e.type === 'RED') };
}
test('udvist forsvarer er ikke linjen: udeholdets back (slot 1) står på y 95 og får rødt i 3. minut – før står hjemmeangriberne på 14 (linjen 100 − 95 = 5, ingen klemme), efter på 28 (linjen 27 fra de elleve andre) – dræber oppOn i onOf', () => {
  const r = red({ side: 'A', aLB: 95 });
  assert.deepEqual(r.reds.map((e) => [e.min, e.isHome]), [[3, false]]);
  const [, f1, f2] = r.m.trace.frames;
  assert.equal(f1.a.length, 11); assert.equal(f2.a.length, 10);
  assert.deepEqual([col(f1, 'h', 2).slice(9), col(f2, 'h', 2).slice(9)], [[14, 14], [28, 28]]);
  // … og målet i 6. minut (efter udvisningen) tegner angriberen på 28 i dit holds billede – receiver/shapes har samme tomme plads
  const goal = r.m.events.find((e) => e.type === 'GOAL');
  assert.equal(goal.min, 6);
  assert.equal(goal.snapshot.pts.find(([id]) => id === slot(r.a.H, 9).id)[2], 28);
});
test('udvist boldholder: hjemmets back (slot 1, trukket til 95 → står på 75 i angreb) får rødt – før er blokken rykket efter ham (udeholdets angreb på 65 spejlet 35), efter efter den næstdybeste (46 → blokken højere: 44) – dræber ballOn i onOf', () => {
  const r = red({ side: 'H', hLB: 95 });
  assert.deepEqual(r.reds.map((e) => [e.min, e.isHome]), [[3, true]]);
  const [, f1, f2] = r.m.trace.frames;
  assert.equal(f1.poss, 'h'); assert.equal(f2.poss, 'h');
  assert.equal(f1.h.length, 11); assert.equal(f2.h.length, 10);
  assert.deepEqual(col(f1, 'a', 2), [10, 30, 27, 27, 30, 47, 44, 44, 47, 65, 65]);
  assert.deepEqual(col(f2, 'a', 2), [10, 30, 27, 27, 30, 37, 34, 34, 37, 44, 44]);
});

// ---------- kontra: skytten løber COUNTER_RUN (24) fra sin plads i forsvarsformen ----------
// A har bolden, dit hold (H) presser og erobrer den (præcis ét kontra-udfald i 3. minut). Kun skytten (plads `who`) er hurtig og står
// på (50, y); alle andre er trukket til y 95. I forsvarsform er der intet ryk (y uændret), og det fangede hold står i angrebsform
// (stopper 73 − 14 = 59 → linjen 41, så de andre klemmes til 42). Løberen er sluppet igennem: y − 24 – foran linjen, ikke klemt.
function ownCounter({ shY = 60, who = 9 } = {}) {
  const a = arena();
  for (const p of a.H.squad) { p.skills.passing = 1; p.skills.ballControl = 1; p.skills.pace = 1; p.skills.intercepting = 30; p.skills.positioning = 30; }
  slot(a.H, who).skills.pace = 20;
  a.H.tactics.customCoords = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 10].map((j) => [j, { x: 50, y: 95 }]));
  a.H.tactics.customCoords[who] = { x: 50, y: shY };
  slot(a.A, 0).skills.goalkeeping = 1;
  const m = simulateMatch(a.H, a.A, stubRng({ 0.48: true, 0.032: (k) => k < 1 }, 0.5));
  const goal = m.events.find((e) => e.type === 'GOAL');
  return { a, m, goal, pts: Object.fromEntries(goal.snapshot.pts.map(([id, x, y]) => [id, [x, y]])) };
}
test('kontra: skytten løber 24 fra sin plads (60 → 36, 50 → 26) – foran linjen (41), ikke klemt – og de andre bliver stående – dræber COUNTER_RUN 0/12/22/26/40, kontra uden runner/step (RUN_STEP 12 → 48)', () => {
  for (const shY of [60, 50]) {
    const r = ownCounter({ shY });
    assert.equal(r.m.goalsPool.length, 1); assert.equal(r.m.goalsPool[0].kind, 'COUNTER');
    assert.equal(r.goal.snapshot.scorer, slot(r.a.H, 9).id);
    assert.deepEqual(r.pts[slot(r.a.H, 9).id], [50, shY - 24]);
    assert.deepEqual(r.pts[slot(r.a.H, 8).id], [50, 95]);   // de andre urørte (bag linjen, ingen løber)
  }
});
test('kontra: oplægsgiveren er en anden midtbanespiller end skytten – skytte = første midtbanespiller (plads 5): oplægget går til plads 6 (assist +1, ikke 0), aldrig "#5 fandt #5" – dræber helper-filteret', () => {
  const r = ownCounter({ who: 5 });
  assert.equal(r.goal.snapshot.scorer, slot(r.a.H, 5).id);
  assert.equal(r.goal.snapshot.assist, slot(r.a.H, 6).id);
  const e = (i) => r.m.ratings.home.find((x) => x.playerId === slot(r.a.H, i).id);
  assert.deepEqual([e(5).goals, e(5).assists, e(6).goals, e(6).assists], [1, 0, 0, 1]);
  assert.ok(!r.m.goalsPool[0].desc.includes(`${r.m.goalsPool[0].scorer} fandt ${r.m.goalsPool[0].scorer}`));
});

// ---------- VAR: "den forreste" følger det koblede billede, ikke holdets rå form ----------
// Midtbanespilleren på plads 8 (RM, trukket til (50, 52): rå y 36) vinder sit løb og står sluppet igennem på 52 − 16 − 12 = 24 –
// foran offside-linjen (27), mens de to angribere (rå 14) er klemt til 28. Han er den forreste og skyder selv: VAR tjekker HAM.
// (Sorteret efter rå y stod han som nr. 3 bag de to angribere, og VAR ville tjekke en af dem: "#10 foran #9".)
test('VAR tjekker løberen, der er sluppet igennem (koblet y 24 < 28), når han selv skyder – ikke en angriber med rå y 14', () => {
  const tg = (p) => `#${p.shirtNumber} ${p.shortName}`;
  const a = arena();
  for (const i of [5, 6, 7, 8]) slot(a.A, i).skills.passing = 1;
  for (const i of [1, 2, 3, 4]) Object.assign(slot(a.A, i).skills, { positioning: 1, intercepting: 1, strength: 1 });
  slot(a.A, 0).skills.goalkeeping = 1;
  for (const p of a.H.squad) p.skills.finishing = 1;
  Object.assign(slot(a.H, 8).skills, { finishing: 1, passing: 1, pace: 1, ballControl: 1 });
  slot(a.H, 10).skills.finishing = 20;
  for (let i = 1; i <= 10; i++) { slot(a.H, i).counterTactics.vsTrapLong = 40; slot(a.H, i).varProfile.varPulse = 30; }
  a.H.tactics.customCoords = { 8: { x: 50, y: 52 } };
  const m = simulateMatch(a.H, a.A, stubRng({ 0.3: (k) => k < 1, ...CHECK }, 0.5));
  const goal = m.events.find((e) => e.type === 'GOAL');
  const y = Object.fromEntries(goal.snapshot.pts.map(([id, , yy]) => [id, yy]));
  assert.deepEqual([y[slot(a.H, 8).id], y[slot(a.H, 9).id], y[slot(a.H, 10).id]], [24, 28, 28]);   // løberen foran linjen, de andre på den
  assert.equal(m.goalsPool[0].scorer, tg(slot(a.H, 8)));
  assert.match(goal.text, new RegExp(`📺 VAR: målet står – ${tg(slot(a.H, 8))} timede sit løb`));
  assert.doesNotMatch(goal.text, /foran/);
  assert.match(m.events.find((e) => e.type === 'VAR_CHECK').text, new RegExp(`stod ${tg(slot(a.H, 8))} offside`));
});

// ---------- match.js momentAt: billedet af afslutningens øjeblik ----------
// ST (plads 9) alene på (x, 20) i angreb; alle andre på y 95. Han er den forreste og skytten. Forsvaret: 4-4-2, mellemblok.
function lone({ x = 40, y = 20, pulse = 30, trap = 40, gk = 1, fin = 20 } = {}, script = {}) {
  const a = arena(); slot(a.A, 0).skills.goalkeeping = gk;
  a.H.tactics.customCoords = { ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 10].map((j) => [j, { x: 50, y: 95 }])), 9: { x, y } };
  for (const p of a.A.squad) p.skills.positioning = 20;
  for (const p of a.H.squad) p.skills.finishing = 1;
  slot(a.H, 9).skills.finishing = fin;
  for (let i = 1; i <= 10; i++) { slot(a.H, i).counterTactics.vsTrapLong = trap; slot(a.H, i).varProfile.varPulse = pulse; }
  const m = simulateMatch(a.H, a.A, stubRng({ 0.3: (n) => n < 1, ...script }, 0.5));
  const st = slot(a.H, 9).id;
  const moments = m.trace.moments.map((mo) => ({ kind: mo.kind, st: mo.h.find((q) => q[0] === st).slice(1), ball: mo.ball, shooter: mo.shooter === st }));
  return { a, m, moments, kinds: m.trace.moments.map((mo) => mo.kind) };
}
const CHECK = { [VAR_RULES.GOAL_CHECK_P]: true, [VAR_RULES.GOAL_FOUL_SHARE]: false };

test('VAR godkender: tjekket står på den rigtige side af linjen (28 = 27 + ONSIDE_GAP), målet derefter i feltet (12) – dræber PASS_MOMENTS uden VAR_CHECK, onside-linje ±, momentCheck-dato', () => {
  // varPulse 30 + 40·0,045 = 31,8 + 3 > positionering 20 + 3 → onside
  const r = lone({ pulse: 30 }, CHECK);
  assert.deepEqual(r.kinds, ['VAR_CHECK', 'GOAL']);
  assert.equal(r.m.events.find((e) => e.type === 'VAR_CHECK').var.verdict, 'STANDS');
  assert.deepEqual(r.moments.map((q) => [q.kind, q.st, q.ball]), [['VAR_CHECK', [40, 28], [40, 28]], ['GOAL', [40, 12], [40, 12]]]);
});

test('VAR annullerer for offside: den tjekkede tegnes foran linjen (26 = 27 − 1) i VAR-tjekket og i annulleringen – dræber PASS_MOMENTS uden VAR_CHECK/VAR_NO_GOAL, kendelsen vendt, linje − 0/− 3, momentCheck.offside altid sand', () => {
  // varPulse 1 + 0 + 3 < 20 + 3 → offside
  const r = lone({ pulse: 1, trap: 0 }, CHECK);
  assert.deepEqual(r.kinds, ['VAR_CHECK', 'VAR_NO_GOAL']);
  assert.equal(r.m.events.find((e) => e.type === 'VAR_NO_GOAL').text.includes('offside'), true);
  assert.deepEqual(r.moments.map((q) => [q.kind, q.st, q.ball]), [['VAR_CHECK', [40, 26], [40, 26]], ['VAR_NO_GOAL', [40, 26], [40, 26]]]);
});

test('linjedommerens flag: den offside tegnes foran linjen (26) – dræber PASS_MOMENTS uden OFFSIDE_FLAG, SHOT_MOMENTS uden OFFSIDE_FLAG, momentCheck i flag-grenen (offside false/aldrig sat)', () => {
  const r = lone({ pulse: 1, trap: 0, gk: 30 }, { [VAR_RULES.OFFSIDE_FLAG_P]: true });
  assert.deepEqual(r.kinds, ['OFFSIDE_FLAG']);
  assert.deepEqual(r.moments.map((q) => [q.kind, q.st, q.ball]), [['OFFSIDE_FLAG', [40, 26], [40, 26]]]);
});

test('redning og forbi er IKKE offside-billeder: skytten tegnes i feltet (12), bolden ved ham – dræber PASS_MOMENTS med SAVE/MISS, SHOT_BOX_Y ±1, klemmen min → max/uden', () => {
  const save = lone({ pulse: 1, trap: 0, gk: 30 });
  assert.deepEqual(save.moments.map((q) => [q.kind, q.st, q.ball]), [['SAVE', [40, 12], [40, 12]]]);
  const miss = lone({ gk: 1, fin: 1 }, { [MISS_P]: true, [MISS_BLOCK_SHARE]: false });
  assert.deepEqual(miss.moments.map((q) => [q.kind, q.st, q.ball]), [['MISS', [40, 12], [40, 12]]]);
});

test('afslutningens x klemmes til 30–70 foran målet: ST på kanten (22 / 78) tegnes på 30 / 70, i midten urørt (40, 60) – dræber x-grænser 20/25/35/65/75/80, kun nedre/øvre klemme', () => {
  // (ved x 5 / 95 vælger lodtrækningen en anden skytte – ST'en står for langt fra pletten; 22 / 78 er lige uden for grænserne)
  const at = (x) => lone({ x, gk: 30 }).moments[0];
  for (const x of [22, 40, 60, 78]) assert.equal(at(x).shooter, true, `ST er skytten ved x ${x}`);
  assert.deepEqual([at(22).st, at(78).st, at(40).st, at(60).st], [[30, 12], [70, 12], [40, 12], [60, 12]]);
  assert.deepEqual([at(22).ball, at(78).ball], [[30, 12], [70, 12]]);
});

test('langskud: skytten tegnes ikke i feltet men på sin plads fra skudafstand (y 30–38) og x 20–80 – ST på 42 (rå 36 = koblet 36) står på 36; på 50 (koblet 44) på LONGSHOT_FAR 38; x 15 / 85 → 20 / 80 – dræber shotLong i goal-grenen, LONGSHOT_X ±, LONGSHOT_FAR ±, klemmen uden/kun en side', () => {
  const goal = (o) => { const r = lone({ ...o, gk: 1 }); assert.deepEqual(r.kinds, ['GOAL']); assert.equal(r.m.goalsPool[0].kind, 'LONGSHOT'); return r.moments[0]; };
  assert.deepEqual(goal({ x: 50, y: 42 }).st, [50, 36]);
  assert.deepEqual(goal({ x: 50, y: 50 }).st, [50, 38]);
  assert.deepEqual([goal({ x: 17, y: 42 }).st, goal({ x: 83, y: 42 }).st], [[20, 36], [80, 36]]);
  assert.deepEqual([goal({ x: 23, y: 42 }).st, goal({ x: 77, y: 42 }).st], [[23, 36], [77, 36]]);
  assert.deepEqual(goal({ x: 50, y: 42 }).ball, [50, 36]);
});

// Grundbilledet efter en chance på højre kant: bolden står, hvor holdets seneste chance var (x 88), og holdet trækkes 11,4 mod den
// side (BALL_PULL 0,3 · 38) – ikke mod den modsatte (ballX 12). En løber på højre kant (RM trukket til (88, 45)) lægger tværs.
test('grundbilledet efter en chance på højre kant: holdet forskudt 11 mod højre (CB 38 → 49, LB 15 → 26), bolden på x 88 – dræber baseFrame med spejlet ballX', () => {
  const a = arena();
  for (const i of [5, 6, 7, 8]) slot(a.A, i).skills.passing = 1;
  for (const i of [1, 2, 3, 4]) Object.assign(slot(a.A, i).skills, { positioning: 1, intercepting: 1, strength: 1 });
  slot(a.A, 0).skills.goalkeeping = 1;
  Object.assign(slot(a.H, 8).skills, { passing: 20, finishing: 1 });
  const m = simulateMatch(a.H, a.A, stubRng({ 0.3: (k) => k < 1 }, 0.5));
  assert.equal(m.goalsPool[0].kind, 'CUTBACK');
  const [, f1, f2] = m.trace.frames;
  assert.deepEqual(col(f1, 'h', 1), [50, 15, 38, 62, 85, 15, 38, 62, 85, 38, 62]);   // før chancen: bolden midt
  assert.deepEqual(col(f2, 'h', 1), [50, 26, 49, 73, 96, 26, 49, 73, 96, 49, 73]);
  assert.deepEqual(f2.ball, [88, 50]);
});

// ---------- momentAt: aktørerne står, hvor HÆNDELSEN var, ikke hvor formen lagde dem ----------
const momentOf = (m, kind) => m.trace.moments.find((mo) => mo.kind === kind);
const at = (mo, side, id) => mo[side].find((q) => q[0] === id).slice(1);
test('cutback-mål: afslutteren tegnes ved straffesparkspletten (50, 12 – ikke ved sit eget x 35) og oplægsgiveren ved baglinjen (88, 6) – dræber ownXY uden moves, snapMoves ikke videregivet', () => {
  const a = arena(); a.H.tactics.phases.phase1_buildUp.attackFocus = 'LOW_CUTBACKS';
  for (const p of a.H.squad) Object.assign(p.skills, { pace: 0, ballControl: 0, finishing: 1 });
  Object.assign(slot(a.H, 8).skills, { pace: 20, ballControl: 20 });   // kantspilleren (højre kant ved terning 0,5)
  slot(a.H, 10).skills.finishing = 20;
  a.H.tactics.customCoords = { ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 9].map((j) => [j, { x: 50, y: 95 }])), 8: { x: 88, y: 45 }, 10: { x: 35, y: 40 } };   // afslutteren står til siden for pletten
  for (const p of a.A.squad) Object.assign(p.skills, { pace: 0, positioning: 0 });
  for (const i of [5, 6, 7, 8]) Object.assign(slot(a.A, i).skills, { passing: 0, ballControl: 0 });
  slot(a.A, 0).skills.goalkeeping = 0;
  const m = simulateMatch(a.H, a.A, stubRng({ 0.3: (n) => n < 1, 0.38: true }, 0.5));
  assert.equal(m.goalsPool[0].kind, 'CUTBACK');
  const mo = momentOf(m, 'GOAL');
  assert.equal(mo.scorer, slot(a.H, 10).id); assert.equal(mo.assist, slot(a.H, 8).id);
  assert.deepEqual(at(mo, 'h', slot(a.H, 10).id), [50, 12]);
  assert.deepEqual(at(mo, 'h', slot(a.H, 8).id), [88, 6]);
  assert.deepEqual(mo.ball, [50, 12]);
});

test('motstanderens hold i øjeblikket er blokken, rykket efter boldholdets dybeste (ikke formens egen opstilling): A (4-4-2, mellemblok) mod H med alle andre på 95 – ønsket 100 − 89 + 10 = 21 – dræber dpts fra livePositions', () => {
  const r = lone({ gk: 30 });
  const mo = r.m.trace.moments[0];
  // udeholdets egne y (100 − det fælles y): bagkæden urørt 70/73; boldholdets dybeste er ST2 på 95 − 6 = 89, så blokken står højst frem til
  // 100 − 89 + 10 = 21: angrebet 20 → 21, midtbanen 45/48 + ½·1 → 46/49 (uden blokken: 45/48 og 20)
  assert.deepEqual(mo.a.map((q) => 100 - q[2]), [90, 70, 73, 73, 70, 46, 49, 49, 46, 21, 21]);
});

// ---------- VAR tjekker en holdkammerat foran skytten (varBehind) og kendelsens billede for den rigtige spiller ----------
// Som var-pinned: angriberne (plads 9 og 10) rå y 14 → klemt til 28; skytten (plads 5, FIN 20, x 15) rå 16 står som nr. 3 → ikke blandt de to
// forreste, så den forreste angriber (plads 9) tjekkes ("foran"). Skytten tegnes mindst VAR_BEHIND (4) bag den tjekkede: 28 + 4 = 32, og x
// urørt (15 – ikke klemt til 30).
function behind(extra, { pulse = 30, trap = 40, gk = 1 } = {}) {
  const a = arena();
  a.H.tactics.customCoords = { ...Object.fromEntries([1, 2, 3, 4, 6, 7, 8].map((j) => [j, { x: 50, y: 95 }])), 9: { x: 5, y: 20 }, 10: { x: 95, y: 20 }, 5: { x: 15, y: 32 } };
  for (const p of a.A.squad) p.skills.positioning = 20;
  for (const p of a.H.squad) p.skills.finishing = 1;
  slot(a.H, 5).skills.finishing = 20; slot(a.A, 0).skills.goalkeeping = 1;
  for (let i = 1; i <= 10; i++) { slot(a.H, i).counterTactics.vsTrapLong = trap; slot(a.H, i).varProfile.varPulse = pulse; }
  slot(a.A, 0).skills.goalkeeping = gk;
  const m = simulateMatch(a.H, a.A, stubRng({ 0.3: (n) => n < 1, ...extra }, 0.5));
  return { a, m };
}
test('VAR godkender en holdkammerat foran skytten: skytten tegnes 4 bag den tjekkede (32) med sit eget x (15), den tjekkede står på linjen (28) – dræber varBehind-grenen i momentAt (b), id-kontrollen', () => {
  const r = behind(CHECK);
  const [vc, goal] = [momentOf(r.m, 'VAR_CHECK'), momentOf(r.m, 'GOAL')];
  const [s, o] = [slot(r.a.H, 5).id, slot(r.a.H, 9).id];
  assert.equal(goal.scorer, s);
  assert.deepEqual([at(goal, 'h', s), at(goal, 'h', o), goal.ball], [[15, 32], [5, 28], [15, 32]]);
  assert.deepEqual([at(vc, 'h', s), at(vc, 'h', o)], [[15, 28], [5, 28]]);   // VAR_CHECK: den tjekkede (onside) på linjen + 1 = 28, skytten urørt
});
test('VAR annullerer for den forreste holdkammerats offside: HAM tegnes foran linjen (26) i VAR-tjek og annullering, skytten urørt (28) – dræber momentCheck.id = skytten', () => {
  const r = behind(CHECK, { pulse: 1, trap: 0 });
  const [s, o] = [slot(r.a.H, 5).id, slot(r.a.H, 9).id];
  assert.deepEqual(r.m.trace.moments.map((mo) => mo.kind), ['VAR_CHECK', 'VAR_NO_GOAL']);
  for (const kind of ['VAR_CHECK', 'VAR_NO_GOAL']) assert.deepEqual([at(momentOf(r.m, kind), 'h', o), at(momentOf(r.m, kind), 'h', s)], [[5, 26], [15, 28]], kind);
});
test('linjedommerens flag mod den forreste holdkammerat: HAM tegnes foran linjen (26), skytten (der ikke var offside) urørt – dræber momentCheck.id = afslutteren i flag-grenen', () => {
  const r = behind({ [VAR_RULES.OFFSIDE_FLAG_P]: true }, { pulse: 1, trap: 0, gk: 30 });
  const [s, o] = [slot(r.a.H, 5).id, slot(r.a.H, 9).id];
  assert.deepEqual(r.m.trace.moments.map((mo) => mo.kind), ['OFFSIDE_FLAG']);
  assert.match(r.m.events.find((e) => e.type === 'OFFSIDE_FLAG').text, /stod offside i opspillet/, 'en anden end skytten blev flaget');
  assert.deepEqual([at(momentOf(r.m, 'OFFSIDE_FLAG'), 'h', o), at(momentOf(r.m, 'OFFSIDE_FLAG'), 'h', s)], [[5, 26], [15, 28]]);
});

test('VAR-annullering efter en udvisning: udeholdets udviste back (rødt i 3. minut, stod på y 95) er ikke linjen – den tjekkede tegnes på 26 (linjen 27 − 1), ikke på 4 (95-linjen) – dræber line uden tom-plads-vagten i momentAt', () => {
  const a = arena(); slot(a.A, 0).skills.goalkeeping = 1;
  a.A.tactics.customCoords = { 1: { x: 50, y: 95 } };
  a.H.tactics.customCoords = { ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 10].map((j) => [j, { x: 50, y: 95 }])), 9: { x: 40, y: 20 } };
  for (const p of a.H.squad) p.skills.finishing = 1;
  slot(a.H, 9).skills.finishing = 20;
  for (let i = 1; i <= 10; i++) { slot(a.H, i).counterTactics.vsTrapLong = 0; slot(a.H, i).varProfile.varPulse = 1; }
  const m = simulateMatch(a.H, a.A, stubRng({ 0.5: true, 0.06: (n) => n === 0, 0.4: (n) => n === 0, 0.07: true, 0.3: (n) => n < 1, ...CHECK }, 0.5));
  assert.deepEqual(m.events.filter((e) => e.type === 'RED').map((e) => [e.min, e.isHome]), [[3, false]]);
  assert.deepEqual(m.trace.moments.map((mo) => mo.kind), ['VAR_CHECK', 'VAR_NO_GOAL']);
  for (const mo of m.trace.moments) assert.deepEqual(at(mo, 'h', slot(a.H, 9).id), [40, 26], mo.kind);
});

// To står på linjen (28), og holdets egen ANGREBSform afgør, hvem der er forrest: midtbanespilleren på plads 5 (rå y 34 − 16 = 18) før
// angriberen på plads 9 (30 − 6 = 24) – i forsvarsform (34 mod 30) ville angriberen stå foran. Skytten (plads 10, y 36 − 6 = 30) står
// bag begge og er nr. 3 → ikke blandt de to forreste: VAR tjekker den forreste, midtbanespilleren.
test('VAR: når to står på linjen, afgør holdets angrebsform hvem der er forrest (midtbanen rå 18 før angriberen rå 24) – dræber tie-break efter forsvarsformen', () => {
  const tg = (p) => `#${p.shirtNumber} ${p.shortName}`;
  const a = arena(); slot(a.A, 0).skills.goalkeeping = 1;
  a.H.tactics.customCoords = { ...Object.fromEntries([1, 2, 3, 4, 6, 7, 8].map((j) => [j, { x: 50, y: 95 }])), 5: { x: 15, y: 34 }, 9: { x: 85, y: 30 }, 10: { x: 50, y: 36 } };
  for (const p of a.A.squad) p.skills.positioning = 20;
  for (const p of a.H.squad) p.skills.finishing = 1;
  slot(a.H, 10).skills.finishing = 20;
  for (let i = 1; i <= 10; i++) { slot(a.H, i).counterTactics.vsTrapLong = 40; slot(a.H, i).varProfile.varPulse = 30; }
  const m = simulateMatch(a.H, a.A, stubRng({ 0.3: (n) => n < 1, ...CHECK }, 0.5));
  const goal = m.events.find((e) => e.type === 'GOAL');
  assert.equal(m.goalsPool[0].scorer, tg(slot(a.H, 10)));
  const y = Object.fromEntries(goal.snapshot.pts.map(([id, , yy]) => [id, yy]));
  assert.deepEqual([y[slot(a.H, 5).id], y[slot(a.H, 9).id]], [28, 28], 'begge på linjen');
  assert.match(goal.text, new RegExp(`📺 VAR: målet står – ${tg(slot(a.H, 5))} foran ${tg(slot(a.H, 10))} stod ikke offside`));
});

// ---------- VAR: frispark (skubbet) er ingen offside – skytten bliver, hvor formen satte ham ----------
test('VAR-tjek for skub (frispark): ingen offside-forskydning – skytten står på 28 i både tjek og annullering (annulleret: cynisme 20 → 15 < 24), ikke på 26 – dræber momentCheck sat også ved frispark', () => {
  const FOUL = { [VAR_RULES.GOAL_CHECK_P]: true, [VAR_RULES.GOAL_FOUL_SHARE]: true };
  const a = arena(); slot(a.A, 0).skills.goalkeeping = 1;
  a.H.tactics.customCoords = { ...Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 10].map((j) => [j, { x: 50, y: 95 }])), 9: { x: 40, y: 20 } };
  for (const p of a.H.squad) p.skills.finishing = 1;
  slot(a.H, 9).skills.finishing = 20; slot(a.H, 9).varProfile.cynicism = 20;
  const m = simulateMatch(a.H, a.A, stubRng({ 0.3: (n) => n < 1, ...FOUL }, 0.5));
  assert.deepEqual(m.trace.moments.map((mo) => mo.kind), ['VAR_CHECK', 'VAR_NO_GOAL']);
  assert.equal(m.events.find((e) => e.type === 'VAR_CHECK').var.kind, 'FOUL');
  for (const mo of m.trace.moments) assert.deepEqual(at(mo, 'h', slot(a.H, 9).id), [40, 28], mo.kind);
});

// ---------- et langskud, der ikke blev til mål: også her står skytten på sin plads, ikke i feltet ----------
test('løbets langskud, der reddes: skytten (RM sluppet igennem på 58 − 16 − 12 = 30 ≥ LONGSHOT_Y) tegnes på 30 i redningen – ikke klemt ind i feltet (12) – dræber shotLong sat først ved mål', () => {
  const a = arena();
  for (const i of [5, 6, 7, 8]) slot(a.A, i).skills.passing = 1;
  for (const i of [1, 2, 3, 4]) Object.assign(slot(a.A, i).skills, { positioning: 1, intercepting: 1, strength: 1 });
  slot(a.A, 0).skills.goalkeeping = 30;
  Object.assign(slot(a.H, 8).skills, { finishing: 20, passing: 1, pace: 1, ballControl: 1 });
  a.H.tactics.customCoords = { 8: { x: 85, y: 58 } };
  const m = simulateMatch(a.H, a.A, stubRng({ 0.3: (n) => n < 1 }, 0.5));
  const mo = momentOf(m, 'SAVE');
  assert.ok(mo, m.events.map((e) => e.type).join());
  assert.equal(mo.shooter, slot(a.H, 8).id);
  assert.deepEqual(at(mo, 'h', slot(a.H, 8).id), [80, 30]);   // x 85 + (88 − 50)·0,3 = 96 → klemt til LONGSHOT_X 80 (QC v3.16: langskud foran målet også ved redning)
});
