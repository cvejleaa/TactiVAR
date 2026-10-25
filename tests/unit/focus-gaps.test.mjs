// Test Manager v3.12: huller fundet ved mutation af angrebsfokus, luftduel i to trin, cutback,
// modtager efter position og fuldtids-analysen. Hver test nævner, hvilken mutation den dræber.
// Tomme/ens fixtures er undgået: hvor to udfald skal kunne skelnes, har spillerne forskellige tal
// (PAC ≠ BAL, FIN ≠ PAS, ulige pladser), og modtager-tests bruger trukne pladser (customCoords).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch as simLive } from '../../public/engine/match.js';
import { goalSpectacle } from '../../public/engine/clues.js';
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
function arena({ home = {}, away = {} } = {}) {
  const L = createLeague(createRng(1));
  const [H, A] = [L.teams[0], L.teams[1]];
  for (const t of [H, A]) {
    for (const p of t.squad) {
      p.skills = SK(10); p.aerialPower = 10; p.counterTactics = { vsPress: 25, vsLowBlock: 25, vsTrapLong: 25 };
      p.varProfile = { cynicism: 10, theatre: 10, varPulse: 10 }; p.injuryMatchesLeft = 0;
    }
    t.tactics.baseFormation = '4-4-2'; t.tactics.customCoords = {}; t.tactics.conditionalRules = []; t.subsLimit = 0; /* v3.13: ingen træthedsskift i test-arenaen */
    t.tactics.lineupSlots = t.squad.slice(0, 11).map((p) => p.id);
  }
  const setPhases = (t, o) => {
    const ph = t.tactics.phases;
    Object.assign(ph.phase1_buildUp, { passingStyle: 'BALANCED', attackFocus: 'CENTRAL', offBallRuns: 'NORMAL' }, o.p1);
    Object.assign(ph.phase2_defending, { pressingHeight: 'MID_BLOCK', offsideTrap: 'OFF', tacklingIntensity: 'NORMAL' }, o.p2);
    Object.assign(ph.phase3_transition, { onBallWon: 'KEEP_POSSESSION', onBallLost: 'DROP_BACK' }, o.p3);
  };
  setPhases(H, home); setPhases(A, away);
  return { L, H, A };
}
// 4-4-2: plads 0 GK, 1 LB, 2–3 CB, 4 RB, 5 LM, 6–7 CM, 8 RM, 9–10 ST.
const slot = (t, i) => t.squad.find((p) => p.id === t.tactics.lineupSlots[i]);
const tg = (p) => `#${p.shirtNumber} ${p.shortName}`;
const shots = (n) => (k) => k < n;
const count = (m, label) => m.events.filter((e) => e.label === label).length;
const homeBall = (a) => { for (const i of [5, 6, 7, 8]) Object.assign(slot(a.A, i).skills, { passing: 0, ballControl: 0 }); };   // hjemmeholdet har altid bolden, uanset egne PAS/BAL
const noRotation = (t) => { for (const b of t.squad.slice(11)) b.skills = SK(1); };   // bot-rotation af en træt starter
// Alle markspillere sættes langt væk (så de ikke vægter), udvalgte pladser trækkes derhen, man vil have.
// v3.12.1: positionerne rykker med (positions.js) – med bolden op til ~20 frem – så "langt væk" er helt nede.
const FAR = { x: 50, y: 95 };
function layout(t, spots) {
  t.tactics.customCoords = {};
  for (let i = 1; i <= 10; i++) t.tactics.customCoords[i] = spots[i] ?? FAR;
}

// ---------- Luftduellens trin 2 og fraktionelle tærskler ----------
function aer({ shAir, cbAir = 10, gk = 10, press = 'MID_BLOCK', shFresh = 100, gkFresh = 100, script = {}, focus = 'HIGH_CROSSES', pass = 'BALANCED', homeBot = false } = {}) {
  const a = arena({ home: { p1: { attackFocus: focus, passingStyle: pass } }, away: { p2: { pressingHeight: press } } });
  for (const p of a.H.squad) Object.assign(p, { aerialPower: shAir, freshness: shFresh });
  for (const i of [1, 2, 3, 4]) slot(a.A, i).aerialPower = cbAir;
  Object.assign(slot(a.A, 0), { freshness: gkFresh }); slot(a.A, 0).skills.goalkeeping = gk;
  noRotation(a.A);
  if (homeBot) a.H.isBot = true;
  const m = simulateMatch(a.H, a.A, stubRng({ 0.3: shots(2), ...(focus === 'HIGH_CROSSES' ? { 0.52: true } : { 0.15: true }), ...script }));
  return { a, m, d: m.duelLog[a.H.id] };
}
test('hovedstødet mod keeperen (trin 2): 9,75 reddes (13,75 < 14), 10 er uafgjort og reddes, 10,25 scorer – HEADER_GK_EDGE præcis 0 (dræber 0,5, −0,5, >=)', () => {
  // Trin 1: luft + 3 + CROSS_EDGE 2 (v3.12.1; før 1) > CB 10 + 3. Trin 2: luft + 4 > MV 10 + 4 + 0 (QC-kalibreringen; før 1,5).
  const saved = (v) => { const r = aer({ shAir: v }); return [r.m.homeGoals, count(r.m, 'Hovedstød reddet'), r.m.stats.hOnTarget, r.d.crossesWon]; };
  assert.deepEqual(saved(9.75), [0, 2, 2, 2]);
  assert.deepEqual(saved(10), [0, 2, 2, 2], 'uafgjort (14 = 14) er en redning');
  assert.deepEqual(saved(10.25), [2, 0, 2, 2]);
});
test('friskhed i trin 2: skyttens og målmandens friskhed tæller i hovedstødet mod keeperen (dræber fjernet fresh på skytte/MV i trin 2)', () => {
  // Skytte 11 frisk: 15 > 14 → mål. Skytte 11 ved 50 % (·0,875 = 9,625): trin 1 13,625 > 13 vinder, trin 2 13,625 < 14 → redning.
  assert.equal(aer({ shAir: 11 }).m.homeGoals, 2);
  const tired = aer({ shAir: 11, shFresh: 50 });
  assert.deepEqual([tired.m.homeGoals, count(tired.m, 'Hovedstød reddet'), tired.d.crossesWon], [0, 2, 2]);
  // MV 10 frisk: 14 = 14 → redning. MV ved 50 % (8,75 + 4 = 12,75 < 14) → mål.
  assert.equal(aer({ shAir: 10 }).m.homeGoals, 0);
  assert.equal(aer({ shAir: 10, gkFresh: 50 }).m.homeGoals, 2);
});
// v3.12.1: CROSS_EDGE 1 → 2 – tærsklen flytter fra 10 til 9.
test('lav blok: CB\'en får præcis +1 i åbent spil (9,01 vinder mod lav blok 14,01 > 14, ikke mod 2) – BOX_BONUS dræber LOW_BLOCK=2', () => {
  assert.equal(aer({ shAir: 9.01, press: 'LOW_BLOCK', gk: 1 }).d.crossesWon, 2);
  assert.equal(aer({ shAir: 9, press: 'LOW_BLOCK', gk: 1 }).d.crossesWon, 0);
  assert.equal(aer({ shAir: 9, press: 'MID_BLOCK', gk: 1 }).d.crossesWon, 2);
});
test('et reddet hovedstød giver hjørne med CORNER_P 0,9 (ikke 0,35); en clearet bold med 0,35 – og en vundet duel som mål giver intet', () => {
  const corners = (shAir, script) => aer({ shAir, script }).m.stats.hCorners;
  assert.equal(corners(9.75, { 0.9: true }), 2); assert.equal(corners(9.75, { 0.35: true }), 0);       // reddet
  assert.equal(corners(8, { 0.35: true }), 2); assert.equal(corners(8, { 0.9: true }), 0);              // clearet (8 + 3 + 2 = 13 ≤ 13)
  assert.equal(corners(12, { 0.9: true, 0.35: true }), 0);                                               // mål
});
test('luftduel-tekster: dit hold nævner kilden (Dit indlæg / Din lange bold), en bot gør det aldrig; reddet hovedstød og clearing står på forsvarets side', () => {
  const clr = (o) => aer({ shAir: 8, ...o }).m.events.filter((e) => e.label === 'Luftduel i feltet');
  const cross = clr({}), long = clr({ focus: 'CENTRAL', pass: 'DIRECT_LONG' });
  // v3.16.3: fire varianter af clearingen (pickBy på minut og forsvarer), og skytten nævnes med sit hold
  assert.ok(cross.length === 2 && cross.every((e) => /^✈️ \[.+ forsvar\] Dit indlæg: #\d+ .+ \(\d+ cm\) (stiger højest og clearer|vinder duellen og header væk|kommer først og rydder|hamrer bolden ud af feltet) foran #\d+ \S+ \S+ \(Bibamus United\)\.$/.test(e.text) && e.isHome === false), cross[0]?.text);
  assert.ok(long.length === 2 && long.every((e) => /^✈️ \[.+ forsvar\] Din lange bold: #\d+ /.test(e.text) && e.isHome === false), long[0]?.text);
  for (const o of [{ homeBot: true }, { homeBot: true, focus: 'CENTRAL', pass: 'DIRECT_LONG' }]) {
    const b = clr({ ...o });
    assert.ok(b.length === 2 && b.every((e) => /^✈️ \[.+ forsvar\] Stærk luftduel: #\d+ /.test(e.text) && !/Dit indlæg|Din lange|Dit |Din /.test(e.text)), b[0]?.text);
  }
  const sv = aer({ shAir: 9.75 }).m.events.filter((e) => e.label === 'Hovedstød reddet');
  assert.ok(sv.length === 2 && sv.every((e) => e.isHome === false && /^🧤 \[.+\] #\d+ .+ redder hovedstødet fra #\d+ .+ \(.+, \d+ cm\), der vandt luftduellen\.$/.test(e.text)), sv[0]?.text);
});
test('dødbold-hovedstød tæller ikke som åbent spil i duelLog (headerGoals/crosses/crossesWon forbliver 0)', () => {
  const a = arena(); slot(a.A, 0).skills.goalkeeping = 15; for (const p of a.H.squad) p.aerialPower = 20;
  const m = simulateMatch(a.H, a.A, stubRng({ 0.3: shots(2), 0.9: true }));   // redning → hjørnespark (0,9) → hovedstødsmål
  assert.ok(m.stats.hHeaderGoals >= 1 && m.stats.hCorners >= 1, 'fixturet skal have hovedstødsmål på hjørne');
  assert.deepEqual([m.duelLog[a.H.id].headerGoals, m.duelLog[a.H.id].crosses, m.duelLog[a.H.id].crossesWon], [0, 0, 0]);
});
test('duelLog er privat: ikke-optællelig på kampen, aldrig i JSON (ellers gemmes og afsløres modstanderens tællere)', () => {
  const { H, A } = arena();
  const m = simulateMatch(H, A, stubRng({ 0.3: shots(2) }));
  assert.ok(m.duelLog && m.duelLog[H.id]);
  assert.ok(!Object.keys(m).includes('duelLog'));
  assert.ok(!JSON.stringify(m).includes('duelLog'));
});

// ---------- Modtager efter position ----------
// Kun to kandidater har evne (andre sættes langt væk med evne 1). Vægt = exp(−afstand/12)·evne.
function headerScorer(layoutSpots, aerial, fin = {}) {
  const a = arena({ home: { p1: { attackFocus: 'HIGH_CROSSES' } } });
  for (const p of a.H.squad) { p.aerialPower = 1; p.skills.finishing = 1; }
  for (const [i, v] of Object.entries(aerial)) slot(a.H, i).aerialPower = v;
  for (const [i, v] of Object.entries(fin)) slot(a.H, i).skills.finishing = v;
  layout(a.H, layoutSpots);
  for (const p of a.A.squad) p.aerialPower = 1; slot(a.A, 0).skills.goalkeeping = 1;
  const m = simulateMatch(a.H, a.A, stubRng({ 0.3: shots(2), 0.52: true }));
  return { a, m, scorers: m.goalsPool.map((g) => g.scorer) };
}
test('hovedstødsspilleren vægtes efter afstand til feltets midte (50,16) og luftstyrke: 6 væk slår 10 væk – dræber SPOT.CROSS og SPOT.GOAL-forveksling', () => {
  const r = headerScorer({ 7: { x: 50, y: 22 }, 8: { x: 50, y: 6 } }, { 7: 10, 8: 10 });
  assert.deepEqual(r.scorers, [tg(slot(r.a.H, 7)), tg(slot(r.a.H, 7))]);   // (50,16): P 6,07 mod Q 4,35 – med spot (50,6) var det Q
});
test('hovedstødsspilleren vægtes efter luftstyrke, ikke afslutning (samme sted): AIR 14/FIN 6 mod AIR 6/FIN 14', () => {
  const r = headerScorer({ 9: { x: 50, y: 16 }, 10: { x: 50, y: 16 } }, { 9: 14, 10: 6 }, { 9: 6, 10: 14 });
  assert.deepEqual(r.scorers, [tg(slot(r.a.H, 9)), tg(slot(r.a.H, 9))]);
});
test('indlægget slås fra kanten (88,30) af den bedste afleverer, aldrig af hovedstødsspilleren, og ikke af midtbanens første mand – assisten går til den rigtige', () => {
  const run = (setup, nextValue = 0.5) => {
    const a = arena({ home: { p1: { attackFocus: 'HIGH_CROSSES' } } });
    for (const p of a.H.squad) { p.aerialPower = 1; p.skills.passing = 0; p.skills.finishing = 5; }
    for (const p of a.A.squad) p.aerialPower = 1; slot(a.A, 0).skills.goalkeeping = 1;
    setup(a); homeBall(a);
    const m = simulateMatch(a.H, a.A, stubRng({ 0.3: shots(2), 0.52: true }, nextValue));
    const who = (e) => m.ratings.home.find((x) => x.playerId === e.id);
    return { a, m, assistOf: (i) => who(slot(a.H, i)).assists, scorerIs: (i) => m.goalsPool.every((g) => g.scorer === tg(slot(a.H, i))) };
  };
  // Default-pladser: skytte = ST 9 (luft 30), kantspiller = RM 8 (pasning 20) – ikke midtbanens første (LM 5)
  // (CM 7 står tættere på midten (50,30) end på kanten (88,30) og har samme PAS – han må ikke tage indlægget)
  const base = run((a) => { slot(a.H, 9).aerialPower = 30; slot(a.H, 8).skills.passing = 20; slot(a.H, 7).skills.passing = 20; });
  assert.ok(base.scorerIs(9)); assert.equal(base.assistOf(8), 2); assert.equal(base.assistOf(5), 0); assert.equal(base.assistOf(4), 0); assert.equal(base.assistOf(7), 0);
  // Evnen er PASNING (ikke afslutning): RM har FIN 0, PAS 20; de andre FIN 20, PAS 0
  const pas = run((a) => { slot(a.H, 9).aerialPower = 30; for (const p of a.H.squad) p.skills.finishing = 20; Object.assign(slot(a.H, 8).skills, { passing: 20, finishing: 0 }); });
  assert.equal(pas.assistOf(8), 2);
  // Samme spiller er både hovedstødsspiller og bedste afleverer: indlægget slås af en anden (exclude)
  const same = run((a) => {
    Object.assign(slot(a.H, 8), { aerialPower: 30 }); slot(a.H, 8).skills.passing = 60; slot(a.H, 10).skills.passing = 40;   // vægt 10 + evne (QC-kalibreringen)
    a.H.tactics.customCoords = { 8: { x: 50, y: 16 } };
  });
  assert.ok(same.scorerIs(8)); assert.equal(same.assistOf(8), 0); assert.equal(same.assistOf(10), 2);
  // Den anden kant (next < 0,5): venstre kant, LM 5. v3.16 (koblede linjer): angriberne står på linjen (y 28, før 14), så alle står
  // 12+ bag hovedstødspletten (50,16) og luftstyrken skal veje mere: med luft 30 lander lodtrækningen ved 0,4 på RM (plads 8, før
  // ST 9 i rækken); med luft 60 (vægt 70 · e^(−26/16) ≈ 13,8 mod resten ≈ 15) er ST 9 stadig hovedstødsspilleren.
  const left = run((a) => { slot(a.H, 9).aerialPower = 60; slot(a.H, 5).skills.passing = 20; }, 0.4);
  assert.ok(left.scorerIs(9));
  assert.equal(left.assistOf(5), 2);
});
test('skytten i almindeligt spil vælges efter afslutning (ikke pasning) og ikke blot første mand: FIN 6/PAS 14 mod FIN 14/PAS 6, og omvendt', () => {
  const run = (finP, finQ, pasP, pasQ) => {
    const a = arena();
    for (const p of a.H.squad) { p.skills.finishing = 0; p.skills.passing = 0; p.skills.pace = 1; p.skills.positioning = 1; }
    Object.assign(slot(a.H, 9).skills, { finishing: finP, passing: pasP }); Object.assign(slot(a.H, 10).skills, { finishing: finQ, passing: pasQ });
    layout(a.H, { 9: { x: 50, y: 10 }, 10: { x: 50, y: 10 } });
    for (const i of [1, 2, 3, 4]) Object.assign(slot(a.A, i).skills, { positioning: 40, intercepting: 40, strength: 40 });   // ingen løb kommer fri
    for (const p of a.A.squad.slice(5, 11)) p.skills.passing = 0;
    slot(a.A, 0).skills.goalkeeping = 0;
    const m = simulateMatch(a.H, a.A, stubRng({ 0.3: shots(2) }));
    return { a, scorers: m.goalsPool.map((g) => g.scorer), m };
  };
  const x = run(6, 14, 14, 6);                       // vægte 6 og 14: r = 10 → anden (FIN). Med pasning som vægt: første
  assert.equal(x.m.goalsPool.length, 2); assert.deepEqual(x.scorers, [tg(slot(x.a.H, 10)), tg(slot(x.a.H, 10))]);
  const y = run(14, 6, 6, 6);                        // vægte 14 og 6: r = 10 → første. Uden evne (1 og 1): anden
  assert.deepEqual(y.scorers, [tg(slot(y.a.H, 9)), tg(slot(y.a.H, 9))]);
});
test('modtagerens vægt er RECEIVE_BASE 10 + evne (evne 0 vælges, hvis han står alene på stedet) – og evnen tæller (1 mod 10 vejer 11:20)', () => {
  const who = (aerial, spots) => {
    const a = arena({ home: { p1: { attackFocus: 'HIGH_CROSSES' } } });
    for (const p of a.H.squad) p.aerialPower = 3;
    for (const [i, v] of Object.entries(aerial)) slot(a.H, i).aerialPower = v;
    layout(a.H, spots);
    for (const p of a.A.squad) p.aerialPower = 1; slot(a.A, 0).skills.goalkeeping = 1;
    const m = simulateMatch(a.H, a.A, stubRng({ 0.3: shots(1), 0.52: true }));
    const ev = m.events.find((e) => e.type === 'HEADER_GOAL' || e.label === 'Hovedstød reddet' || e.label === 'Luftduel i feltet');
    return { a, text: ev.text };
  };
  // Alene på stedet med luftstyrke 0 (vægt 0,5) mod 9 andre langt væk med 3 (≈0,115 i alt): ham med 0 tager hovedstødet
  const zero = who({ 7: 0 }, { 7: { x: 50, y: 16 } });
  assert.ok(zero.text.includes(tg(slot(zero.a.H, 7))), zero.text);
  // To på samme sted: luftstyrke 1 (plads 7) og 10 (plads 8): vægte 11 og 20 → plads 8. Uden evne i vægten tog plads 7 den.
  const four = who({ 7: 1, 8: 10 }, { 7: { x: 50, y: 16 }, 8: { x: 50, y: 16 } });
  assert.ok(four.text.includes(tg(slot(four.a.H, 8))), four.text);
});

// ---------- Cutback ----------
const FIGHT = { pace: 0, ballControl: 0 };
function cb({ next = 0.5, setup = null, script = {}, bot = false, press = 'MID_BLOCK', n = 2, gk = 0 } = {}) {
  const a = arena({ home: { p1: { attackFocus: 'LOW_CUTBACKS' } }, away: { p2: { pressingHeight: press } } });
  for (const p of a.H.squad) Object.assign(p.skills, FIGHT);          // ingen andre end de udpegede vægter som kantspiller
  for (const p of a.A.squad) Object.assign(p.skills, { pace: 0, positioning: 0 });
  slot(a.A, 0).skills.goalkeeping = gk;
  homeBall(a); noRotation(a.A);
  if (setup) setup(a);
  if (bot) a.H.isBot = true;
  const m = simulateMatch(a.H, a.A, stubRng({ 0.3: shots(n), 0.38: true, ...script }, next));
  return { a, m, d: m.duelLog[a.H.id], blocked: m.events.filter((e) => e.label === 'Kanten lukket'), win: m.events.filter((e) => e.label === 'Mod baglinjen') };
}
const strongBacks = (v = 30) => (a) => { for (const p of a.A.squad) Object.assign(p.skills, { pace: v, positioning: v }); };
// v3.16.1 (sammenpresning): forsvaret presses sammen efter sit pres ([20, 63] til [51, 63]: midtbanen 45 → 58), så kantmidtbanespilleren
// på boldsiden står 16 fra cutback-forsvarets plet (100 − wx, 72) og kan selv lukke kanten. Vægtene exp(−afstand/16) for (12, 72) med bolden
// til venstre (−11,4): LB (4, 70) 0,60, CB (27, 73) 0,39, CB (51, 73) 0,09, RB 0,02, LM (4, 58) 0,37 … i alt 2,11. Ved 0,55 (højre kant)
// lander lodtrækningen (1,16) på LM (plads 5); ved 0,5 lå den på den fjerne stopper (plads 3, x 51 – kumuleret 1,08 ≥ 1,06). Ved 0,4
// (venstre kant, spejlet) på RB (plads 4). Aldrig én fra den modsatte side.
test('cutback: flanken følger terningen (next < 0,5 = venstre kant) og forsvareren står på den MODSATTE side – RM mod LB ved 0,55, LM mod RB ved 0,4', () => {
  // v3.16.7: backen er backen på sin side (før den nærmeste – i v3.16 LM'en)
  const setup = (a) => { strongBacks()(a); for (const i of [5, 8]) Object.assign(slot(a.H, i).skills, { pace: 20, ballControl: 20 }); };
  const right = cb({ next: 0.55, setup }), left = cb({ next: 0.4, setup });
  assert.equal(right.blocked.length, 2); assert.equal(left.blocked.length, 2);
  // v3.12.1: forsvaret forskydes mod boldsiden, så den nærmeste kan være backen, stopperen eller (v3.16) kantmidtbanespilleren på
  // DEN side – aldrig én fra den modsatte side.
  const side = (r, ids, w) => r.blocked.every((e) => ids.some((i) => e.text.includes(`${tg(slot(r.a.A, i))} (`)) && e.text.includes(`lukker kanten mod ${tg(slot(r.a.H, w))}.`));
  assert.ok(side(right, [1], 8), right.blocked[0].text); assert.ok(!side(right, [2, 3, 4, 5, 8], 8));
  assert.ok(side(left, [4], 5), left.blocked[0].text); assert.ok(!side(left, [1, 2, 5], 5));
});
test('cutback: kantspilleren vælges efter PAC+BAL (begge dele) og backen efter PAC+POS (begge dele) – en anden med højere ene evne stjæler dem ikke', () => {
  const who = (hs, as) => cb({ setup: (a) => {
    for (const p of a.A.squad) Object.assign(p.skills, { pace: 0, positioning: 0 });
    for (const [i, s] of Object.entries(hs)) Object.assign(slot(a.H, i).skills, s);
    for (const [i, s] of Object.entries(as)) Object.assign(slot(a.A, i).skills, s);
    for (const i of [1, 2, 3, 4]) slot(a.A, i).skills.strength = 0;
  } });
  const ok = (r, w, b) => r.blocked.length === 2 && r.blocked.every((e) => e.text.includes(`${tg(slot(r.a.A, b))} (`) && e.text.includes(`lukker kanten mod ${tg(slot(r.a.H, w))}.`));
  // Kantspiller: RM (8) PAC 1 + BAL 28 mod ST (10) PAC 30 – og omvendt (PAC 28 + BAL 1 mod BAL 30).
  // Back: LB (1) PAC 1 + POS 60 mod CB (2) PAC 60 – og omvendt (PAC 60 + POS 1 mod CB POS 60).
  const w1 = who({ 8: { pace: 1, ballControl: 28 }, 10: { pace: 30, ballControl: 0 } }, { 1: { pace: 30, positioning: 30 } });
  const w2 = who({ 8: { pace: 28, ballControl: 1 }, 10: { pace: 0, ballControl: 30 } }, { 1: { pace: 30, positioning: 30 } });
  assert.ok(ok(w1, 8, 1), w1.blocked[0]?.text); assert.ok(ok(w2, 8, 1), w2.blocked[0]?.text);
  // v3.16: midtbanen står 16 nærmere forsvarets plet (blok-rykningen), så de evneløse vejer mere (≈ 12,5 i alt mod før ≈ 6) – med
  // 1 + 30 mod 30 vandt CB'en lodtrækningen. Nu 1 + 60 mod 60: LB 71 · 0,597 = 42,4 > halvdelen af 42,4 + CB 70 · 0,391 = 27,4 + 12,5;
  // med kun PAC (eller kun POS) som vægt: LB 11 · 0,597 = 6,6 → CB'en.
  const b1 = who({ 8: { pace: 10, ballControl: 10 } }, { 1: { pace: 1, positioning: 60 }, 2: { pace: 60, positioning: 0 } });
  const b2 = who({ 8: { pace: 10, ballControl: 10 } }, { 1: { pace: 60, positioning: 1 }, 2: { pace: 1, positioning: 60 } });
  assert.ok(ok(b1, 8, 1), b1.blocked[0]?.text); assert.ok(ok(b2, 8, 1), b2.blocked[0]?.text);
});
test('cutback-duellen: PAC+BAL mod PAC+POS summeres begge dele på begge sider (15+5 mod 17+5 holder; 5+15 mod 5+17 holder) – 21,9 slår, 22 holder', () => {
  const duel = (w, bk, o = {}) => cb({ setup: (a) => {
    Object.assign(slot(a.H, 8).skills, { pace: w[0], ballControl: w[1] }); Object.assign(slot(a.A, 1).skills, { pace: bk[0], positioning: bk[1] });
    if (o.hFresh != null) for (const p of a.H.squad) p.freshness = o.hFresh;
    if (o.aFresh != null) for (const p of a.A.squad) p.freshness = o.aFresh;
  } }).d.cutbacksBlocked;
  // W + 4 ≤ D + 4 − 2 → holder. 20 mod 22 holder:
  assert.equal(duel([15, 5], [17, 5]), 2); assert.equal(duel([5, 15], [5, 17]), 2);
  assert.equal(duel([15, 5], [16.9, 5]), 0); assert.equal(duel([5, 15], [5, 16.9]), 0);
  // Friskhed: kantspiller 28 ved 0 % (·0,75 = 21) mod 24: 25 ≤ 26 holder; uden friskhed 32 > 26 slår. Back 26 ved 0 % (19,5) mod 20: 24 > 21,5 slår; uden 28 holder.
  assert.equal(duel([28, 0], [12, 12], { hFresh: 0 }), 2); assert.equal(duel([28, 0], [12, 12]), 0);
  assert.equal(duel([10, 10], [13, 13], { aFresh: 0 }), 0); assert.equal(duel([10, 10], [13, 13]), 2);
});
test('en lukket kant giver hjørne med CROSS_CORNER_P 0,35 (hverken 0,9 eller ingen) – og en bots egne cutbacks viser "Mod baglinjen" på angriberens side', () => {
  const corners = (script) => cb({ setup: strongBacks(), script }).m.stats.hCorners;
  assert.equal(corners({ 0.35: true }), 2); assert.equal(corners({}), 0); assert.equal(corners({ 0.9: true }), 0);
  const bot = cb({ bot: true });
  assert.equal(bot.win.length, 2); assert.ok(bot.win.every((e) => e.isHome === true), 'angriberen (hjemme) er den, der kommer forbi');
});
test('cutback-afslutteren står nær (50,28) og er ikke kantspilleren selv; PAS vælger ham ikke, FIN gør', () => {
  const run = (setup) => cb({ n: 2, setup: (a) => {
    for (const p of a.H.squad) Object.assign(p.skills, { finishing: 1, passing: 10, pace: 0, ballControl: 0 });
    setup(a);
  } });
  const text = (r) => r.m.events.filter((e) => e.type === 'GOAL').map((e) => e.text);
  // Afstand: P (50,34) og Q (50,14), lige gode: (50,28) → P, (50,10) eller (50,12) → Q. RM (8) er kantspiller.
  const near = run((a) => {
    Object.assign(slot(a.H, 8).skills, { pace: 15, ballControl: 15 }); Object.assign(slot(a.H, 9).skills, { finishing: 10 }); Object.assign(slot(a.H, 10).skills, { finishing: 10 });
    layout(a.H, { 8: { x: 85, y: 45 }, 9: { x: 50, y: 34 }, 10: { x: 50, y: 14 } });
  });
  assert.equal(near.m.homeGoals, 2);
  for (const t of text(near)) assert.ok(t.includes(`MÅÅÅL! ${tg(slot(near.a.H, 8))} når baglinjen og lægger den lavt tilbage til ${tg(slot(near.a.H, 9))}.`) && !t.includes('✅'), t);   // v3.16.3: uden ✅
  // Kantspilleren er bedst til afslutning og står på cutbackstedet – men er ekskluderet; plads 9 tager den.
  // v3.16.1: plads 9 står ved siden af (40, 28), ikke oven i ham – to på samme plet skubbes fra hinanden (spread), og så kom plads 9
  // (64, 32) inden for kantens rækkevidde (25 fra (88, 30)) og blev selv kantspiller. Nu: RM (61, 28) og ST (55, 32 – skubbet fra
  // stopperen) begge uden for rækkevidden → kantspilleren vælges blandt alle efter PAC+BAL (100).
  const self = run((a) => {
    Object.assign(slot(a.H, 8).skills, { pace: 50, ballControl: 50, finishing: 20 }); Object.assign(slot(a.H, 9).skills, { finishing: 10 });
    layout(a.H, { 8: { x: 50, y: 28 }, 9: { x: 40, y: 28 } });
  });
  for (const t of text(self)) assert.ok(t.includes(`MÅÅÅL! ${tg(slot(self.a.H, 8))} når baglinjen og lægger den lavt tilbage til ${tg(slot(self.a.H, 9))}.`), t);
  // Evne: FIN, ikke PAS (samme afstand; P: FIN 6/PAS 14, Q: FIN 14/PAS 6). v3.16.1: to på samme plet skubbes fra hinanden (spread), og så
  // afgjorde afstanden – derfor spejlet om pletten: x 36 / 42 + 11,4 (boldsiden) = 47 / 53, y 40 − 6 = 34 (RM rå 29 bag linjen 28: ingen
  // sammenpresning), begge 6,7 fra (50, 28), 7 fra stopperne (y 27) og bottens midtbane (y 41) – ingen skubbes.
  const skill = run((a) => {
    Object.assign(slot(a.H, 8).skills, { pace: 15, ballControl: 15 });
    Object.assign(slot(a.H, 9).skills, { finishing: 6, passing: 14 }); Object.assign(slot(a.H, 10).skills, { finishing: 14, passing: 6 });
    layout(a.H, { 8: { x: 85, y: 45 }, 9: { x: 36, y: 40 }, 10: { x: 42, y: 40 } });
  });
  for (const t of text(skill)) assert.ok(t.includes(`lavt tilbage til ${tg(slot(skill.a.H, 10))}.`), t);
});

// ---------- Fuldtids-analysen: tre forskellige tal pr. par, så en ombytning ses ----------
// Tre høje bolde (mål, reddet, clearet → 3 forsøg, 2 vundet, 1 hovedstødsmål), derefter fire cutbacks
// (mål, mål, reddet, lukket → 4 forsøg, 2 mål, 1 stoppet). Tilstanden ændres undervejs i scriptet.
function mixedMatch({ meIsAttacker }) {
  const a = arena({ home: { p1: { attackFocus: 'LOW_CUTBACKS', passingStyle: 'DIRECT_LONG' } } });
  for (const p of a.H.squad) { p.aerialPower = 15; Object.assign(p.skills, { pace: 10, ballControl: 10, finishing: 10 }); }
  for (const p of a.A.squad) { p.aerialPower = 10; Object.assign(p.skills, { pace: 1, positioning: 1 }); }
  const gk = slot(a.A, 0), setGk = (v) => { gk.skills.goalkeeping = v; }, setCb = (v) => { for (const i of [1, 2, 3, 4]) slot(a.A, i).aerialPower = v; };
  setGk(1); noRotation(a.A);
  if (!meIsAttacker) { a.H.isBot = true; a.A.isBot = false; }
  const long = (k) => { if (k === 1) setGk(30); if (k === 2) { setGk(1); setCb(30); } if (k === 3) setCb(10); return k < 3; };
  const cut = (n) => { if (n === 2) setGk(30); if (n === 3) { setGk(1); strongBacks(60)(a); } return true; };
  const m = simulateMatch(a.H, a.A, stubRng({ 0.3: shots(7), 0.15: long, 0.38: cut }));
  return { a, m, ft: m.events.find((e) => e.type === 'FULLTIME') };
}
test('fuldtids-analysen: dit angreb (forsøg/mål/stoppet, høje bolde/vundne/hovedstødsmål) og dit felt hver for sig – ingen ombyttede tal', () => {
  const me = mixedMatch({ meIsAttacker: true });
  assert.deepEqual([me.m.duelLog[me.m.homeId].crosses, me.m.duelLog[me.m.homeId].crossesWon, me.m.duelLog[me.m.homeId].headerGoals], [3, 2, 1]);
  assert.deepEqual([me.m.duelLog[me.m.homeId].cutbacks, me.m.duelLog[me.m.homeId].cutbackGoals, me.m.duelLog[me.m.homeId].cutbacksBlocked], [4, 2, 1]);
  assert.ok(me.ft.text.endsWith(' ⚔️ Angreb (Lave cutbacks · direkte lange bolde): 4 cutbacks (2 mål, 1 stoppet ved kanten), 3 høje bolde (2 vundne luftdueller i åbent spil, 1 hovedstødsmål). 🛡️ Dit felt: modstanderens cutbacks stoppet 0 af 0 · luftdueller i åbent spil vundet 0 af 0.'), me.ft.text);
  // Samme kamp set fra forsvarets side: en bot angriber dig. Du har ikke selv noget angreb (Centralt · balanceret).
  const def = mixedMatch({ meIsAttacker: false });
  assert.equal(def.ft.isHome, false);
  assert.ok(def.ft.text.endsWith(' ⚔️ Angreb (Centralt · balanceret): ingen cutbacks eller høje bolde. 🛡️ Dit felt: modstanderens cutbacks stoppet 1 af 4 · luftdueller i åbent spil vundet 1 af 3.'), def.ft.text);
});
test('fuldtids-analysen nævner alle ni kombinationer af fokus og pasningsstil med de rigtige danske navne', () => {
  const F = { CENTRAL: 'Centralt', HIGH_CROSSES: 'Høje indlæg', LOW_CUTBACKS: 'Lave cutbacks' };
  const P = { SHORT: 'korte pasninger', BALANCED: 'balanceret', DIRECT_LONG: 'direkte lange bolde' };
  for (const [f, fl] of Object.entries(F)) for (const [p, pl] of Object.entries(P)) {
    const a = arena({ home: { p1: { attackFocus: f, passingStyle: p } } });
    const ft = simulateMatch(a.H, a.A, stubRng()).events.find((e) => e.type === 'FULLTIME');
    assert.ok(ft.text.includes(` ⚔️ Angreb (${fl} · ${pl}): `), `${f}/${p}: ${ft.text.slice(-260)}`);
  }
});

// ---------- Løb → aflevering fra kanten tæller som cutback i duelLog ----------
function runCase({ rm, custom = null, gk = 1 }) {
  const a = arena({ home: { p1: { attackFocus: 'CENTRAL' } } });
  for (const i of [5, 6, 7, 8]) slot(a.A, i).skills.passing = 1;
  for (const i of [1, 2, 3, 4]) Object.assign(slot(a.A, i).skills, { positioning: 1, intercepting: 1, strength: 1 });
  slot(a.A, 0).skills.goalkeeping = gk;
  Object.assign(slot(a.H, 8).skills, rm); if (custom) a.H.tactics.customCoords = custom;
  const m = simulateMatch(a.H, a.A, stubRng({ 0.3: shots(2) }));
  return { m, kinds: m.goalsPool.map((g) => g.kind), d: m.duelLog[a.H.id] };
}
test('duelLog for løb: en aflevering fra kanten tæller som cutback (og som cutbackmål); en kombination midt i banen eller et langskud gør ikke', () => {
  const wide = runCase({ rm: { passing: 20, finishing: 1 } });
  assert.deepEqual(wide.kinds, ['CUTBACK', 'CUTBACK']);
  assert.deepEqual([wide.d.cutbacks, wide.d.cutbackGoals, wide.d.runGoals, wide.d.cutbacksBlocked], [2, 2, 2, 0]);
  const saved = runCase({ rm: { passing: 20, finishing: 1 }, gk: 25 });
  assert.deepEqual(saved.kinds, []); assert.deepEqual([saved.d.cutbacks, saved.d.cutbackGoals, saved.d.runGoals], [2, 0, 0]);
  const mid = runCase({ rm: { passing: 20, finishing: 1 }, custom: { 8: { x: 50, y: 60 } } });
  assert.deepEqual(mid.kinds, ['COMBINATION', 'COMBINATION']);
  assert.deepEqual([mid.d.cutbacks, mid.d.cutbackGoals, mid.d.runGoals], [0, 0, 2]);
  const shot = runCase({ rm: { finishing: 20, passing: 1, pace: 1, ballControl: 1 }, custom: { 8: { x: 50, y: 82 } } });
  assert.deepEqual(shot.kinds, ['LONGSHOT', 'LONGSHOT']);
  assert.deepEqual([shot.d.cutbacks, shot.d.cutbackGoals, shot.d.runGoals], [0, 0, 2]);
});

// ---------- Måleværktøjet (balance.test.mjs bygger sine bånd på det) ----------
test('measureFocus: netto = for − imod, hovedstødsmål er færre end vundne luftdueller (keeperen redder nogle), cutback-udfaldene er en delmængde af forsøgene', async () => {
  const { measureFocus } = await import('../../tools/measure-duels.mjs');
  // N = 4 (32 kampe): med 2 lå cutbacks pr. kamp på præcis 1 efter v3.12.1's kalibrering – for lidt data til "> 1".
  const x = measureFocus({ focus: 'HIGH_CROSSES' }, 4), c = measureFocus({ focus: 'LOW_CUTBACKS', oppPress: 'HIGH_GEGENPRESS' }, 4);
  assert.equal(x.games, 32);
  assert.ok(Math.abs(x.net - (x.gf - x.ga)) < 1e-9 && Math.abs(x.gf + x.ga - x.goalsPerMatch) < 1e-9, JSON.stringify(x));
  assert.ok(x.crosses * x.games > 10 && x.headerGoals > 0 && x.headerGoals < x.crosses * x.crossWinRate - 1e-9, JSON.stringify(x));
  assert.ok(c.cutbacks * c.games > 10 && c.cutbacksBlocked > 0 && c.cutbackGoals + c.cutbacksBlocked <= c.cutbacks + 1e-9, JSON.stringify(c));
  // Modgiften sættes på B (ikke A): højt gegenpres lukker flere af A's kanter end A's egen lav blok ville
  const open = measureFocus({ focus: 'LOW_CUTBACKS', oppPress: 'LOW_BLOCK' }, 4);
  assert.ok(c.cutbacksBlocked / c.cutbacks > open.cutbacksBlocked / open.cutbacks, `${c.cutbacksBlocked / c.cutbacks} mod ${open.cutbacksBlocked / open.cutbacks}`);
});

// ---------- Almindelig afslutning gennem finishAttempt ----------
function plainShot({ shooterSkills = {}, spots = { 9: { x: 50, y: 10 } }, setup = null } = {}) {
  const a = arena();
  for (const p of a.H.squad) Object.assign(p.skills, { positioning: 1, pace: 1, finishing: 0, passing: 10, ballControl: 10 });
  Object.assign(slot(a.H, 9).skills, { finishing: 10, ...shooterSkills });
  layout(a.H, spots);
  for (const i of [1, 2, 3, 4]) Object.assign(slot(a.A, i).skills, { positioning: 60, intercepting: 60, strength: 60 });   // ingen løb kommer fri
  slot(a.A, 0).skills.goalkeeping = 0;
  if (setup) setup(a);
  const m = simulateMatch(a.H, a.A, stubRng({ 0.3: shots(2) }));
  return { a, m };
}
test('almindelig afslutning: skytten er også første midtbane (oplægsgiveren) → assisten går til en anden (v3.16.6), og ratingen er 6,5 + 2·1,25 (ikke solo)', () => {
  const r = plainShot({ spots: { 5: { x: 50, y: 10 } }, setup: (a) => { Object.assign(slot(a.H, 5).skills, { finishing: 10 }); slot(a.H, 9).skills.finishing = 0; } });
  assert.deepEqual(r.m.goalsPool.map((g) => [g.kind, g.scorer]), [['COMBINATION', tg(slot(r.a.H, 5))], ['COMBINATION', tg(slot(r.a.H, 5))]]);
  assert.equal(r.m.ratings.home.reduce((s, e) => s + e.assists, 0), 2, 'én assist pr. mål – til en anden end skytten');
  assert.equal(r.m.ratings.home.find((e) => e.playerId === slot(r.a.H, 5).id).assists, 0);
  assert.equal(r.m.ratings.home.find((e) => e.playerId === slot(r.a.H, 5).id).rating, 9.4);   // + 0,4 sejr (v3.15)
});
test('almindelig afslutning: målmanden er aldrig modtager, selv om han er trukket helt frem og har den bedste afslutning', () => {
  const r = plainShot({ spots: { 9: { x: 50, y: 10 } }, setup: (a) => { slot(a.H, 0).skills.finishing = 40; a.H.tactics.customCoords[0] = { x: 50, y: 10 }; } });
  assert.deepEqual(r.m.goalsPool.map((g) => g.scorer), [tg(slot(r.a.H, 9)), tg(slot(r.a.H, 9))]);
});
test('almindelig afslutning: en dribletur bruger skyttens PAC og BAL hver for sig i målets spektakel (PAC 28/BAL 8 ≠ BAL 8/BAL 8)', () => {
  // Vægte ved next 0,5: kombination 4, langskud (FIN 8 − 8)·0,45 = 0, dribletur ((28 + 8)/2 − 8)·0,45 = 4,5 → r = 4,25 → dribletur
  const r = plainShot({ shooterSkills: { finishing: 8, pace: 28, ballControl: 8, passing: 10 } });
  assert.deepEqual(r.m.goalsPool.map((g) => g.kind), ['DRIBBLE', 'DRIBBLE']);
  const g = r.m.goalsPool[0];
  assert.equal(g.spectacle, goalSpectacle('DRIBBLE', { finishing: 8, pace: 28, ballControl: 8, passing: 10 }, g.min, { next: () => 0.5 }));
  assert.notEqual(g.spectacle, goalSpectacle('DRIBBLE', { finishing: 8, pace: 8, ballControl: 8, passing: 10 }, g.min, { next: () => 0.5 }));
});
