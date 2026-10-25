// Deterministiske tests af motorens enkelte beslutninger. En styret rng (stub) afgør hver
// sandsynlighed for sig, så en ændret bonus, tærskel eller sandsynlighed bliver rød –
// statistiske invarianter (summer, rækkefølge) kan ikke se den slags (Test Managers fund).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague, isArchetypeUnlocked, BOT_PROFILES, ARCHETYPES, defaultStarterIds } from '../../public/engine/generator.js';
import { simulateMatch as simLive, counterChance, runZone, runGroup, decisionWeights, RUN_WEIGHT } from '../../public/engine/match.js';
import { commitRound, sortStandings, playPairs, fixedPairs } from '../../public/engine/season.js';
import { buildGazette } from '../../public/engine/gazette.js';
import { normalizeLeague } from '../../public/engine/sanitize.js';
import { applyCounterXp } from '../../public/engine/counter.js';
import { starsFromRating } from '../../public/engine/ratings.js';

// chance(p) afgøres af script[p]: true/false eller (n) => bool, hvor n er nummeret på kaldet
// med netop den sandsynlighed. Uomtalte sandsynligheder er false. next() er konstant,
// int() giver nedre grænse, pick() første element.
function stubRng(script = {}, nextValue = 0.5) {
  const calls = {};
  return {
    next: () => nextValue,
    int: (a) => a,
    pick: (arr) => arr[0],
    chance: (p) => {
      const n = (calls[p] = (calls[p] ?? -1) + 1);
      const s = script[p];
      return typeof s === 'function' ? s(n) : !!s;
    },
  };
}

const SK = (v) => ({ pace: v, stamina: v, strength: v, ballControl: v, passing: v, finishing: v, positioning: v, intercepting: v, goalkeeping: v });
// To hold med ens, kendte værdier og neutral mod-kunnen. Ingen Hvis-Så-regler.
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
// 4-4-2: plads 0 GK, 1–4 forsvar, 5–8 midtbane, 9–10 angreb.
// v3.12.1: skytten er den, der står nærmest i øjeblikket (positions.js). Til tests af selve afslutningen:
// alle andre markspillere trækkes helt ned, så plads i er skytten.
const onlyShooter = (t, i = 9) => { t.tactics.customCoords = Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((j) => j !== i).map((j) => [j, { x: 50, y: 95 }])); };
const slot = (t, i) => t.squad.find((p) => p.id === t.tactics.lineupSlots[i]);
const mids = (t) => [5, 6, 7, 8].map((i) => slot(t, i));
const count = (m, label) => m.events.filter((e) => e.label === label).length;

// ---------- Boldbesiddelse og fase-duel ----------
test('boldbesiddelse: ens midtbaner giver hjemmeholdet bolden (4 ≥ 3,75); stærkere ude-midtbane vender det', () => {
  const { H, A } = arena();
  let m = simulateMatch(H, A, stubRng({ 0.48: true }));
  assert.equal(m.stats.hPoss, 10 + 30 * 3); assert.equal(m.stats.aPoss, 10);
  for (const p of mids(A)) p.skills.passing = 11;
  m = simulateMatch(H, A, stubRng({ 0.48: true }));
  assert.equal(m.stats.aPoss, 10 + 30 * 3);
});

test('fase-duel i hvert af de 30 ticks (minut 3–90) ved 48 %', () => {
  const { H, A } = arena();
  const m = simulateMatch(H, A, stubRng({ 0.48: true }));
  assert.equal(count(m, 'Fase 1 virker') + count(m, 'Fase 2 pres virker'), 30);
  assert.equal(m.events.filter((e) => e.label === 'Fase 1 virker' || e.label === 'Fase 2 pres virker').at(-1).min, 90);
  assert.equal(m.events.find((e) => e.type === 'HALFTIME').min, 45);
});

// v3.6: Opbygning = PAS+BAL (20) + 25·0,05 + 3,5 = 24,75.
// Pres = INT + POS·0,85 (8,5) + STA·0,35 (3,5) + 25·0,05 + 3,5 = INT + 16,75.
// INT 9: pres 25,75 vinder – medmindre opbygningens +3 udligner (27,75). Med den gamle formel
// (pres INT + STA·0,6 = 19,25) vandt opbygningen altid her, så testene er røde mod den.
function duel(homePhases, awayPhases, int = 9) {
  const { H, A } = arena({ home: homePhases, away: awayPhases });
  for (const p of mids(A)) p.skills.intercepting = int;
  const m = simulateMatch(H, A, stubRng({ 0.48: true }));
  return { win: count(m, 'Fase 1 virker'), lose: count(m, 'Fase 2 pres virker') };
}

test('sten-saks-papir: uden bonus vinder presset 25,75 mod 24,75', () => {
  assert.deepEqual(duel({}, {}), { win: 0, lose: 30 });
});
test('SHORT mod LOW_BLOCK giver opbygningen +3 (27,75 mod 25,75)', () => {
  assert.deepEqual(duel({ p1: { passingStyle: 'SHORT', attackFocus: 'LOW_CUTBACKS' } }, { p2: { pressingHeight: 'LOW_BLOCK' } }), { win: 30, lose: 0 });
});
test('DIRECT_LONG mod HIGH_GEGENPRESS giver opbygningen +3', () => {
  assert.deepEqual(duel({ p1: { passingStyle: 'DIRECT_LONG' } }, { p2: { pressingHeight: 'HIGH_GEGENPRESS' } }), { win: 30, lose: 0 });
});
// INT 7: pres 23,75 taber til 24,75 – med +3 vinder presset (26,75).
test('HIGH_GEGENPRESS mod SHORT giver presset +3 (ellers vandt opbygningen 24,75 mod 23,75)', () => {
  assert.deepEqual(duel({ p1: { passingStyle: 'SHORT' } }, { p2: { pressingHeight: 'MID_BLOCK' } }, 7), { win: 30, lose: 0 });
  assert.deepEqual(duel({ p1: { passingStyle: 'SHORT' } }, { p2: { pressingHeight: 'HIGH_GEGENPRESS' } }, 7), { win: 0, lose: 30 });
});
test('LOW_BLOCK mod CENTRAL giver presset +3', () => {
  assert.deepEqual(duel({ p1: { attackFocus: 'CENTRAL' } }, { p2: { pressingHeight: 'LOW_BLOCK' } }, 7), { win: 0, lose: 30 });
  assert.deepEqual(duel({ p1: { attackFocus: 'LOW_CUTBACKS' } }, { p2: { pressingHeight: 'LOW_BLOCK' } }, 7), { win: 30, lose: 0 });
});

test('offside-fælden: kun når den ikke er OFF, og kun ved 45 %', () => {
  const run = (trap, s45) => {
    const { H, A } = arena({ away: { p2: { offsideTrap: trap } } });
    for (const p of mids(A)) p.skills.intercepting = 9;
    return simulateMatch(H, A, stubRng({ 0.48: true, 0.45: s45 }));
  };
  assert.equal(count(run('NORMAL', true), 'Offside-fælde virker'), 30);
  assert.equal(count(run('NORMAL', false), 'Offside-fælde virker'), 0);
  assert.equal(count(run('OFF', true), 'Offside-fælde virker'), 0);
});

test('custom position: 25 %; uden for zonen straffes og springer resten af tick over', () => {
  const run = (dx) => {
    const { H, A } = arena();
    const a = { x: 15 + dx, y: 45 }; H.tactics.customCoords = { 5: a };
    return simulateMatch(H, A, stubRng({ 0.25: true, 0.48: true }));
  };
  const out = run(40), inn = run(10);
  assert.equal(count(out, 'Ude af zone'), 30);
  assert.equal(count(out, 'Fase 1 virker') + count(out, 'Fase 2 pres virker'), 0);
  assert.equal(count(inn, 'Custom pos virker'), 30);
  assert.equal(count(inn, 'Fase 1 virker') + count(inn, 'Fase 2 pres virker'), 30);
});

// ---------- Frispark og skade ----------
test('frispark 6 %: skade ved 40 %, ellers gult kort', () => {
  const run = (inj) => { const { H, A } = arena(); return simulateMatch(H, A, stubRng({ 0.06: (n) => n === 0, 0.5: true, 0.4: inj })); };
  const a = run(true), b = run(false);
  assert.equal(a.injuries.length, 1); assert.equal(a.events.filter((e) => e.type === 'FOUL').length, 0);
  assert.equal(b.injuries.length, 0); assert.equal(b.events.filter((e) => e.type === 'FOUL').length, 1);
});

// ---------- Afslutninger ----------
const shots = (n) => (k) => k < n;
// v3.12 (brugeren: "Jeg har sat mit hold til cutbacks, og alligevel er der ikke en eneste reference
// til cutbacks i referatet"): angrebsfokus afgør chancens type; før tvang DIRECT_LONG 55 % op i luften.
test('chancetype efter angrebsfokus: indlæg ved HIGH_CROSSES (0,52), lange bolde ved DIRECT_LONG (0,15), cutbacks ved LOW_CUTBACKS (0,38) – den gamle 55 %-regel er væk', () => {
  const run = (p1, script) => { const { H, A } = arena({ home: { p1 } }); const m = simulateMatch(H, A, stubRng({ 0.3: true, ...script })); return m.duelLog[H.id]; };
  assert.equal(run({ attackFocus: 'HIGH_CROSSES' }, { 0.52: true }).crosses, 30);
  assert.equal(run({ attackFocus: 'HIGH_CROSSES', passingStyle: 'DIRECT_LONG' }, { 0.15: true }).crosses, 0, 'indlægsfokus bruger sin egen andel');
  assert.equal(run({ passingStyle: 'DIRECT_LONG' }, { 0.15: true }).crosses, 30);
  assert.equal(run({ passingStyle: 'DIRECT_LONG' }, { 0.55: true, 0.52: true, 0.38: true }).crosses, 0, 'lange bolde tvinger ikke længere indlæg');
  assert.equal(run({ passingStyle: 'SHORT' }, { 0.52: true, 0.15: true, 0.38: true }).crosses, 0);
  assert.equal(run({ attackFocus: 'HIGH_CROSSES' }, { 0.52: false }).crosses, 0);
  assert.equal(run({ attackFocus: 'LOW_CUTBACKS' }, { 0.38: true }).cutbacks, 30);
  assert.equal(run({ attackFocus: 'CENTRAL' }, { 0.38: true, 0.52: true }).cutbacks, 0);
  // Lange bolde og cutback-fokus: den høje bold afgøres først, så cutbacken
  const both = (s15) => run({ attackFocus: 'LOW_CUTBACKS', passingStyle: 'DIRECT_LONG' }, { 0.15: s15, 0.38: true });
  assert.deepEqual([both(true).crosses, both(true).cutbacks], [30, 0]);
  assert.deepEqual([both(false).crosses, both(false).cutbacks], [0, 30]);
});

// Luftduellen i to trin (v3.12; før vandt angriberen ≈4 % mod CB + keeperens evne·0,38, og en vundet
// duel var altid mål). Rul 0,5: trin 1 = luft + 3 + CROSS_EDGE 2 > CB 10 + 3; trin 2 = luft + 4 > MV 10 + 4 + HEADER_GK_EDGE 0.
// v3.12.1: CROSS_EDGE 1 → 2 (dokumentets målfordeling) – 9 vandt ikke med 1 (13 = 13), vinder nu (14 > 13); 8 taber.
// v3.16 (koblede linjer): angriberne står på offside-linjen (y 28, før 14), alle 12+ bag hovedstødspletten (50,16) – så luft 12 mod
// 10 afgjorde ikke længere hovedstøds-lodtrækningen (en anden med luft 10 fik bolden). onlyShooter: plads 9 er hovedstødsspilleren.
test('luftduel i to trin: 12 vinder og scorer (16 > 14), 10 vinder men reddes (14 = 14), 8 taber til CB\'en (13 = 13); keeperens evne tæller ikke i duellen', () => {
  const run = (att) => {
    const { H, A } = arena({ home: { p1: { attackFocus: 'HIGH_CROSSES' } } });
    onlyShooter(H); slot(H, 9).aerialPower = att; for (const i of [1, 2, 3, 4]) slot(A, i).aerialPower = 10;
    return { m: simulateMatch(H, A, stubRng({ 0.3: shots(2), 0.52: true })), id: slot(H, 9).id, gk: slot(A, 0).id };
  };
  const goal = run(12), saved = run(10), cleared = run(8);
  const r = (x, id) => x.m.ratings.home.concat(x.m.ratings.away).find((e) => e.playerId === id);
  assert.deepEqual([goal.m.homeGoals, goal.m.stats.hAerialWon, goal.m.stats.aAerialWon, goal.m.duelLog[goal.m.homeId].headerGoals], [2, 2, 0, 2]);
  assert.deepEqual([saved.m.homeGoals, saved.m.stats.hAerialWon, saved.m.stats.hOnTarget, count(saved.m, 'Hovedstød reddet')], [0, 2, 2, 2]);
  assert.deepEqual([cleared.m.homeGoals, cleared.m.stats.hAerialWon, cleared.m.stats.aAerialWon, count(cleared.m, 'Luftduel i feltet')], [0, 0, 2, 2]);
  // Karakter: vundet duel +0,4, mål yderligere +0,95 (i alt 1,35 som før); reddet: MV +0,5 pr. redning (+0,5 clean sheet)
  assert.equal(r(goal, goal.id).rating, 9.6);   // 9,2 + 0,4 sejr (v3.15)
  assert.equal(r(saved, saved.id).rating, 7.3);
  assert.equal(r(saved, saved.gk).rating, 8.0);
  assert.equal(r(saved, saved.gk).saves, 2);
  assert.equal(r(saved, saved.id).aerialWins, 2);
});

// VAR (v3.15.1): ikke længere en chancetype (før: rul < 0,22 i chancen) – målet tjekkes EFTER en vundet keeperduel
// (varGoalCheck, GOAL_CHECK_P 0,131 scriptet sand; GOAL_FOUL_SHARE 0,27 falsk → offside-tjekket). Samme regel som før,
// nu i offsideCheck: varPulse + vsTrapLong·0,045 + rul·6 > forsvarer.positioning + rul·6 (v3.6; før ·0,025).
// Rul 0,1: skud 10 + 0,8 mod MV 1 + 0,8 + 0,3 → mål; den tjekkede forsvarer er den første i forsvaret (plads 1, POS 11).
function varRun(trap, { awayAttacks = false, check = true, n = 2 } = {}) {
  const { H, A } = arena();
  const [att, def] = awayAttacks ? [A, H] : [H, A];
  if (awayAttacks) for (const p of mids(A)) p.skills.passing = 11;
  // Skytten er den, der står nær målet (v3.12, tilfældig vægtet) – alle får samme VAR-evner.
  for (let i = 1; i <= 10; i++) { slot(att, i).varProfile.varPulse = 10; slot(att, i).counterTactics.vsTrapLong = trap; }
  const d = slot(def, 1); d.skills.positioning = 11; d.skills.intercepting = 20;
  slot(def, 0).skills.goalkeeping = 1;
  const m = simulateMatch(H, A, stubRng({ 0.3: shots(n), 0.131: check, 0.27: false }, 0.1));
  const shooter = [att.squad.find((p) => (awayAttacks ? m.ratings.away : m.ratings.home).some((e) => e.playerId === p.id && e.goals > 0))].find(Boolean) ?? slot(att, 9);
  return { m, shooter, d };
}
test('VAR: mod-kunnen mod VAR-linjen afgør (10 + 23·0,045 = 11,035 > 11; 22·0,045 = 0,99 → 10,99 < 11)', () => {
  const { m: ok, shooter } = varRun(23), { m: no, d } = varRun(22); // med den gamle faktor 0,025 tabte 23 også
  const checks = (m) => m.events.filter((e) => e.type === 'VAR_CHECK').map((e) => `${e.var.kind}/${e.var.verdict}`);
  assert.deepEqual(checks(ok), ['OFFSIDE/STANDS', 'OFFSIDE/STANDS']);
  assert.deepEqual(checks(no), ['OFFSIDE/OVERTURNED', 'OFFSIDE/OVERTURNED']);
  assert.deepEqual([ok.homeGoals, ok.events.filter((e) => e.type === 'GOAL' && e.text.includes('📺 VAR: målet står')).length], [2, 2]);
  assert.deepEqual([no.homeGoals, no.events.filter((e) => e.type === 'VAR_NO_GOAL').length, no.stats.hOnTarget, no.goalsPool.length], [0, 2, 0, 0]);
  assert.equal(ok.stats.hVarChecks, 2); assert.equal(no.stats.hVarChecks, 2);
  // VAR ± (v3.15.1): kun kendelser, VAR ændrede – et godkendt mål giver 0 (før +1), et annulleret −1 for angriberen.
  assert.equal(ok.homeVarNet, 0); assert.equal(no.homeVarNet, -2);
  // Forsvareren, der holdt linjen: +0,45 og en taktisk sejr pr. annullering.
  assert.equal(no.ratings.away.find((x) => x.playerId === d.id).tacticWins, 2);
  // Et godkendt mål giver skytten præcis det samme som et mål uden tjek (før: +1,3 for et VAR-mål). Ét skud, så karakteren
  // ikke rammer loftet 10: rul 0,1 → start 6,38; langskud (solo) +1,4; sejr +0,4 = 8,18 → 8,2. (v3.16 SHOT_REACH 28: stopperen
  // står for langt fra skudstedet til at skyde – før scorede han og fik også clean sheet +0,5 = 8,7.)
  const one = varRun(23, { n: 1 }), plain = varRun(23, { n: 1, check: false });
  assert.deepEqual([one.m.stats.hVarChecks, plain.m.stats.hVarChecks, one.m.homeGoals, plain.m.homeGoals], [1, 0, 1, 1]);
  assert.equal(one.shooter.id, plain.shooter.id); assert.equal(one.shooter.id, shooter.id);
  const rt = (x) => x.m.ratings.home.find((e) => e.playerId === x.shooter.id).rating;
  assert.deepEqual([rt(one), rt(plain)], [8.2, 8.2]);
});
test('VAR: fortegn på VAR-netto, når udeholdet angriber (godkendt 0, annulleret +1 for hjemmeholdet pr. mål)', () => {
  const ok = varRun(23, { awayAttacks: true }).m, no = varRun(22, { awayAttacks: true }).m;
  assert.deepEqual([ok.awayGoals, ok.stats.aVarChecks, ok.homeVarNet], [2, 2, 0]);
  assert.deepEqual([no.awayGoals, no.stats.aVarChecks, no.homeVarNet], [0, 2, 2]);
});
test('VAR tjekker kun et mål ved GOAL_CHECK_P (0,131) – ikke længere ved et rul i chancen (før < 0,22)', () => {
  const off = varRun(22, { check: false }).m;   // ville være annulleret, hvis det blev tjekket
  assert.deepEqual([off.stats.hVarChecks, off.homeGoals, off.homeVarNet, off.events.filter((e) => e.type.startsWith('VAR')).length], [0, 2, 0, 0]);
});

test('afslutning: FIN + 4 > GK + 4 + KEEPER_EDGE 0,3 (v3.15.1; v3.13 3; v3.12.1 3,5; v3.10 havde 0); mål giver +1,25, oplæg +0,5, målmand −0,3', () => {
  // MV 8: 8,4 + 4 = 12,4 > 8 + 4 + 0,3 = 12,3 → mål; 8,3 + 4 = 12,3 > 12,3 falsk → redning. Med 3 var 8,4 redning; med 0,2 var 8,3 mål.
  const run = (fin) => { const { H, A } = arena(); onlyShooter(H); slot(H, 9).skills.finishing = fin; slot(A, 0).skills.goalkeeping = 8; return { H, A, m: simulateMatch(H, A, stubRng({ 0.3: shots(2) })) }; };
  const { H, A, m } = run(8.4);
  assert.equal(m.homeGoals, 2);
  const r = (t, i) => m.ratings[t === H ? 'home' : 'away'].find((x) => x.playerId === slot(t, i).id);
  assert.equal(r(H, 9).rating, 9.4);   // 6,5 + 2·1,25 + 0,4 sejr (v3.15)
  assert.equal(r(H, 5).rating, 7.9);   // oplæg: 6,5 + 2·0,5 + 0,4 sejr (v3.15)
  assert.equal(r(H, 5).assists, 2);
  assert.equal(r(A, 0).rating, 5.5);   // 6,5 − 2·0,3 − 0,4 nederlag (v3.15), intet clean sheet
  const saved = run(8.3).m;
  assert.equal(saved.homeGoals, 0); assert.equal(saved.events.filter((e) => e.type === 'SAVE').length, 2);
});

test('xG: 0,13 + rul·0,22 pr. afslutning', () => {
  const { H, A } = arena(); slot(A, 0).skills.goalkeeping = 20;
  const lo = simulateMatch(H, A, stubRng({ 0.3: shots(3) }, 0));
  const hi = simulateMatch(H, A, stubRng({ 0.3: shots(3) }, 0.999999));
  assert.equal(lo.stats.hShots, 3);
  assert.ok(Math.abs(lo.stats.hXg - 3 * 0.13) < 1e-9, String(lo.stats.hXg));
  assert.ok(Math.abs(hi.stats.hXg - 3 * 0.35) < 1e-5, String(hi.stats.hXg));
});

test('MotM er den højeste karakter', () => {
  for (let s = 1; s <= 25; s++) {
    const L = createLeague(createRng(s));
    const m = simulateMatch(L.teams[0], L.teams[1 + (s % 7)], createRng(s));
    const all = [...m.ratings.home, ...m.ratings.away];
    assert.equal(m.ratings.motm.rating, Math.max(...all.map((e) => e.rating)));
  }
});

// ---------- Bogføring ----------
function syntheticRound(L, { hG = 1, aG = 0, varNet = 1, ratings }) {
  const [H, A] = [L.teams[0], L.teams[1]];
  const m = { homeId: H.id, awayId: A.id, homeName: H.name, awayName: A.name, homeGoals: hG, awayGoals: aG, homeVarNet: varNet, ratings: { home: ratings, away: [] }, observations: [], injuries: [], goalsPool: [], stats: { hVarChecks: 0, aVarChecks: 0 } };
  return { round: (L.leagueMetadata.round || 0) + 1, matches: [m], gazette: null };
}
test('bogføring: friskhed efter løbet distance (v3.7), bænk +15, stjerner af snittet, mod-XP mod rigtig modstander, VAR-netto', () => {
  const L = createLeague(createRng(2));
  const [H, A] = L.teams;
  const [p, q, bench1, bench2] = [H.squad[0], H.squad[1], H.squad[11], H.squad[12]];
  p.skills.stamina = 10; p.freshness = 100; p.ratingSum = 16; p.ratingGames = 2;
  q.skills.stamina = 2; q.freshness = 61;
  bench1.freshness = 90; bench2.freshness = 70;
  const ctBefore = { ...p.counterTactics };
  const res = syntheticRound(L, { ratings: [{ playerId: p.id, rating: 5, gainedCounterXp: 10, distanceKm: 11.2 }, { playerId: q.id, rating: 6, gainedCounterXp: 4, distanceKm: 10 }] });
  commitRound(L, res, { next: () => 0.5 });
  // v3.6 gav 99 og 60 (−max(4, 14 − STA/2) + 8 straks): næsten ingen træthed.
  assert.equal(p.freshness, 92);      // 100 − round(11,2·(1,5 − 0,30) = 13,4) = 87; + round(0,41·13) = 5
  assert.equal(q.freshness, 69);      // 61 − round(10·(1,5 − 0,06) = 14,4) = 47; + round(0,41·53) = 22 (v3.10.1; 0,35 gav 66)
  assert.equal(bench1.freshness, 100); assert.equal(bench2.freshness, 85);
  assert.equal(p.ratingSum, 21); assert.equal(p.ratingGames, 3); assert.equal(p.lastRating, 5);
  assert.equal(p.publicStars, starsFromRating(7)); // snit 21/3 = 7,0 → 3 stjerner (sidste karakter 5 ville give 1)
  assert.equal(p.publicStars, 3);
  assert.deepEqual(p.counterTactics, applyCounterXp(ctBefore, p.age, A, 10));
  const sH = L.leagueMetadata.standings.find((s) => s.teamId === H.id), sA = L.leagueMetadata.standings.find((s) => s.teamId === A.id);
  assert.equal(sH.varNet, 1); assert.equal(sA.varNet, -1);
  assert.equal(sH.points, 3); assert.equal(sA.lost, 1);
  let r = syntheticRound(L, { ratings: [{ playerId: q.id, rating: 6, gainedCounterXp: 1, distanceKm: 10 }] }); r.round = 2;
  commitRound(L, r, { next: () => 0.5 });
  assert.equal(q.freshness, 73);      // 69 − 14 = 55; + round(0,41·45) = 18 (jo mere træt, jo mere restitution)
  r = syntheticRound(L, { ratings: [{ playerId: q.id, rating: 6, gainedCounterXp: 1, distanceKm: 40 }] }); r.round = 3;
  commitRound(L, r, { next: () => 0.5 });
  assert.equal(q.freshness, 50);      // 73 − 58 = 15; + round(0,41·85) = 35 → 50 (bunden 50)
});

test('stilling sorteres på point, så målforskel, så scorede mål', () => {
  const s = (id, points, gf, ga) => ({ teamId: id, points, goalsFor: gf, goalsAgainst: ga });
  const out = sortStandings([s('a', 3, 2, 2), s('b', 3, 3, 1), s('c', 6, 0, 5), s('d', 3, 4, 2)]);
  assert.deepEqual(out.map((x) => x.teamId), ['c', 'd', 'b', 'a']);
});

// ---------- Avisen ----------
function gz(matches) { return buildGazette(matches); }
const mm = (hG, aG, home, away, goals = [], v = [0, 0]) => ({ homeName: 'H', awayName: 'U', homeGoals: hG, awayGoals: aG, ratings: { home, away }, goalsPool: goals, stats: { hVarChecks: v[0], aVarChecks: v[1] } });
const R = (id, rating, goals = 0, assists = 0, saves = 0, tacticWins = 0) => ({ playerId: id, rating, goals, assists, saves, tacticWins });

test('avisen: rundens spiller er højeste karakter, ved lighed flest mål/oplæg', () => {
  const g = gz([mm(1, 0, [R('a', 7.1), R('b', 8.0, 0, 1)], [R('c', 8.0, 1)], [{ spectacle: 5 }]), mm(0, 0, [R('d', 6.0)], [], [], [1, 2])]);
  assert.equal(g.playerOfTheRound.playerId, 'c');
  assert.equal(g.totalGoals, 1); assert.equal(g.totalVarChecks, 3);
});
test('avisen: rundens mål er det mest spektakulære; uden mål en defensiv aktion', () => {
  const g = gz([mm(2, 1, [R('a', 7)], [R('b', 6)], [{ spectacle: 3, id: 'x' }, { spectacle: 9, id: 'y' }, { spectacle: 5, id: 'z' }])]);
  assert.equal(g.goalOfTheRound.id, 'y'); assert.equal(g.defensiveAction, null);
  const n = gz([mm(0, 0, [R('a', 7.5)], [R('g', 7.0, 0, 0, 3)])]);
  assert.equal(n.goalOfTheRound, null); assert.equal(n.defensiveAction.playerId, 'g');
});
test('avisen: dit resultat beskrives for sejr, nederlag og uafgjort', () => {
  assert.match(gz([mm(2, 0, [R('a', 7)], [])]).myResult, /^H leverede .* 2-0 over U/);
  assert.match(gz([mm(0, 1, [R('a', 7)], [])]).myResult, /^Modstanderen U .* 1-0 over H/);
  assert.match(gz([mm(1, 1, [R('a', 7)], [])]).myResult, /skakmat .* endte 1-1/);
  assert.match(gz([mm(0, 0, [R('a', 7)], []), mm(3, 0, [R('b', 7)], [])]).myResult, /skakmat/, 'dit resultat er altid første kamp');
});

// ---------- Reparation ----------
test('normalizeLeague: ugyldigt indhold repareres, gyldige data og standardværdier overskrives ikke', () => {
  const L = createLeague(createRng(3));
  const t2 = L.teams[2], t3 = L.teams[3], t4 = L.teams[4];
  const ids = t3.tactics.lineupSlots.slice();
  t3.tactics.lineupSlots = [...ids.slice(0, 10), ids[0]];          // dublet
  t4.tactics.lineupSlots = [...ids.slice(0, 10), 'findes_ikke'];    // ukendt id (og fremmed hold)
  delete t2.tactics; t2.tacticPresets = [t2.tacticPresets[0]];
  L.teams[5].tactics.baseFormation = '9-9-9';
  L.teams[6].tactics.conditionalRules = Array.from({ length: 10 }, (_, i) => ({ ruleId: i, minuteTrigger: 60, condition: 'DRAW', newFormation: '4-4-2' }));
  const p = L.teams[1].squad[4]; p.freshness = 70; p.aerialPower = 1;
  L.leagueMetadata.round = 6; L.teams[1].cashBalance = 123;
  const { league: N } = normalizeLeague(L);
  assert.deepEqual(N.teams[3].tactics.lineupSlots, defaultStarterIds(t3.squad));
  assert.deepEqual(N.teams[4].tactics.lineupSlots, defaultStarterIds(t4.squad));
  assert.equal(N.teams[2].tactics.baseFormation, BOT_PROFILES[2].form); // holdets egen profil, ikke profil 0
  assert.equal(N.teams[2].tacticPresets.length, 3);
  assert.equal(N.teams[5].tactics.baseFormation, BOT_PROFILES[5].form);
  assert.equal(N.teams[6].tactics.conditionalRules.length, 8);   // v3.13: MAX_RULES 8 (før 5)
  assert.equal(p.freshness, 70);
  assert.equal(p.aerialPower, Math.round(Math.max(1, Math.min(20, Math.round((p.heightCm - 166) * 0.7))) * 0.35 + p.jumpingPower * 0.35 + p.skills.strength * 0.15 + p.skills.positioning * 0.15));
  assert.equal(N.leagueMetadata.round, 6); assert.equal(N.teams[1].cashBalance, 123);
});

// ---------- Generator ----------
test('standardopstillingen sorteres efter kæde: 4-4-2 får MÅL, 4 FOR, 4 MID, 2 ANG på sine pladser', () => {
  const L = createLeague(createRng(6));
  const t = L.teams[0];
  const lines = t.tactics.lineupSlots.map((id) => t.squad.find((p) => p.id === id).line);
  assert.deepEqual(lines, ['GK', 'DEF', 'DEF', 'DEF', 'DEF', 'MID', 'MID', 'MID', 'MID', 'ATT', 'ATT']);
  assert.deepEqual(t.tactics.lineupSlots.map((id) => t.squad.find((p) => p.id === id).shirtNumber), [1, 2, 3, 4, 5, 6, 7, 8, 10, 9, 11]);
});

test('truppens opbygning pr. plads og bot-profil pr. hold', () => {
  const L = createLeague(createRng(4));
  const expected = ['GK STARTER', 'DEF STARTER', 'DEF STARTER', 'DEF STAR', 'DEF STARTER', 'MID STARTER', 'MID STARTER', 'MID STAR', 'ATT STARTER', 'MID STARTER', 'ATT STARTER',
    'GK ROTATION', 'DEF ROTATION', 'DEF TALENT', 'MID ROTATION', 'MID TALENT', 'ATT ROTATION', 'ATT TALENT'];
  for (const t of L.teams) assert.deepEqual(t.squad.map((p) => `${p.line} ${p.roleTier}`), expected);
  const forms = ['4-4-2', '4-2-3-1', '5-3-2', '4-3-3', '3-5-2', '4-4-2', '5-4-1', '3-4-3'];
  const passes = ['BALANCED', 'SHORT', 'DIRECT_LONG', 'SHORT', 'BALANCED', 'DIRECT_LONG', 'DIRECT_LONG', 'BALANCED'];
  L.teams.forEach((t, i) => {
    assert.equal(t.tactics.baseFormation, forms[i], t.name);
    assert.equal(t.tactics.phases.phase1_buildUp.passingStyle, passes[i], t.name);
  });
});

test('evnespænd pr. type: positionering STAR 11–16, ROTATION 7–12 (begge ender rammes)', () => {
  const seen = { STAR: [], ROTATION: [] };
  for (let s = 1; s <= 60; s++) for (const t of createLeague(createRng(s)).teams) for (const p of t.squad) if (seen[p.roleTier]) seen[p.roleTier].push(p.skills.positioning);
  assert.deepEqual([Math.min(...seen.STAR), Math.max(...seen.STAR)], [11, 16]);
  assert.deepEqual([Math.min(...seen.ROTATION), Math.max(...seen.ROTATION)], [7, 12]);
});

test('arketype-chance: STAR 75 %, TALENT 55 %, øvrige 25 % – og altid fra spillerens kæde', () => {
  const n = { STAR: [0, 0], TALENT: [0, 0], OTHER: [0, 0] };
  for (let s = 1; s <= 60; s++) for (const t of createLeague(createRng(s)).teams) for (const p of t.squad) {
    const k = n[p.roleTier] ? p.roleTier : 'OTHER';
    n[k][1]++; if (p.archetype) { n[k][0]++; assert.ok(ARCHETYPES[p.line].some((a) => a.id === p.archetype.id), p.line); }
  }
  const pct = (k) => n[k][0] / n[k][1];
  assert.ok(pct('STAR') > 0.71 && pct('STAR') < 0.79, String(pct('STAR')));
  assert.ok(pct('TALENT') > 0.51 && pct('TALENT') < 0.59, String(pct('TALENT')));
  assert.ok(pct('OTHER') > 0.22 && pct('OTHER') < 0.28, String(pct('OTHER')));
});

test('arketype låses op når ALLE krav er nået (≥), også springkraft', () => {
  const arch = { unlockReq: { strength: 13, jumpingPower: 14 } };
  const pl = (str, jump) => ({ skills: { ...SK(10), strength: str }, jumpingPower: jump });
  assert.equal(isArchetypeUnlocked(arch, pl(13, 14)), true);
  assert.equal(isArchetypeUnlocked(arch, pl(12, 14)), false);
  assert.equal(isArchetypeUnlocked(arch, pl(13, 13)), false);
  assert.equal(isArchetypeUnlocked(arch, pl(20, 1)), false);
  const L = createLeague(createRng(5));
  for (const t of L.teams) for (const p of t.squad) if (p.archetype) assert.equal(p.archetype.isUnlocked, isArchetypeUnlocked(p.archetype, p));
});

// ---------- Hvis-Så: antal mål og planer ----------
import { ruleConditionMet } from '../../public/engine/match.js';
test('Hvis-Så-betingelse: "mindst N" bagud/foran, uafgjort præcis lige', () => {
  const R = (condition, margin) => ({ condition, margin });
  assert.equal(ruleConditionMet(R('TRAILING', 2), 0, 2), true);
  assert.equal(ruleConditionMet(R('TRAILING', 2), 0, 1), false);
  assert.equal(ruleConditionMet(R('TRAILING', 2), 0, 3), true);
  assert.equal(ruleConditionMet(R('LEADING', 2), 3, 1), true);
  assert.equal(ruleConditionMet(R('LEADING', 2), 2, 1), false);
  assert.equal(ruleConditionMet(R('LEADING', 1), 4, 0), true);
  assert.equal(ruleConditionMet(R('DRAW', 3), 1, 1), true);
  assert.equal(ruleConditionMet(R('DRAW', 1), 2, 1), false);
  assert.equal(ruleConditionMet(R('DRAW', 1), 0, 1), false, 'uafgjort udløses ikke når man er bagud');
  assert.equal(ruleConditionMet(R('TRAILING', 0), 0, 1), true, 'margin 0 behandles som 1');
  assert.equal(ruleConditionMet(R('LEADING', 0), 0, 0), false, 'margin 0 behandles som 1 – ikke "foran med 0"');
  assert.equal(ruleConditionMet(R('TRAILING'), 0, 1), true, 'uden margin = 1');
  assert.equal(ruleConditionMet(R('UKENDT', 1), 0, 5), false);
});

test('Hvis-Så til egen plan: formation, trukne positioner og faser skifter; spillerne beholder pladserne', () => {
  const { H, A } = arena();
  const planB = structuredClone(H.tactics);
  Object.assign(planB, { baseFormation: '3-5-2', customCoords: { 6: { x: 40, y: 40 } } });
  planB.phases.phase1_buildUp.passingStyle = 'DIRECT_LONG';
  H.tacticPresets[1] = planB;
  const lineup = H.tactics.lineupSlots.slice();
  H.tactics.conditionalRules = [{ ruleId: 1, minuteTrigger: 3, condition: 'DRAW', margin: 1, newFormation: '5-4-1', newPlan: 1 }];
  const m = simulateMatch(H, A, stubRng({ 0.48: true }));
  const trig = m.events.filter((e) => e.type === 'TRIGGER');
  assert.equal(trig.length, 1);
  assert.match(trig[0].text, /til Plan B \(3-5-2, direkte lange bolde/);
  assert.equal(m.endState.home.formation, '3-5-2', 'planens formation, ikke reglens formation');
  assert.deepEqual(m.endState.home.customCoords, { 6: { x: 40, y: 40 } }, 'planens trukne positioner');
  assert.equal(m.endState.home.phases.phase1_buildUp.passingStyle, 'DIRECT_LONG', 'planens faser');
  m.endState.home.customCoords[6].x = 1; m.endState.home.phases.phase1_buildUp.passingStyle = 'SHORT';
  assert.equal(H.tacticPresets[1].customCoords[6].x, 40, 'kopi – planen deles ikke med kampen');
  assert.equal(H.tacticPresets[1].phases.phase1_buildUp.passingStyle, 'DIRECT_LONG');
  assert.deepEqual(m.endState.home.starters, lineup);
  // Planens fase 1 virker fra skiftet: DIRECT_LONG giver høje bolde fremover (BALANCED/CENTRAL gav ingen)
  const m2 = simulateMatch(H, A, stubRng({ 0.3: true, 0.15: true }));
  assert.ok(m2.duelLog[H.id].crosses > 0);
  assert.equal(H.tactics.baseFormation, '4-4-2', 'holdet selv ændres ikke');
});

test('Hvis-Så med "Bagud med 2": udløses ikke ved 0-1, men ved 0-2', () => {
  const run = (goals) => {
    const { H, A } = arena();
    for (const p of [A.squad.find((x) => x.id === A.tactics.lineupSlots[9])]) p.skills.finishing = 20;
    H.squad.find((x) => x.id === H.tactics.lineupSlots[0]).skills.goalkeeping = 1;
    H.tactics.conditionalRules = [{ ruleId: 1, minuteTrigger: 3, condition: 'TRAILING', margin: 2, newFormation: '3-4-3', newPlan: null }];
    for (const p of mids(H)) p.skills.passing = 1; // udeholdet har bolden og skyder
    return simulateMatch(H, A, stubRng({ 0.3: (n) => n < goals }));
  };
  assert.equal(run(1).events.filter((e) => e.type === 'TRIGGER').length, 0);
  const two = run(2);
  assert.equal(two.awayGoals, 2);
  assert.equal(two.events.filter((e) => e.type === 'TRIGGER').length, 1);
});

test('offside og omstilling: dine egne valg navngives, modstanderens beskrives neutralt', () => {
  // Modstanderen (ude) forsvarer med offside-fælde og lynkontra
  const a = arena({ away: { p2: { offsideTrap: 'NORMAL' }, p3: { onBallWon: 'FAST_COUNTER' } } });
  for (const p of mids(a.A)) p.skills.intercepting = 17;
  const opp = simulateMatch(a.H, a.A, stubRng({ 0.48: true, 0.45: (n) => n % 2 === 0 }));
  const oppTexts = opp.events.filter((e) => e.category === 'TACTIC' && !e.isHome).map((e) => e.text);
  assert.ok(oppTexts.some((t) => /fanges offside/.test(t)) && oppTexts.some((t) => /erobrer bolden/.test(t)));
  assert.ok(oppTexts.every((t) => !/offside-fælde|kontra|falder til ro/i.test(t)), oppTexts.join(' | '));
  // Dit hold (hjemme) forsvarer: dine valg står i teksten
  const b = arena({ home: { p2: { offsideTrap: 'NORMAL' }, p3: { onBallWon: 'FAST_COUNTER' } } });
  for (const p of mids(b.A)) p.skills.passing = 11; // udeholdet har bolden
  for (const p of mids(b.H)) p.skills.intercepting = 17;
  const own = simulateMatch(b.H, b.A, stubRng({ 0.48: true, 0.45: (n) => n % 2 === 0 }));
  const ownTexts = own.events.filter((e) => e.category === 'TACTIC' && e.isHome).map((e) => e.text);
  assert.ok(ownTexts.some((t) => /DIN OFFSIDE-FÆLDE VIRKER/.test(t)), ownTexts.join(' | '));
  assert.ok(ownTexts.some((t) => /Din lynkontra|lynkontraen|Lynkontraen/.test(t)), 'dit valg (lynkontra) nævnes – v3.16.3: tre varianter');
  assert.ok(ownTexts.some((t) => /^✅ \[DIT PRES VIRKER\] Din mellemblok lukker af/.test(t)), ownTexts.join(' | '));
});

// Brugeren: "Der er ikke en eneste gang i referaterne fra runde 3, at taktikken ikke har virket".
test('referatet siger fra dit synspunkt, når din taktik IKKE virker – uden at navngive modstanderens stil', () => {
  // Dit hold (hjemme) har bolden; modstanderen presser hårdt (INT 17) med højt gegenpres.
  const a = arena({ home: { p1: { passingStyle: 'SHORT' } }, away: { p2: { pressingHeight: 'HIGH_GEGENPRESS' } } });
  for (const p of mids(a.A)) p.skills.intercepting = 17;
  const m = simulateMatch(a.H, a.A, stubRng({ 0.48: true }));
  const fails = m.events.filter((e) => e.label === 'Fase 2 pres virker').map((e) => e.text);
  assert.equal(fails.length, 30);
  assert.ok(fails.every((t) => t.startsWith('❌ [DIN OPBYGNING STOPPES] Dine korte pasninger kommer ikke igennem')), fails[0]);
  assert.ok(fails.every((t) => !/gegenpres|pres(?!set)|blok/i.test(t.replace('[DIN OPBYGNING STOPPES]', ''))), fails[0]);
  // Pause-analysen tæller dine dueller (15 ticks før pausen; alle tabt).
  const ht = m.events.find((e) => e.type === 'HALFTIME').text;
  assert.ok(ht.includes('Din opbygning er kommet igennem 0 af 14 gange'), ht);
  // To bot-hold: ingen "din/dit" i pause-analysen.
  const { L } = arena();
  const bots = simulateMatch(L.teams[2], L.teams[3], stubRng({ 0.48: true }));
  assert.ok(!/\b(Din|dit)\b/.test(bots.events.find((e) => e.type === 'HALFTIME').text));
});

test('Hvis-Så til den plan man allerede spiller: tom handling – men en forskel i formation, faser ELLER positioner tæller', () => {
  const run = (tweak) => {
    const { H, A } = arena();
    const plan = structuredClone(H.tactics); tweak(plan); H.tacticPresets[2] = plan;
    H.tactics.conditionalRules = [{ ruleId: 1, minuteTrigger: 3, condition: 'DRAW', margin: 1, newFormation: '4-4-2', newPlan: 2 }];
    return simulateMatch(H, A, stubRng({})).events.filter((e) => e.type === 'TRIGGER').length;
  };
  assert.equal(run(() => {}), 0, 'identisk plan: intet skift logges');
  assert.equal(run((p) => { p.baseFormation = '4-3-3'; }), 1, 'anden formation');
  assert.equal(run((p) => { p.phases.phase2_defending.pressingHeight = 'LOW_BLOCK'; }), 1, 'andre faser');
  assert.equal(run((p) => { p.customCoords = { 7: { x: 30, y: 30 } }; }), 1, 'andre positioner');
});

test('Hvis-Så: en plan-regel udløses højst én gang, og en ugyldig plan falder tilbage til formationen', () => {
  const { H, A } = arena();
  const planB = structuredClone(H.tactics); planB.baseFormation = '3-5-2'; H.tacticPresets[1] = planB;
  H.tactics.conditionalRules = [{ ruleId: 1, minuteTrigger: 3, condition: 'DRAW', margin: 1, newFormation: '4-4-2', newPlan: 1 }];
  assert.equal(simulateMatch(H, A, stubRng({})).events.filter((e) => e.type === 'TRIGGER').length, 1);
  H.tactics.conditionalRules = [{ ruleId: 1, minuteTrigger: 3, condition: 'DRAW', margin: 1, newFormation: '5-4-1', newPlan: 7 }];
  const m = simulateMatch(H, A, stubRng({}));
  assert.equal(m.endState.home.formation, '5-4-1');
  assert.match(m.events.find((e) => e.type === 'TRIGGER').text, /fra 4-4-2 til 5-4-1/);
});

// ---------- Karakterark: plads og startformationer (v3.5) ----------
test('kampen gemmer hvert holds startformation og pladsen pr. karakter – også indskifterens', () => {
  const { H, A } = arena();
  A.tactics.baseFormation = '4-2-3-1';
  // Skade ved første frispark → skadesskift.
  const m = simulateMatch(H, A, stubRng({ 0.06: (n) => n === 0, 0.5: true, 0.4: true }));
  assert.deepEqual(m.startFormations, { home: '4-4-2', away: '4-2-3-1' });
  const all = [...m.ratings.home, ...m.ratings.away];
  for (const [side, t] of [['home', H], ['away', A]]) {
    for (const e of m.ratings[side].filter((x) => x.minIn <= 1)) assert.equal(e.slot, t.tactics.lineupSlots.indexOf(e.playerId), e.shortName);
  }
  const sub = all.find((e) => e.minIn > 1);
  assert.ok(sub, 'skaden gav en indskiftning');
  const out = all.find((e) => e.teamId === sub.teamId && e.minIn <= 1 && e.minOut === sub.minIn);
  assert.ok(out, 'den udskiftede spiller findes');
  assert.equal(sub.slot, out.slot);
});

test('vinder presset duellen, får angriberen ingen chance i samme tick', () => {
  const run = (int) => {
    const { H, A } = arena();
    for (const p of mids(A)) p.skills.intercepting = int;
    return simulateMatch(H, A, stubRng({ 0.48: true, 0.3: true }));
  };
  const lost = run(17), won = run(1); // hjemmeholdet har bolden i alle 30 ticks
  assert.equal(count(lost, 'Fase 2 pres virker'), 30);
  assert.equal(lost.stats.hShots, 0);
  assert.equal(count(won, 'Fase 1 virker'), 30);
  assert.equal(won.stats.hShots, 30);
});

test('referatet: alle fire udfald skrives fra dit holds side, bot-kampe neutralt', () => {
  // Dit hold (hjemme) bygger op og vinder (modstanderens INT 1)
  let a = arena({ home: { p1: { passingStyle: 'DIRECT_LONG' } } });
  for (const p of mids(a.A)) p.skills.intercepting = 1;
  let t = simulateMatch(a.H, a.A, stubRng({ 0.48: true })).events.filter((e) => e.label === 'Fase 1 virker').map((e) => e.text);
  assert.ok(t.length === 30 && t.every((x) => x.startsWith('✅ [DIN OPBYGNING VIRKER] Dine direkte lange bolde bryder igennem')), t[0]);
  // Modstanderen (ude) bygger op og bryder dit pres
  a = arena({ home: { p2: { pressingHeight: 'LOW_BLOCK' } } });
  for (const p of mids(a.A)) p.skills.passing = 11; // udeholdet har bolden
  for (const p of mids(a.H)) p.skills.intercepting = 1;
  t = simulateMatch(a.H, a.A, stubRng({ 0.48: true })).events.filter((e) => e.label === 'Fase 1 virker').map((e) => e.text);
  assert.ok(t.length === 30 && t.every((x) => x.startsWith('❌ [DIT PRES BRYDES]') && x.includes('din lave blok')), t[0]);
  // Din opbygning fanges offside (modstanderens fælde navngives ikke)
  a = arena({ away: { p2: { offsideTrap: 'NORMAL' } } });
  for (const p of mids(a.A)) p.skills.intercepting = 17;
  t = simulateMatch(a.H, a.A, stubRng({ 0.48: true, 0.45: true })).events.filter((e) => e.label === 'Offside-fælde virker').map((e) => e.text);
  assert.ok(t.length === 30 && t.every((x) => x.startsWith('❌ [DIN OPBYGNING STOPPES]') && x.endsWith('fanges offside.') && !/fælde/i.test(x)), t[0]);
  // To bot-hold: neutral tekst (ingen ❌ og ingen "din/dit") – begge udfald forekommer
  const { L } = arena();
  for (const p of [...L.teams[2].squad, ...L.teams[3].squad]) p.skills.intercepting = 20; // hvem der end har bolden, taber den
  const ev = simulateMatch(L.teams[2], L.teams[3], stubRng({ 0.48: true })).events.filter((e) => e.label === 'Fase 1 virker' || e.label === 'Fase 2 pres virker');
  assert.ok(ev.some((e) => e.label === 'Fase 2 pres virker') && ev.every((e) => !/❌|\b(DIN|DIT|Din|Dit|Dine|dine|din|dit)\b/.test(e.text)), ev.map((e) => e.text).join(' | ').slice(0, 300));
});

// ---------- v3.6: fastlåste duel-vægte (Test Managers overlevende mutationer) ----------
// Arena: opbygning 20 + 25·0,05 + 3,5 = 24,75; pres INT + 8,5 + 3,5 + 25·0,05 + 3,5 = INT + 16,75.
test('lighed i fase-duellen tæller for opbygningen (INT 8: 24,75 mod 24,75), INT 9 taber', () => {
  assert.deepEqual(duel({}, {}, 8), { win: 30, lose: 0 });
  assert.deepEqual(duel({}, {}, 9), { win: 0, lose: 30 });
});
test('stilbonussen er præcis 3: INT 11 giver lighed (vinder), INT 12 taber', () => {
  const sl = [{ p1: { passingStyle: 'SHORT', attackFocus: 'LOW_CUTBACKS' } }, { p2: { pressingHeight: 'LOW_BLOCK' } }];
  assert.deepEqual(duel(...sl, 11), { win: 30, lose: 0 }); // bonus 2 → taber
  assert.deepEqual(duel(...sl, 12), { win: 0, lose: 30 }); // bonus 4 → vinder
});
test('mod-kunnen vejer præcis 0,05 – og opbygningen bruger playmakerens, presset presserens', () => {
  const run = (side, int) => {
    const { H, A } = arena();
    for (const p of mids(side === 'home' ? H : A)) p.counterTactics = { vsPress: 80, vsLowBlock: 80, vsTrapLong: 80 };
    // Hjemmeholdet skal stadig have bolden: løft dets øvrige startere, så besiddelses-gennemsnittet
    // ikke vipper til udeholdet (midtbanens mod-kunnen – playmakerens – røres ikke).
    if (side === 'away') for (const i of [0, 1, 2, 3, 4, 9, 10]) slot(H, i).counterTactics = { vsPress: 80, vsLowBlock: 80, vsTrapLong: 80 };
    for (const p of mids(A)) p.skills.intercepting = int;
    const m = simulateMatch(H, A, stubRng({ 0.48: true }));
    return count(m, 'Fase 1 virker');
  };
  // Playmaker 80: opbygning 27,5. Pres INT + 16,75 → INT 10 taber (26,75), INT 11 vinder (27,75).
  // Vægt 0,03 gav INT 10 tab; vægt 0,1 gav INT 11 sejr; byttede mod-kunnen-værdier gav begge forkert.
  assert.equal(run('home', 10), 30);
  assert.equal(run('home', 11), 0);
  // Presser 80: pres INT + 19,5 mod 24,75 → INT 5 vinder opbygningen, INT 6 presset.
  assert.equal(run('away', 5), 30);
  assert.equal(run('away', 6), 0);
});

// ---------- v3.6: pause-analysens tællere ----------
test('pause-analysen tæller dine opbygninger og dit pres hver for sig', () => {
  const half = (homeHasBall, oppInt, ownInt) => {
    const { H, A } = arena();
    if (!homeHasBall) for (const p of mids(A)) p.skills.passing = 11;
    for (const p of mids(A)) p.skills.intercepting = oppInt;
    for (const p of mids(H)) p.skills.intercepting = ownInt;
    return simulateMatch(H, A, stubRng({ 0.48: true })).events.find((e) => e.type === 'HALFTIME').text;
  };
  // v3.16.7: aldrig "0 af 0 gange" – kun de dele, kampen havde
  assert.ok(half(true, 1, 10).includes('kommet igennem 14 af 14 gange.') && !half(true, 1, 10).includes('dit pres'), half(true, 1, 10));
  assert.ok(half(false, 10, 20).includes(' Dit pres har vundet bolden 14 af 14 gange.') && !half(false, 10, 20).includes('opbygning'), half(false, 10, 20));
  assert.ok(half(false, 10, 1).includes('Dit pres har vundet bolden 0 af 14 gange'), half(false, 10, 1));
});

// ---------- v3.6: alle dine stile i referatet ----------
test('referatet navngiver hver af dine pasningsstile og presshøjder rigtigt – og aldrig modstanderens', () => {
  const PASS = { SHORT: 'Dine korte pasninger', BALANCED: 'Din balancerede opbygning', DIRECT_LONG: 'Dine direkte lange bolde' };
  for (const [pass, words] of Object.entries(PASS)) {
    const a = arena({ home: { p1: { passingStyle: pass, attackFocus: 'LOW_CUTBACKS' } }, away: { p2: { pressingHeight: 'HIGH_GEGENPRESS' } } });
    for (const p of mids(a.A)) p.skills.intercepting = 1;
    const t = simulateMatch(a.H, a.A, stubRng({ 0.48: true })).events.filter((e) => e.label === 'Fase 1 virker').map((e) => e.text);
    assert.ok(t.length === 30 && t.every((x) => x.startsWith(`✅ [DIN OPBYGNING VIRKER] ${words} bryder igennem`) && !/gegenpres|blok/i.test(x)), t[0]);
  }
  const PRESS = { LOW_BLOCK: 'din lave blok', MID_BLOCK: 'din mellemblok', HIGH_GEGENPRESS: 'dit høje gegenpres' };
  for (const [height, words] of Object.entries(PRESS)) {
    for (const ownInt of [20, 1]) {
      const a = arena({ home: { p2: { pressingHeight: height } } });
      for (const p of mids(a.A)) p.skills.passing = 11; // udeholdet har bolden
      for (const p of mids(a.H)) p.skills.intercepting = ownInt;
      const t = simulateMatch(a.H, a.A, stubRng({ 0.48: true })).events.filter((e) => e.label === 'Fase 1 virker' || e.label === 'Fase 2 pres virker').map((e) => e.text);
      const want = ownInt === 20 ? `✅ [DIT PRES VIRKER] ${words[0].toUpperCase() + words.slice(1)} lukker af` : `❌ [DIT PRES BRYDES]`;
      assert.ok(t.length === 30 && t.every((x) => x.startsWith(want) && x.includes(ownInt === 20 ? words.slice(1) : words)), `${height}/${ownInt}: ${t[0]}`);
    }
  }
  // Din offside-fælde: ✅; to bot-holds offside: neutral
  const o = arena({ home: { p2: { offsideTrap: 'NORMAL' } } });
  for (const p of mids(o.A)) p.skills.passing = 11;
  for (const p of mids(o.H)) p.skills.intercepting = 20;
  const ot = simulateMatch(o.H, o.A, stubRng({ 0.48: true, 0.45: true })).events.filter((e) => e.label === 'Offside-fælde virker').map((e) => e.text);
  // v3.16.7: det fulde banner første gang pr. halvleg, ellers den korte "[DIN OFFSIDE-FÆLDE]"-linje
  assert.ok(ot.length === 30 && ot.filter((x) => x.startsWith('✅ [DIN OFFSIDE-FÆLDE VIRKER]')).length === 2 && ot.every((x) => x.startsWith('✅ [DIN OFFSIDE-FÆLDE')), ot.join(' | '));
  const { L } = arena();
  for (const t of [L.teams[2], L.teams[3]]) { t.tactics.phases.phase2_defending.offsideTrap = 'NORMAL'; for (const p of t.squad) p.skills.intercepting = 20; }
  const bt = simulateMatch(L.teams[2], L.teams[3], stubRng({ 0.48: true, 0.45: true })).events.filter((e) => e.label === 'Offside-fælde virker').map((e) => e.text);
  assert.ok(bt.length === 30 && bt.every((x) => !/❌|✅ \[DIN|\b(din|dit|dine)\b/i.test(x)), bt[0]);
});

// ---------- v3.6: XP-ledningen fra kampen ----------
test('mod-XP fra kampen: taktiske sejre og spilletid går ind i XP', () => {
  const { H, A } = arena();
  for (const p of mids(A)) p.skills.intercepting = 1; // hjemmeholdet vinder alle 30 opbygninger
  const m = simulateMatch(H, A, stubRng({ 0.48: true, 0.06: (n) => n === 0, 0.5: true, 0.4: true }));
  const byId = new Map(m.ratings.home.concat(m.ratings.away).map((e) => [e.playerId, e]));
  const pm = byId.get(mids(H)[0].id); // stubRng.pick tager første midtbanespiller som playmaker
  assert.ok(pm.tacticWins >= 25, String(pm.tacticWins));
  assert.equal(pm.gainedCounterXp, 5); // 2 + 0,5·sejre klemmes til 5
  // Skaden i 3. minut: den skadede spillede 3 min (min. 10 → 0,2 → 1), indskifteren 87 min (1,9 → 2)
  const victimEntry = m.ratings.home.concat(m.ratings.away).find((e) => e.injured);
  const subEntry = m.ratings.home.concat(m.ratings.away).find((e) => e.minIn > 1);
  assert.equal(victimEntry.gainedCounterXp, 1);
  assert.equal(subEntry.gainedCounterXp, 2);
});

// ---------- v3.7: friskhed i kampen og bots, der roterer ----------
test('friskhed virker: 0,75 + 0,25·friskhed/100; en træt playmaker taber duellen, han ellers vandt', async () => {
  const { freshFactor } = await import('../../public/engine/match.js');
  assert.equal(freshFactor({ freshness: 100 }), 1);
  assert.ok(Math.abs(freshFactor({ freshness: 50 }) - 0.875) < 1e-9); // v3.7-udkast: 0,925
  assert.ok(Math.abs(freshFactor({ freshness: 76 }) - 0.94) < 1e-9);
  assert.equal(freshFactor({}), 1);
  // Arena: opbygning 20 + 1,25 + 3,5 = 24,75 mod pres INT 8 → 24,75 (lighed → opbygning vinder).
  // Med friskhed 96 hos playmakerne: 20·0,99 = 19,8 → 24,55 < 24,75 → presset vinder.
  // (Vægtene selv er låst af freshFactor-tallene ovenfor.)
  const run = (fresh) => { const { H, A } = arena(); for (const p of mids(A)) p.skills.intercepting = 8; for (const p of mids(H)) p.freshness = fresh; return count(simulateMatch(H, A, stubRng({ 0.48: true })), 'Fase 1 virker'); };
  assert.equal(run(100), 30);
  assert.equal(run(96), 0);
});

test('bots hviler en træt starter (< 70 %) for en frisk bænkspiller i samme kæde – dit hold gør ikke', () => {
  const { L } = arena();
  const bot = L.teams[2], me = L.teams[0];
  bot.subsLimit = 0;   // v3.13: uden udskiftningsgrænse – de faste 70/85 (grænsen prøves i testen nedenfor)
  for (const t of [bot, me]) {
    const starter = t.squad.find((p) => p.id === t.tactics.lineupSlots[5]);
    const benchMate = t.squad.find((p) => !t.tactics.lineupSlots.includes(p.id) && p.line === starter.line);
    starter.freshness = 60; benchMate.freshness = 95; benchMate.skills = { ...starter.skills };
    t._s = starter; t._b = benchMate;
  }
  const m = simulateMatch(me, bot, stubRng({}));
  const playedIds = new Set([...m.ratings.home, ...m.ratings.away].map((e) => e.playerId));
  assert.ok(playedIds.has(bot._b.id) && !playedIds.has(bot._s.id), 'botten roterede');
  assert.ok(playedIds.has(me._s.id) && !playedIds.has(me._b.id), 'dit hold vælger selv');
  assert.ok(m.events.some((e) => e.text.includes(`starter i stedet for en træt #${bot._s.shirtNumber}`)));
  // Grænsen: 70 % roterer ikke (69 gør)
  bot._s.freshness = 70;
  const m2 = simulateMatch(me, bot, stubRng({}));
  assert.ok(new Set(m2.ratings.away.map((e) => e.playerId)).has(bot._s.id));
});

// =====================================================================================
// v3.7 – Test Managers huller (alle tal regnes i kommentaren; båndene er røde mod mutationerne)
// =====================================================================================
import { viewRatingEntry, viewPlayer } from '../../public/engine/visibility.js';
import { createSheet, finalizeSheet, runProfile } from '../../public/engine/ratings.js';
import { counterXpForMatch } from '../../public/engine/counter.js';
import { goalSpectacle, describeGoal, pickBy } from '../../public/engine/clues.js';
import { headline } from '../../public/engine/gazette.js';

// ---------- #6 Privatfelter: km og topfart røber STA og PAC ----------
test('modstandere ser hverken km, topfart eller sæsonløb – ejeren ser dem', () => {
  const e = { playerId: 'x', rating: 7, stars: 3, distanceKm: 11.2, topSpeed: 31.5, gainedCounterXp: 3, startCounterMastery: 20 };
  const opp = viewRatingEntry(e, false), own = viewRatingEntry(e, true);
  for (const k of ['distanceKm', 'topSpeed', 'rating']) { assert.ok(!(k in opp), k); assert.ok(k in own, k); }
  assert.equal(opp.stars, 3);
  const p = { id: 'p', name: 'A', heightCm: 180, freshness: 90, distanceSum: 33, minutesSum: 270, topSpeedMax: 32, skills: {} };
  const po = viewPlayer(p, false), pw = viewPlayer(p, true);
  for (const k of ['distanceSum', 'minutesSum', 'topSpeedMax']) { assert.ok(!(k in po), k); assert.equal(pw[k], p[k]); }
  assert.equal(po.freshness, 90); // friskhed er offentlig
});

// ---------- #5 Løb og topfart ----------
test('runProfile: rolle-basis · (0,9 + STA·0,01) · pres · støj; topfart 25 + PAC·0,45 (MV −3)', () => {
  const r = { next: () => 0.5 }; // støj 0,96 + 0,04 = 1,00; topfart-støj 0
  const team = (press) => ({ tactics: { phases: { phase2_defending: { pressingHeight: press } } } });
  const pl = (line, sta = 10, pace = 10) => ({ line, skills: { stamina: sta, pace } });
  const km = (line, press = 'MID_BLOCK', sta = 10, role) => Math.round(runProfile(pl(line, sta), team(press), r, role).km90 * 1000) / 1000;
  // v3.8: pladsen i kampen afgør (v3.7.1 var kæden: MID 11,2 og DEF 9,8 for både back og stopper).
  const roles = ['GK', 'CB', 'LB', 'RWB', 'LM', 'RW', 'CDM', 'CM', 'CAM', 'CF', 'ST'];
  assert.deepEqual(roles.map((ro) => km('MID', 'MID_BLOCK', 10, ro)), [5.5, 9.5, 10.6, 11, 11, 11, 11.8, 11.8, 10.8, 10.8, 10]);
  // Dokumentets rækkefølge: CM > kanter > offensive > angriber = … > CB.
  assert.ok(km('MID', 'MID_BLOCK', 10, 'CM') > km('MID', 'MID_BLOCK', 10, 'RM') && km('MID', 'MID_BLOCK', 10, 'RM') > km('MID', 'MID_BLOCK', 10, 'CAM') && km('MID', 'MID_BLOCK', 10, 'ST') > km('MID', 'MID_BLOCK', 10, 'CB'));
  // Uden rolle (fx en gammel kampkopi): kædens plads – MV, stopper, central midtbane, angriber.
  assert.deepEqual([km('GK'), km('DEF'), km('MID'), km('ATT')], [5.5, 9.5, 11.8, 10]);
  assert.equal(km('MID', 'MID_BLOCK', 10, 'SUB (MID)'), 11.8);
  assert.equal(km('MID', 'HIGH_GEGENPRESS'), 12.508); // 11,8·1,06
  assert.equal(km('MID', 'LOW_BLOCK'), 11.328);       // ·0,96
  assert.equal(km('MID', 'MID_BLOCK', 20), 12.98);    // ·1,1
  assert.equal(km('MID', 'MID_BLOCK', 1), 10.738);    // ·0,91
  assert.equal(runProfile(pl('MID', 10, 10), team('MID_BLOCK'), r).topSpeed, 29.5);
  assert.equal(runProfile(pl('MID', 10, 20), team('MID_BLOCK'), r).topSpeed, 34);
  assert.equal(runProfile(pl('GK', 10, 10), team('MID_BLOCK'), r).topSpeed, 26.5);
  assert.equal(runProfile(pl('ATT', 10, 99), team('MID_BLOCK'), r).topSpeed, 36); // loft
  assert.equal(runProfile(pl('MID', 10, 10), team('MID_BLOCK'), { next: () => 0.96 }).km90.toFixed(3), '12.234'); // 11,8 · (0,96 + 0,96·0,08 = 1,0368)
});
test('finalizeSheet: km for spilletiden, ingen topfart under 10 min, og raten pr. 90 fjernes', () => {
  const s = createSheet(), r = { next: () => 0.5 };
  const team = { id: 't', name: 'T', isBot: false, tactics: { phases: { phase2_defending: { pressingHeight: 'MID_BLOCK' } } } };
  const mk = (id) => ({ id, shirtNumber: 1, shortName: id, line: 'MID', skills: { stamina: 10, pace: 10 } });
  s.register(mk('a'), team, true, 'CM', 1, r, 15, 5);   // hele kampen: 89 min
  s.register(mk('b'), team, true, 'CM', 61, r, 15, 6);  // 29 min
  s.register(mk('c'), team, true, 'CM', 85, r, 15, 7);  // 5 min
  const res = finalizeSheet(s, 0, 0, r, counterXpForMatch);
  const by = Object.fromEntries(res.home.map((e) => [e.playerId, e]));
  assert.equal(by.a.distanceKm, 11.7); // CM 11,8·89/90 = 11,67 (v3.7.1 kæde: 11,1)
  assert.equal(by.b.distanceKm, 3.8);  // 11,8·29/90 = 3,80
  assert.equal(by.c.distanceKm, 0.7);  // 11,8·5/90 = 0,66
  assert.equal(by.a.topSpeed, 29.5); assert.equal(by.c.topSpeed, null);
  assert.equal(by.a.hiShare, 8); assert.equal(by.b.hiShare, 8); assert.equal(by.c.hiShare, null); // under 10 min: ingen andel
  assert.equal(by.c.hiKm, null); assert.ok(by.b.hiKm > 0); // og ingen HI-km til sæsonsummen
  for (const e of res.home) assert.ok(!('km90' in e), 'raten pr. 90 min røber udholdenheden');
});

// ---------- #3 goalSpectacle og describeGoal ----------
test('goalSpectacle: fælles skala 0–20 pr. type, +3 fra 80. minut, loft 20', () => {
  const r = (v) => ({ next: () => v });
  assert.equal(goalSpectacle('LONGSHOT', { finishing: 12 }, 50, r(0.5)), 15);     // 10 + 3 + 2
  assert.equal(goalSpectacle('LONGSHOT', { finishing: 12 }, 80, r(0.5)), 18);     // + 3 (sent)
  assert.equal(goalSpectacle('LONGSHOT', { finishing: 12 }, 79, r(0.5)), 15);
  assert.equal(goalSpectacle('LONGSHOT', { finishing: 20 }, 85, r(0.99)), 20);    // 21,96 → loft 20
  assert.equal(goalSpectacle('DRIBBLE', { pace: 12, ballControl: 12 }, 50, r(0.5)), 15.1); // v3.9: 9 + 4,08 + 2 (v3.8: 13,6)
  assert.equal(goalSpectacle('COUNTER', { pace: 10 }, 50, r(0.5)), 9.5);          // v3.9: 5,5 + 2 + 2 (v3.8: 11)
  assert.equal(goalSpectacle('CUTBACK', { passing: 10 }, 50, r(0.5)), 13);        // v3.9: 8 + 3 + 2 (v3.8: 6 + 1,5 + 2 = 9,5)
  assert.equal(goalSpectacle('COMBINATION', { passing: 10 }, 50, r(0.5)), 9);     // 5 + 2 + 2
  assert.equal(goalSpectacle('HEADER', { aerialPower: 10 }, 50, r(0.5)), 11);     // 5 + 4 + 2
  assert.equal(goalSpectacle('VAR', {}, 50, r(0.5)), 8);                          // v3.9: 5,5 + 2,5 (v3.8: 9,5; før v3.7: 17–25)
  assert.equal(goalSpectacle('VAR', {}, 50, r(0)), 5.5);
  assert.equal(goalSpectacle('???', {}, 50, r(0.5)), 5);
});
// v3.16.3: minuttet står ikke længere i teksten (det står ved linjen – QC: en indlejret minut-angivelse modsiger uret)
test('describeGoal: tre varianter pr. type, valgt af rng; uden minut i teksten; ukendt type bliver kombination', () => {
  const v = (kind, x) => describeGoal(kind, 'S', 'A', 33, { next: () => x });
  for (const kind of ['LONGSHOT', 'DRIBBLE', 'COUNTER', 'CUTBACK', 'COMBINATION', 'HEADER', 'VAR']) {
    const three = [v(kind, 0), v(kind, 0.5), v(kind, 0.99)];
    assert.equal(new Set(three).size, 3, kind);
    assert.ok(three.every((t) => t.includes('S') && !t.includes('33') && !/\d+\. minut/.test(t)), `${kind}: ${three.join(' | ')}`);
  }
  assert.ok(v('LONGSHOT', 0).includes('langskud')); assert.ok(v('DRIBBLE', 0).includes('dribletur'));
  assert.equal(v('???', 0.5), v('COMBINATION', 0.5));
});

// ---------- #2 Måltyper i kampen ----------
// Hjemmeholdet har bolden og vinder alle opbygninger (INT 1); chance i alle 30 ticks (0,3);
// next = 0,5 → ingen VAR (≥ 0,22), afslutning 20 + 4 > MV 1 + 4 → mål hver gang.
function goals({ home = {}, away = {}, script = {}, shooterSkills = null, bots = false, shooterAt = null, gk = 1 } = {}) {
  const a = arena({ home, away });
  let [H, A] = [a.H, a.A];
  if (bots) {
    [H, A] = [a.L.teams[2], a.L.teams[3]];
    for (const t of [H, A]) { for (const p of t.squad) { p.skills = SK(10); p.counterTactics = { vsPress: 25, vsLowBlock: 25, vsTrapLong: 25 }; p.injuryMatchesLeft = 0; } t.tactics.baseFormation = '4-4-2'; t.tactics.customCoords = {}; t.tactics.conditionalRules = []; t.subsLimit = 0; /* v3.13: ingen træthedsskift i test-arenaen */ t.tactics.lineupSlots = t.squad.slice(0, 11).map((p) => p.id); }
    for (const t of [H, A]) t.tactics.phases.phase1_buildUp.offBallRuns = 'NORMAL';
    Object.assign(H.tactics.phases.phase1_buildUp, { passingStyle: 'BALANCED', attackFocus: 'CENTRAL' }, home.p1);
    Object.assign(H.tactics.phases.phase3_transition, { onBallWon: 'KEEP_POSSESSION' }, home.p3);
  }
  for (const p of mids(A)) p.skills.intercepting = 1;
  slot(A, 0).skills.goalkeeping = gk;
  onlyShooter(H);   // v3.12.1: skytten er plads 9
  if (shooterAt) H.tactics.customCoords[9] = shooterAt;
  if (shooterSkills) Object.assign(slot(H, 9).skills, shooterSkills);
  const m = simulateMatch(H, A, stubRng({ 0.48: true, 0.3: true, ...script }));
  const assister = m.ratings.home.find((e) => e.playerId === mids(H)[0].id);
  return { m, kinds: m.goalsPool.map((g) => g.kind), assister, H };
}
// ---------- v3.9: én rigtig kontra efter vundet pres ----------
test('counterChance: trin × taberens boldtab × vinderens erobring (× FB/WB ved Mange), afrundet til 3 decimaler', () => {
  assert.deepEqual(['FEW', 'NORMAL', 'MANY'].map((r) => counterChance(r, 'DROP_BACK', 'KEEP_POSSESSION')), [0.012, 0.032, 0.088]);
  assert.deepEqual(['FEW', 'NORMAL', 'MANY'].map((r) => counterChance(r, 'DROP_BACK', 'FAST_COUNTER')), [0.054, 0.144, 0.396]);
  assert.equal(counterChance('NORMAL', 'COUNTER_PRESS_5S', 'KEEP_POSSESSION'), 0.019); // 0,08·0,6·0,4 = 0,0192 (v3.10: genpres 0,6)
  assert.equal(counterChance('NORMAL', 'COUNTER_PRESS_5S', 'FAST_COUNTER'), 0.086); // 0,08·0,6·1,8 = 0,0864
  assert.equal(counterChance('MANY', 'DROP_BACK', 'KEEP_POSSESSION', 4), 0.106);    // 0,22·0,4·1,2 for fire FB/WB
  assert.equal(counterChance('NORMAL', 'DROP_BACK', 'KEEP_POSSESSION', 4), 0.032);  // kun ved Mange
  assert.ok(counterChance('FEW', 'COUNTER_PRESS_5S', 'KEEP_POSSESSION') > 0, 'kontra findes på alle trin (én kontra røber intet)');
});
// Ude-holdet vinder presset hver gang (INT 20) og kontrer, når kontra-kastet siger ja.
function counters({ home = {}, away = {}, script = {}, own = 'home' } = {}) {
  const a = arena({ home, away });
  const [att, def] = own === 'home' ? [a.H, a.A] : [a.A, a.H];
  if (own === 'away') for (const p of mids(a.A)) p.skills.passing = 11; // ude-holdet har bolden
  for (const p of mids(def)) p.skills.intercepting = 20;
  const m = simulateMatch(a.H, a.A, stubRng({ 0.48: true, ...script }));
  return { m, kinds: m.goalsPool.map((g) => g.kind), press: m.events.filter((e) => e.label === 'Fase 2 pres virker').map((e) => e.text), att, def };
}
test('kontra: vundet pres + kontra-kast → kontramål (COUNTER) for vinderen; uden kast ingen; genpres skifter sandsynligheden', () => {
  const yes = counters({ script: { 0.032: true } });           // NORMAL · Fald tilbage · Hold på bolden
  assert.equal(yes.press.length, 30);
  assert.equal(yes.kinds.length, 30); assert.ok(yes.kinds.every((k) => k === 'COUNTER'));
  assert.equal(yes.m.awayGoals, 30); assert.equal(yes.m.homeGoals, 0);
  assert.ok(yes.m.events.filter((e) => e.type === 'GOAL').every((e) => e.text.includes('PÅ KONTRA')));
  assert.equal(counters({ script: {} }).kinds.length, 0);
  // Genpres hos taberen: 0,032 udløser ikke længere, 0,019 gør
  assert.equal(counters({ home: { p3: { onBallLost: 'COUNTER_PRESS_5S' } }, script: { 0.032: true } }).kinds.length, 0);
  assert.equal(counters({ home: { p3: { onBallLost: 'COUNTER_PRESS_5S' } }, script: { 0.019: true } }).kinds.length, 30);
  // Taberen på Mange: 0,22·0,4 = 0,088 (4-4-2 har LB og RB: ·1,1 → 0,097)
  assert.equal(counters({ home: { p1: { offBallRuns: 'MANY' } }, script: { 0.097: true } }).kinds.length, 30);
  // Reddet kontra: målmand 20 (10 + 4 + 4 < 20·1 + 4)
  const a = counters({ script: { 0.032: true } });
  slot(a.att, 0).skills.goalkeeping = 20;
  const saved = simulateMatch(a.att, a.def, stubRng({ 0.48: true, 0.032: true }));
  assert.equal(saved.awayGoals, 0); assert.equal(saved.events.filter((e) => e.label === 'Kontra reddet').length, 30);
});
test('kontra-teksten: kun DIT holds valg forklares – fire kombinationer; "højt oppe" kun når DU står på Mange', () => {
  // Dit hold (hjemme) presser og vinder bolden fra ude-holdet
  const txt = (won, script) => counters({ own: 'away', home: { p3: { onBallWon: won } }, script }).press[0];
  assert.match(txt('FAST_COUNTER', { 0.144: true }), /Din lynkontra sættes straks i gang\./);
  // v3.16.3: tre varianter (pickBy på minut og presser – intet rng-træk)
  assert.match(txt('FAST_COUNTER', {}), / (Din lynkontra løber ind i et organiseret forsvar\.|Modstanderen når hjem, før lynkontraen kommer i gang\.|Lynkontraen bremses – de er hurtigt tilbage i position\.)$/);
  assert.match(txt('KEEP_POSSESSION', { 0.032: true }), /Dit hold ser hullet og går direkte\./);
  assert.match(txt('KEEP_POSSESSION', {}), /Dit hold falder til ro på bolden\./);
  // Du taber bolden på Mange: den back, der faktisk har løbet frem, nævnes – ingen løb, intet navn
  const noRuns = counters({ home: { p1: { offBallRuns: 'MANY' } }, script: { 0.097: true } }).m.events.find((e) => e.type === 'GOAL').text;
  assert.doesNotMatch(noRuns, /højt oppe/, 'ingen back har løbet i den kamp');
  // 3-5-2 på Mange: hver anden tick en chance, hvor terningen 0,5 lægger løbet på RWB (vægt 7,9–9,9
  // af 18,9); de andre ticks tabes presset og der kontres (0,22·0,4·1,1 for LWB+RWB = 0,097)
  const a = arena({ home: { p1: { offBallRuns: 'MANY' } } });
  a.H.tactics.baseFormation = '3-5-2';
  for (const p of mids(a.A)) p.skills.intercepting = 20;
  const mm = simulateMatch(a.H, a.A, stubRng({ 0.48: (n) => n % 2 === 1, 0.36: true, 0.097: true }));
  const rwb = slot(a.H, 7);
  assert.ok(mm.ratings.home.find((e) => e.playerId === rwb.id).freeRuns > 0);
  const many = mm.events.filter((e) => e.type === 'GOAL' && e.text.includes('KONTRA')).at(-1).text;
  assert.match(many, new RegExp(`Din RWB #${rwb.shirtNumber} ${rwb.shortName} er højt oppe efter sit løb\\.`));
  const normal = counters({ script: { 0.032: true } }).m.events.find((e) => e.type === 'GOAL').text;
  assert.doesNotMatch(normal, /højt oppe|løb/);
  // Modstanderen på Mange taber bolden til dig: hans indstilling nævnes aldrig
  const opp = counters({ own: 'away', away: { p1: { offBallRuns: 'MANY' } }, script: { 0.097: true } });
  assert.ok(opp.m.events.filter((e) => e.type === 'GOAL').length > 0);
  for (const e of opp.m.events) assert.doesNotMatch(e.text, /højt oppe|løb uden bold|Mange/, e.text);
});
// ---------- v3.9: løb uden bold – løber og beslutning ----------
// Stub: next 0,5 trækker løberen midt i vægtene. 4-4-2 på Normal: LB .8, CB .1, CB .1, RB .8,
// LM 2,5, CM 1,5, CM 1,5, RM 2,5, ST 3, ST 3 (sum 15,8 → 7,9 lander på RM, slot 8, på kanten).
function decide({ rm = {}, def = {}, gk = 1, runs = 'NORMAL', script = {} } = {}) {
  const a = arena({ home: { p1: { offBallRuns: runs } } });
  Object.assign(slot(a.H, 8).skills, rm);
  for (const p of mids(a.A)) p.skills.passing = 1;             // hjemmeholdet har altid bolden
  for (const i of [1, 2, 3, 4]) Object.assign(slot(a.A, i).skills, { positioning: 1, intercepting: 1, strength: 1, ...def });
  slot(a.A, 0).skills.goalkeeping = gk;
  const m = simulateMatch(a.H, a.A, stubRng({ 0.3: true, ...script }));
  const rmE = m.ratings.home.find((e) => e.playerId === slot(a.H, 8).id);
  return { m, kinds: m.goalsPool.map((g) => g.kind), rmE, a, goals: m.events.filter((e) => e.type === 'GOAL').map((e) => e.text) };
}
test('løb: kanten med god pasning løber sig fri og lægger den tværs → CUTBACK, assist til løberen, mål til angriberen', () => {
  const r = decide({ rm: { passing: 20, finishing: 1 } });  // skud 0,5 · aflevering 14·3 · dribling 4·2
  assert.equal(r.kinds.length, 30); assert.ok(r.kinds.every((k) => k === 'CUTBACK'), r.kinds.join());
  assert.equal(r.rmE.freeRuns, 30); assert.equal(r.rmE.freeRunsWon, 30); assert.equal(r.rmE.assists, 30); assert.equal(r.rmE.goals, 0);
  const sc = r.m.ratings.home.find((e) => e.goals === 30);   // modtageren står nær straffesparkspletten (v3.12.1)
  assert.ok(sc && sc.playerId !== slot(r.a.H, 8).id);
  // v3.16.3 (Spilfører: "MÅÅÅL! ✅ …"): målets linje genfortæller løbet uden ✅
  assert.match(r.goals[0], /MÅÅÅL! #\d+ .+ løber sig fri på kanten og lægger den tværs til #\d+/); assert.doesNotMatch(r.goals[0], /✅/);
});
// v3.16: skuddets type efter løberens plads (LONGSHOT_Y 30), ikke zonen – RM sluppet igennem står på 48 − 16 − 12 = 20 i feltet:
// kombination med oplæg fra den første anden midtbanespiller (LM, plads 5). Før: langskud uden oplæg. Skudvægt (FIN 20 − 6)·0,3 = 4,2
// mod aflevering 0,5·3 + dribling 0,5·2 = 2,5 → skud.
test('løb: god afslutning → skud selv (fra kanten i feltet: kombination med oplæg fra LM); god fart+boldkontrol → dribletur', () => {
  const shot = decide({ rm: { finishing: 20, passing: 1, pace: 1, ballControl: 1 } });
  assert.ok(shot.kinds.length === 30 && shot.kinds.every((k) => k === 'COMBINATION'), shot.kinds.join());
  assert.equal(shot.rmE.goals, 30); assert.equal(shot.rmE.assists, 0);
  assert.equal(shot.m.ratings.home.find((e) => e.playerId === slot(shot.a.H, 5).id).assists, 30);
  assert.match(shot.goals[0], /løber sig fri på kanten og skyder/);
  const drb = decide({ rm: { pace: 20, ballControl: 20, finishing: 10, passing: 1 } });
  assert.ok(drb.kinds.length === 30 && drb.kinds.every((k) => k === 'DRIBBLE'), drb.kinds.join());
  assert.match(drb.goals[0], /løber sig fri på kanten, dribler #\d+ .+ af og afslutter selv/);
});
test('løb: tabt dribletur er en opsnapning – ingen afslutning, ingen redning, men kontra-tjek', () => {
  const lost = decide({ rm: { pace: 12, ballControl: 12, finishing: 1, passing: 1 }, def: { positioning: 1, intercepting: 1, strength: 40 } });
  // Løbet vindes (POS 10 + PAC 6 mod 1 + 0,5), driblingen tabes: 24 + 4 < 1 + 20 + 4 + 3
  assert.equal(lost.kinds.length, 0);
  assert.equal(lost.m.events.filter((e) => e.label === 'Opsnappet').length, 30);
  assert.equal(lost.m.events.filter((e) => e.type === 'SAVE').length, 0);
  assert.equal(lost.m.stats.hShots, 0, 'en opsnapning er ikke et skud');
  const ctr = decide({ rm: { pace: 12, ballControl: 12, finishing: 1, passing: 1 }, def: { positioning: 1, intercepting: 1, strength: 40 }, script: { 0.032: true } });
  assert.equal(ctr.m.awayGoals, 30); assert.ok(ctr.kinds.every((k) => k === 'COUNTER'));
});
test('løb: tabt løb (forsvareren følger med) → almindelig chance som før, intet "fri" i referatet', () => {
  const r = decide({ def: { positioning: 20, intercepting: 20 }, gk: 1 });
  assert.equal(r.rmE.freeRuns, 30); assert.equal(r.rmE.freeRunsWon, 0);
  // Almindelig afslutning: kombination eller langskud efter skyttens plads (v3.12.1) – aldrig løbets cutback/dribletur.
  assert.ok(r.kinds.length === 30 && r.kinds.every((k) => k === 'COMBINATION' || k === 'LONGSHOT'), r.kinds.join());
  // Løbets tekst er "løber sig fri"/"kom fri" – målteksten "spillede X fri" (kombination) er ikke løbet (v3.16.3: alle tre
  // kombinationstekster bruges nu i en kamp, så den kommer med)
  assert.ok(r.goals.length === 30);
  for (const t of r.goals) assert.doesNotMatch(t, /løber sig fri|kom fri|sluppet fri/);
});
test('løb: lave cutbacks vægter afleveringen fra kanten for ALLE hold (v3.12, brugerens valg) – men kun dit hold får fokus nævnt i teksten', () => {
  // Kant: skud 0,5 · aflevering 4·3 (·1,3 = 15,6) · dribling 7·2 → uden fokus dribling, med fokus aflevering
  const rm = { finishing: 4, passing: 10, pace: 13, ballControl: 13 }; // FIN 4: skudvægt 0,5, men nok til at score (4 + 4 + 2 > 1 + 4 + 3 er falsk – MV 0 nedenfor)
  const setup = () => { const a = arena({ home: { p1: { attackFocus: 'LOW_CUTBACKS' } } }); Object.assign(slot(a.H, 8).skills, rm); for (const p of mids(a.A)) p.skills.passing = 1; for (const i of [1, 2, 3, 4]) Object.assign(slot(a.A, i).skills, { positioning: 1, intercepting: 1, strength: 1 }); slot(a.A, 0).skills.goalkeeping = 0; return a; };
  const base = (() => { const a = setup(); a.H.tactics.phases.phase1_buildUp.attackFocus = 'CENTRAL'; return simulateMatch(a.H, a.A, stubRng({ 0.3: true })).goalsPool.map((g) => g.kind); })();
  assert.ok(base.length >= 25 && base.every((k) => k === 'DRIBBLE'), 'uden fokus: ' + base.join());
  const own = setup();
  const om = simulateMatch(own.H, own.A, stubRng({ 0.3: true }));
  assert.ok(om.goalsPool.length >= 25 && om.goalsPool.every((g) => g.kind === 'CUTBACK'), om.goalsPool.map((g) => g.kind).join());
  assert.ok(om.events.filter((e) => e.type === 'GOAL').every((e) => e.text.includes('lægger den lavt tilbage til')), 'dit fokus nævnes');
  const bot = setup(); bot.H.isBot = true;
  const bm = simulateMatch(bot.H, bot.A, stubRng({ 0.3: true }));
  assert.ok(bm.goalsPool.length >= 25 && bm.goalsPool.every((g) => g.kind === 'CUTBACK'), 'en bots fokus virker også');
  // Målbeskrivelsen (describeGoal – måltypen er offentlig, "Lavt cutback: …") fjernes: den nævner typen, ikke botens indstilling.
  // v3.16.3: alle tre CUTBACK-tekster bruges nu i en kamp (før gav stub-rng'en altid den ene uden ordet).
  const descs = bm.goalsPool.map((g) => g.desc);
  assert.ok(descs.length >= 25 && descs.every((d) => bm.events.some((e) => e.text.includes(d))), 'data: beskrivelserne står i referatet');
  const botText = bm.events.filter((e) => e.isHome).map((e) => descs.reduce((t, d) => t.replace(d, ''), e.text)).join(' ');
  assert.ok(!/lavt tilbage|cutback|Dine |Dit |løber sig fri/i.test(botText), 'en bots fokus og løb nævnes aldrig: ' + botText.slice(0, 200));
  assert.equal(bm.duelLog[bot.H.id].cutbacks, om.duelLog[own.H.id].cutbacks, 'samme mekanik');
});
test('anti-spionage i koden: ingen referattekst læser modstanderens løb uden bold – kun egne (own) eller udfaldet', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../../public/engine/match.js', import.meta.url), 'utf8');
  const reads = src.split('\n').filter((l) => /offBallRuns/.test(l) && !/^\s*\/\//.test(l));
  assert.ok(reads.length >= 4, 'testdata: feltet læses');
  // Hver læsning er enten mekanik (sandsynlighed/vægt) eller bag own(...): ingen tekst-skabelon på samme linje uden own
  for (const l of reads) if (/`/.test(l)) assert.match(l, /own\(/, l);
  // Teksten "højt oppe" står kun i grenen for dit eget hold
  const hoj = src.split('\n').filter((l) => l.includes('højt oppe'));
  assert.ok(hoj.length >= 1 && src.includes("own(lose) && lose.tactics.phases.phase1_buildUp.offBallRuns === 'MANY'"));
});
test('Hvis-Så-planskift bærer løb uden bold med: skift til en plan på Mange giver Mange-chancen (0,36)', () => {
  const a = arena();
  a.H.tacticPresets = [structuredClone(a.H.tactics), structuredClone(a.H.tactics), structuredClone(a.H.tactics)];
  a.H.tacticPresets[1].phases.phase1_buildUp.offBallRuns = 'MANY';
  a.H.tactics.conditionalRules = [{ ruleId: 1, minuteTrigger: 45, condition: 'DRAW', margin: 1, newFormation: '4-4-2', newPlan: 1, slotRemapping: null }];
  const seen = [];
  const rng = { ...stubRng(), chance: (p) => { seen.push(p); return false; } };
  simulateMatch(a.H, a.A, rng);
  // Hjemme har bolden hele kampen: chance-kast 0,3 før minut 45, 0,36 efter skiftet
  assert.ok(seen.includes(0.3) && seen.includes(0.36), [...new Set(seen)].join(','));
  assert.ok(seen.indexOf(0.36) > seen.lastIndexOf(0.3));
});

test('løb: modstanderens løb fortælles aldrig – kun handlingen', () => {
  const a = arena();
  for (const p of mids(a.A)) p.skills.passing = 11;           // ude-holdet har bolden
  for (const i of [1, 2, 3, 4]) Object.assign(slot(a.H, i).skills, { positioning: 1, intercepting: 1 });
  slot(a.H, 0).skills.goalkeeping = 1;
  const m = simulateMatch(a.H, a.A, stubRng({ 0.3: true }));
  assert.ok(m.awayGoals >= 25);
  for (const e of m.events) assert.doesNotMatch(e.text, /løber sig fri|fri på|fri bag|fri mellem|fri dybt/, e.text);
  assert.ok(m.ratings.away.some((e) => e.freeRunsWon > 0), 'tælles stadig (privat) hos modstanderen');
});
test('løb: vægte pr. rolle og trin – CB kan løbe på alle trin (intet "kun ved"), backs mest på Mange; zoner og beslutningsvægte', () => {
  for (const r of ['FEW', 'NORMAL', 'MANY']) assert.ok(RUN_WEIGHT.CB[r] > 0 && RUN_WEIGHT.FB[r] > 0, r);
  assert.ok(RUN_WEIGHT.FB.MANY > RUN_WEIGHT.FB.NORMAL && RUN_WEIGHT.FB.NORMAL > RUN_WEIGHT.FB.FEW);
  assert.deepEqual(['LWB', 'RB', 'CDM', 'CAM', 'CF', 'RW', 'CB', 'GK'].map(runGroup), ['FB', 'FB', 'CM', 'WIDE', 'ST', 'WIDE', 'CB', 'CM']);
  assert.deepEqual([{ x: 15, y: 70 }, { x: 50, y: 85 }, { x: 50, y: 55 }, { x: 50, y: 60 }, { x: 72, y: 79 }, { x: 28, y: 56 }].map(runZone), ['WIDE', 'DEEP', 'HIGH', 'MID', 'MID', 'MID']);
  // v3.16: DECISION_ZONE.SHOT.WIDE 1 → 0,3 – skud (gulv 0,5)·0,3 = 0,15 (før 0,5)
  assert.deepEqual(decisionWeights({ finishing: 5, passing: 12, pace: 10, ballControl: 10 }, 'WIDE'), { SHOT: 0.15, PASS: 18, DRIBBLE: 8 });
  assert.ok(Math.abs(decisionWeights({ finishing: 5, passing: 12, pace: 10, ballControl: 10 }, 'WIDE', true).PASS - 23.4) < 1e-9); // lave cutbacks ·1,3
  assert.deepEqual(decisionWeights({ finishing: 16, passing: 10, pace: 10, ballControl: 10 }, 'HIGH'), { SHOT: 30, PASS: 4, DRIBBLE: 4 });
});

test('Hold på bolden: efter vundet pres uden kontra får holdets NÆSTE opbygning +2 (Lynkontra ikke)', () => {
  // Terningen: possession skifter fra 2. tick (ude, hjemme, ude, …); alt andet 0,5. Hjemme presser
  // hårdt (INT 20) og vinder bolden i ude-tickene; i hjemme-tickene er opbygningen 24,75 mod
  // udeholdets pres 25,75 – kun +2 fra "Hold på bolden" vender det (26,75).
  const run = (won) => {
    const a = arena({ home: { p3: { onBallWon: won } } });
    for (const p of mids(a.H)) p.skills.intercepting = 20;
    for (const p of mids(a.A)) p.skills.intercepting = 9;
    let state = 'pre', poss = 0;
    const rng = {
      int: (x) => x, pick: (arr) => arr[0],
      chance: (p) => { state = p === 0.48 ? 'duel' : 'poss'; return p === 0.48; },
      next: () => {
        if (state !== 'poss') return 0.5;
        const tick = Math.floor(poss / 2), h = poss % 2 === 0; poss++;
        return tick % 2 === 0 ? (h ? 0 : 1) : 0.5; // lige tick (2., 4., …): ude får bolden
      },
    };
    const m = simulateMatch(a.H, a.A, rng);
    return m.events.filter((e) => e.label === 'Fase 1 virker' && e.isHome).length;
  };
  assert.equal(run('KEEP_POSSESSION'), 14); // hjemme-tick 3, 5, …, 29
  assert.equal(run('FAST_COUNTER'), 0);
});

test('prisen i løb: Mange km ·1,03 og HI ·1,08 for backs/centrale/angribere, Få ·0,98/·0,94; genpres km ·1,04 for alle markspillere', async () => {
  const { runProfile } = await import('../../public/engine/ratings.js');
  const r = { next: () => 0.5 };
  const team = (runs, lost = 'DROP_BACK') => ({ tactics: { phases: { phase1_buildUp: { offBallRuns: runs }, phase2_defending: { pressingHeight: 'MID_BLOCK' }, phase3_transition: { onBallLost: lost } } } });
  const pl = (line) => ({ line, freshness: 100, skills: { stamina: 10, pace: 10 } });
  const km = (role, runs, lost, line = 'MID') => Math.round(runProfile(pl(line), team(runs, lost), r, role).km90 * 1000) / 1000;
  const hi = (role, runs) => runProfile(pl('MID'), team(runs), r, role).hiShare;
  assert.deepEqual(['FEW', 'NORMAL', 'MANY'].map((x) => km('CM', x)), [11.564, 11.8, 12.154]);
  assert.deepEqual(['FEW', 'NORMAL', 'MANY'].map((x) => km('RB', x)), [10.388, 10.6, 10.918]);
  assert.deepEqual(['FEW', 'NORMAL', 'MANY'].map((x) => km('CB', x)), [9.5, 9.5, 9.5]);     // stoppere bliver hjemme
  assert.deepEqual(['FEW', 'NORMAL', 'MANY'].map((x) => hi('ST', x)), [10.3, 11, 11.9]);    // 11·0,94 / 11·1,08
  assert.equal(km('CB', 'NORMAL', 'COUNTER_PRESS_5S'), 9.88);                                // 9,5·1,04
  assert.equal(km('CM', 'MANY', 'COUNTER_PRESS_5S'), 12.64);                                 // 11,8·1,03·1,04
  assert.equal(km('GK', 'NORMAL', 'COUNTER_PRESS_5S', 'GK'), 5.5);                           // målmanden presser ikke
});
test('opsummering ved slutfløjt: kun dit hold, med din indstilling, dine løb og kontraer imod i alt', () => {
  // Test Manager v3.9: Mange har chance-tallet 0,36 – uden det her var der 0 løb, og teksten "0 løb, 0 kom fri" var tom
  const r = decide({ rm: { passing: 20, finishing: 1 }, runs: 'MANY', script: { 0.36: true } });
  assert.ok(r.m.ratings.home.reduce((a, e) => a + e.freeRuns, 0) >= 25, 'fixturet skal have løb');
  const sum = r.m.events.filter((e) => e.label === 'Fuldtids-analyse').map((e) => ({ ...e, text: e.text.match(/🎯 .*?\.(?= ⚔️)/)[0] }));
  assert.equal(sum.length, 1);
  assert.ok(sum[0].isHome && sum[0].min === 90);
  const runs = r.m.ratings.home.reduce((a, e) => a + e.freeRuns, 0), won = r.m.ratings.home.reduce((a, e) => a + e.freeRunsWon, 0);
  assert.equal(sum[0].text, `🎯 Løb uden bold (Mange): ${runs} løb, ${won} kom fri (${r.m.homeGoals} mål) · kontraer imod i alt: 0 (0 mål).`);
  // Bot mod bot: ingen opsummering
  const { L } = arena();
  const b = simulateMatch(L.teams[2], L.teams[3], createRng(5));
  assert.equal(b.events.filter((e) => e.label === 'Fuldtids-analyse').length, 0);
});
test('frispilningsløb er private i karakterarket (de røber positionering, fart og indstilling)', async () => {
  const { viewRatingEntry } = await import('../../public/engine/visibility.js');
  const e = { playerId: 'p', stars: 3, freeRuns: 5, freeRunsWon: 3 };
  assert.ok(!('freeRuns' in viewRatingEntry(e, false)) && !('freeRunsWon' in viewRatingEntry(e, false)));
  assert.equal(viewRatingEntry(e, true).freeRunsWon, 3);
});

test('måltype: COUNTER kommer kun fra en rigtig kontra – aldrig som label på en almindelig afslutning', () => {
  for (const won of ['FAST_COUNTER', 'KEEP_POSSESSION']) {
    const g = goals({ home: { p3: { onBallWon: won } }, script: { 0.36: true, 0.14: true } });
    assert.ok(g.kinds.length >= 25 && g.kinds.every((k) => k !== 'COUNTER'), g.kinds.join());
  }
});
test('måltype CUTBACK kommer kun fra en rigtig cutback (v3.12): den almindelige afslutning er aldrig cutback – heller ikke med de gamle 42 %/12 %', () => {
  const plain = (o) => goals(o).kinds;
  for (const k of [plain({ home: { p1: { attackFocus: 'LOW_CUTBACKS' } }, script: { 0.42: true } }), plain({ bots: true, home: { p1: { attackFocus: 'CENTRAL' } }, script: { 0.12: true } })]) {
    assert.ok(k.length >= 25 && k.every((x) => x !== 'CUTBACK'), k.join());
  }
  const cb = plain({ home: { p1: { attackFocus: 'LOW_CUTBACKS' } }, script: { 0.38: true } });
  assert.ok(cb.length >= 25 && cb.every((x) => x === 'CUTBACK'), cb.join());
  // Samme hold som bot (modstanderens pres holdes på mellemblok, så kanten ikke lukkes)
  const b = arena({ home: { p1: { attackFocus: 'LOW_CUTBACKS' } } }); b.H.isBot = true;
  for (const p of mids(b.A)) p.skills.intercepting = 1; slot(b.A, 0).skills.goalkeeping = 1;
  const botCb = simulateMatch(b.H, b.A, stubRng({ 0.48: true, 0.3: true, 0.38: true })).goalsPool.map((g) => g.kind);
  assert.ok(botCb.length >= 25 && botCb.every((x) => x === 'CUTBACK'), botCb.join());
});
// v3.12.1 (dokumentet "Mål": langskud 8–10 %): langskud = skytten står uden for feltet (y ≥ LONGSHOT_Y – v3.16: 30, før 24);
// før v3.12.1 vægtet af FIN. ST (y 20) med bolden: 20 − 6 = 14, v3.16 klemt bag offside-linjen (27 + 1 = 28) → inde (28 < 30);
// trukket til y 36: 36 − 6 = 30 → ude (før y 34 → 28 ≥ 24 – nu inde).
test('måltype: langskud efter skyttens plads, dribletur/kombination efter evnerne – langskud/dribletur uden oplæg, kombination med', () => {
  // Inde i feltet, vægte ved next 0,5: kombination 4, dribletur ((PAC+BAL)/2−8)·0,45.
  const comb = goals({ shooterSkills: { finishing: 20 } });      // 4 / 0,9 → r = 2,45 → kombination – FIN alene giver intet langskud
  assert.ok(comb.kinds.length >= 25 && comb.kinds.every((k) => k === 'COMBINATION'), comb.kinds.join());
  assert.ok(comb.assister.assists > 0);
  const lng = goals({ shooterSkills: { finishing: 20 }, shooterAt: { x: 50, y: 36 } });   // uden for feltet → langskud
  assert.ok(lng.kinds.length >= 25 && lng.kinds.every((k) => k === 'LONGSHOT'), lng.kinds.join());
  assert.equal(lng.assister.assists, 0, 'et langskud har ingen oplægsgiver');
  const drb = goals({ shooterSkills: { pace: 20, ballControl: 20, finishing: 10 } }); // 4 / 0,9 / 5,4 → r = 5,15 → dribletur
  assert.ok(drb.kinds.length >= 25 && drb.kinds.every((k) => k === 'DRIBBLE'), drb.kinds.join());
  assert.equal(drb.assister.assists, 0);
  const g = lng.m.goalsPool[0], ev = lng.m.events.find((e) => e.type === 'GOAL');
  assert.ok(g.desc.includes('langskud') || g.desc.includes('distancen') || g.desc.includes('missil'), g.desc);
  assert.ok(ev.text.includes(g.desc) && !/Kombinationsfodbold/.test(ev.text), ev.text);
  assert.equal(g.spectacle, goalSpectacle('LONGSHOT', { finishing: 20 }, g.min, { next: () => 0.5 }));
  // Skytten får +1,4 for et solomål (+1,25 med oplæg): ét mål i 1. tick, start 6,5
  const one = (sk, at = null) => { const x = goals({ shooterSkills: sk, shooterAt: at, script: { 0.3: (n) => n === 0 } }); return x.m.ratings.home.find((e) => e.playerId === slot(x.H, 9).id).rating; };
  assert.equal(one({ finishing: 20 }, { x: 50, y: 36 }), 8.3); // 6,5 + 1,4 + 0,4 sejr (RESULT_BONUS v3.15)
  assert.equal(one(null), 8.2);              // 6,5 + 1,25 + 0,4 sejr = 8,15 → 8,2 (v3.15)
});
// QC v3.12.1 (B1): langskuddets værdi er min(FIN + 8, LOFT). v3.15.1: loftet 13 → 10 og KEEPER_EDGE 3 → 0,3.
// Rul 0,5: skud + 4 mod MV + 4 + 0,3. God afslutter (FIN 16) mod MV 9,8: i feltet 16 > 10,1 → mål; uden for feltet
// 10 < 10,1 → redning (med loftet 13 var det mål; med fast +7 var det 23 → mål). Midtbanespiller (FIN 2) mod MV 9,6:
// uden for 2 + 8 = 10 > 9,9 → mål; i feltet 2 < 9,9. FIN 1,8 + 8 = 9,8 < 9,9 → redning (bonussen er 8, ikke mere).
test('langskud: værdien er min(FIN + 8, 10) – en god afslutter står bedre i feltet, en midtbanespiller får hjælp på afstand', () => {
  const OUT = { x: 50, y: 36 };   // v3.16: 36 − 6 = 30 ≥ LONGSHOT_Y 30 (før y 34 → 28 ≥ 24)
  assert.equal(goals({ shooterSkills: { finishing: 16 }, gk: 9.8 }).m.homeGoals, 30, 'i feltet');
  assert.equal(goals({ shooterSkills: { finishing: 16 }, gk: 9.8, shooterAt: OUT }).m.homeGoals, 0, 'uden for feltet: loftet 10');
  assert.equal(goals({ shooterSkills: { finishing: 2 }, gk: 9.6, shooterAt: OUT }).m.homeGoals, 30, 'FIN 2 + 8 = 10');
  assert.equal(goals({ shooterSkills: { finishing: 2 }, gk: 9.6 }).m.homeGoals, 0);
  assert.equal(goals({ shooterSkills: { finishing: 1.8 }, gk: 9.6, shooterAt: OUT }).m.homeGoals, 0, 'FIN 1,8 + 8 = 9,8 < 9,9');
});
test('øjebliksbillede: ved et solo-mål (langskud) står bolden ved skytten; ved et kontramål imod står dit hold i angrebsform', () => {
  const g = goals({ shooterSkills: { finishing: 20 }, shooterAt: { x: 50, y: 36 }, script: { 0.3: (n) => n === 0 } });   // v3.16: 30 ≥ 30
  const ev = g.m.events.find((e) => e.type === 'GOAL'), sid = slot(g.H, 9).id;
  assert.ok(ev?.snapshot && g.m.goalsPool[0].kind === 'LONGSHOT', JSON.stringify(ev?.snapshot));
  const me = ev.snapshot.pts.find(([id]) => id === sid);
  assert.deepEqual(ev.snapshot.ball, [me[1], me[2]]);
  assert.equal(ev.snapshot.scorer, sid);
  // Kontra imod dit hold (hjem): dit hold mistede bolden i angrebet – CB'en (formation y 73) står fremme (73 − 14 = 59), ikke i blokken (73)
  const { a, m } = ctr();
  const ce = m.events.find((e) => e.type === 'GOAL' && e.snapshot);
  assert.ok(ce && ce.snapshot.attacking === false && ce.snapshot.scorer === null, JSON.stringify(ce?.snapshot));
  const cb = ce.snapshot.pts.find(([id]) => id === slot(a.H, 2).id);
  assert.equal(cb[2], 59);
  assert.ok(ce.snapshot.pts.every(([id]) => a.H.squad.some((p) => p.id === id)), 'kun dit holds spillere');
});
// v3.12.1 (QC): kontraens skytte vælges i FORSVARSFORMEN – holdet har lige vundet bolden. v3.16 (koblede linjer, caught): ingen af
// kontraholdet står foran modstanderens sidste markspiller, der er fanget fremme i angrebsform (CB 73 − 14 = 59 → linje 41, så ≥ 42).
// Før: ST (50, 20) mod CM (50, 36) – nu klemmes begge til 42 og står ens. Derfor ST trukket til (50, 42), CM til (50, 50): i forsvarsform
// står ST nærmest pletten (50, 20) (22 mod 30) → han skyder; i angrebsform (ST −6 → 36, CM −16 → 34, linjen 27 + 1) stod CM'en
// nærmest (14 mod 16) og ville skyde. Rul 0,5 vælger kumulativt i pladsrækkefølge (CM før ST).
test('kontra: skytten er den nærmeste i forsvarsformen (ST nærmest pletten), ikke i angrebsformen (CM rykket frem)', () => {
  const { a, m } = ctr({ tweak: (a) => {
    a.A.tactics.customCoords = Object.fromEntries([1, 2, 3, 4, 5, 7, 8, 10].map((j) => [j, { x: 50, y: 95 }]));
    Object.assign(a.A.tactics.customCoords, { 6: { x: 50, y: 50 }, 9: { x: 50, y: 42 } });
    for (const i of [6, 9]) slot(a.A, i).skills.finishing = 20;
    slot(a.H, 0).skills.goalkeeping = 1;
  } });
  assert.equal(m.awayGoals, 2);
  assert.equal(rOf(m, 'away', a.A, 9).goals, 2, 'ST scorer');
  assert.equal(rOf(m, 'away', a.A, 6).goals, 0, 'ikke CM');
});
// v3.15.1: VAR er ikke længere en måltype – et tjekket mål beholder sin egen type (GOAL_KIND_LABEL.VAR og VAR-teksterne
// findes kun for gamle gem). Hovedstødet tjekkes også (0,131 sand) og forbliver HEADER.
test('måltype: hovedstød har egen type og tekst – et mål, VAR har tjekket, får aldrig typen VAR', () => {
  const run = (check) => {
    const a = arena({ home: { p1: { attackFocus: 'HIGH_CROSSES' } } });
    for (const p of mids(a.A)) p.skills.intercepting = 1;
    for (const p of a.A.squad) p.aerialPower = 1;
    slot(a.A, 0).skills.goalkeeping = 1;
    return simulateMatch(a.H, a.A, stubRng({ 0.48: true, 0.3: true, 0.52: true, 0.131: check }));
  };
  const m = run(false);
  // v3.16.3: hovedstødsteksten uden minut (minuttet står ved linjen)
  assert.ok(m.goalsPool.length >= 25 && m.goalsPool.every((g) => g.kind === 'HEADER' && /hovedstødsmål|stangede|Luftherredømme/.test(g.desc) && !/\d+\. minut/.test(g.desc)), m.goalsPool[0]?.desc);
  const hv = run(true);
  assert.equal(hv.events.filter((e) => e.type === 'VAR_CHECK').length, hv.goalsPool.length);
  assert.ok(hv.goalsPool.length >= 25 && hv.goalsPool.every((g) => g.kind === 'HEADER'), hv.goalsPool.map((g) => g.kind).join());
  assert.ok(hv.events.filter((e) => e.type === 'HEADER_GOAL').every((e) => e.text.includes('header bolden ind') && e.text.includes('📺 VAR: målet står')));
  const v = varRun(23).m;
  assert.equal(v.events.filter((e) => e.type === 'VAR_CHECK').length, 2);
  assert.ok(v.goalsPool.length === 2 && v.goalsPool.every((g) => g.kind !== 'VAR' && ['COMBINATION', 'LONGSHOT', 'DRIBBLE'].includes(g.kind)), v.goalsPool.map((g) => g.kind).join());
  assert.ok(!v.events.some((e) => e.type === 'VAR_GOAL'), 'ingen VAR_GOAL-hændelse længere');
});

// ---------- #4 Avisen ----------
const M = (hName, aName, hG, aG, extra = {}) => ({ homeId: hName, awayId: aName, homeName: hName, awayName: aName, homeGoals: hG, awayGoals: aG, stats: { hVarChecks: 0, aVarChecks: 0 }, ratings: { home: [], away: [] }, goalsPool: [], ...extra });
test('overskrifter: variant = (hjemme·7 + ude·3 + runde) % 3; vinder og score i rigtig rækkefølge', () => {
  assert.equal(headline(M('A', 'B', 3, 0), 0), 'A knuser B 3-0');               // 21 % 3 = 0 → stor sejr
  assert.equal(headline(M('A', 'B', 3, 0), 1), 'Opvisning: A sender B hjem med 3-0');
  assert.equal(headline(M('A', 'B', 2, 0), 2), 'A snupper sejren mod B (2-0)'); // (14 + 2) % 3 = 1; 2 mål er ikke stor
  assert.equal(headline(M('A', 'B', 0, 2), 0), 'B slår A 2-0');                 // udesejr: vinderen først
  assert.equal(headline(M('A', 'B', 0, 3), 2), 'A får klø – B vinder 3-0');     // 9 + 2 = 11 % 3 = 2
  assert.equal(headline(M('A', 'B', 1, 1), 0), 'A og B skilles 1-1');           // 10 % 3 = 1
  assert.equal(headline(M('A', 'B', 0, 0), 0), 'Målløst mellem A og B');
  assert.equal(headline(M('A', 'B', 0, 0), 2), 'Ingen vinder – A og B spiller 0-0');
  assert.equal(new Set([0, 1, 2].map((r) => headline(M('A', 'B', 1, 0), r))).size, 3);
});
test('rundens overraskelse: ≥3 pladser OG ≥3 point under taberen; uafgjort tæller ikke; størst afstand vinder', () => {
  const pos = { A: { pos: 1, points: 9 }, B: { pos: 4, points: 6 }, C: { pos: 2, points: 9 }, D: { pos: 7, points: 3 }, E: { pos: 3, points: 7 }, F: { pos: 6, points: 5 } };
  const up = (ms) => buildGazette(ms, { positions: pos, round: 4 }).upset;
  assert.deepEqual(up([M('A', 'D', 0, 1)]), { gap: 6, winner: 'D', winnerPos: 7, loser: 'A', loserPos: 1, score: '1-0' });
  assert.equal(up([M('B', 'A', 1, 0)])?.winner, 'B');         // 3 pladser, 3 point
  assert.equal(up([M('E', 'B', 0, 1)]), null);                // 1 plads
  assert.equal(up([M('E', 'F', 0, 2)]), null);                // 3 pladser, men kun 2 point
  assert.equal(up([M('A', 'D', 1, 1)]), null);                // uafgjort
  assert.equal(up([M('B', 'A', 1, 0), M('D', 'C', 2, 1)]).winner, 'D'); // 5 pladser slår 3
  assert.equal(buildGazette([M('A', 'D', 0, 1)], { round: 4 }).upset, null); // uden tabel ingen overraskelse
});
test('dit holds løber: kun dit eget hold, den der løb længst', () => {
  const e = (id, user, km, ts) => ({ playerId: id, teamId: user ? 'me' : 'bot', isUserTeam: user, shirtNumber: 1, shortName: id, rating: 6, goals: 0, assists: 0, distanceKm: km, topSpeed: ts, hiShare: km });
  const g = buildGazette([M('me', 'bot', 1, 0, { ratings: { home: [e('a', true, 10.1, 30), e('b', true, 11.5, 31)], away: [e('x', false, 13, 33)] } })]);
  assert.deepEqual(g.myRunner, { playerId: 'b', teamId: 'me', shirtNumber: 1, shortName: 'b', distanceKm: 11.5, topSpeed: 31, hiShare: 11.5 });
  assert.equal(buildGazette([M('me', 'bot', 1, 0, { ratings: { home: [], away: [e('x', false, 13, 33)] } })]).myRunner, null);
});
test('tabellen før runden: placering og point, kun fra runde 3', async () => {
  const { tableBefore } = await import('../../public/engine/season.js');
  const L = createLeague(createRng(8)), rng = createRng(8);
  assert.equal(tableBefore(L, 1), null); assert.equal(tableBefore(L, 2), null);
  for (let r = 0; r < 2; r++) commitRound(L, playPairs(L, fixedPairs(L, 1), rng), rng);
  const t = tableBefore(L, 3), sorted = sortStandings(L.leagueMetadata.standings);
  assert.deepEqual(t[sorted[0].teamId], { pos: 1, points: sorted[0].points });
  assert.deepEqual(t[sorted[7].teamId], { pos: 8, points: sorted[7].points });
});

// ---------- #1 Friskhed i pres, afslutning, målmand og luftduel ----------
test('friskhed virker også i presset: INT 9 vinder frisk (25,75 > 24,75), taber ved 80 % (19,95 + 4,75 = 24,7)', () => {
  const run = (fresh) => { const { H, A } = arena(); for (const p of mids(A)) { p.skills.intercepting = 9; p.freshness = fresh; } return count(simulateMatch(H, A, stubRng({ 0.48: true })), 'Fase 1 virker'); };
  assert.equal(run(100), 0);
  assert.equal(run(80), 30);
});
test('friskhed virker i afslutningen – både skytte og målmand', () => {
  // v3.15.1 (KEEPER_EDGE 0,3; v3.13: 3 mod MV 6/7): skytte FIN 10 mod MV 9 (+4 hver, +0,3): 14 > 13,3 → mål; skytte 50 %:
  // 8,75 + 4 < 13,3 → redning. MV 10 mod FIN 10: 14 > 14,3 er falsk → redning; MV 50 %: 8,75 + 4,3 = 13,05 < 14 → mål.
  // Med den gamle kant 3 var MV 9 frisk en redning (14 < 16) og MV 10 træt også (15,75 > 14).
  const run = (shFresh, gk, gkFresh) => {
    const { H, A } = arena();
    for (const p of mids(A)) p.skills.intercepting = 1;
    onlyShooter(H); slot(H, 9).freshness = shFresh; Object.assign(slot(A, 0), { freshness: gkFresh }); slot(A, 0).skills.goalkeeping = gk;
    for (const b of A.squad.slice(11)) b.skills = SK(1); // udeholdet er en bot – ingen frisk afløser at rotere ind
    const m = simulateMatch(H, A, stubRng({ 0.48: true, 0.3: true }));
    return m.homeGoals;
  };
  assert.ok(run(100, 9, 100) >= 25); assert.equal(run(50, 9, 100), 0);
  assert.equal(run(100, 10, 100), 0); assert.ok(run(100, 10, 50) >= 25);
});
test('friskhed virker i luftduellen – både angriber og forsvarer', () => {
  // Hovedstød (v3.12, trin 1): skytte-aerial·f + 3 + CROSS_EDGE 2 (v3.12.1; før 1) > forsvarer-aerial·f + 3; trin 2 mod MV 0 vindes altid.
  const run = (shAir, shFresh, defFresh) => {
    const a = arena({ home: { p1: { attackFocus: 'HIGH_CROSSES' } } });
    for (const p of mids(a.A)) p.skills.intercepting = 1;
    slot(a.A, 0).skills.goalkeeping = 0;
    for (const i of [1, 2, 3, 4]) Object.assign(slot(a.A, i), { aerialPower: 10, freshness: defFresh }); // v3.8: en stopper (slot 2/3) tager luftduellen
    Object.assign(slot(a.H, 9), { aerialPower: shAir, freshness: shFresh });
    onlyShooter(a.H);   // v3.16: angriberne på offside-linjen – uden det tog en anden (luft 10) hovedstødet
    for (const b of a.A.squad.slice(11)) b.skills = SK(1); // ingen bot-rotation af den trætte forsvarer
    return simulateMatch(a.H, a.A, stubRng({ 0.48: true, 0.3: true, 0.52: true })).events.filter((e) => e.type === 'HEADER_GOAL').length;
  };
  assert.ok(run(8.5, 100, 100) >= 25);   // 8,5 + 2 > 10
  assert.equal(run(8.5, 50, 100), 0);    // 7,44 + 2 < 10
  assert.equal(run(8, 100, 100), 0);     // 8 + 2 > 10 er falsk
  assert.ok(run(8, 100, 50) >= 25);      // 10 > 8,75
});

test('luftduel i feltet tages af en midtstopper, når holdet har en (v3.8) – ellers af den trukne forsvarer', () => {
  const run = (formation) => {
    const a = arena({ home: { p1: { attackFocus: 'HIGH_CROSSES' } } });
    if (formation) a.A.tactics.baseFormation = formation;
    for (const p of mids(a.A)) p.skills.intercepting = 1;
    slot(a.A, 0).skills.goalkeeping = 0;
    // Backs/wingbacks (slot 1 og 4 i 4-4-2) er luftstærke, stopperne svage: vinder skytten, var det en stopper.
    for (const i of [1, 2, 3, 4]) Object.assign(slot(a.A, i), { aerialPower: [1, 4].includes(i) ? 20 : 5, freshness: 100 });
    Object.assign(slot(a.H, 9), { aerialPower: 11, freshness: 100 });
    for (const b of a.A.squad.slice(11)) b.skills = SK(1);
    const ev = simulateMatch(a.H, a.A, stubRng({ 0.48: true, 0.3: true, 0.52: true })).events;
    return { goals: ev.filter((e) => e.type === 'HEADER_GOAL').length, clears: ev.filter((e) => e.label === 'Luftduel i feltet').map((e) => e.text) };
  };
  const r = run();
  assert.ok(r.goals >= 25, `stopperne (5) taber til skytten (11): ${r.goals}`);
  assert.equal(r.clears.length, 0);
});

// v3.13 (QC B3): rotationen følger botens grænse: hvile under grænse + ROTATE_MARGIN 10, bænken ≥ grænse + 15.
// Grænse 75: 84 hviles (ville ellers rammes tidligt), 85 hviles ikke; bænk 89 er for træt, 90 er frisk nok.
// Med de faste 70/85 ville hverken 84 eller 69+ hviles – rødt.
test('bot-rotation med udskiftningsgrænse 75: hvil under 85 %, bænken mindst 90 %', () => {
  const run = (stF, bF) => {
    const { L } = arena();
    const bot = L.teams[2], me = L.teams[0];
    bot.subsLimit = 75;
    const st = bot.squad.find((p) => p.id === bot.tactics.lineupSlots[5]);
    st.freshness = stF; st.skills = SK(10);
    for (const b of bot.squad.filter((p) => !bot.tactics.lineupSlots.includes(p.id))) { b.freshness = 100; b.skills = SK(1); b.injuryMatchesLeft = 0; }
    const mate = bot.squad.find((p) => !bot.tactics.lineupSlots.includes(p.id) && p.line === st.line);
    mate.freshness = bF; mate.skills = SK(10);
    const m = simulateMatch(me, bot, stubRng({}));
    return m.ratings.away.some((e) => e.playerId === mate.id && e.minIn <= 1);
  };
  assert.equal(run(84, 95), true); assert.equal(run(85, 95), false);
  assert.equal(run(80, 89), false); assert.equal(run(80, 90), true);
});

// ---------- #8 Bot-rotationens filtre ----------
test('bot-rotation: bænken skal være ≥ 85 % frisk, i samme kæde og højst 2 svagere – den bedste vælges', () => {
  const setup = (benchFresh, benchSkill, otherLine = false) => {
    const { L } = arena();
    const bot = L.teams[2];
    bot.subsLimit = 0;   // v3.13: de faste 70/85 uden grænse
    const st = bot.squad.find((p) => p.id === bot.tactics.lineupSlots[5]);
    st.freshness = 60; st.skills = SK(10);
    const bench = bot.squad.filter((p) => !bot.tactics.lineupSlots.includes(p.id));
    for (const b of bench) { b.freshness = 100; b.skills = SK(1); b.injuryMatchesLeft = 0; }
    const mate = bench.find((b) => (otherLine ? b.line !== st.line : b.line === st.line));
    mate.freshness = benchFresh; mate.skills = SK(benchSkill);
    const m = simulateMatch(L.teams[0], bot, stubRng({}));
    return { played: new Set(m.ratings.away.map((e) => e.playerId)), st, mate, bot, bench };
  };
  let r = setup(85, 8); assert.ok(r.played.has(r.mate.id) && !r.played.has(r.st.id), '85 % og 2 svagere: roterer');
  r = setup(84, 8); assert.ok(r.played.has(r.st.id), '84 %: for træt bænk');
  r = setup(85, 7); assert.ok(r.played.has(r.st.id), '3 svagere: for svag');
  r = setup(100, 10, true); assert.ok(r.played.has(r.st.id), 'anden kæde afvises');
  // To kvalificerede: den bedste vælges
  const { L } = arena(); const bot = L.teams[2];
  const st = bot.squad.find((p) => p.id === bot.tactics.lineupSlots[5]); st.freshness = 60; st.skills = SK(10);
  const mates = bot.squad.filter((p) => !bot.tactics.lineupSlots.includes(p.id) && p.line === st.line);
  assert.ok(mates.length >= 2, 'testdata: to bænkspillere i kæden');
  mates.forEach((b, i) => { b.freshness = 100; b.injuryMatchesLeft = 0; b.skills = SK(i === 1 ? 10 : 9); });
  const played = new Set(simulateMatch(L.teams[0], bot, stubRng({})).ratings.away.map((e) => e.playerId));
  assert.ok(played.has(mates[1].id) && !played.has(mates[0].id) && !played.has(st.id));
});

// ---------- #7 Sæsontal og støj på friskhed ----------
test('bogføring: km, minutter og bedste topfart summeres over sæsonen; støjen ±2 virker', () => {
  const L = createLeague(createRng(2));
  const [H] = L.teams;
  const p = H.squad[0];
  p.skills.stamina = 10; p.freshness = 100;
  const round = (n, km, ts, minIn, minOut, rng) => { const res = syntheticRound(L, { ratings: [{ playerId: p.id, rating: 6, gainedCounterXp: 1, distanceKm: km, topSpeed: ts, minIn, minOut }] }); res.round = n; commitRound(L, res, rng); };
  round(1, 11.2, 31.5, 1, 90, { next: () => 0 });   // støj round(0·4 − 2) = −2: pris 13 − 2 = 11 → 89; + round(0,41·11) = 5 → 94
  assert.equal(p.freshness, 94);
  round(2, 5.6, 29, 46, 90, { next: () => 1 });     // støj +2: pris round(6,72) = 7 + 2 = 9 → 85; + round(0,41·15) = 6 → 91
  assert.equal(p.freshness, 91);
  assert.ok(Math.abs(p.distanceSum - 16.8) < 1e-9);
  assert.equal(p.minutesSum, 89 + 44);
  assert.equal(p.topSpeedMax, 31.5, 'en lavere topfart ændrer ikke sæsonens bedste');
  round(3, 0, null, 85, 90, { next: () => 0.5 }); // under 10 min: ingen km, ingen topfart
  assert.equal(p.minutesSum, 133); assert.equal(p.topSpeedMax, 31.5);
});

// ---------- #12 Gamle gemte spillere får de nye felter ----------
test('normalizeLeague giver gamle spillere 0 i km, minutter og topfart (ikke NaN)', () => {
  const L = createLeague(createRng(4));
  const p = L.teams[1].squad[2];
  delete p.distanceSum; delete p.minutesSum; delete p.topSpeedMax; delete p.hiKmSum; delete p.hiDistSum;
  const { league } = normalizeLeague(L);
  const q = league.teams[1].squad[2];
  assert.deepEqual([q.distanceSum, q.minutesSum, q.topSpeedMax, q.hiKmSum, q.hiDistSum], [0, 0, 0, 0, 0]);
});

// ---------- v3.7.1: andel højintenst løb og kampen bag "Rundens mål" ----------
test('runProfile: andel højintenst løb = (rolle-basis + (PAC−10)·0,4) · pres · (0,8 + 0,2·friskhed) ± 1, klemt 1–20', () => {
  const r = { next: () => 0.5 }; // støj 0
  const team = (press) => ({ tactics: { phases: { phase2_defending: { pressingHeight: press } } } });
  const hi = (line, { pace = 10, press = 'MID_BLOCK', fresh = 100, role } = {}) => runProfile({ line, freshness: fresh, skills: { stamina: 10, pace } }, team(press), r, role).hiShare;
  // v3.8 pr. rolle (v3.7.1 pr. kæde: 2/7/9/11): wingbacks og kanter flest, stoppere færrest.
  const roles = ['GK', 'CB', 'LB', 'LWB', 'RM', 'LW', 'CDM', 'CM', 'CAM', 'ST'];
  assert.deepEqual(roles.map((role) => hi('MID', { role })), [2, 5, 11, 13, 13, 13, 8, 8, 10, 11]);
  assert.deepEqual([hi('GK'), hi('DEF'), hi('MID'), hi('ATT')], [2, 5, 8, 11]); // uden rolle: kædens plads
  assert.equal(hi('MID', { pace: 15 }), 10);                  // 8 + 2
  assert.equal(hi('MID', { press: 'HIGH_GEGENPRESS' }), 9.2); // 8·1,15
  assert.equal(hi('MID', { press: 'LOW_BLOCK' }), 7.2);        // ·0,9
  assert.equal(hi('MID', { fresh: 50 }), 7.2);                 // ·0,9
  assert.equal(hi('ATT', { pace: 40 }), 20);                   // loft
  assert.equal(hi('GK', { pace: 1 }), 1);                      // bund (2 − 3,6)
  assert.equal(runProfile({ line: 'MID', skills: { stamina: 10, pace: 10 } }, team('MID_BLOCK'), { next: () => 1 }).hiShare, 9); // 8, støj +1
});
test('finalizeSheet: km i højintenst løb = distance · andel; modstandere ser hverken andel eller km i HI', () => {
  const s = createSheet(), r = { next: () => 0.5 };
  const team = { id: 't', name: 'T', isBot: false, tactics: { phases: { phase2_defending: { pressingHeight: 'MID_BLOCK' } } } };
  s.register({ id: 'a', shirtNumber: 1, shortName: 'a', line: 'MID', skills: { stamina: 10, pace: 10 } }, team, true, 'CM', 1, r, 15, 5);
  const e = finalizeSheet(s, 0, 0, r, counterXpForMatch).home[0];
  assert.equal(e.hiShare, 8); assert.equal(e.hiKm, 0.94); // CM: 11,7 km · 8 % = 0,936
  // Afrunding til 2 decimaler: 10,5 km · 9,5 % = 0,9975 → 1; 4,3 km · 11 % = 0,473 → 0,47 (1 decimal gav 0,5)
  const s2 = createSheet();
  s2.register({ id: 'b', shirtNumber: 2, shortName: 'b', line: 'ATT', skills: { stamina: 10, pace: 10 } }, team, true, 'ST', 56, r, 15, 9);
  const e2 = finalizeSheet(s2, 0, 0, r, counterXpForMatch).home[0];
  assert.equal(e2.distanceKm, 3.8); assert.equal(e2.hiKm, 0.42); // 10·34/90 = 3,78 → 3,8; 3,8·11 % = 0,418
  assert.equal(viewPlayer({ id: 'p', hiKmSum: 3, hiDistSum: 30, skills: {} }, true).hiKmSum, 3);
  const opp = viewRatingEntry(e, false);
  assert.ok(!('hiShare' in opp) && !('hiKm' in opp));
  assert.ok(!('hiKmSum' in viewPlayer({ id: 'p', hiKmSum: 3, skills: {} }, false)));
});
test('bogføring: km i højintenst løb summeres over sæsonen', () => {
  const L = createLeague(createRng(2)); const p = L.teams[0].squad[0];
  const res = syntheticRound(L, { ratings: [{ playerId: p.id, rating: 6, gainedCounterXp: 1, distanceKm: 11, hiKm: 1.1, topSpeed: 30, minIn: 1, minOut: 90 }] });
  commitRound(L, res, { next: () => 0.5 });
  assert.equal(p.hiKmSum, 1.1); assert.equal(p.hiDistSum, 11);
  // En runde fra før v3.7.1 (ingen hiKm) tæller med i distancen, men ikke i HI-nævneren
  const old = syntheticRound(L, { ratings: [{ playerId: p.id, rating: 6, gainedCounterXp: 1, distanceKm: 10, topSpeed: 30, minIn: 1, minOut: 90 }] }); old.round = 2;
  commitRound(L, old, { next: () => 0.5 });
  assert.equal(p.distanceSum, 21); assert.equal(p.hiKmSum, 1.1); assert.equal(p.hiDistSum, 11); // andel 10 %, ikke 1,1/21 = 5 %
  const third = syntheticRound(L, { ratings: [{ playerId: p.id, rating: 6, gainedCounterXp: 1, distanceKm: 9, hiKm: 0.6, topSpeed: 30, minIn: 1, minOut: 90 }] }); third.round = 3;
  commitRound(L, third, { next: () => 0.5 });
  assert.ok(Math.abs(p.hiKmSum - 1.7) < 1e-9); assert.equal(p.hiDistSum, 20); // summeres, overskrives ikke
});
test('hvert mål ved, hvilken kamp i runden det faldt i', () => {
  const L = createLeague(createRng(31)), res = playPairs(L, fixedPairs(L, 1), createRng(31));
  const all = res.matches.flatMap((m, i) => m.goalsPool.map((g) => [g, i]));
  assert.ok(all.length > 0);
  for (const [g, i] of all) { assert.equal(g.matchIdx, i); assert.equal(g.match, `${res.matches[i].homeName} - ${res.matches[i].awayName}`); }
  if (res.gazette.goalOfTheRound) assert.ok(Number.isInteger(res.gazette.goalOfTheRound.matchIdx));
});

test('Rundens mål: kampen findes via matchIdx, ellers via navnet (runder fra før v3.7.1), ellers ukendt', async () => {
  const { goalMatchIdx } = await import('../../public/engine/gazette.js');
  const goal = { match: 'A - B', min: 12 };
  assert.equal(goalMatchIdx({ ...goal, matchIdx: 2 }, []), 2);
  assert.equal(goalMatchIdx({ ...goal, matchIdx: 0 }, [{ homeName: 'A', awayName: 'B' }, {}]), 0);
  assert.equal(goalMatchIdx(goal, [{ homeName: 'C', awayName: 'D' }, { homeName: 'A', awayName: 'B' }]), 1);
  assert.equal(goalMatchIdx(goal, [{ homeName: 'B', awayName: 'A' }]), -1);
  assert.equal(goalMatchIdx(goal, null), -1);
  assert.equal(goalMatchIdx(null, []), -1);
});

import { FORMATIONS } from '../../public/engine/formations.js';
import { RUN_BY_ROLE } from '../../public/engine/ratings.js';
// v3.13: friskheden falder i kampen (freshness.js). Denne fils tærskler forudsætter fuld friskhed hele
// kampen, så friskhed i kampen slås fra her – de nye tests i fatigue.test.mjs prøver den slået TIL.
const simulateMatch = (h, a, r, o = {}) => simLive(h, a, r, { liveEnergy: false, ...o });
const slotRoles = (team) => FORMATIONS[team.tactics.baseFormation].map((s) => s.r);
const RUN_HI = (role, line) => (role ? RUN_BY_ROLE[role].hi : RUN_BY_ROLE[{ GK: 'GK', DEF: 'CB', MID: 'CM', ATT: 'ST' }[line]].hi);

// ---------- v3.8 Test Manager: løb efter plads – tabellen, ledningen og indskifterne ----------
test('RUN_BY_ROLE er dokumentets løbetal (bogstavelig), og HVER rolle i HVER formation har en post', async () => {
  const { RUN_BY_ROLE, runBase } = await import('../../public/engine/ratings.js');
  const { FORMATIONS } = await import('../../public/engine/formations.js');
  const W = { km: 11.0, hi: 13 };
  assert.deepEqual(RUN_BY_ROLE, {
    GK: { km: 5.5, hi: 2 }, CB: { km: 9.5, hi: 5 },
    LB: { km: 10.6, hi: 11 }, RB: { km: 10.6, hi: 11 },
    LWB: W, RWB: W, LM: W, RM: W, LW: W, RW: W,
    CDM: { km: 11.8, hi: 8 }, CM: { km: 11.8, hi: 8 },
    CAM: { km: 10.8, hi: 10 }, CF: { km: 10.8, hi: 10 }, ST: { km: 10.0, hi: 11 },
  });
  const roles = new Set(Object.values(FORMATIONS).flatMap((f) => f.map((s) => s.r)));
  for (const r of roles) assert.ok(RUN_BY_ROLE[r], `rolle ${r} mangler i RUN_BY_ROLE (falder ellers stille tilbage på kæden)`);
  // Ukendt rolle → kædens plads; ukendt begge dele → 10 km / 8 %
  assert.deepEqual(runBase('SUB (DEF)', 'DEF'), { km: 9.5, hi: 5 });
  assert.deepEqual(runBase(undefined, 'GK'), { km: 5.5, hi: 2 });
  assert.deepEqual(runBase('XX', 'YY'), { km: 10, hi: 8 });
  assert.deepEqual(runBase(undefined, undefined), { km: 10, hi: 8 });
  assert.deepEqual(runBase('LB', 'ATT'), { km: 10.6, hi: 11 }, 'rollen vinder over kæden');
});
test('sheet.register: løbet følger runRole; uden runRole rollen selv – ikke kæden', () => {
  const r = { next: () => 0.5 };
  const team = { id: 't', name: 'T', isBot: false, tactics: { phases: { phase2_defending: { pressingHeight: 'MID_BLOCK' } } } };
  const mid = (id) => ({ id, shirtNumber: 5, shortName: id, line: 'MID', skills: { stamina: 10, pace: 10 } });
  const s = createSheet();
  s.register(mid('a'), team, true, 'LM', 1, r, 15, 5);                 // runRole = role = LM
  s.register(mid('b'), team, true, 'SUB (MID)', 1, r, 15, 6, 'LM');    // roleteksten er ikke en rolle; runRole afgør
  s.register(mid('c'), team, true, 'SUB (MID)', 1, r, 15, 7);          // ingen runRole: kædens plads (CM)
  const by = Object.fromEntries(finalizeSheet(s, 0, 0, r, counterXpForMatch).home.map((e) => [e.playerId, e]));
  // LM: 11,0 km/90 · 89/90 = 10,9 og 13 % · CM: 11,8 → 11,7 km og 8 %
  assert.deepEqual([by.a.distanceKm, by.a.hiShare], [10.9, 13]);
  assert.deepEqual([by.b.distanceKm, by.b.hiShare], [10.9, 13]);
  assert.deepEqual([by.c.distanceKm, by.c.hiShare], [11.7, 8]);
});
test('kampen: også en INDSKIFTER løber efter den plads han kommer ind på (ikke efter kæden)', () => {
  const PRESS_HI = { HIGH_GEGENPRESS: 1.15, MID_BLOCK: 1, LOW_BLOCK: 0.9 };
  let checked = 0, differing = 0;
  for (const seed of [22, 5, 8]) {
    const L = createLeague(createRng(seed)), base = createRng(3);
    const rng = { ...base, chance: (p) => (p === 0.06 || p === 0.4 ? true : base.chance(p)) }; // skader i hvert tick → mange skift
    const m = simulateMatch(L.teams[0], L.teams[1], rng);
    for (const [list, team] of [[m.ratings.home, L.teams[0]], [m.ratings.away, L.teams[1]]]) {
      for (const e of list.filter((x) => x.role.startsWith('SUB') && x.hiShare != null)) {
        const pl = team.squad.find((p) => p.id === e.playerId);
        const slotRole = slotRoles(team)[e.slot];
        // v3.9-prisen for løb uden bold (Mange ·1,08 / Få ·0,94) gælder LB/RB/LWB/RWB/CM/CDM/ST/CF
        const runsF = ['LB', 'RB', 'LWB', 'RWB', 'CM', 'CDM', 'ST', 'CF'].includes(slotRole) ? ({ FEW: 0.94, NORMAL: 1, MANY: 1.08 }[team.tactics.phases.phase1_buildUp.offBallRuns] ?? 1) : 1;
        const exp = (hi) => (hi + (pl.skills.pace - 10) * 0.4) * PRESS_HI[team.tactics.phases.phase2_defending.pressingHeight] * runsF * (0.8 + 0.2 * pl.freshness / 100);
        const hiSlot = RUN_HI(slotRole), hiLine = RUN_HI(null, pl.line);
        assert.ok(Math.abs(e.hiShare - exp(hiSlot)) <= 1.05, `${seed} indskifter på ${slotRole} (kæde ${pl.line}): ${e.hiShare} vs forventet ${exp(hiSlot).toFixed(1)}`);
        checked++; if (Math.abs(exp(hiSlot) - exp(hiLine)) >= 3) differing++;
      }
    }
  }
  assert.ok(checked >= 8 && differing >= 3, `for lidt data: ${checked} indskiftere, ${differing} hvor pladsen og kæden adskiller sig`);
});

// =====================================================================================
// Test Manager, v3.9: huller fundet ved mutation (suiten var grøn med hver af dem fjernet)
// =====================================================================================
const CHANCE_KEY = { FEW: 0.285, NORMAL: 0.3, MANY: 0.36 };   // CHANCE_P pr. trin
const rOf = (m, side, t, i) => m.ratings[side].find((x) => x.playerId === slot(t, i).id);
const sumOf = (m, side, f) => m.ratings[side].reduce((s, e) => s + e[f], 0);

// --- Kontraen: skud, rating, statistik og opsummering (counterAttack) ---
// Dit hold (hjem) taber presset i alle 30 ticks (ude: INT 20 på alle); kontra-kastet 0,032 er styret.
function ctr({ n = 2, key = 0.032, tweak = null, home = {}, away = {}, form = null } = {}) {
  const a = arena({ home, away });
  if (form) { a.H.tactics.baseFormation = form.home ?? '4-4-2'; a.A.tactics.baseFormation = form.away ?? '4-4-2'; }
  for (const p of a.A.squad) p.skills.intercepting = 20;
  if (tweak) tweak(a);
  const m = simulateMatch(a.H, a.A, stubRng({ 0.48: true, [key]: shots(n) }));
  return { a, m, summary: m.events.find((e) => e.label === 'Fuldtids-analyse')?.text.match(/🎯 .*?\.(?= ⚔️)/)?.[0] };
}
test('kontramål: skytten +1,25 og målmanden −0,3, tæller som skud, på mål og xG, og står i din opsummering som "kontraer imod"', () => {
  const { a, m, summary } = ctr({ tweak: (a) => { onlyShooter(a.A); slot(a.A, 9).skills.pace = 14; } });   // v3.12.1: skytten er den nærmeste (onlyShooter)
  assert.equal(m.awayGoals, 2); assert.equal(m.homeGoals, 0);
  assert.equal(rOf(m, 'away', a.A, 9).rating, 9.4); assert.equal(rOf(m, 'away', a.A, 9).goals, 2);   // 6,5 + 2·1,25 + 0,4 sejr (v3.15)
  assert.equal(rOf(m, 'home', a.H, 0).rating, 5.5);                                                // 6,5 − 2·0,3 − 0,4 nederlag (v3.15)
  assert.equal(m.stats.aShots, 2); assert.equal(m.stats.aOnTarget, 2); assert.equal(m.stats.hShots, 0);
  assert.ok(Math.abs(m.stats.aXg - 2 * 0.3) < 1e-9, String(m.stats.aXg));                          // 0,2 + 0,5·0,2 pr. kontra
  assert.equal(summary, '🎯 Løb uden bold (Normal): 0 løb, 0 kom fri (0 mål) · kontraer imod i alt: 2 (2 mål).');
  // Avisen/karakterarket regner kontramålet som COUNTER med skyttens fart: 5,5 + 14·0,2 + 0,5·4
  const g = m.goalsPool[0];
  assert.equal(g.kind, 'COUNTER'); assert.equal(g.teamName, a.A.name);
  assert.equal(g.spectacle, goalSpectacle('COUNTER', { pace: 14 }, g.min, { next: () => 0.5 }));
  assert.notEqual(g.spectacle, goalSpectacle('COUNTER', { pace: 10 }, g.min, { next: () => 0.5 }));
  const ge = m.events.find((e) => e.type === 'GOAL');
  assert.equal(ge.isHome, false);                      // målet står hos vinderen (ude), ikke hos den der mistede bolden
});
test('reddet kontra: målmanden +0,5 pr. redning, redning tælles, hændelsen står hos dig; ingen løb → ingen back nævnt (QC v3.9); opsummering med Mange og 3 (0 mål)', () => {
  const { a, m, summary } = ctr({ n: 3, key: 0.097, home: { p1: { offBallRuns: 'MANY' } }, tweak: (a) => { slot(a.H, 0).skills.goalkeeping = 20; } });
  assert.equal(m.awayGoals, 0);
  const gk = rOf(m, 'home', a.H, 0);
  assert.equal(gk.saves, 3); assert.equal(gk.rating, 8.5);          // 6,5 + 3·0,5 + 0,5 clean sheet
  assert.equal(m.stats.aShots, 3); assert.equal(m.stats.aOnTarget, 3);
  const saves = m.events.filter((e) => e.label === 'Kontra reddet');
  assert.equal(saves.length, 3);
  for (const e of saves) {
    assert.equal(e.isHome, true);
    assert.match(e.text, /^🧤 \[.+\] .+ kontrer, men #\d+ .+ redder fra #\d+ .+\.$/, e.text);
    assert.doesNotMatch(e.text, /højt oppe/, e.text); // 0 løb i kampen: "højt oppe" ville være usandt
  }
  assert.equal(summary, '🎯 Løb uden bold (Mange): 0 løb, 0 kom fri (0 mål) · kontraer imod i alt: 3 (0 mål).');
});
// v3.12.1: COUNTER_FINISH_BONUS 4 → 3 (dokumentets kontra 8–12 %; med 4 var 13,5 mål); skytten står i forsvarsformen.
test('kontra-afgørelsen: skyttens FIN + 3 (v3.12.1; v3.10: +4; v3.9: +1) mod målmandens MV, begge ·friskhed (strengt større)', () => {
  const goals9 = (o) => ctr({ tweak: (a) => { onlyShooter(a.A); Object.assign(slot(a.A, 9).skills, { finishing: o.fin ?? 10 }); slot(a.A, 9).freshness = o.sf ?? 100; slot(a.H, 0).skills.goalkeeping = o.gk; slot(a.H, 0).freshness = o.gf ?? 100; } }).m.awayGoals;
  assert.equal(goals9({ gk: 13 }), 0);      // 10 + 3 > 13 er falsk (gk 12,9 giver mål)
  assert.equal(goals9({ gk: 12.9 }), 2);
  assert.equal(goals9({ gk: 13.5 }), 0, 'med +4 ville 13,5 være mål');
  // Skytten træt (71 %: ·0,9275 → 9,275 + 3 = 12,275): 12,2 slås, 12,3 holder. Uden friskhed på skytten: 13 > 12,3 → mål.
  assert.equal(goals9({ sf: 71, gk: 12.2 }), 2); assert.equal(goals9({ sf: 71, gk: 12.3 }), 0);
  // Målmanden træt (0 %: ·0,75): 17 → 12,75 < 13 → mål; uden friskhed på målmanden holder 17.
  assert.equal(goals9({ gk: 17, gf: 0 }), 2); assert.equal(goals9({ gk: 17, gf: 100 }), 0);
});

// --- counterChance: ukendte nøgler falder tilbage til Normal / ingen faktor ---
test('counterChance: ukendt trin, boldtab eller erobring falder tilbage til Normal og faktor 1', () => {
  assert.equal(counterChance(undefined, undefined, undefined), 0.08);
  assert.equal(counterChance('X', 'Y', 'Z'), 0.08);
});
// --- FB/WB-tillægget regnes på DEN der mistede bolden, og på LWB/RWB også ---
test('kontra-chancen tæller taberens FB/WB-pladser (formation), ikke vinderens', () => {
  // Taber 3-5-2 (LWB + RWB = 2) mod vinder 3-4-3 (0): 0,22·0,4·1,1 = 0,097. Taber 3-4-3 (0) mod vinder 4-4-2 (2): 0,088.
  assert.equal(ctr({ key: 0.097, n: 30, home: { p1: { offBallRuns: 'MANY' } }, form: { home: '3-5-2', away: '3-4-3' } }).m.awayGoals, 30);
  assert.equal(ctr({ key: 0.088, n: 30, home: { p1: { offBallRuns: 'MANY' } }, form: { home: '3-4-3', away: '4-4-2' } }).m.awayGoals, 30);
  assert.equal(ctr({ key: 0.097, n: 30, home: { p1: { offBallRuns: 'MANY' } }, form: { home: '3-4-3', away: '4-4-2' } }).m.awayGoals, 0);
  assert.equal(ctr({ key: 0.084, n: 30, home: { p1: { offBallRuns: 'MANY' } }, form: { home: '3-5-2', away: '3-4-3' } }).m.awayGoals, 0);
});

// --- Hold på bolden: præcis +2, kun én gang, og kun når der ikke blev kontret ---
// Ude har bolden i 1. tick; vi skifter den til hjemme bagefter ved at sænke ude-midtbanens pasning.
// Hjemme presser hårdt (INT 20), vinder 1. tick og får "Hold på bolden" (ingen kontra). Fra 2. tick
// bygger hjemme (24,75) mod udes pres 15 + INT: opbygningen vinder kun, hvis +2 rækker.
function calmRun({ awayInt, counterKey = false, won = 'KEEP_POSSESSION', counterN = 1 }) {
  const a = arena({ home: { p3: { onBallWon: won } } });
  for (const p of mids(a.H)) p.skills.intercepting = 20;
  for (const p of mids(a.A)) { p.skills.intercepting = awayInt; p.skills.passing = 11; }
  const base = stubRng({ 0.48: true, ...(counterKey ? { 0.032: shots(counterN) } : {}) });
  let flipped = false;
  const rng = { ...base, chance: (p) => { const r = base.chance(p); if (p === 0.48 && !flipped) { flipped = true; for (const x of mids(a.A)) x.skills.passing = 1; } return r; } };
  const m = simulateMatch(a.H, a.A, rng);
  return m.events.filter((e) => e.label === 'Fase 1 virker' && e.isHome).length;
}
test('Hold på bolden: præcis +2 (gab 2 vinder, gab 3 taber), kun for ÉN opbygning, ikke efter en kontra, ikke ved Lynkontra', () => {
  // udes presser: INT 9 → pres 25,75 (gab 1), 10 → 26,75 (gab 2), 11 → 27,75 (gab 3); hjemmes opbygning 24,75
  assert.equal(calmRun({ awayInt: 9 }), 1);     // kun 2. tick (bonus brugt, så nulstillet); uden nulstilling 29
  assert.equal(calmRun({ awayInt: 10 }), 1);    // bonus 1 ville tabe (26,75 mod 25,75 → 25,75 < 26,75)
  assert.equal(calmRun({ awayInt: 11 }), 0);    // bonus 3 ville vinde
  assert.equal(calmRun({ awayInt: 10, won: 'FAST_COUNTER' }), 0);
  assert.equal(calmRun({ awayInt: 10, counterKey: true }), 0);   // kontraen kom → ingen ro på bolden
});

// --- Chance pr. trin: Få 26 %, Normal 30 %, Mange 36 % ---
test('chancer pr. tick følger løbs-indstillingen (Få 0,285, Mange 0,36) – og kun den', () => {
  const shotsFor = (runs, keys) => { const a = arena({ home: { p1: { offBallRuns: runs } } }); for (const p of mids(a.A)) { p.skills.passing = 1; p.skills.intercepting = 1; } return simulateMatch(a.H, a.A, stubRng({ 0.48: true, ...keys })).stats.hShots; };
  for (const r of ['FEW', 'NORMAL', 'MANY']) {
    assert.equal(shotsFor(r, { [CHANCE_KEY[r]]: true }), 30, r);
    for (const other of ['FEW', 'NORMAL', 'MANY'].filter((x) => x !== r)) assert.equal(shotsFor(r, { [CHANCE_KEY[other]]: true }), 0, `${r} må ikke bruge ${other}s tal`);
  }
});

// --- Løbsduellen: (POS + PAC·0,5)·friskhed + 8·rnd + {−3/0/+4} > (POS + INT·0,5)·friskhed + 8·rnd + {Få: 5} ---
// Alle 10 markspillere hos hjemme har samme evner, så uanset hvem der trækkes, er duellen den samme.
function runWins({ runner = {}, def = {}, runs = 'NORMAL', defRuns = 'NORMAL', rf = 100, df = 100 }) {
  const a = arena({ home: { p1: { offBallRuns: runs } }, away: { p1: { offBallRuns: defRuns } } });
  for (let i = 1; i <= 10; i++) { Object.assign(slot(a.H, i).skills, { positioning: 10, pace: 10 }, runner); slot(a.H, i).freshness = rf; }
  for (const p of a.A.squad) { p.freshness = df; }                               // alle trætte → ingen bot-rotation
  for (const i of [1, 2, 3, 4]) Object.assign(slot(a.A, i).skills, { positioning: 1, intercepting: 10 }, def);
  for (const p of mids(a.A)) { p.skills.passing = 1; p.skills.intercepting = 1; }   // hjemme har bolden og vinder hver opbygning
  const m = simulateMatch(a.H, a.A, stubRng({ 0.48: true, [CHANCE_KEY[runs]]: true }));
  const won = sumOf(m, 'home', 'freeRunsWon');
  assert.equal(sumOf(m, 'home', 'freeRuns'), 30);
  return won;
}
test('løbsduellen: grænsen ligger præcis ved de dokumenterede tal (Få −3, Mange +4, forsvar på Få +5; Normal/Mange hos forsvaret 0)', () => {
  const D = (dp, di = 10) => ({ positioning: dp, intercepting: di });      // forsvarer: dp + di/2
  // Løber 15 (POS 10, PAC 10). Normal: vinder under 15 (strengt)
  assert.equal(runWins({ def: D(9.9) }), 30); assert.equal(runWins({ def: D(10) }), 0);
  assert.equal(runWins({ runs: 'FEW', def: D(6.9) }), 30); assert.equal(runWins({ runs: 'FEW', def: D(7) }), 0);       // 15 − 3 = 12
  assert.equal(runWins({ runs: 'MANY', def: D(13.9) }), 30); assert.equal(runWins({ runs: 'MANY', def: D(14) }), 0);   // 15 + 4 = 19
  assert.equal(runWins({ defRuns: 'FEW', def: D(4.9) }), 30); assert.equal(runWins({ defRuns: 'FEW', def: D(5) }), 0);   // forsvaret på Få: +5 (v3.9: +4)
  assert.equal(runWins({ defRuns: 'MANY', def: D(9.9) }), 30); assert.equal(runWins({ defRuns: 'NORMAL', def: D(9.9) }), 30); // ingen tillæg
  // Koefficienterne: PAC·0,5 (ikke 0,4/0) og INT·0,5 (ikke 0,4/0)
  assert.equal(runWins({ runner: { pace: 12 }, def: D(10.9) }), 30);   // 16 > 15,9 (med ·0,4: 14,8 → tabt)
  assert.equal(runWins({ def: D(2, 26) }), 0);                         // 15 > 2 + 13 er falsk (med ·0,4: 12,4 → vundet)
  // Friskhed på begge sider (0 % = ·0,75)
  assert.equal(runWins({ rf: 0, def: D(6.2) }), 30); assert.equal(runWins({ rf: 0, def: D(6.3) }), 0);                  // 11,25 mod 11,2 / 11,3
  assert.equal(runWins({ df: 0, def: D(14) }), 30);                    // 19 · 0,75 = 14,25 < 15 (uden friskhed på forsvaret: 19 → tabt)
});

// --- Tabeller: beslutning, zoner, grupper, vægte (spec.md "Løb uden bold") ---
test('beslutningsvægte: alle zone-felter, dribletur = (PAC+BAL)/2, gulv 0,5, lave cutbacks kun fra kanten', () => {
  const sk = { finishing: 8, passing: 10, pace: 16, ballControl: 8 };   // over 6: skud 2, aflevering 4, dribletur (12 → 6)
  const w = (z, cb) => decisionWeights(sk, z, cb);
  assert.deepEqual(w('WIDE'), { SHOT: 0.6, PASS: 12, DRIBBLE: 12 });   // v3.16: skud 2 · WIDE 0,3 (før · 1 = 2)
  assert.deepEqual(w('DEEP'), { SHOT: 1.2, PASS: 10, DRIBBLE: 3 });
  assert.deepEqual(w('MID'), { SHOT: 3, PASS: 6, DRIBBLE: 9 });
  assert.deepEqual(w('HIGH'), { SHOT: 6, PASS: 4, DRIBBLE: 6 });
  assert.ok(Math.abs(w('WIDE', true).PASS - 15.6) < 1e-9);
  for (const z of ['DEEP', 'MID', 'HIGH']) assert.deepEqual(w(z, true), w(z), `cutbacks må kun løfte kanten (${z})`);
  assert.deepEqual(decisionWeights({ finishing: 6, passing: 6, pace: 6, ballControl: 5 }, 'MID'), { SHOT: 0.75, PASS: 0.75, DRIBBLE: 0.75 });   // gulv 0,5 · zone
});
test('zonegrænser (pladsen 20 frem: kant x < 28 / > 72, dybt y ≥ 60, højt y ≤ 35) og rolle-grupper', () => {
  const z = (x, y) => runZone({ x, y });
  assert.deepEqual([z(27.9, 60), z(28, 60), z(72, 60), z(72.1, 60)], ['WIDE', 'MID', 'MID', 'WIDE']);
  assert.deepEqual([z(50, 79), z(50, 80), z(50, 81)], ['MID', 'DEEP', 'DEEP']);          // y−20 = 59 / 60 / 61
  assert.deepEqual([z(50, 54), z(50, 55), z(50, 56)], ['HIGH', 'HIGH', 'MID']);          // y−20 = 34 / 35 / 36
  assert.deepEqual(['ST', 'CF', 'LM', 'RM', 'LW', 'RW', 'CAM', 'CM', 'CDM', 'LB', 'RB', 'LWB', 'RWB', 'CB'].map(runGroup),
    ['ST', 'ST', 'WIDE', 'WIDE', 'WIDE', 'WIDE', 'WIDE', 'CM', 'CM', 'FB', 'FB', 'FB', 'FB', 'CB']);
  // spec.md: ST/CF 3/3/3, LM/RM/LW/RW/CAM 2/2,5/3, CM/CDM 1/1,5/2,5, LB/RB/LWB/RWB 0,2/0,8/2, CB 0,05/0,1/0,3
  assert.deepEqual(RUN_WEIGHT, { ST: { FEW: 3, NORMAL: 3, MANY: 3 }, WIDE: { FEW: 2, NORMAL: 2.5, MANY: 3 }, CM: { FEW: 1, NORMAL: 1.5, MANY: 2.5 }, FB: { FEW: 0.2, NORMAL: 0.8, MANY: 2 }, CB: { FEW: 0.05, NORMAL: 0.1, MANY: 0.3 } });
});

// --- Løberen, beslutningen og følgerne (en kendt løber: next 0,5 trækker RM/plads 8 på Normal, CM/plads 7 på Mange) ---
const tg = (p) => `#${p.shirtNumber} ${p.shortName}`;
const WEAK = { positioning: 1, intercepting: 1, strength: 1 };
function fx({ rm = {}, def = {}, gk = 1, n = 2, runs = 'NORMAL', rslot = 8, form = null, custom = null, script = {}, tweak = null, away = {}, focus = 'CENTRAL', nextValue = 0.5 } = {}) {
  const a = arena({ home: { p1: { offBallRuns: runs, attackFocus: focus } }, away });
  if (form) a.H.tactics.baseFormation = form;
  if (custom) a.H.tactics.customCoords = custom;
  for (const p of mids(a.A)) p.skills.passing = 1;
  for (const i of [1, 2, 3, 4]) Object.assign(slot(a.A, i).skills, WEAK, def);
  slot(a.A, 0).skills.goalkeeping = gk;
  Object.assign(slot(a.H, rslot).skills, rm);
  if (tweak) tweak(a);
  const m = simulateMatch(a.H, a.A, stubRng({ [CHANCE_KEY[runs]]: shots(n), ...script }, nextValue));
  return { a, m, runner: slot(a.H, rslot), goals: m.events.filter((e) => e.type === 'GOAL'), summary: m.events.find((e) => e.label === 'Fuldtids-analyse')?.text.match(/🎯 .*?\.(?= ⚔️)/)?.[0] };
}
test('løber → aflevering fra kanten: CUTBACK, oplæg til løberen (+0,15 +0,5 pr. mål), mål, observation og tekst hos modtageren', () => {
  const { a, m, runner, goals, summary } = fx({ rm: { passing: 20, finishing: 1 } });
  // v3.12.1: modtageren er den, der står nær straffesparkspletten i øjeblikket (ikke længere altid plads 9)
  const fin = a.H.squad.find((p) => m.ratings.home.some((e) => e.playerId === p.id && e.goals === 2));
  assert.ok(fin && fin !== runner);
  const finE = m.ratings.home.find((e) => e.playerId === fin.id);
  assert.equal(m.homeGoals, 2); assert.deepEqual(m.goalsPool.map((g) => g.kind), ['CUTBACK', 'CUTBACK']);
  assert.equal(rOf(m, 'home', a.H, 8).rating, 8.2);        // 6,5 + 2·(0,15 løb + 0,5 oplæg) + 0,4 sejr (v3.15)
  assert.equal(rOf(m, 'home', a.H, 8).assists, 2); assert.equal(rOf(m, 'home', a.H, 8).goals, 0);
  assert.equal(finE.rating, 9.4);        // 6,5 + 2·1,25 + 0,4 sejr – målscoreren er modtageren, ikke løberen
  assert.equal(rOf(m, 'away', a.A, 0).rating, 5.5);   // − 0,4 nederlag (v3.15)
  assert.equal(m.goalsPool[0].scorer, tg(fin));
  assert.equal(m.goalsPool[0].spectacle, goalSpectacle('CUTBACK', { passing: 20 }, m.goalsPool[0].min, { next: () => 0.5 }));   // oplæggets PAS (20), ikke modtagerens (10)
  assert.ok(m.observations.some((o) => o.playerId === fin.id) && !m.observations.some((o) => o.playerId === runner.id));
  // v3.16.3 (Spilfører): uden løbets ✅ i målets linje, og "Han sparkede den ind." – ikke modtagerens navn to gange i træk
  assert.ok(goals[0].text.includes(`MÅÅÅL! ${tg(runner)} løber sig fri på kanten og lægger den tværs til ${tg(fin)}.`) && !goals[0].text.includes('✅'), goals[0].text);
  // v3.14.3 (brugeren: "cutback bliver noteret 2 gange"): efter løbs-linjen kun en kort slutning
  assert.equal(goals[0].text.split(`til ${tg(fin)}. `)[1], 'Han sparkede den ind.', goals[0].text);
  assert.equal(goals[0].text.split(tg(fin)).length, 2, 'modtagerens navn én gang');
  // "Rundens mål" (goalsPool) fortæller samme hændelse som linjen (v3.16.3 – før describeGoal's fulde beskrivelse)
  const pool = m.goalsPool[0].desc;
  assert.equal(pool, `${tg(runner)} løber sig fri på kanten og lægger den tværs til ${tg(fin)}. Han sparkede den ind.`, pool);
  assert.equal(summary, '🎯 Løb uden bold (Normal): 2 løb, 2 kom fri (2 mål) · kontraer imod i alt: 0 (0 mål).');
});
// v3.16: langskud efter løberens plads, ikke zonen – RM trukket til (85, 58) står sluppet igennem på 58 − 16 − 12 = 30 ≥ LONGSHOT_Y 30
// (langskud, solo); trukket til (85, 57) på 29 → kombination med oplæg. Kanten (x 85) er stadig WIDE. Skudvægten fra kanten er
// (FIN − 6)·0,3 mod aflevering 1,5 + dribling 1: FIN 20 → 4,2 (skud); redningen prøves med FIN 15 (2,7 > 5,2/2 – skud; før FIN 10,
// der nu afleverer: 1,2 < 3,7/2).
test('løber → skud fra kanten: LONGSHOT uden oplæg, når han står uden for feltet (y 30; 29 → kombination), +1,4 til løberen selv; pris i rating for en redning', () => {
  const g = fx({ rm: { finishing: 20, passing: 1, pace: 1, ballControl: 1 }, custom: { 8: { x: 85, y: 58 } } });
  assert.deepEqual(g.m.goalsPool.map((x) => x.kind), ['LONGSHOT', 'LONGSHOT']);
  const inBox = fx({ rm: { finishing: 20, passing: 1, pace: 1, ballControl: 1 }, custom: { 8: { x: 85, y: 57 } } });
  assert.deepEqual(inBox.m.goalsPool.map((x) => x.kind), ['COMBINATION', 'COMBINATION']);
  assert.equal(sumOf(inBox.m, 'home', 'assists'), 2);
  assert.equal(rOf(g.m, 'home', g.a.H, 8).rating, 10);     // 6,5 + 2·(0,15 + 1,4) + 0,4 sejr (v3.15) = 10,0
  assert.equal(sumOf(g.m, 'home', 'assists'), 0);
  assert.equal(g.m.goalsPool[0].scorer, tg(g.runner));
  assert.ok(g.goals[0].text.includes(`MÅÅÅL! ${tg(g.runner)} løber sig fri på kanten og skyder.`) && !g.goals[0].text.includes('✅'), g.goals[0].text);   // v3.16.3: uden ✅
  assert.equal(g.summary, '🎯 Løb uden bold (Normal): 2 løb, 2 kom fri (2 mål) · kontraer imod i alt: 0 (0 mål).');
  // Redning (løbsbonus 2, KEEPER_EDGE 0,3 fra v3.15.1): FIN 15 + 2 = 17 mod MV 16,75 + 0,3 = 17,05 → redning; 15,1 + 2 = 17,1 → mål
  // (med kanten 3 også redning). v3.16: før FIN 10 mod MV 11,75 – FIN 10 afleverer nu fra kanten (skudvægt 1,2 mod 2,5).
  const save = fx({ rm: { finishing: 15, passing: 1, pace: 1, ballControl: 1 }, gk: 16.75 });
  assert.equal(save.m.homeGoals, 0);
  assert.equal(rOf(save.m, 'home', save.a.H, 8).rating, 7.0);   // 6,5 + 2·(0,15 + 0,1)
  const gk = rOf(save.m, 'away', save.a.A, 0);
  assert.equal(gk.saves, 2); assert.equal(gk.rating, 8.0);      // 6,5 + 2·0,5 + 0,5 clean sheet
  assert.equal(save.m.stats.hOnTarget, 2); assert.equal(save.m.stats.hShots, 2);
  const txt = save.m.events.filter((e) => e.type === 'SAVE').map((e) => e.text);
  assert.equal(txt.length, 2);
  // Opspillet står FØR redningen (v3.16.5 – det skete først)
  for (const t of txt) assert.match(t, new RegExp(`^🧤 \\[.+\\] ${tg(save.runner)} løber sig fri på kanten og skyder – men #\\d+ .+ redder\\.$`), t);
  assert.equal(fx({ rm: { finishing: 15.1, passing: 1, pace: 1, ballControl: 1 }, gk: 16.75 }).m.homeGoals, 2);
  // Friskhed: løberen træt (0 %: 15 → 11,25 + 2 = 13,25 < 13 + 0,3 → redning; uden friskhed 17 > 13,3 → mål); målmanden træt
  // (22,2 → 16,65 + 0,3 = 16,95 < 15 + 2 = 17 → mål; uden: 22,5 → redning). Med kanten 3: 17 < 16 og 17 < 19,65.
  // (v3.16: før FIN 10/MV 9,5 og FIN 12,2/MV 18,5 – begge afleverer nu fra kanten)
  assert.equal(fx({ rm: { finishing: 15, passing: 1, pace: 1, ballControl: 1 }, gk: 13, tweak: (a) => { a.H.squad.forEach((p) => { p.freshness = 0; }); } }).m.homeGoals, 0);
  assert.equal(fx({ rm: { finishing: 15, passing: 1, pace: 1, ballControl: 1 }, gk: 13 }).m.homeGoals, 2);
  assert.equal(fx({ rm: { finishing: 15, passing: 1, pace: 1, ballControl: 1 }, gk: 22.2, tweak: (a) => { a.A.squad.forEach((p) => { p.freshness = 0; }); } }).m.homeGoals, 2);
  assert.equal(fx({ rm: { finishing: 15, passing: 1, pace: 1, ballControl: 1 }, gk: 22.2 }).m.homeGoals, 0);
});
test('løber → aflevering/skud efter zone: trukket plads afgør (kant: tværs/CUTBACK, midt: COMBINATION, højt: skud er COMBINATION med oplæg) – og teksten nævner stedet', () => {
  // Trukket midt i banen (50,60 → 40: mellem kæderne): aflevering bliver COMBINATION, "spiller" i stedet for "tværs"
  const mid = fx({ rm: { passing: 20, finishing: 1 }, custom: { 8: { x: 50, y: 60 } } });
  assert.deepEqual(mid.m.goalsPool.map((g) => g.kind), ['COMBINATION', 'COMBINATION']);
  assert.ok(mid.goals[0].text.includes(`${tg(mid.runner)} løber sig fri mellem kæderne og spiller #`) && !mid.goals[0].text.includes('tværs'), mid.goals[0].text);
  // Trukket dybt (50,82 → 62): skud, LONGSHOT
  const deep = fx({ rm: { finishing: 20, passing: 1, pace: 1, ballControl: 1 }, custom: { 8: { x: 50, y: 82 } } });
  assert.deepEqual(deep.m.goalsPool.map((g) => g.kind), ['LONGSHOT', 'LONGSHOT']);
  assert.ok(deep.goals[0].text.includes(`${tg(deep.runner)} løber sig fri dybt i banen og skyder.`), deep.goals[0].text);
  assert.ok(deep.goals[0].text.endsWith('og skyder. Bolden sad i nettet.') && !deep.goals[0].text.includes('sparkede'), deep.goals[0].text);   // v3.14.3: solo → kort slutning uden sparker
  const midShot = fx({ rm: { finishing: 20, passing: 1, pace: 1, ballControl: 1 }, custom: { 8: { x: 50, y: 60 } } });
  assert.ok(midShot.goals[0].text.includes('løber sig fri mellem kæderne og skyder.'), midShot.goals[0].text);
  // 3-5-2: plads 8 er CAM (50,36 → højt, "bag forsvaret"): et skud bliver COMBINATION med oplæg fra en anden
  const hi = fx({ rm: { finishing: 20, passing: 1, pace: 1, ballControl: 1 }, form: '3-5-2' });
  assert.deepEqual(hi.m.goalsPool.map((g) => g.kind), ['COMBINATION', 'COMBINATION']);
  assert.ok(hi.goals[0].text.includes(`${tg(hi.runner)} løber sig fri bag forsvaret og skyder.`), hi.goals[0].text);
  assert.ok(hi.goals[0].text.endsWith('og skyder. Bolden sad i nettet.') && !hi.goals[0].text.includes('sparkede'), hi.goals[0].text);   // v3.14.3 (QC): løberen skyder selv – ikke "X skyder. X sparkede den ind."
  assert.equal(sumOf(hi.m, 'home', 'assists'), 2);
  assert.equal(rOf(hi.m, 'home', hi.a.H, 8).assists, 0);
  assert.equal(rOf(hi.m, 'home', hi.a.H, 8).rating, 9.7);          // 6,5 + 2·(0,15 + 1,25) + 0,4 sejr – ikke solo, så ikke 1,4
  const helper = hi.m.ratings.home.find((e) => e.assists === 2);
  assert.ok(helper && helper.playerId !== hi.runner.id && helper.rating === 7.9, JSON.stringify(helper));   // 7,5 + 0,4 sejr (v3.15)
});
test('løber → dribletur: vundet er DRIBBLE uden oplæg (+1,4); tabt er en opsnapning med præcis grænse (PAC+BAL mod POS+STR·0,5+3, begge ·friskhed)', () => {
  const win = fx({ rm: { pace: 20, ballControl: 20, finishing: 10, passing: 1 } });
  assert.deepEqual(win.m.goalsPool.map((g) => g.kind), ['DRIBBLE', 'DRIBBLE']);
  assert.equal(rOf(win.m, 'home', win.a.H, 8).rating, 10); assert.equal(sumOf(win.m, 'home', 'assists'), 0);   // 9,6 + 0,4 sejr (v3.15)
  assert.ok(win.goals[0].text.includes(`${tg(win.runner)} løber sig fri på kanten, dribler #`) && win.goals[0].text.includes('af og afslutter selv.'), win.goals[0].text);
  assert.ok(win.goals[0].text.endsWith('af og afslutter selv. Bolden sad i nettet.') && !win.goals[0].text.includes('sparkede'), win.goals[0].text);   // v3.14.3: dribletur er solo, selv med en tilfældig "helper" i koden
  // Grænse: løber 24 mod 5 + STR/2 + 3 (strengt større): STR 32 → 24 holder, 31,8 → 23,9 slås
  const drb = (str, o = {}) => fx({ rm: { pace: 12, ballControl: 12, finishing: 1, passing: 1 }, def: { positioning: 5, intercepting: 1, strength: str }, ...o });
  const opps = (r) => r.m.events.filter((e) => e.label === 'Opsnappet').length;
  assert.equal(opps(drb(32)), 2); assert.equal(opps(drb(31.8)), 0);
  assert.equal(opps(drb(20, { tweak: (a) => { a.H.squad.forEach((p) => { p.freshness = 0; }); } })), 2);      // løber 24·0,75 = 18 mod 5 + 10 + 3 = 18
  assert.equal(opps(drb(19.8, { tweak: (a) => { a.H.squad.forEach((p) => { p.freshness = 0; }); } })), 0);
  assert.equal(opps(drb(40, { tweak: (a) => { a.A.squad.forEach((p) => { p.freshness = 0; }); } })), 0);       // forsvaret træt: (5 + 20)·0,75 + 3 = 21,75 < 24
  assert.equal(opps(drb(40)), 2);
  // Følgerne af en opsnapning: tekst, hændelsens side, forsvarerens rating (+0,3) og taktiksejr
  const lost = drb(40);
  const defd = slot(lost.a.A, 1);
  for (const e of lost.m.events.filter((x) => x.label === 'Opsnappet')) {
    assert.equal(e.isHome, false);
    assert.match(e.text, new RegExp(`^❌ \\[.+\\] ${tg(lost.runner)} løber sig fri på kanten, men ${tg(defd)} \\(.+\\) tager bolden i driblingen\\.$`), e.text);
  }
  assert.equal(rOf(lost.m, 'away', lost.a.A, 1).rating, 7.6);      // 6,5 + 2·0,3 + 0,5 clean sheet (LB)
  assert.equal(rOf(lost.m, 'away', lost.a.A, 1).tacticWins, 2);
  assert.equal(lost.m.homeGoals, 0);
});
test('opsnappet dribling hos et bot-hold: teksten nævner ikke løbet ("fri"), og hændelsen står hos forsvaret (dig)', () => {
  const a = arena();
  for (const p of mids(a.A)) p.skills.passing = 15;                              // ude har bolden
  for (const i of [1, 2, 3, 4]) Object.assign(slot(a.H, i).skills, { positioning: 5, intercepting: 1, strength: 40 });
  Object.assign(slot(a.A, 8).skills, { pace: 12, ballControl: 12, finishing: 1, passing: 1 });
  const m = simulateMatch(a.H, a.A, stubRng({ 0.3: shots(2) }));
  const ev = m.events.filter((e) => e.label === 'Opsnappet');
  assert.equal(ev.length, 2);
  for (const e of ev) {
    assert.equal(e.isHome, true);
    assert.match(e.text, new RegExp(`^🛡️ \\[${a.H.name}\\] #\\d+ .+ tager bolden fra #\\d+ .+ \\(${a.A.name}\\)\\.$`), e.text);   // [forsvarets hold] … (angriberens hold)
    assert.doesNotMatch(e.text, /fri/);
  }
});
test('kontra-tjek efter en opsnappet dribling bruger løberens trin, hans boldtab og modstanderens erobring', () => {
  // Mange: løberen er CM/plads 7 (højt, dribletur). Kontra-tallet: 0,2 · tab · erobring · 1,1 (LB+RB).
  const drb = { rm: { pace: 12, ballControl: 12, finishing: 1, passing: 1 }, rslot: 7, def: { positioning: 5, intercepting: 1, strength: 40 }, runs: 'MANY' };
  const goalsWith = (key, o = {}) => fx({ ...drb, n: 2, script: { [key]: shots(2) }, ...o }).m.awayGoals;
  assert.equal(goalsWith(0.097), 2);                                                                   // MANY · Fald tilbage · Hold på bolden (0,22·0,4·1,1)
  assert.equal(goalsWith(0.032), 0);                                                                   // Normal-tallet gælder ikke
  assert.equal(goalsWith(0.058, { tweak: (a) => { a.H.tactics.phases.phase3_transition.onBallLost = 'COUNTER_PRESS_5S'; } }), 2);   // 0,22·0,6·0,4·1,1
  assert.equal(goalsWith(0.436, { tweak: (a) => { a.A.tactics.phases.phase3_transition.onBallWon = 'FAST_COUNTER'; } }), 2);       // 0,22·1·1,8·1,1
  const r = fx({ ...drb, n: 2, script: { 0.097: shots(2) } });
  assert.deepEqual(r.m.goalsPool.map((g) => g.kind), ['COUNTER', 'COUNTER']);
  assert.equal(r.m.events.filter((e) => e.label === 'Opsnappet').length, 2);
  assert.equal(r.summary, '🎯 Løb uden bold (Mange): 2 løb, 2 kom fri (0 mål) · kontraer imod i alt: 2 (2 mål).');
});
test('opsummering: Få og Normal, løb som tabes (30 løb, 0 kom fri, 0 løbs-mål selv om holdet scorer på almindelige skud)', () => {
  const lost = fx({ runs: 'FEW', n: 30, def: { positioning: 20, intercepting: 20 } });
  assert.equal(lost.summary, `🎯 Løb uden bold (Få): 30 løb, 0 kom fri (0 mål) · kontraer imod i alt: 0 (0 mål).`);
  assert.ok(lost.m.homeGoals >= 25, 'de almindelige skud scorer, men tæller ikke som løbs-mål');
  const won = fx({ rm: { passing: 20, finishing: 1 }, n: 30 });
  assert.equal(won.summary, `🎯 Løb uden bold (Normal): 30 løb, 30 kom fri (30 mål) · kontraer imod i alt: 0 (0 mål).`);
});
test('løber trækkes efter indstillingens vægte: Få → plads 8 (RM), Mange → plads 7 (CM) ved next 0,5', () => {
  for (const [runs, s] of [['FEW', 8], ['MANY', 7]]) {
    const r = fx({ runs, rslot: s, n: 30 });
    assert.equal(rOf(r.m, 'home', r.a.H, s).freeRuns, 30, `${runs}: plads ${s}`);
  }
});
test('løb uden bold i rating-kolonnerne: Mange/Få ændrer km og HI præcis for LB/RB/LWB/RWB/CM/CDM/ST/CF (spec.md), ikke for de andre roller', () => {
  const rr = { next: () => 0.5 };
  const team = (runs) => ({ tactics: { phases: { phase1_buildUp: { offBallRuns: runs }, phase2_defending: { pressingHeight: 'MID_BLOCK' }, phase3_transition: { onBallLost: 'DROP_BACK' } } } });
  const pl = { line: 'MID', freshness: 100, skills: { stamina: 10, pace: 10 } };
  const IN = new Set(['LB', 'RB', 'LWB', 'RWB', 'CM', 'CDM', 'ST', 'CF']);
  const roles = Object.keys(RUN_BY_ROLE).filter((x) => x !== 'GK');
  assert.ok(roles.length >= 13);
  for (const role of roles) {
    const n = runProfile(pl, team('NORMAL'), rr, role), many = runProfile(pl, team('MANY'), rr, role), few = runProfile(pl, team('FEW'), rr, role);
    assert.ok(Math.abs(many.km90 / n.km90 - (IN.has(role) ? 1.03 : 1)) < 1e-9, `${role} Mange km`);
    assert.ok(Math.abs(few.km90 / n.km90 - (IN.has(role) ? 0.98 : 1)) < 1e-9, `${role} Få km`);
    if (IN.has(role)) assert.ok(many.hiShare > n.hiShare && few.hiShare < n.hiShare, `${role} HI`); else assert.ok(many.hiShare === n.hiShare && few.hiShare === n.hiShare, `${role} HI uændret`);
  }
});
test('lave cutbacks løfter aflevering fra kanten ·1,3 i løberens beslutning (dribletur uden – aflevering/CUTBACK med)', () => {
  // Kant: skud 0,5·0,3 = 0,15 (v3.16, før 0,5) · aflevering 3·(PAS−6) · dribletur 2·14 = 28. Aflevering vælges, når 0,15 + P > (0,15 + P + 28)/2,
  // dvs. P > 27,85 (før 27,5). PAS 6 + 21,5/3 → 21,5 (ingen fokus: rd 24,825 > 21,65 → dribletur) / ·1,3 = 27,95 (fokus: rd 28,05 < 28,1 →
  // aflevering); med ·1,29 = 27,735 → dribletur. Før: P 21,4 · 1,3 = 27,82 – under den nye tærskel 27,85.
  const rm = { passing: 6 + 21.5 / 3, finishing: 6, pace: 20, ballControl: 20 };
  assert.deepEqual(fx({ rm }).m.goalsPool.map((g) => g.kind), ['DRIBBLE', 'DRIBBLE']);
  assert.deepEqual(fx({ rm, focus: 'LOW_CUTBACKS' }).m.goalsPool.map((g) => g.kind), ['CUTBACK', 'CUTBACK']);
  assert.deepEqual(fx({ rm, focus: 'HIGH_CROSSES' }).m.goalsPool.map((g) => g.kind), ['DRIBBLE', 'DRIBBLE']);
});
test('kontra efter opsnapning tæller DEN der mistede bolden FB/WB-pladser (3-4-3 har ingen: 0,08 – ikke vinderens 4-4-2: 0,088)', () => {
  const drb = { rm: { pace: 12, ballControl: 12, finishing: 1, passing: 1 }, form: '3-4-3', rslot: 7, runs: 'MANY', def: { positioning: 5, intercepting: 1, strength: 40 } };
  assert.equal(fx({ ...drb, script: { 0.088: shots(2) } }).m.awayGoals, 2);
  assert.equal(fx({ ...drb, script: { 0.097: shots(2) } }).m.awayGoals, 0);
  assert.equal(fx({ ...drb, script: { 0.088: shots(2) } }).m.events.filter((e) => e.label === 'Opsnappet').length, 2);
});
test('løber der selv er første midtbanespiller: skud i højt felt er COMBINATION med oplæg fra en ANDEN (ikke fra ham selv)', () => {
  // 4-4-2 plads 5 (LM) trækkes ved next 0,25; trukket til (50,40) = højt. SHOT 3·(FIN−6) mod 0,5 · 1 + 0,5 · 1.
  const r = fx({ rm: { finishing: 20, passing: 1, pace: 1, ballControl: 1 }, rslot: 5, custom: { 5: { x: 50, y: 40 } }, nextValue: 0.25 });
  assert.deepEqual(r.m.goalsPool.map((g) => g.kind), ['COMBINATION', 'COMBINATION']);
  assert.equal(rOf(r.m, 'home', r.a.H, 5).assists, 0);
  assert.equal(rOf(r.m, 'home', r.a.H, 5).freeRuns, 2);
  assert.equal(sumOf(r.m, 'home', 'assists'), 2, 'oplægget må ikke gå tabt, når oplægsgiveren var løberen selv');
  assert.equal(rOf(r.m, 'home', r.a.H, 6).assists, 2);
});
// v3.15.1 (KEEPER_EDGE 3 → 0,3; før FIN 15,1 mod 13,5 + 3): med kanten 3 ville 13,9 ikke slå 16,5 – rødt.
// v3.16: fra kanten skyder løberen kun med skudvægt (FIN − 6)·0,3 > halvdelen af (skud + 2,5): FIN 14,9 → 2,67 > 2,585 (FIN 11,9 afleverer nu:
// 1,77 < 2,135). Så MV 22 i stedet for 18: træt 16,5 + 0,3 = 16,8 < 14,9 + 2 = 16,9; frisk 22,3 holder; med kanten 3 holder også den trætte (19,5).
test('målmandens friskhed tæller i løbets afslutning (træt MV 22 = 16,5 + 0,3 slås af FIN 14,9 + 2 = 16,9; frisk MV 22 + 0,3 holder)', () => {
  const sh = { finishing: 14.9, passing: 1, pace: 1, ballControl: 1 };
  assert.equal(fx({ rm: sh, gk: 22, tweak: (a) => { a.A.squad.forEach((p) => { p.freshness = 0; }); } }).m.homeGoals, 2);
  assert.equal(fx({ rm: sh, gk: 22 }).m.homeGoals, 0);
});
test('bot-hold: gegenpres → Mange, lav blok → Få, ellers Normal; brugerens startprofil (0) er Normal', () => {
  const expect = (p) => (p.press === 'HIGH_GEGENPRESS' ? 'MANY' : p.press === 'LOW_BLOCK' ? 'FEW' : 'NORMAL');
  assert.equal(BOT_PROFILES.length, 8);
  BOT_PROFILES.forEach((p, i) => assert.equal(p.runs, expect(p), `profil ${i}`));
  assert.equal(BOT_PROFILES[0].runs, 'NORMAL');
  assert.deepEqual([...new Set(BOT_PROFILES.map((p) => p.runs))].sort(), ['FEW', 'MANY', 'NORMAL']);
});

// ---------- v3.10: dødbolde (straffe, frispark, hjørnespark) ----------
// Hjemme har bolden hver tick (ingen fase-duel); én dødbold pr. tick efter scriptet.
function sp({ script = {}, gk = 10, tweak = null } = {}) {
  const a = arena();
  slot(a.A, 0).skills.goalkeeping = gk;
  if (tweak) tweak(a);
  const m = simulateMatch(a.H, a.A, stubRng(script));
  return { a, m, kinds: m.goalsPool.map((g) => g.kind) };
}
test('straffespark: holdets bedste afslutter tager det; FIN + 4 + 2,3 mod MV + 4; tæller straffe, frispark imod og målet som dødbold', () => {
  const st9 = (a) => { slot(a.H, 9).skills.finishing = 15; };
  const g = sp({ script: { 0.011: true }, tweak: st9 });
  assert.equal(g.kinds.length, 30); assert.ok(g.kinds.every((k) => k === 'PENALTY'));
  assert.equal(g.m.stats.hPenalties, 30); assert.equal(g.m.stats.hPenaltyGoals, 30); assert.equal(g.m.stats.hSetPieceGoals, 30);
  assert.equal(g.m.stats.aFouls, 30);
  const e = rOf(g.m, 'home', g.a.H, 9); assert.equal(e.goals, 30); assert.equal(e.penaltyGoals, 30); assert.equal(e.setPieceGoals, 30);
  assert.match(g.m.events.find((x) => x.type === 'GOAL').text, /STRAFFESPARK – MÅL! #\d+ .+ fældes i feltet af #\d+ .+, og (#\d+ .+|han tager det selv og) sender bolden sikkert i nettet\./);
  // 15 + 4 + 2,3 = 21,3 mod MV 17,3 + 4 = 21,3 → ikke større → reddet; 17,2 → mål
  const saved = sp({ script: { 0.011: true }, gk: 17.3, tweak: st9 });
  assert.equal(saved.m.homeGoals, 0); assert.equal(saved.m.events.filter((x) => x.label.startsWith('🧤 Straffe reddet')).length, 30);
  assert.equal(sp({ script: { 0.011: true }, gk: 17.2, tweak: st9 }).m.homeGoals, 30);
});
test('frispark i skudafstand: 37 % direkte skud (bedste FIN+PAS, MV +4) – ellers indlæg til luftduel (SETPIECE) med assist', () => {
  const st9 = (a) => { slot(a.H, 9).skills.finishing = 15; };
  const shot = sp({ script: { 0.061: true, 0.37: true }, tweak: st9 });   // 15 + 4 > 10 + 4 + 4
  assert.ok(shot.kinds.length === 30 && shot.kinds.every((k) => k === 'FREEKICK'));
  assert.equal(shot.m.stats.hFreeKicks, 30); assert.equal(shot.m.stats.aFouls, 30);
  assert.equal(sp({ script: { 0.061: true, 0.37: true }, gk: 11, tweak: st9 }).m.homeGoals, 0);   // 19 > 19 falsk
  // Indlæg: hovedstødsspilleren er den bedste i luften (CB slot 3: 20) – stopperne går med op
  const cross = sp({ script: { 0.061: true }, tweak: (a) => { slot(a.H, 3).aerialPower = 20; } });
  assert.ok(cross.kinds.length === 30 && cross.kinds.every((k) => k === 'SETPIECE'));
  assert.equal(rOf(cross.m, 'home', cross.a.H, 3).goals, 30); assert.equal(rOf(cross.m, 'home', cross.a.H, 3).headerGoals, 30);
  assert.equal(cross.m.ratings.home.reduce((x, e) => x + e.assists, 0), 30);
  assert.match(cross.m.events.find((x) => x.type === 'HEADER_GOAL').text, /MÅÅÅL PÅ FRISPARK! #\d+ .+ slår frisparket ind, og #\d+ .+ \(\d+ cm\) header bolden ind/);
  // Dødbolden giver forsvaret +0,5: 20 + 3 mod 10 + 3,8 + 3 + 0,5 → mål; angriber 10,7: 13,7 > 17,3 falsk
  assert.equal(sp({ script: { 0.061: true }, tweak: (a) => { for (const p of a.H.squad) p.aerialPower = 13.7; } }).m.homeGoals, 0);
});
test('hjørnespark efter redning (90 %): luftduel (CORNER), tælles som hjørne og afslutning', () => {
  // v3.12.1: onlyShooter – ellers kan skytten stå uden for feltet og skyde et langskud
  const g = sp({ script: { 0.3: true, 0.9: true }, gk: 10, tweak: (a) => { onlyShooter(a.H); slot(a.H, 3).aerialPower = 20; } });
  // afslutningen reddes (10 + 4 < 10 + 4 + 0,3 – v3.15.1; før MV 8 + 3); hjørnet: duel 20 + 3 > 10 + 3 + 3,75, hovedstød 20 + 4 > 10 + 4
  assert.equal(g.m.stats.hCorners, 30);
  assert.ok(g.kinds.length === 30 && g.kinds.every((k) => k === 'CORNER'), g.kinds.join());
  assert.equal(g.m.stats.hShots, 60);
  assert.equal(sp({ script: { 0.3: true }, gk: 10, tweak: (a) => onlyShooter(a.H) }).m.stats.hCorners, 0);
});
test('stille frispark (58 %) tælles på forsvaret uden hændelse; skade-frispark giver ikke gult kort', () => {
  const g = sp({ script: { 0.58: true } });
  assert.equal(g.m.stats.aFouls, 30); assert.equal(g.m.events.filter((e) => e.type === 'FOUL').length, 0);
  const inj = sp({ script: { 0.06: (n) => n === 0, 0.4: true } });
  assert.equal(inj.m.events.filter((e) => e.type === 'INJURY').length, 1);
  assert.ok([...inj.m.ratings.home, ...inj.m.ratings.away].every((e) => !e.yellowCard));
  const card = sp({ script: { 0.06: (n) => n === 0 } });
  assert.equal([...card.m.ratings.home, ...card.m.ratings.away].filter((e) => e.yellowCard).length, 1);
});

// ---------- v3.10: sæsonstatistik (bogføring, historik, synlighed) ----------
test('statistik: to runder bogføres eksakt – spillertal fra karakterarket, holdtal fra kampens statistik, historik pr. runde', async () => {
  const { viewTeamStats, viewPlayer } = await import('../../public/engine/visibility.js');
  const L = createLeague(createRng(4));
  assert.equal(L.statsFromRound, 1); assert.deepEqual(L.history, []);
  const [H, A] = L.teams, [p, q, gk] = [H.squad[8], H.squad[5], A.squad[0]];
  const stats = (o = {}) => ({ hShots: 7, aShots: 3, hOnTarget: 4, aOnTarget: 1, hXg: 1.234, aXg: 0.4, hPoss: 60, aPoss: 40, hFouls: 9, aFouls: 12, hFreeKicks: 2, aFreeKicks: 1, hCorners: 5, aCorners: 2, hPenalties: 1, aPenalties: 0, hPenaltyGoals: 1, aPenaltyGoals: 0, hSetPieceGoals: 2, aSetPieceGoals: 0, hHeaderGoals: 1, aHeaderGoals: 0, hCounterGoals: 0, aCounterGoals: 1, hVarChecks: 1, aVarChecks: 2, ...o });
  const rnd = (round, hG, aG, home, away) => ({ round, gazette: null, matches: [{ homeId: H.id, awayId: A.id, homeName: H.name, awayName: A.name, homeGoals: hG, awayGoals: aG, homeVarNet: 0, observations: [], injuries: [], stats: stats(),
    goalsPool: [{ kind: 'PENALTY' }, { kind: 'CORNER' }, { kind: 'LONGSHOT' }].slice(0, hG + aG), ratings: { home, away } }] });
  const e = (pl, o) => ({ playerId: pl.id, rating: 7, gainedCounterXp: 1, distanceKm: 10, minIn: 1, minOut: 90, goals: 0, assists: 0, ...o });
  commitRound(L, rnd(1, 2, 1, [e(p, { goals: 2, penaltyGoals: 1, setPieceGoals: 2, headerGoals: 1, isMotM: true, freeRuns: 3, freeRunsWon: 2 }), e(q, { assists: 1, yellowCard: true, minIn: 61 })], [e(gk, { cleanSheet: false })]), createRng(1));
  commitRound(L, rnd(2, 0, 0, [e(p, { freeRuns: 1 })], [e(gk, { cleanSheet: true })]), createRng(1));
  assert.deepEqual([p.sGames, p.sMinutes, p.sGoals, p.sMotm, p.sPenaltyGoals, p.sSetPieceGoals, p.sHeaderGoals, p.freeRunsSum, p.freeRunsWonSum], [2, 180, 2, 1, 1, 2, 1, 4, 2]);
  assert.deepEqual([q.sGames, q.sMinutes, q.sAssists, q.sYellow], [1, 29, 1, 1]);
  assert.deepEqual([gk.sGames, gk.sCleanSheets], [2, 1]);
  const sh = L.leagueMetadata.standings.find((s) => s.teamId === H.id), sa = L.leagueMetadata.standings.find((s) => s.teamId === A.id);
  assert.ok(Math.abs(sh.xg - 2.468) < 1e-9, String(sh.xg)); // summen afrundes ikke undervejs (ellers 2,46)
  assert.deepEqual([sh.sMatches, sh.shots, sh.onTarget, Math.round(sh.xg * 1000) / 1000, sh.possSum, sh.fouls, sh.foulsWon, sh.corners, sh.penalties, sh.penaltyGoals, sh.setPieceGoals, sh.headerGoals, sh.counterGoalsAgainst, sh.varChecks, sh.cleanSheets, sh.yellows],
    [2, 14, 8, 2.468, 120, 18, 24, 10, 2, 2, 4, 2, 2, 2, 1, 1]);
  assert.deepEqual([sa.counterGoals, sa.cleanSheets, sa.possSum], [2, 1, 80]);
  assert.equal(L.history.length, 2);
  const { facts: f0, ...h0 } = L.history[0];   // v3.14: offentlige tal pr. hold til klummen (fatigue/column-tests)
  assert.ok(f0 && Object.keys(f0).length >= 2, 'facts pr. hold');
  assert.deepEqual(h0, { round: 1, matches: 1, goals: 3, setPiece: 2, kinds: { PENALTY: 1, CORNER: 1, LONGSHOT: 1 }, biggest: { diff: 1, label: `${H.name} 2-1 ${A.name}` }, most: { goals: 3, label: `${H.name} 2-1 ${A.name}` }, results: [{ h: H.id, a: A.id, hG: 2, aG: 1 }] });
  assert.equal(L.history[1].biggest, null);
  // Synlighed: andre hold ser ikke tal, der følger en skjult indstilling
  const opp = viewTeamStats(sh, false), own = viewTeamStats(sh, true);
  for (const k of ['shots', 'onTarget', 'xg', 'corners', 'counterGoals', 'counterGoalsAgainst', 'varChecks', 'freeKicks']) { assert.ok(!(k in opp), k); assert.ok(k in own, k); }
  for (const k of ['possSum', 'fouls', 'foulsWon', 'yellows', 'penalties', 'penaltyGoals', 'setPieceGoals', 'headerGoals', 'cleanSheets', 'sMatches']) assert.equal(opp[k], sh[k], k); // hovedstødsmål: offentlige pr. spiller → også pr. hold
  const pv = viewPlayer(p, false);
  assert.equal(pv.sGoals, 2); assert.equal(pv.sPenaltyGoals, 1);
  assert.ok(!('freeRunsSum' in pv) && !('freeRunsWonSum' in pv));
  assert.equal(viewPlayer(p, true).freeRunsWonSum, 2);
});
test('statistik: en historik, der allerede er for lang (fx ældre gem), beskæres til de seneste 60', () => {
  const L = createLeague(createRng(4));
  const [H, A] = L.teams;
  L.leagueMetadata.round = 65;
  L.history = Array.from({ length: 65 }, (_, i) => ({ round: i + 1, matches: 4, goals: 1, setPiece: 0, kinds: {}, biggest: null, most: null }));
  commitRound(L, { round: 66, gazette: null, matches: [{ homeId: H.id, awayId: A.id, homeName: H.name, awayName: A.name, homeGoals: 0, awayGoals: 0, homeVarNet: 0, observations: [], injuries: [], goalsPool: [], stats: {}, ratings: { home: [], away: [] } }] }, createRng(1));
  assert.equal(L.history.length, 60); assert.equal(L.history[0].round, 7); assert.equal(L.history.at(-1).round, 66);
});
test('statistik: historikken har et loft på 60 runder', async () => {
  const { HISTORY_MAX } = await import('../../public/engine/stats.js');
  const L = createLeague(createRng(4));
  const [H, A] = L.teams;
  for (let r = 1; r <= HISTORY_MAX + 3; r++) commitRound(L, { round: r, gazette: null, matches: [{ homeId: H.id, awayId: A.id, homeName: H.name, awayName: A.name, homeGoals: 0, awayGoals: 0, homeVarNet: 0, observations: [], injuries: [], goalsPool: [], stats: {}, ratings: { home: [], away: [] } }] }, createRng(r));
  assert.equal(L.history.length, 60); assert.equal(L.history[0].round, 4);
});
test('kontramål giver assist til den oplægsgiver, teksten nævner (v3.10 – statistik = referat)', () => {
  const r = counters({ script: { 0.032: true } });
  const helper = mids(r.def)[0];
  assert.equal(r.kinds.length, 30);
  assert.equal(r.m.ratings.away.find((e) => e.playerId === helper.id).assists, 30);
  // Alle tre kontra-tekster nævner oplægsgiveren
  for (const v of [0, 0.4, 0.8]) assert.ok(describeGoal('COUNTER', 'SKYTTE', 'OPLÆG', 10, { next: () => v }).includes('OPLÆG'), String(v));
});
test('goalSpectacle for dødbolde (v3.10): straffe lavt, frispark højt, hjørne/indlæg efter luftstyrke', () => {
  const r = (v) => ({ next: () => v });
  assert.equal(goalSpectacle('PENALTY', {}, 50, r(0.5)), 4.5);                       // 3 + 1,5
  assert.equal(goalSpectacle('FREEKICK', { finishing: 14 }, 50, r(0.5)), 17.2);      // 11 + 4,2 + 2
  assert.equal(goalSpectacle('CORNER', { aerialPower: 14 }, 50, r(0.5)), 10.9);      // 4 + 4,9 + 2
  assert.equal(goalSpectacle('SETPIECE', { aerialPower: 10 }, 50, r(0.5)), 9.5);     // 4 + 3,5 + 2
});


// ---------- Test Manager v3.10: huller fundet ved mutation ----------
// Én dødbold/hændelse i tick 0 (n === 0), så ratings er eksakte: start 6,5 (next 0,5), ingen klemning.
const once = (n) => n === 0;
const lastPick = (rng) => ({ ...rng, pick: (arr) => arr[arr.length - 1] });
const half = { next: () => 0.5 };
const stNums = (m, side, ...ks) => ks.map((k) => m.stats[side + k]);
function spx({ script = {}, gk = 10, tweak = null, wrap = null, home = {}, nextValue = 0.5 } = {}) {
  const a = arena({ home });
  slot(a.A, 0).skills.goalkeeping = gk;
  if (tweak) tweak(a);
  const rng = stubRng(script, nextValue);
  const m = simulateMatch(a.H, a.A, wrap ? wrap(rng) : rng);
  return { a, m, pool: m.goalsPool };
}

test('kontramål: oplægsgiveren (vinderens første midtbane) får assist og +0,4, står i teksten, og holdets kontramål tælles', () => {
  const run = (nextValue) => {
    const a = arena();
    for (const p of a.A.squad) p.skills.intercepting = 20;
    slot(a.A, 9).skills.pace = 14;
    return { a, m: simulateMatch(a.H, a.A, stubRng({ 0.48: shots(2), 0.032: shots(2) }, nextValue)) };   // kun to dueller → to kontraer
  };
  const { a, m } = run(0.5);
  const helper = rOf(m, 'away', a.A, 5);
  assert.equal(m.awayGoals, 2);
  assert.equal(helper.assists, 2); assert.equal(sumOf(m, 'away', 'assists'), 2);
  assert.equal(helper.rating, 8.1);                    // + 0,4 sejr (v3.15); 6,5 + 2·0,2 (vandt presset, DUEL_BONUS v3.15; før 0,35 → 8,0) + 2·0,4 (oplæg); 0,5 pr. oplæg ville give 7,9
  assert.equal(m.stats.aCounterGoals, 2); assert.equal(m.stats.hCounterGoals, 0);
  // Teksten: oplægsgiveren (ikke skytten) sendte den i dybden. next 0 → første tekstvariant, der nævner ham.
  const t = run(0);
  const g = t.m.goalsPool[0];
  assert.equal(g.desc, `Kontra: bolden blev erobret, ${tg(slot(t.a.A, 5))} sendte den i dybden, og ${g.scorer} løb fra alle og scorede.`);
  assert.notEqual(g.scorer, tg(slot(t.a.A, 5)));
});

test('straffespark i detaljer: taker er bedste FIN, fældet spiller er en anden, ratings/statistik/bogføring/xG/pointe-tekst præcis', () => {
  const t = (a) => { slot(a.H, 10).skills.finishing = 15; };
  const { a, m, pool } = spx({ script: { 0.011: once }, tweak: t });
  const taker = slot(a.H, 10), e = rOf(m, 'home', a.H, 10);
  assert.equal(pool.length, 1); assert.equal(pool[0].kind, 'PENALTY'); assert.equal(pool[0].scorer, tg(taker));
  assert.equal(pool[0].spectacle, goalSpectacle('PENALTY', {}, pool[0].min, half));
  assert.equal(pool[0].desc, describeGoal('PENALTY', tg(taker), tg(slot(a.H, 9)), pool[0].min, half));   // fældet: første angriber (ikke taker)
  assert.equal(e.rating, 7.9);                                  // 6,5 + 1,0 + 0,4 sejr (1,25 ville give 8,2)
  assert.equal(rOf(m, 'away', a.A, 0).rating, 6.0);             // MV −0,1 − 0,4 nederlag (v3.15)
  assert.equal(rOf(m, 'away', a.A, 1).rating, 5.8);             // forbryderen −0,3 − 0,4 nederlag (v3.15)
  assert.deepEqual([e.goals, e.penaltyGoals, e.setPieceGoals, e.headerGoals], [1, 1, 1, 0]);
  assert.deepEqual(stNums(m, 'h', 'Penalties', 'PenaltyGoals', 'SetPieceGoals', 'HeaderGoals', 'Shots', 'OnTarget'), [1, 1, 1, 0, 1, 1]);
  assert.equal(m.stats.aFouls, 1); assert.ok(Math.abs(m.stats.hXg - 0.76) < 1e-9, String(m.stats.hXg));   // 0,7 ville give 0,70
  // Reddet: MV +0,8 (+0,5 clean sheet), redning tælles, taker −0,4, på mål men ikke mål; hændelsen står hos forsvaret
  const s = spx({ script: { 0.011: once }, gk: 17.3, tweak: t });
  assert.equal(s.m.homeGoals, 0);
  assert.equal(rOf(s.m, 'away', s.a.A, 0).rating, 7.8); assert.equal(rOf(s.m, 'away', s.a.A, 0).saves, 1);
  assert.equal(rOf(s.m, 'home', s.a.H, 10).rating, 6.1); assert.equal(rOf(s.m, 'away', s.a.A, 1).rating, 6.7);   // forbryder −0,3 + clean sheet 0,5
  assert.equal(s.m.stats.hOnTarget, 1);
  assert.equal(s.m.events.find((x) => x.label.startsWith('🧤 Straffe reddet')).isHome, false);
  assert.equal(s.m.events.find((x) => x.type === 'GOAL'), undefined);
});
test('straffespark: friskhed tæller for både taker og målmand (frisk FIN 15 slår MV 16, træt gør ikke; frisk MV 20 holder, træt MV slås)', () => {
  const taker = (fresh) => (a) => { slot(a.H, 10).skills.finishing = 15; slot(a.H, 10).freshness = fresh; };
  assert.equal(spx({ script: { 0.011: once }, gk: 16, tweak: taker(100) }).m.homeGoals, 1);   // 21,3 > 20
  assert.equal(spx({ script: { 0.011: once }, gk: 16, tweak: taker(0) }).m.homeGoals, 0);     // 17,55 < 20
  const keeper = (fresh) => (a) => { slot(a.H, 10).skills.finishing = 15; for (const q of a.A.squad) q.freshness = fresh; };   // hele truppen: en træt bot-starter rotes ellers ud
  assert.equal(spx({ script: { 0.011: once }, gk: 20, tweak: keeper(100) }).m.homeGoals, 0);  // 21,3 < 24
  assert.equal(spx({ script: { 0.011: once }, gk: 20, tweak: keeper(0) }).m.homeGoals, 1);    // 21,3 > 19
});
test('straffespark og frispark: fældet spiller og forbryder trækkes fra de rigtige grupper (sidste i listen)', () => {
  const p = spx({ script: { 0.011: once }, wrap: lastPick, tweak: (a) => { slot(a.H, 10).skills.finishing = 15; } });
  const text = p.m.events.find((x) => x.type === 'GOAL').text;
  assert.ok(text.includes(`${tg(slot(p.a.H, 8))} fældes i feltet af ${tg(slot(p.a.A, 4))} (`), text);   // angribere+midtbane → sidste midtbane; forsvar → sidste back
  const f = spx({ script: { 0.061: once, 0.37: true }, gk: 5, wrap: lastPick, tweak: (a) => { slot(a.H, 10).skills.finishing = 15; } });
  assert.ok(f.m.events.find((x) => x.type === 'GOAL').text.includes(`Frispark efter ${tg(slot(f.a.A, 8))}s (`), 'forbryderen kan også være en midtbanespiller');
});

test('frispark-skud i detaljer: taker = bedste FIN+PAS, +1,4 / MV −0,3, bogført som dødbold (ikke hoved), xG 0,07, tekst og scorer', () => {
  const t = (a) => { slot(a.H, 9).skills.finishing = 15; slot(a.H, 10).skills.finishing = 13; slot(a.H, 10).skills.passing = 13; slot(a.H, 6).skills.passing = 14; };   // FIN+PAS: plads 10 = 26, plads 9 = 25, plads 6 = 24
  const { a, m, pool } = spx({ script: { 0.061: once, 0.37: true }, gk: 5, tweak: t });
  const e = rOf(m, 'home', a.H, 10);
  assert.equal(pool.length, 1); assert.equal(pool[0].kind, 'FREEKICK'); assert.equal(pool[0].scorer, tg(slot(a.H, 10)));   // hverken bedste FIN (plads 9) eller bedste PAS (plads 6)
  assert.equal(pool[0].spectacle, goalSpectacle('FREEKICK', { finishing: 13 }, pool[0].min, half));
  assert.equal(pool[0].desc, describeGoal('FREEKICK', tg(slot(a.H, 10)), tg(slot(a.H, 10)), pool[0].min, half));
  assert.equal(e.rating, 8.3); assert.equal(rOf(m, 'away', a.A, 0).rating, 5.8);                // 6,5 + 1,4 + 0,4 sejr · MV 6,5 − 0,3 − 0,4 nederlag
  assert.deepEqual([e.goals, e.setPieceGoals, e.headerGoals, e.penaltyGoals], [1, 1, 0, 0]);
  assert.deepEqual(stNums(m, 'h', 'FreeKicks', 'SetPieceGoals', 'HeaderGoals', 'Shots', 'OnTarget'), [1, 1, 0, 1, 1]);
  assert.ok(Math.abs(m.stats.hXg - 0.07) < 1e-9, String(m.stats.hXg)); assert.equal(m.stats.aFouls, 1);
  assert.ok(m.events.find((x) => x.type === 'GOAL').text.includes('FRISPARKSMÅL! Frispark efter '));
  // Reddet: på mål, redning tælles (+0,4 +0,5 clean sheet), hændelsen hedder "Frispark reddet" og står hos forsvaret
  const s = spx({ script: { 0.061: once, 0.37: true }, gk: 20, tweak: t });
  assert.equal(s.m.homeGoals, 0); assert.equal(s.m.stats.hOnTarget, 1);
  assert.equal(rOf(s.m, 'away', s.a.A, 0).rating, 7.4); assert.equal(rOf(s.m, 'away', s.a.A, 0).saves, 1);
  const ev = s.m.events.find((x) => x.label === 'Frispark reddet');
  assert.ok(ev && ev.isHome === false && ev.text.includes(tg(slot(s.a.H, 10))), ev?.text);
});
test('frispark-skud: friskhed tæller for taker og målmand', () => {
  const run = (tf, gf, fin, gk) => spx({ script: { 0.061: once, 0.37: true }, gk, tweak: (a) => { slot(a.H, 10).skills.finishing = fin; slot(a.H, 10).freshness = tf; for (const q of a.A.squad) q.freshness = gf; } }).m.homeGoals;
  assert.equal(run(100, 100, 15, 10), 1);   // 19 > 18
  assert.equal(run(0, 100, 15, 10), 0);     // 15,25 < 18
  assert.equal(run(100, 100, 20, 20), 0);   // 24 < 28
  assert.equal(run(100, 0, 20, 20), 1);     // 24 > 23
});
test('frispark-indlæg: taker = bedste PAS får assist (xG 0,1, ét skud), hovedstødsspiller er den bedste i luften ≠ taker', () => {
  const t = (a) => { slot(a.H, 6).skills.passing = 15; slot(a.H, 10).skills.finishing = 15; slot(a.H, 3).aerialPower = 20; };
  const { a, m, pool } = spx({ script: { 0.061: once }, tweak: t });
  assert.equal(pool.length, 1); assert.equal(pool[0].kind, 'SETPIECE'); assert.equal(pool[0].scorer, tg(slot(a.H, 3)));
  assert.equal(pool[0].spectacle, goalSpectacle('SETPIECE', { aerialPower: 20 }, pool[0].min, half));
  assert.equal(pool[0].desc, describeGoal('SETPIECE', tg(slot(a.H, 3)), tg(slot(a.H, 6)), pool[0].min, half));
  assert.equal(rOf(m, 'home', a.H, 6).assists, 1);
  assert.deepEqual(stNums(m, 'h', 'Shots', 'FreeKicks', 'SetPieceGoals', 'HeaderGoals', 'AerialWon', 'TacticSuccess'), [1, 1, 1, 1, 1, 0]);
  assert.ok(Math.abs(m.stats.hXg - 0.1) < 1e-9, String(m.stats.hXg));
  const e = rOf(m, 'home', a.H, 3);
  assert.deepEqual([e.goals, e.headerGoals, e.setPieceGoals, e.aerialWins], [1, 1, 1, 1]);
  assert.ok(m.observations.some((o) => o.playerId === slot(a.H, 3).id && /^Luftduel \(mod .+\): .+ scorede med /.test(o.text)));   // v3.16.3: uden minut
  assert.ok(m.events.find((x) => x.type === 'HEADER_GOAL').text.includes(`MÅÅÅL PÅ FRISPARK! ${tg(slot(a.H, 6))} slår frisparket ind, og ${tg(slot(a.H, 3))} (`));
  // Taker, der selv er bedst i luften, er ikke hovedstødsspiller: han slår ind, en anden header (ellers ingen assist)
  const self = spx({ script: { 0.061: once }, tweak: (a2) => { t(a2); slot(a2.H, 6).aerialPower = 25; } });
  assert.equal(self.pool[0].scorer, tg(slot(self.a.H, 3))); assert.equal(rOf(self.m, 'home', self.a.H, 6).assists, 1);
});
test('hovedstødsspiller blandt de tre bedste i luften (stopperne går med op): sidste af tre vælges, ikke 1. eller 5.', () => {
  const t = (a) => { slot(a.H, 6).skills.passing = 15; [[3, 20], [4, 19], [7, 18], [8, 17]].forEach(([i, v]) => { slot(a.H, i).aerialPower = v; }); };
  const { a, pool } = spx({ script: { 0.061: once }, wrap: lastPick, tweak: t });
  assert.equal(pool[0].scorer, tg(slot(a.H, 7)));    // top-3 = 20, 19, 18 → sidste = plads 7 (18)
});
// v3.12.1 (dokumentets dødboldandel 25–30 %): SETPIECE_DEF_EDGE 4,5 → 3,75, CROSS_EDGE 1 → 2. Med 4,5 var 13,8 ikke mål.
test('frisparksindlæg: forsvaret får SETPIECE_DEF_EDGE 3,75 (i åbent spil i stedet angriberen CROSS_EDGE 2): 13,7 slår ikke dødbolden men slår åbent indlæg; 13,8 er mål', () => {
  const air = (v) => (a) => { for (const p of a.H.squad) p.aerialPower = v; };
  assert.equal(spx({ script: { 0.061: true }, tweak: air(13.7) }).m.homeGoals, 0);    // 16,7 < 10 + 3 + 3,75
  assert.equal(spx({ script: { 0.061: true }, tweak: air(13.8) }).m.homeGoals, 30);   // 16,8 > 16,75; hovedstød 17,8 > 10 + 4
  const open = spx({ script: { 0.3: true, 0.52: true }, home: { p1: { attackFocus: 'HIGH_CROSSES' } }, tweak: air(13.7) });
  assert.equal(open.m.homeGoals, 30, 'åbent spil: tærskel 8 (CROSS_EDGE 2, ingen dødboldfordel)');
});
test('dødbolde vundet af forsvaret: tekst pr. type, luftsejr +0,4 og aerialWins til forsvareren, ingen dødboldmål', () => {
  const def = (a) => { for (const p of a.A.squad) p.aerialPower = 20; };
  const fk = spx({ script: { 0.061: shots(2) }, tweak: def });
  const cb = rOf(fk.m, 'away', fk.a.A, 2);
  assert.equal(fk.m.homeGoals, 0); assert.equal(fk.m.stats.aAerialWon, 2); assert.equal(fk.m.stats.hAerialWon, 0);
  assert.equal(cb.rating, 7.8); assert.equal(cb.aerialWins, 2);                // 6,5 + 2·0,4 + clean sheet 0,5
  const evs = fk.m.events.filter((x) => x.label === 'Luftduel i feltet');
  // v3.16.3: fire varianter (vary: pickBy på forsvarerens n'te clearing i kampen – intet rng-træk; to i træk er forskellige),
  // og skytten med sit hold: "foran #X (Hold)"
  const CLEAR = ['stiger højest og clearer', 'vinder duellen og header væk', 'kommer først og rydder', 'hamrer bolden ud af feltet'];
  assert.equal(evs.length, 2); assert.ok(evs.every((x, i) => x.text === `✈️ [${fk.a.A.name} forsvar] Frisparksindlæg: ${tg(slot(fk.a.A, 2))} (${slot(fk.a.A, 2).heightCm} cm) ${pickBy(CLEAR, i, 'clear', slot(fk.a.A, 2).id)} foran ${x.text.match(/foran (#\d+ \S+ \S+) /)[1]} (${fk.a.H.name}).`), evs[0].text);
  assert.doesNotMatch(evs[0].text, /Hjørnespark|Stærk luftduel/);
  const co = spx({ script: { 0.3: shots(2), 0.9: true }, gk: 20, tweak: def });
  const ce = co.m.events.filter((x) => x.label === 'Luftduel i feltet');
  assert.equal(ce.length, 2); assert.ok(ce.every((x) => new RegExp(`Hjørnespark: #\\d+ .+ \\(\\d+ cm\\) (${CLEAR.join('|')}) foran #\\d+ .+ \\(${co.a.H.name}\\)\\.$`).test(x.text)), ce[0].text);
  const open = spx({ script: { 0.3: shots(2), 0.52: true }, home: { p1: { attackFocus: 'HIGH_CROSSES' } }, tweak: def });
  const oe = open.m.events.filter((x) => x.label === 'Luftduel i feltet');
  assert.ok(oe.length === 2 && oe.every((x) => /Dit indlæg: #\d+ /.test(x.text)), oe[0]?.text);   // v3.12: dit hold får kilden nævnt
  assert.equal(open.m.stats.aTacticSuccess, 0, 'forsvarets luftsejr er ikke en taktisk succes');
});
test('hjørnespark-mål i detaljer: hoved +1,35, oplægsgiver (bedste PAS) +0,55, forsvarer −0,35, MV −0,25; bogført som hoved- og dødboldmål, ikke taktisk succes', () => {
  // v3.16 (koblede linjer): angriberne står på linjen (28, før 14), og afslutnings-lodtrækningen gik til CM 7 (hovedstødsspilleren) –
  // så fik han også skuddets karakter (9,8 i stedet for 9,6). onlyShooter(10): skuddet er plads 10's; hjørnet vælger efter evner.
  const t = (a) => { onlyShooter(a.H, 10); slot(a.H, 7).aerialPower = 20; slot(a.H, 6).skills.passing = 15; slot(a.H, 10).skills.finishing = 15; };
  // MV 15 redder skuddet (FIN 15 + 4 < 15 + 4 + 3,5), men ikke hovedstødet (20 + 4 > 15 + 4)
  const { a, m, pool } = spx({ script: { 0.3: shots(2), 0.9: true }, gk: 15, tweak: t });
  assert.equal(m.homeGoals, 2); assert.ok(pool.every((g) => g.kind === 'CORNER'), pool.map((g) => g.kind).join());
  const sh = rOf(m, 'home', a.H, 7), as = rOf(m, 'home', a.H, 6);
  assert.equal(sh.rating, 9.6); assert.equal(as.rating, 8.0);                    // 6,5 + 2·1,35 · 6,5 + 2·0,55 – begge + 0,4 sejr (v3.15)
  assert.equal(as.assists, 2); assert.deepEqual([sh.goals, sh.headerGoals, sh.setPieceGoals, sh.aerialWins], [2, 2, 2, 2]);
  assert.equal(rOf(m, 'away', a.A, 2).rating, 5.4);                              // aDef 6,5 − 2·0,35 − 0,4 nederlag (v3.15)
  assert.equal(rOf(m, 'away', a.A, 0).rating, 6.6);                              // MV: 6,5 + 2·0,5 (reddet 1. skud) − 2·0,25 − 0,4 nederlag (v3.15)
  assert.deepEqual(stNums(m, 'h', 'Corners', 'SetPieceGoals', 'HeaderGoals', 'AerialWon', 'TacticSuccess', 'Shots'), [2, 2, 2, 2, 0, 4]);
  assert.equal(pool[0].scorer, tg(slot(a.H, 7)));
  assert.equal(pool[0].spectacle, goalSpectacle('CORNER', { aerialPower: 20 }, pool[0].min, half));
  assert.equal(pool[0].desc, describeGoal('CORNER', tg(slot(a.H, 7)), tg(slot(a.H, 6)), pool[0].min, half));
  assert.ok(m.observations.some((o) => o.playerId === slot(a.H, 7).id && /^Luftduel \(mod .+\): .+ scorede med /.test(o.text)));   // v3.16.3: uden minut
  assert.ok(m.events.find((x) => x.type === 'HEADER_GOAL').text.includes(`MÅÅÅL PÅ HJØRNESPARK! ${tg(slot(a.H, 6))} slår hjørnesparket ind, og ${tg(slot(a.H, 7))} (`));
  // xG: skud 0,2·… + 0,04 pr. hjørnespark (ingen ekstra uden hjørnet)
  const no = spx({ script: { 0.3: shots(2) }, gk: 15, tweak: t });
  assert.ok(Math.abs(m.stats.hXg - no.m.stats.hXg - 2 * 0.04) < 1e-9, `${m.stats.hXg} ${no.m.stats.hXg}`);
});
test('hjørnespark efter redning: kun efter en reddet afslutning i åbent spil og i løb (90 %), og et vundet åbent indlæg giver ikke hjørne', () => {
  const sv = (extra) => spx({ script: { 0.3: shots(2), 0.9: true, ...extra }, gk: 20 });
  assert.equal(sv({}).m.stats.hCorners, 2);
  // Åbent indlæg (v3.12): forsvaret vinder → hjørne med CROSS_CORNER_P 35 % (ikke 90 %); angriberen scorer → intet hjørne
  const hc = { home: { p1: { attackFocus: 'HIGH_CROSSES' } } };
  const lostWith = (sc) => spx({ script: { 0.3: shots(2), 0.52: true, ...sc }, ...hc, tweak: (a) => { for (const p of a.A.squad) p.aerialPower = 20; } });
  assert.equal(lostWith({ 0.35: true }).m.stats.hCorners, 2);
  assert.equal(lostWith({ 0.9: true }).m.stats.hCorners, 0);
  const won = spx({ script: { 0.3: shots(2), 0.52: true, 0.9: true, 0.35: true }, ...hc, tweak: (a) => { for (const p of a.H.squad) p.aerialPower = 20; } });
  assert.equal(won.m.stats.hCorners, 0); assert.equal(won.m.homeGoals, 2);
  // Redning i løb uden bold giver også hjørnespark
  const run = fx({ rm: { finishing: 1, passing: 1, pace: 1, ballControl: 1 }, gk: 20, script: { 0.9: true } });
  assert.equal(run.m.stats.hCorners, run.m.events.filter((e) => e.label === 'Redning').length);
  assert.ok(run.m.stats.hCorners >= 2, String(run.m.stats.hCorners));
});
test('lang bold: er oplægsgiveren samme spiller som hovedstødsspilleren, går assisten til en ANDEN (v3.16.6: aldrig "#7 fandt #7")', () => {
  // v3.12: hovedstødsspilleren er den, der står i feltet – plads 8 trukket ind på (50, 16); lastPick:
  // den lange bolds oplægsgiver = sidste midtbanespiller = samme spiller. (Et indlæg slås fra kanten af en anden.)
  const { a, m, pool } = spx({ script: { 0.3: once, 0.15: true }, home: { p1: { passingStyle: 'DIRECT_LONG' } }, wrap: lastPick, tweak: (a2) => { slot(a2.H, 8).aerialPower = 20; a2.H.tactics.customCoords = { 8: { x: 50, y: 16 } }; } });
  assert.equal(pool.length, 1); assert.equal(pool[0].scorer, tg(slot(a.H, 8)));
  assert.equal(rOf(m, 'home', a.H, 8).goals, 1); assert.equal(rOf(m, 'home', a.H, 8).assists, 0); assert.equal(sumOf(m, 'home', 'assists'), 1, 'holdets bedste afleverer blandt de andre');
});
test('hjørnespark: oplægsgiveren er den bedste afleverer; hovedstødsspilleren en anden end ham, selv om han er bedst i luften', () => {
  const t = (a) => { slot(a.H, 6).skills.passing = 15; slot(a.H, 6).aerialPower = 25; slot(a.H, 9).skills.finishing = 15; slot(a.H, 3).aerialPower = 20; };
  const { a, pool, m } = spx({ script: { 0.3: once, 0.9: true }, gk: 15, tweak: t });   // skuddet reddes, hovedstødet går ind
  assert.equal(pool.length, 1); assert.equal(pool[0].scorer, tg(slot(a.H, 3)));
  assert.equal(rOf(m, 'home', a.H, 6).assists, 1);
});
test('bogføring pr. måltype: hovedstød i åbent spil er hovedstødsmål men ikke dødboldmål; langskud er ingen af delene', () => {
  // v3.16: onlyShooter – med angriberne på offside-linjen (28) gik hovedstøds-lodtrækningen ellers til en anden end plads 9
  const open = spx({ script: { 0.3: shots(2), 0.52: true }, home: { p1: { attackFocus: 'HIGH_CROSSES' } }, tweak: (a) => { onlyShooter(a.H); slot(a.H, 9).aerialPower = 20; } });
  const e = rOf(open.m, 'home', open.a.H, 9);
  assert.deepEqual(open.pool.map((g) => g.kind), ['HEADER', 'HEADER']);
  assert.deepEqual([e.headerGoals, e.setPieceGoals, e.penaltyGoals], [2, 0, 0]);
  assert.deepEqual(stNums(open.m, 'h', 'HeaderGoals', 'SetPieceGoals', 'AerialWon', 'TacticSuccess'), [2, 0, 2, 2]);
  const plain = spx({ script: { 0.3: shots(2) }, tweak: (a) => { onlyShooter(a.H); slot(a.H, 9).skills.finishing = 15; } });
  const p = rOf(plain.m, 'home', plain.a.H, 9);
  assert.equal(plain.m.homeGoals, 2); assert.deepEqual([p.headerGoals, p.setPieceGoals, p.penaltyGoals], [0, 0, 0]);
});
test('en tick giver højst én hændelse: straffe/frispark fortrænger chancen, og efter tabt bold er der ingen dødbolde', () => {
  const pen = spx({ script: { 0.011: true, 0.3: true } });
  assert.equal(pen.m.stats.hShots, 30); assert.equal(pen.m.stats.hPenalties, 30);
  const fk = spx({ script: { 0.061: true, 0.3: true } });
  assert.equal(fk.m.stats.hShots, 30); assert.equal(fk.m.stats.hFreeKicks, 30);
  assert.equal(spx({ script: { 0.011: true, 0.061: true } }).m.stats.hFreeKicks, 0, 'straffe først, så frispark');
  // Opbygningen stoppes hver tick (presset vinder) → bolden er tabt → ingen dødbolde
  const lost = spx({ script: { 0.48: true, 0.011: true, 0.061: true } });
  assert.equal(lost.m.events.filter((e) => e.label === 'Fase 2 pres virker').length, 30);
  assert.deepEqual(stNums(lost.m, 'h', 'Penalties', 'FreeKicks', 'Shots'), [0, 0, 0]);
  const lost2 = spx({ script: { 0.48: true, 0.061: true } });
  assert.equal(lost2.m.stats.hFreeKicks, 0);
});
test('stille frispark tælles på forsvaret, ikke angriberen', () => {
  const g = spx({ script: { 0.58: true } });
  assert.deepEqual([g.m.stats.aFouls, g.m.stats.hFouls], [30, 0]);
});
test('gult kort: kun taktisk frispark (ikke skade-frispark), og frisparket logges som FOUL', () => {
  const card = spx({ script: { 0.06: once } });
  assert.equal(card.m.events.filter((e) => e.type === 'FOUL').length, 1);
  assert.equal([...card.m.ratings.home, ...card.m.ratings.away].filter((e) => e.yellowCard).length, 1);
  const inj = spx({ script: { 0.06: once, 0.4: true } });
  assert.ok([...inj.m.ratings.home, ...inj.m.ratings.away].every((e) => !e.yellowCard), 'skade-frispark nævner intet kort');
});

test('fuldtids-analyse: hvert tal står på sin plads (dit hold hjemme), kun for dit hold, som nøglehændelse af typen FULLTIME', () => {
  // Bolden hos hjemme alle ticks (poss 10 + 3·30 mod 10 → 91 %), opbygningen vinder hver duel (30 af 30; pres 0 af 0),
  // straffe i tick 0–1 (reddet), frispark-indlæg i de næste 4 (tabt luftduel = skud uden på mål), 3 afslutninger der scorer.
  const a = arena();
  onlyShooter(a.H); slot(a.H, 9).skills.finishing = 26.1; slot(a.H, 1).skills.finishing = 26.2; slot(a.H, 1).freshness = 0;   // straffe: FIN 26,2 · 0,75 + 6,3 = 25,95 < MV 26; skud: 30,1 > 22 + 4 + 3,5
  slot(a.A, 0).skills.goalkeeping = 22;
  for (const p of mids(a.H)) p.skills.passing = 20;
  const m = simulateMatch(a.H, a.A, stubRng({ 0.48: true, 0.011: (n) => n < 2, 0.061: (n) => n < 4, 0.3: (n) => n < 3 }));
  const ft = m.events.filter((e) => e.type === 'FULLTIME');
  assert.equal(ft.length, 1); assert.equal(ft[0].label, 'Fuldtids-analyse'); assert.equal(ft[0].isHome, true); assert.equal(ft[0].min, 90);
  const st = m.stats;
  assert.ok(m.homeGoals > 0 && m.awayGoals === 0, `${m.homeGoals}-${m.awayGoals}`);
  // Tal, der skal være forskellige, så en ombytning bliver rød
  assert.ok(st.hShots !== st.hOnTarget && st.hFreeKicks !== st.hCorners && st.hPenalties !== st.hPenaltyGoals && st.hFouls !== st.aFouls && st.hFreeKicks !== st.hPenalties, JSON.stringify(st));
  assert.deepEqual(stNums(m, 'h', 'Penalties', 'PenaltyGoals', 'FreeKicks', 'Corners'), [2, 0, 4, 0]);
  const poss = Math.round(st.hPoss / (st.hPoss + st.aPoss) * 100);
  assert.equal(poss, 91);
  assert.equal(ft[0].text, `📊 [FULDTIDS-ANALYSE] Sejr ${m.homeGoals}-${m.awayGoals} til dig. Du havde 91% af bolden og ${st.hShots} afslutninger (${st.hOnTarget} på mål). Din opbygning kom igennem 30 af 30 gange.`
    + ` Dødbolde: 4 frispark i skudafstand, 0 hjørnespark, 2 straffespark (0 mål) · frispark begået ${st.hFouls}, tilkendt ${st.aFouls}.`
    + ft[0].text.slice(ft[0].text.indexOf(' 🎯 Løb uden bold (Normal): ')));
  assert.match(ft[0].text, / 🎯 Løb uden bold \(Normal\): \d+ løb, \d+ kom fri \(\d+ mål\) · kontraer imod i alt: 0 \(0 mål\)\. ⚔️ Angreb \(Centralt · balanceret\): ingen cutbacks eller høje bolde\. 🛡️ /);
  // Kun dit hold: har modstanderen ikke et brugerhold, står der ingen analyse for ham (bot hjemme, dig ude)
  const swap = arena(); swap.H.isBot = true; swap.A.isBot = false;
  const m2 = simulateMatch(swap.H, swap.A, stubRng({}));
  const f2 = m2.events.filter((e) => e.type === 'FULLTIME');
  assert.equal(f2.length, 1); assert.equal(f2[0].isHome, false);
  assert.equal(simulateMatch(...(() => { const b = arena(); b.H.isBot = true; return [b.H, b.A]; })(), stubRng({})).events.filter((e) => e.type === 'FULLTIME').length, 0, 'to bots: ingen analyse');
});
test('fuldtids-analysen er en nøglehændelse i referatets filter (og ikke blot en almindelig INFO)', async () => {
  const { filterEvents } = await import('../../public/ui/matchcenter.js');
  const evs = [{ type: 'FULLTIME', cat: 'TACTIC' }, { type: 'INFO', cat: 'PLAY' }, { type: 'GOAL', cat: 'HIGHLIGHT' }];
  assert.deepEqual(filterEvents(evs, 'key').map((e) => e.type), ['FULLTIME', 'GOAL']);
});

// ---------- Test Manager v3.10: clean sheet, statistik, synlighed, tekster ----------
test('cleanSheet i statistikken: kun målmanden (plads 0), 0 mål imod og mindst 60 minutter (starter: minIn 1 → 59 + 1); hvert hold regnes mod sine egne mål imod', () => {
  // v3.11 (brugeren: "Det er kun målmanden der får Clean sheet"): før fik CB/LB/RB det også –
  // den gamle regel giver cb60/lb61/rb/acb true og gør testen rød.
  const r = { next: () => 0.5 };
  const mkTeam = (id) => ({ id, name: id, isBot: false, tactics: { phases: { phase2_defending: { pressingHeight: 'MID_BLOCK' } } } });
  const mk = (id) => ({ id, shirtNumber: 1, shortName: id, line: 'DEF', skills: { stamina: 10, pace: 10 } });
  const slotOf = (role) => (role === 'GK' || role === 'SUB (GK)' ? 0 : 1);
  const s = createSheet(), th = mkTeam('h'), ta = mkTeam('a');
  const add = (id, role, minOut, team = th, isHome = true, minIn = 1) => { s.register(mk(id), team, isHome, role, minIn, r, 15, slotOf(role)).minOut = minOut; };
  add('gk', 'GK', 90); add('cb60', 'CB', 60); add('rb', 'RB', 90);
  add('agk', 'GK', 90, ta, false); add('acb', 'CB', 90, ta, false);
  const cs = (list) => Object.fromEntries(list.map((e) => [e.playerId, e.cleanSheet]));
  // 0-1: hjemmeholdet har lukket 1 ind (ingen clean sheet), udeholdet 0 (kun MV har)
  const res = finalizeSheet(s, 0, 1, r, counterXpForMatch);
  assert.ok(Object.values(cs(res.home)).every((v) => v === false), JSON.stringify(cs(res.home)));
  assert.deepEqual(cs(res.away), { agk: true, acb: false });
  // 0-0: positiv liste – kun plads 0 med mindst 60 minutter; en målmand skiftet ind ved skade
  // (rollen 'SUB (GK)') tæller, når han spillede nok: ind i 31. = 59 minutter ja, ind i 32. nej;
  // en målmand ud efter 58 minutter nej.
  const s2 = createSheet();
  const add2 = (id, role, minOut, minIn = 1) => { s2.register(mk(id), th, true, role, minIn, r, 15, slotOf(role)).minOut = minOut; };
  add2('gk', 'GK', 90); add2('cb60', 'CB', 60); add2('lb61', 'LB', 61); add2('rb', 'RB', 90); add2('lwb', 'LWB', 90);
  add2('cm', 'CM', 90); add2('st', 'ST', 90); add2('sub', 'SUB (DEF)', 90, 31); add2('subgk', 'SUB (GK)', 90, 31); add2('subgk2', 'SUB (GK)', 90, 32); add2('gk58', 'GK', 59);
  assert.deepEqual(cs(finalizeSheet(s2, 0, 0, r, counterXpForMatch).home),
    { gk: true, cb60: false, lb61: false, rb: false, lwb: false, cm: false, st: false, sub: false, subgk: true, subgk2: false, gk58: false });
  // Karakterbonussen for clean sheet gælder stadig forsvaret (spec §5) – kun statistikken er ændret
  const s4 = createSheet(); s4.register(mk('cb'), th, true, 'CB', 1, r, 15, 1).minOut = 90;
  assert.equal(finalizeSheet(s4, 0, 0, r, counterXpForMatch).home[0].rating, 7.0);
  // Mål imod fra den anden side: 1-0 hjemme → udeholdet lukkede 1 ind
  const s3 = createSheet(); s3.register(mk('x'), ta, false, 'GK', 1, r, 15, 0); s3.register(mk('y'), th, true, 'GK', 1, r, 15, 0);
  const r3 = finalizeSheet(s3, 1, 0, r, counterXpForMatch);
  assert.equal(r3.away[0].cleanSheet, false); assert.equal(r3.home[0].cleanSheet, true);
});

test('runStats: km pr. 90 (distance/minutter·90), HI-andel afrundet (ikke afskåret), topfart – og null uden data', async () => {
  const { runStats } = await import('../../public/engine/stats.js');
  const r = runStats({ minutesSum: 180, distanceSum: 21, hiDistSum: 3, hiKmSum: 2, topSpeedMax: 31.2 });
  assert.ok(Math.abs(r.km90 - 10.5) < 1e-9, String(r.km90)); assert.equal(r.hiPct, 67); assert.equal(r.top, 31.2);   // 2/3 = 66,7 → 67 (afskåret 66)
  assert.deepEqual(runStats({ minutesSum: 0, distanceSum: 0, hiDistSum: 0, hiKmSum: 0, topSpeedMax: 0 }), { km90: null, hiPct: null, top: null });
  // Gem fra v3.7.0: minutter men ingen HI-data endnu
  assert.deepEqual(runStats({ minutesSum: 90, distanceSum: 10, hiDistSum: 0, hiKmSum: 0, topSpeedMax: 0 }), { km90: 10, hiPct: null, top: null });
});

test('statistik: flere kampe pr. runde – største sejr/målrigeste (uafgjort: første), udesejr, clean sheet til den rigtige side, dødboldmål, minutter og frispark', () => {
  const L = createLeague(createRng(4));
  const [T0, T1, T2, T3] = L.teams;
  const P = (t, i) => t.squad[i];
  const mk = (h, a, hG, aG, kinds = [], home = [], away = [], st = {}) => ({ homeId: h.id, awayId: a.id, homeName: h.name, awayName: a.name, homeGoals: hG, awayGoals: aG, homeVarNet: 0, observations: [], injuries: [], stats: st, goalsPool: kinds.map((kind) => ({ kind })), ratings: { home, away } });
  const e = (pl, o) => ({ playerId: pl.id, rating: 7, gainedCounterXp: 1, distanceKm: 10, minIn: 1, minOut: 90, goals: 0, assists: 0, ...o });
  const rnd = (round, matches) => ({ round, gazette: null, matches });
  commitRound(L, rnd(1, [
    mk(T0, T1, 3, 0, ['PENALTY', 'CORNER', 'HEADER'], [e(P(T0, 0), { minOut: 60 }), e(P(T0, 1), { minIn: 46 })], [], { hPoss: 2, aPoss: 1, hFreeKicks: 3, aFreeKicks: 1, hShots: 5, aShots: 2 }),
    mk(T2, T3, 2, 2, ['FREEKICK', 'SETPIECE', 'LONGSHOT', 'LONGSHOT']),
  ]), createRng(1));
  commitRound(L, rnd(2, [mk(T1, T0, 0, 2), mk(T2, T3, 1, 3)]), createRng(1));
  commitRound(L, rnd(3, [mk(T0, T2, 1, 1), mk(T1, T3, 1, 1)]), createRng(1));
  const { facts: f0, ...h0 } = L.history[0];   // v3.14: offentlige tal pr. hold til klummen (fatigue/column-tests)
  assert.ok(f0 && Object.keys(f0).length >= 2, 'facts pr. hold');
  assert.deepEqual(h0, { round: 1, matches: 2, goals: 7, setPiece: 4, kinds: { PENALTY: 1, CORNER: 1, HEADER: 1, FREEKICK: 1, SETPIECE: 1, LONGSHOT: 2 },
    biggest: { diff: 3, label: `${T0.name} 3-0 ${T1.name}` }, most: { goals: 4, label: `${T2.name} 2-2 ${T3.name}` },
    results: [{ h: T0.id, a: T1.id, hG: 3, aG: 0 }, { h: T2.id, a: T3.id, hG: 2, aG: 2 }] });   // HEADER og LONGSHOT er ikke dødbolde
  assert.deepEqual(L.history[1].biggest, { diff: 2, label: `${T1.name} 0-2 ${T0.name}` }, 'udesejr tæller, og ved lighed står den første');
  assert.deepEqual(L.history[1].most, { goals: 4, label: `${T2.name} 1-3 ${T3.name}` });
  assert.equal(L.history[2].biggest, null); assert.deepEqual(L.history[2].most, { goals: 2, label: `${T0.name} 1-1 ${T2.name}` }, 'ved lighed står den første');
  const row = (t) => L.leagueMetadata.standings.find((s) => s.teamId === t.id);
  assert.deepEqual([row(T0).cleanSheets, row(T1).cleanSheets, row(T2).cleanSheets, row(T3).cleanSheets], [2, 0, 0, 0], 'clean sheet = 0 mål imod, for det rigtige hold');
  assert.deepEqual([row(T0).freeKicks, row(T1).freeKicks, row(T0).shots], [3, 1, 5]);
  assert.deepEqual([row(T0).possSum, row(T1).possSum], [67, 33], '2 mod 1 → 66,7 % afrundet 67 (afskåret 66); kampe uden tal tæller 0');
  assert.equal(P(T0, 0).sMinutes, 60);                      // starter taget ud efter 60: (60 − 1) + 1
  assert.equal(P(T0, 1).sMinutes, 44);                      // indskifter kom ind i 46. minut: 90 − 46
});

test('synlighed: ti sæsonfelter er offentlige på spillere, løb uden bold kun ejerens; holdtal: ti offentlige (hovedstødsmål som pr. spiller), resten kun dit eget', async () => {
  const { PLAYER_SEASON_FIELDS, TEAM_STAT_FIELDS } = await import('../../public/engine/stats.js');
  const { viewTeamStats } = await import('../../public/engine/visibility.js');
  const p = Object.fromEntries(PLAYER_SEASON_FIELDS.map((k, i) => [k, i + 1]));
  const pub = ['sGames', 'sMinutes', 'sGoals', 'sAssists', 'sMotm', 'sYellow', 'sRed', 'sCleanSheets', 'sHeaderGoals', 'sPenaltyGoals', 'sSetPieceGoals'], priv = ['freeRunsSum', 'freeRunsWonSum'];
  assert.deepEqual([...PLAYER_SEASON_FIELDS].sort(), [...pub, ...priv].sort());
  const o = viewPlayer(p, false), w = viewPlayer(p, true);
  for (const k of pub) { assert.equal(o[k], p[k], k); assert.equal(w[k], p[k], k); }
  for (const k of priv) { assert.ok(!(k in o), k); assert.equal(w[k], p[k], k); }
  const row = { teamId: 't', teamName: 'T', ...Object.fromEntries(TEAM_STAT_FIELDS.map((k, i) => [k, i + 1])) };
  const publicKeys = ['sMatches', 'possSum', 'fouls', 'foulsWon', 'yellows', 'reds', 'penalties', 'penaltyGoals', 'setPieceGoals', 'headerGoals', 'cleanSheets'];
  const opp = viewTeamStats(row, false), own = viewTeamStats(row, true);
  assert.deepEqual(Object.keys(opp).sort(), ['teamId', 'teamName', ...publicKeys].sort());
  assert.equal(opp.teamId, 't'); assert.equal(opp.teamName, 'T');
  assert.deepEqual(Object.keys(own).sort(), ['teamId', 'teamName', ...TEAM_STAT_FIELDS].sort(), 'ejeren ser alle holdtal');
  for (const k of TEAM_STAT_FIELDS) assert.equal(own[k], row[k], k);
});

// v3.16.3: uden minut (det står ved linjen) og med ejefald via gen ("As" – "Kjærs", men "Aarhus'")
test('nye måltyper: tre egne tekster pr. type (aldrig kombinationsteksten), scorer og oplægsgiver på de rigtige pladser', () => {
  const v = (kind, x) => describeGoal(kind, 'S', 'A', 33, { next: () => x });
  const expected = {
    PENALTY: ['Straffespark: A blev fældet i feltet, og S sendte målmanden den forkerte vej.', 'S var iskold fra pletten, efter at A var blevet lagt ned i feltet.', 'Kold, rolig, mål: S scorede på straffespark.'],
    FREEKICK: ['Et frispark for vitrineskabet: S krøllede bolden over muren og op i hjørnet.', 'S sendte et frispark ind under overliggeren – målmanden nåede kun at se efter den.', 'Direkte frispark: S fandt det lange hjørne fra 22 meter.'],
    CORNER: ['Hjørnespark: A slog bolden ind, og S stangede den i mål.', 'S vandt luftduellen på As hjørnespark og headede ind.', 'Dødboldsstyrke: hjørnespark fra A, hovedstød fra S.'],
    SETPIECE: ['Frisparksindlæg: A lagde bolden ind, og S headede den i mål.', 'S kom først på As frispark og nikkede ind.', 'Indøvet dødbold: frispark fra A, hovedstød fra S.'],
  };
  for (const [kind, texts] of Object.entries(expected)) assert.deepEqual([v(kind, 0), v(kind, 0.5), v(kind, 0.99)], texts, kind);
});
test('goalSpectacle for dødbolde: straffespark sjældent flot, frispark på FIN, hjørne/indlæg på luftkraft; +3 sent', () => {
  const r = (x) => ({ next: () => x });
  assert.equal(goalSpectacle('PENALTY', {}, 50, r(0.5)), 4.5);                          // 3 + 1,5
  assert.equal(goalSpectacle('PENALTY', {}, 50, r(1)), 6);
  assert.equal(goalSpectacle('PENALTY', {}, 85, r(0)), 6);                              // 3 + 3 sent
  assert.equal(goalSpectacle('FREEKICK', { finishing: 12 }, 50, r(0.5)), 16.6);         // 11 + 3,6 + 2
  assert.equal(goalSpectacle('FREEKICK', { finishing: 10 }, 50, r(0)), 14);             // 11 + 3
  assert.equal(goalSpectacle('CORNER', { aerialPower: 12 }, 50, r(0.5)), 10.2);         // 4 + 4,2 + 2
  assert.equal(goalSpectacle('CORNER', { aerialPower: 10 }, 50, r(0)), 7.5);            // 4 + 3,5
  assert.equal(goalSpectacle('SETPIECE', { aerialPower: 14 }, 50, r(0.5)), 10.9);       // 4 + 4,9 + 2
  assert.equal(goalSpectacle('SETPIECE', { aerialPower: 10 }, 50, r(0)), 7.5);
});
test('avisens etiketter for alle måltyper (også de fire dødbolde)', async () => {
  const { GOAL_KIND_LABEL } = await import('../../public/engine/gazette.js');
  assert.deepEqual(GOAL_KIND_LABEL, { LONGSHOT: 'Langskud', DRIBBLE: 'Dribletur', COUNTER: 'Kontra', CUTBACK: 'Cutback', COMBINATION: 'Kombination', HEADER: 'Hovedstød', VAR: 'VAR-drama', PENALTY: 'Straffespark', FREEKICK: 'Frispark', CORNER: 'Hjørnespark', SETPIECE: 'Frisparksindlæg' });
});

test('kampstatistik: gule kort tælles løbende (st.*Yellows) og passer med karakterarkene; højst ét gult pr. spiller', () => {
  const g = sp({ script: { 0.58: true, 0.21: true } });          // stille frispark + kort i hver tick – samme forsvarer
  assert.equal(g.m.stats.aYellows, 1);
  assert.equal(g.m.ratings.away.filter((e) => e.yellowCard).length, 1);
  assert.equal(g.m.events.filter((e) => e.label === 'Gult kort').length, 1);
  const t = sp({ script: { 0.06: (n) => n === 0 } });             // taktisk frispark
  const side = t.m.stats.hYellows + t.m.stats.aYellows;
  assert.equal(side, 1); assert.equal([...t.m.ratings.home, ...t.m.ratings.away].filter((e) => e.yellowCard).length, 1);
});

// v3.10.1 Test Manager: ovenstående summerer siderne og kører taktisk frispark kun ÉN gang – side (foulende, ikke ofret)
// og "højst ét pr. spiller" i den taktiske gren var ubevist.
test('kampstatistik: taktisk frispark – gult kort tælles på det foulende hold og højst ét pr. spiller', () => {
  const once = (victimIsHome) => sp({ script: { 0.06: (n) => n === 0, 0.5: (n) => victimIsHome && n === 0 } });
  const a = once(false);                 // ofret = ude → hjemmeholdet foulede
  assert.equal(a.m.stats.hYellows, 1); assert.equal(a.m.stats.aYellows, 0);
  assert.equal(a.m.ratings.home.filter((e) => e.yellowCard).length, 1); assert.equal(a.m.ratings.away.filter((e) => e.yellowCard).length, 0);
  const b = once(true);                  // ofret = hjemme → udeholdet foulede
  assert.equal(b.m.stats.aYellows, 1); assert.equal(b.m.stats.hYellows, 0);
  assert.equal(b.m.ratings.away.filter((e) => e.yellowCard).length, 1); assert.equal(b.m.ratings.home.filter((e) => e.yellowCard).length, 0);
  const many = sp({ script: { 0.06: true } });   // 30 taktiske frispark, samme spiller hver gang (pick = første)
  assert.equal(many.m.stats.hYellows + many.m.stats.aYellows, 1, 'samme spiller får ikke gult kort igen');
  assert.equal([...many.m.ratings.home, ...many.m.ratings.away].filter((e) => e.yellowCard).length, 1);
});

// ---------- v3.12: angrebsfokus, cutback, modgift, modtager efter position ----------
// Brugeren: "Jeg har sat mit hold til cutbacks, og alligevel er der ikke en eneste reference til
// cutbacks i referatet" og "den spiller der var nærmest hvor bolden blev spillet hen".
function cbRun({ defSum = 20, press = 'MID_BLOCK', bot = false, gk = 1, n = 2, fin = 10 } = {}) {
  const a = arena({ home: { p1: { attackFocus: 'LOW_CUTBACKS' } }, away: { p2: { pressingHeight: press } } });
  if (bot) a.H.isBot = true;
  for (const p of a.A.squad.slice(1, 11)) Object.assign(p.skills, { pace: defSum / 2, positioning: defSum / 2 });
  for (const p of a.H.squad) p.skills.finishing = fin;
  slot(a.A, 0).skills.goalkeeping = gk;
  const m = simulateMatch(a.H, a.A, stubRng({ 0.3: shots(n), 0.38: true }));
  return { a, m, d: m.duelLog[a.H.id] };
}
test('cutback: kantspilleren (PAC+BAL 20 + 4) mod backen (PAC+POS + 4 − 2): 21,9 vinder, 22 lukker kanten – en lukket kant er ingen afslutning', () => {
  const won = cbRun({ defSum: 21.9 }), shut = cbRun({ defSum: 22 });
  assert.deepEqual([won.d.cutbacks, won.d.cutbacksBlocked, won.d.cutbackGoals, won.m.homeGoals], [2, 0, 2, 2]);
  assert.deepEqual(won.m.goalsPool.map((g) => g.kind), ['CUTBACK', 'CUTBACK']);
  assert.ok(won.m.events.filter((e) => e.type === 'GOAL').every((e) => /MÅÅÅL! #\d+ .+ når baglinjen og lægger den lavt tilbage til #\d+ /.test(e.text) && !e.text.includes('✅')));   // v3.16.3: uden ✅
  // Kantspilleren får oplægget (+0,15 + 0,5 pr. mål); scoreren +1,25
  const wE = won.m.ratings.home.find((e) => e.assists > 0), sE = won.m.ratings.home.find((e) => e.goals > 0);
  assert.equal(wE.assists, 2); assert.equal(wE.rating, 8.2); assert.equal(sE.rating, 9.4);   // + 0,4 sejr (v3.15)
  assert.notEqual(wE.playerId, sE.playerId);   // stod før bag kommentartegnet og blev aldrig kørt
  assert.deepEqual([shut.d.cutbacks, shut.d.cutbacksBlocked, shut.m.homeGoals, shut.m.stats.hShots], [2, 2, 0, 0]);
  assert.ok(Math.abs(shut.m.stats.hXg) < 1e-9, String(shut.m.stats.hXg));
  const ev = shut.m.events.filter((e) => e.label === 'Kanten lukket');
  assert.equal(ev.length, 2); assert.ok(ev.every((e) => e.isHome === false && /^❌ Dit cutback-forsøg stoppes: #\d+ .+ \(.+\) lukker kanten mod #\d+ /.test(e.text)), ev[0].text);
  // v3.16.1 (sammenpresning): forsvaret (bold 12 → −11,4) presses sammen fra [20, 63] til [51, 63] – LM 45 → 58 (v3.16: 61), bagkæden
  // står. Vægtene exp(−afstand/16) til (12, 72) (rul 0,5, ens evner): LB (4, 70) 0,60, CB (27, 73) 0,39, CB (51, 73) 0,09 – summen af alle
  // ti er 2,11, så halvdelen nås ved den anden stopper (plads 3), ikke LM'en (plads 5, (4, 58)) som i v3.16. Han får 6,5 + 2·0,3 + clean
  // sheet 0,5 = 7,6 (LM'en: 7,1 uden bonus). OBS: spec.md siger "mod den nærmeste back" – lodtrækningen giver ikke altid den nærmeste.
  // v3.16.7 (Spilfører: midtstoppere og angribere lukkede kanten): backen på sin side (LB, plads 1) – ikke lodtrækningens stopper
  const back = shut.m.ratings.away.find((e) => e.tacticWins > 0);
  assert.equal(back.playerId, slot(shut.a.A, 1).id);
  assert.equal(back.tacticWins, 2); assert.equal(back.rating, 7.6);
});
// v3.12.1: CUTBACK_FINISH_BONUS 6 → 8; v3.13: KEEPER_EDGE 3,5 → 3; v3.15.1: 3 → 0,3 (med 3 reddede 17,6; før MV 14,9 / 15)
test('cutback: afslutteren får CUTBACK_FINISH_BONUS 8 – FIN 10 + 4 + 8 = 22 mod MV + 4 + 0,3: MV 17,6 slås, 17,7 redder', () => {
  assert.equal(cbRun({ gk: 17.6 }).m.homeGoals, 2);
  const saved = cbRun({ gk: 17.7 }).m;
  assert.equal(saved.homeGoals, 0); assert.equal(saved.events.filter((e) => e.type === 'SAVE').length, 2); assert.equal(saved.stats.hOnTarget, 2);
});
test('modgift mod cutbacks: højt gegenpres lukker kanten (+3), lav blok åbner den (−2)', () => {
  const blocked = (o) => cbRun(o).d.cutbacksBlocked;
  assert.equal(blocked({ defSum: 18.9, press: 'HIGH_GEGENPRESS' }), 0); assert.equal(blocked({ defSum: 19, press: 'HIGH_GEGENPRESS' }), 2);
  assert.equal(blocked({ defSum: 23.9, press: 'LOW_BLOCK' }), 0); assert.equal(blocked({ defSum: 24, press: 'LOW_BLOCK' }), 2);
});
// v3.12.1: CROSS_EDGE 2 – angriberne har luft 9 (9 + 2 = 11 > 10, men 11 = 10 + 1 mod lav blok)
test('modgift mod indlæg: lav blok fylder feltet (+1 til CB\'en i åbent spil) – 9 + 2 vinder mod mellemblok, taber mod lav blok', () => {
  const run = (press) => {
    const a = arena({ home: { p1: { attackFocus: 'HIGH_CROSSES' } }, away: { p2: { pressingHeight: press } } });
    slot(a.A, 0).skills.goalkeeping = 1; for (const p of a.H.squad) p.aerialPower = 9;
    return simulateMatch(a.H, a.A, stubRng({ 0.3: shots(2), 0.52: true })).duelLog[a.H.id];
  };
  assert.deepEqual([run('MID_BLOCK').crossesWon, run('HIGH_GEGENPRESS').crossesWon, run('LOW_BLOCK').crossesWon], [2, 2, 0]);
});
test('cutback hos en bot: samme mekanik, men neutral tekst – indstillingen, "Dit/Dine" og din egen indledning nævnes aldrig (§3)', () => {
  // Målet selv må hedde "cutback" (det er, hvad der skete på banen – som "dribletur"); fokus-ordet og
  // dit holds indledning ("✅ … lægger den lavt tilbage til …") må ikke stå hos en bot.
  const won = cbRun({ defSum: 21.9, bot: true }), shut = cbRun({ defSum: 22, bot: true });
  assert.equal(won.d.cutbackGoals, 2); assert.equal(shut.d.cutbacksBlocked, 2);
  const flank = [...won.m.events, ...shut.m.events].filter((e) => ['Kanten lukket', 'Mod baglinjen'].includes(e.label)).map((e) => e.text);
  assert.equal(flank.length, 4);
  for (const t of flank) assert.doesNotMatch(t, /cutback|lavt tilbage|Dit |Dine |når baglinjen|fokus/i, t);
  const goalsTxt = won.m.events.filter((e) => e.type === 'GOAL').map((e) => e.text);
  assert.equal(goalsTxt.length, 2);
  for (const t of goalsTxt) assert.doesNotMatch(t, /✅|lægger den lavt tilbage til|Dit |Dine |fokus|Lave cutbacks/i, t);
  assert.ok(won.m.events.filter((e) => e.label === 'Mod baglinjen').every((e) => /^↩️ \[.+\] #\d+ .+ kommer forbi #\d+ .+ og spiller bolden tilbage i feltet\.$/.test(e.text)));
  assert.ok(shut.m.events.filter((e) => e.label === 'Kanten lukket').every((e) => /^🛡️ \[.+\] #\d+ .+ lukker kanten mod #\d+ .+ \(.+\)\.$/.test(e.text)));
});
test('modtageren står nær bolden: skytten er den nærmest feltet – en midtbanespiller trukket frem tager skuddet, og angribere trukket tilbage gør ikke', () => {
  const run = (custom) => {
    const a = arena(); slot(a.A, 0).skills.goalkeeping = 1;
    if (custom) a.H.tactics.customCoords = custom;
    return { a, pool: simulateMatch(a.H, a.A, stubRng({ 0.3: shots(2) })).goalsPool };
  };
  // Angriberne trukket tilbage og en midtbanespiller lagt ind på feltets kant (50, 20): han tager skuddene
  const moved = run({ 6: { x: 50, y: 20 }, 9: { x: 40, y: 70 }, 10: { x: 60, y: 70 } });
  assert.ok(moved.pool.every((g) => g.scorer === tg(slot(moved.a.H, 6))), moved.pool.map((g) => g.scorer).join());
  const deep = run({ 9: { x: 40, y: 70 }, 10: { x: 60, y: 70 } });
  assert.ok(deep.pool.every((g) => ![9, 10].some((i) => g.scorer === tg(slot(deep.a.H, i)))), deep.pool.map((g) => g.scorer).join());
});
test('hovedstødsspilleren er den, der står i feltet (indlæg mod feltets midte); indlægget slås fra kanten af en anden', () => {
  const a = arena({ home: { p1: { attackFocus: 'HIGH_CROSSES' } } }); slot(a.A, 0).skills.goalkeeping = 1;
  a.H.tactics.customCoords = { 7: { x: 50, y: 16 } };
  const m = simulateMatch(a.H, a.A, stubRng({ 0.3: shots(2), 0.52: true }));
  assert.ok(m.goalsPool.length === 2 && m.goalsPool.every((g) => g.kind === 'HEADER' && g.scorer === tg(slot(a.H, 7))), m.goalsPool.map((g) => g.scorer).join());
  const assister = m.ratings.home.find((e) => e.assists > 0);
  assert.ok(assister && assister.playerId !== slot(a.H, 7).id && assister.assists === 2);
});
test('fuldtids-analyse (v3.12): dit angreb efter dine valg og dit felt med modstanderens forsøg – hvert tal på sin plads', () => {
  // Dit hold hjemme: 2 lange bolde (vundet, mål) og 3 cutbacks (mål)
  const a = arena({ home: { p1: { attackFocus: 'LOW_CUTBACKS', passingStyle: 'DIRECT_LONG' } } }); slot(a.A, 0).skills.goalkeeping = 1;
  const m = simulateMatch(a.H, a.A, stubRng({ 0.3: shots(5), 0.15: (k) => k < 2, 0.38: true }));
  const ft = m.events.find((e) => e.type === 'FULLTIME').text;
  // v3.16.3-ordlyden ("luftdueller i åbent spil"; cutback-tallene som før – de stoppede er en del af forsøgene)
  assert.ok(ft.endsWith(' ⚔️ Angreb (Lave cutbacks · direkte lange bolde): 3 cutbacks (3 mål, 0 stoppet ved kanten), 2 høje bolde (2 vundne luftdueller i åbent spil, 2 hovedstødsmål). 🛡️ Dit felt: modstanderens cutbacks stoppet 0 af 0 · luftdueller i åbent spil vundet 0 af 0.'), ft);
  // Du er ude, og en bot angriber dig: 3 cutbacks lukket af dine backs, 2 lange bolde vundet af angriberen
  const b = arena({ home: { p1: { attackFocus: 'LOW_CUTBACKS', passingStyle: 'DIRECT_LONG' } } });
  b.H.isBot = true; b.A.isBot = false;
  for (const p of b.A.squad.slice(1, 11)) Object.assign(p.skills, { pace: 11, positioning: 11 });
  const m2 = simulateMatch(b.H, b.A, stubRng({ 0.3: shots(5), 0.15: (k) => k < 2, 0.38: true }));
  const f2 = m2.events.find((e) => e.type === 'FULLTIME');
  assert.equal(f2.isHome, false);
  assert.ok(f2.text.endsWith(' 🛡️ Dit felt: modstanderens cutbacks stoppet 3 af 3 · luftdueller i åbent spil vundet 0 af 2.'), f2.text);
});

test('fuldtids-analysens angreb nævner kun det, dine valg (eller kampen) gav: centralt uden noget → "ingen …"; høje indlæg uden indlæg → 0 høje bolde; cutbacks fra et løb på kanten tælles også ved andet fokus', () => {
  const ft = (p1, script, tweak = null) => { const a = arena({ home: { p1 } }); slot(a.A, 0).skills.goalkeeping = 1; if (tweak) tweak(a); const m = simulateMatch(a.H, a.A, stubRng({ 0.3: shots(2), ...script })); return m.events.find((e) => e.type === 'FULLTIME').text.match(/⚔️ [^🛡]*/)[0].trim(); };
  assert.equal(ft({ attackFocus: 'CENTRAL' }, {}), '⚔️ Angreb (Centralt · balanceret): ingen cutbacks eller høje bolde.');
  assert.equal(ft({ attackFocus: 'HIGH_CROSSES' }, {}), '⚔️ Angreb (Høje indlæg · balanceret): 0 høje bolde (0 vundne luftdueller i åbent spil, 0 hovedstødsmål).');
  assert.equal(ft({ attackFocus: 'LOW_CUTBACKS', passingStyle: 'SHORT' }, {}), '⚔️ Angreb (Lave cutbacks · korte pasninger): 0 cutbacks (0 mål, 0 stoppet ved kanten).');
  assert.equal(ft({ attackFocus: 'CENTRAL', passingStyle: 'DIRECT_LONG' }, {}), '⚔️ Angreb (Centralt · direkte lange bolde): 0 høje bolde (0 vundne luftdueller i åbent spil, 0 hovedstødsmål).');
  // Et vundet løb på kanten, der ender i en aflevering, er en cutback – også med centralt fokus
  const run = ft({ attackFocus: 'CENTRAL' }, {}, (a) => { Object.assign(slot(a.H, 8).skills, { passing: 20, finishing: 1 }); for (const p of mids(a.A)) p.skills.passing = 1; for (const i of [1, 2, 3, 4]) Object.assign(slot(a.A, i).skills, { positioning: 1, intercepting: 1, strength: 1 }); });
  assert.equal(run, '⚔️ Angreb (Centralt · balanceret): 2 cutbacks (2 mål, 0 stoppet ved kanten).');   // v3.16.3-ordlyden
});

// ---------- v3.16.6 (M2): den haltende spiller ----------
// Hjemmeholdet uden bænk (alle skadet) → en skadet bliver på banen og halter. int → a: offeret er første markspiller (plads 1).
const noBench = (a) => { for (const p of a.H.squad) if (!a.H.tactics.lineupSlots.includes(p.id)) p.injuryMatchesLeft = 5; };
const limpFirst = { 0.06: (n) => n === 0, 0.5: (n) => n === 0, 0.4: (n) => n === 0 };
test('haltende: holdets bedste afslutter (plads 1) halter – en anden tager straffene, og referatet siger "#X halter – #Y tager straffen"', () => {
  const g = sp({ script: { ...limpFirst, 0.011: true }, tweak: (a) => { noBench(a); slot(a.H, 1).skills.finishing = 15; slot(a.H, 10).skills.finishing = 12; } });
  const lim = slot(g.a.H, 1), next = slot(g.a.H, 10);   // plads 10, ikke 9: den fældede er første angriber (plads 9)
  assert.ok(g.m.events.some((e) => e.min === 3 && /Ingen indskiftning/.test(e.text) && e.text.includes(`${tg(lim)} haltende`)), 'data: han halter fra 3\'');
  const pens = g.m.events.filter((e) => /STRAFFESPARK (– MÅL|REDDET)/.test(e.text));
  assert.ok(pens.length >= 25, `data: ${pens.length} straffe`);
  for (const e of pens) assert.ok(e.text.includes(`${tg(lim)} halter – ${tg(next)} tager straffen`), e.text);
  assert.equal(rOf(g.m, 'home', g.a.H, 1).penaltyGoals, 0);
  // Uden halten: plads 1 tager dem (kontrol)
  const ok = sp({ script: { 0.011: true }, tweak: (a) => { noBench(a); slot(a.H, 1).skills.finishing = 15; slot(a.H, 10).skills.finishing = 12; } });
  assert.ok(ok.m.events.filter((e) => /STRAFFESPARK – MÅL/.test(e.text)).every((e) => !/halter/.test(e.text)) && rOf(ok.m, 'home', ok.a.H, 1).penaltyGoals >= 25);
});
test('haltende: hans evner tæller LIMP.factor (0,6) – alle ti markspillere halter, så den bedste (FIN 15) må tage straffen og brænder mod MV 17', () => {
  // int(0, n) → tick'ets nummer: offeret er plads 1, 2, … 10 i de første ti tick; straffe fra tick 11. FIN 15·0,6 + 4 + 2,3 = 15,3
  // < MV 17 + 4 = 21 → reddet; uden faktoren 15 + 6,3 = 21,3 > 21 → mål. Ingen "halter"-tekst: den sædvanlige skytte ER skytten.
  let t = -1;
  const wrap = (r) => ({ ...r, int: (a, b) => (a === 0 && b >= 8 ? ++t % 10 : a) });
  const g = spx({ script: { 0.06: (n) => n < 10, 0.5: (n) => n < 10, 0.4: (n) => n < 10, 0.011: (n) => n >= 10 }, gk: 17, wrap, tweak: (a) => { noBench(a); slot(a.H, 10).skills.finishing = 15; } });
  const limp = g.m.events.filter((e) => /Ingen indskiftning/.test(e.text) && e.isHome).length;
  const pens = g.m.events.filter((e) => /STRAFFESPARK (– MÅL|REDDET)/.test(e.text));
  assert.ok(limp === 10 && pens.length >= 15, `data: ${limp} haltende, ${pens.length} straffe`);
  assert.equal(g.m.homeGoals, 0, 'alle reddet');
  assert.ok(pens.every((e) => e.text.includes(`redder fra ${tg(slot(g.a.H, 10))}`) && !/halter/.test(e.text)), pens[0]?.text);
});
test('haltende: direkte frispark – "#X halter, så #Y tager frisparket"; frisparksindlæg – han er ikke hovedstødsspiller, selv om han er bedst i luften', () => {
  const t = (a) => { noBench(a); slot(a.H, 1).skills.finishing = 15; slot(a.H, 10).skills.finishing = 12; };
  const shot = sp({ script: { ...limpFirst, 0.061: true, 0.37: true }, tweak: t });
  const lim = slot(shot.a.H, 1), next = slot(shot.a.H, 10);
  const fks = shot.m.events.filter((e) => /FRISPARKSMÅL|redder .+ frispark/.test(e.text));
  assert.ok(fks.length >= 25, `data: ${fks.length} direkte frispark`);
  for (const e of fks) assert.ok(e.text.includes(`${tg(lim)} halter, så ${tg(next)} tager frisparket`), e.text);
  const cross = sp({ script: { ...limpFirst, 0.061: true }, tweak: (a) => { noBench(a); slot(a.H, 1).aerialPower = 25; slot(a.H, 3).aerialPower = 20; } });
  assert.ok(cross.kinds.filter((k) => k === 'SETPIECE').length >= 20, `data: ${cross.kinds.length} indlægsmål`);
  assert.equal(rOf(cross.m, 'home', cross.a.H, 1).headerGoals, 0, 'den haltende (bedst i luften) header ikke');
  assert.ok(rOf(cross.m, 'home', cross.a.H, 3).headerGoals >= 20, 'den næstbedste i luften tager dem');
});
test('pauseskift for den haltende: den friskeste i kæden, der IKKE er sat til en Hvis-Så-regel, og aldrig en reservemålmand', () => {
  // Tre Hvis-Så-skift (3', 6', 9') bruger de tre pauser; skaden i 12' (plads 1, forsvar) kan derfor ikke skiftes → han halter.
  // I pausen (gratis): bænkens forsvarsspillere – den første er sat til en regel i 80', den anden er 70 % frisk.
  const run = (reserveFirst) => {
    const a = arena();
    const bench = a.H.squad.filter((p) => !a.H.tactics.lineupSlots.includes(p.id));
    const defs = bench.filter((p) => p.line === 'DEF'), others = bench.filter((p) => p.line !== 'DEF' && p.line !== 'GK').slice(0, 3);
    defs.forEach((p, i) => { p.freshness = i === 0 ? 100 : 70; });
    const R = (i, min, out, inP) => ({ ruleId: i, minuteTrigger: min, condition: 'ANY', margin: 1, newFormation: '4-4-2', newPlan: null, slotRemapping: [...Array(11).keys()], action: 'SUB', subOut: out.id, subIn: inP.id });
    a.H.tactics.conditionalRules = [R(1, 3, slot(a.H, 5), others[0]), R(2, 6, slot(a.H, 6), others[1]), R(3, 9, slot(a.H, 7), others[2]),
      ...(reserveFirst ? [R(4, 80, slot(a.H, 2), defs[0])] : [])];
    const m = simulateMatch(a.H, a.A, stubRng({ 0.06: (n) => n === 3, 0.5: (n) => n === 0, 0.4: (n) => n === 0 }));
    return { a, defs, m, sub: m.events.find((e) => e.type === 'SUB' && e.min === 45 && /Pauseskift for den haltende/.test(e.text)) };
  };
  const r = run(true), f = run(false);
  assert.ok(r.defs.length >= 2, 'data: to forsvarsspillere på bænken');
  assert.ok(r.m.events.some((e) => e.min === 12 && /Ingen indskiftning/.test(e.text)), 'data: han halter fra 12\'');
  assert.ok(r.sub && r.sub.label === `🔄 ${tg(r.defs[1])} ind for ${tg(slot(r.a.H, 1))}`, `reserveret springes over: ${r.sub?.label}`);
  assert.ok(f.sub && f.sub.label === `🔄 ${tg(f.defs[0])} ind for ${tg(slot(f.a.H, 1))}`, `ellers den friskeste (100 > 70): ${f.sub?.label}`);
});
// TM v3.16.6: LIMP.factor præcist (FIN 20·f + 4 + 2,3 mod MV + 4), redningsteksten, self-casen, frisparket og minutterne
import { LIMP } from '../../public/engine/match-rules.js';
import { playerSpan } from '../../public/engine/clock.js';
const allLimp = (gk, extra = {}) => {
  let t = -1;
  const wrap = (r) => ({ ...r, int: (a, b) => (a === 0 && b >= 8 ? ++t % 10 : a) });
  return spx({ script: { 0.06: (n) => n < 10, 0.5: (n) => n < 10, 0.4: (n) => n < 10, 0.011: (n) => n >= 10, ...extra }, gk, wrap, tweak: (a) => { noBench(a); slot(a.H, 10).skills.finishing = 20; } });
};
test('LIMP.factor er 0,6: FIN 20·0,6 + 6,3 = 18,3 → reddet af MV 15,4 (19,4; med 0,7: 20,3 mål), mål mod MV 14,2 (18,2; med 0,5: 16,3 reddet)', () => {
  assert.equal(LIMP.factor, 0.6);
  const saved = allLimp(15.4), goal = allLimp(14.2);
  assert.ok(saved.m.events.filter((e) => /STRAFFESPARK REDDET/.test(e.text)).length >= 15, 'data');
  assert.equal(saved.m.homeGoals, 0);
  assert.ok(goal.m.homeGoals >= 15, `mål mod 14,2: ${goal.m.homeGoals}`);
});
test('haltende: straffen reddet – "X halter – Y tager straffen, men Z redder"; den fældede som skytte – "X halter – den fældede tager straffen"', () => {
  const t = (a) => { noBench(a); slot(a.H, 1).skills.finishing = 15; slot(a.H, 10).skills.finishing = 12; };
  const g = sp({ script: { ...limpFirst, 0.011: true }, gk: 17, tweak: t });
  const lim = slot(g.a.H, 1), next = slot(g.a.H, 10), gk = slot(g.a.A, 0);
  const saves = g.m.events.filter((e) => /STRAFFESPARK REDDET/.test(e.text));
  assert.ok(saves.length >= 25, `data: ${saves.length}`);
  for (const e of saves) assert.ok(e.text.includes(`${tg(lim)} halter – ${tg(next)} tager straffen, men ${tg(gk)} redder.`), e.text);
  // Den fældede er første angriber (plads 9) – gør ham til den næstbedste skytte
  const self = sp({ script: { ...limpFirst, 0.011: true }, tweak: (a) => { noBench(a); slot(a.H, 1).skills.finishing = 15; slot(a.H, 9).skills.finishing = 12; } });
  const goals = self.m.events.filter((e) => /STRAFFESPARK – MÅL/.test(e.text));
  assert.ok(goals.length >= 25, `data: ${goals.length}`);
  for (const e of goals) assert.ok(e.text.includes(`${tg(slot(self.a.H, 1))} halter – den fældede tager straffen og sender`), e.text);
});
test('haltende: frisparksmålet siger det ("forseelse. X halter, så Y tager frisparket: …"), og han slår ikke indlægget, selv om han er bedste afleverer', () => {
  const t = (a) => { noBench(a); slot(a.H, 1).skills.finishing = 15; slot(a.H, 10).skills.finishing = 12; };
  const goal = sp({ script: { ...limpFirst, 0.061: true, 0.37: true }, gk: 3, tweak: t });
  const gl = goal.m.events.filter((e) => /FRISPARKSMÅL/.test(e.text));
  assert.ok(gl.length >= 25, `data: ${gl.length} frisparksmål`);
  for (const e of gl) assert.ok(e.text.includes(`forseelse. ${tg(slot(goal.a.H, 1))} halter, så ${tg(slot(goal.a.H, 10))} tager frisparket: `), e.text);
  const cross = sp({ script: { ...limpFirst, 0.061: true }, tweak: (a) => { noBench(a); slot(a.H, 1).skills.passing = 20; slot(a.H, 3).aerialPower = 20; } });
  const lines = cross.m.events.filter((e) => /slår frisparket ind/.test(e.text));
  assert.ok(lines.length >= 20, `data: ${lines.length} indlæg`);
  assert.ok(lines.every((e) => !e.text.includes(`${tg(slot(cross.a.H, 1))} slår frisparket ind`)), lines[0].text);
});
test('haltende: han spiller hele kampen – minOut 90 og intet udminut i referatets ur (playerSpan)', () => {
  const g = sp({ script: { ...limpFirst }, tweak: (a) => noBench(a) });
  const e = rOf(g.m, 'home', g.a.H, 1);
  assert.ok(g.m.events.some((x) => /Ingen indskiftning/.test(x.text ?? '')), 'data: han halter');
  assert.equal(e.minOut, 90);
  assert.equal(playerSpan(g.m.events, g.m.ratings.home).get(e.playerId).out, undefined);
});
test('frispark i samme tick som skade-tacklingen (TM v3.16.6): samme tackler i begge linjer, og forseelsen tælles én gang', () => {
  const g = sp({ script: { 0.06: (n) => n === 0, 0.5: (n) => n === 0, 0.4: (n) => n === 0, 0.061: (n) => n === 0, 0.37: true }, gk: 3 });
  const inj = g.m.events.find((e) => e.type === 'INJURY'), fk = g.m.events.find((e) => /FRISPARKSMÅL/.test(e.text));
  assert.ok(inj && fk && inj.min === fk.min, 'data: skade og frisparksmål i samme minut');
  const tackler = inj.text.match(/tackling fra (#\d+ .+?) \(/)[1];
  assert.ok(fk.text.includes(`Frispark efter ${tackler}s (${g.a.A.name}) forseelse`) || fk.text.includes(`Frispark efter ${tackler}' (${g.a.A.name}) forseelse`), `${tackler} – ${fk.text}`);
  assert.equal(g.m.stats.aFouls, 1, 'én forseelse, ikke to');
});
test('modstanderens løbs-cutback (TM v3.16.6): hele linjen er "↩️ [hold] #N løber kommer forbi #M forsvarer (dit hold) og spiller bolden tilbage i feltet." – og aldrig for dit hold', async () => {
  const { createRng: cr } = await import('../../public/engine/rng.js');
  let seen = 0;
  for (let s = 1; s <= 200; s++) {
    const L = createLeague(cr(s * 97)), me = L.teams.find((t) => !t.isBot), opp = L.teams[(s % 7) + 1];
    const m = s % 2 ? simLive(me, opp, cr(s * 131)) : simLive(opp, me, cr(s * 131));
    const mineTags = new Set(me.squad.map(tg)), oppTags = new Set(opp.squad.map(tg));
    for (const e of m.events.filter((x) => x.type === 'INFO' && x.text.startsWith('↩️'))) {
      assert.ok(!e.text.startsWith(`↩️ [${me.name}]`), e.text);
      const mm = e.text.match(/^↩️ \[(.+)\] (#\d+ .+?) kommer forbi (#\d+ .+?) og spiller bolden tilbage i feltet\.$/);
      assert.ok(mm && mm[1] === opp.name && oppTags.has(mm[2]) && mineTags.has(mm[3]), e.text);
      seen++;
    }
  }
  assert.ok(seen >= 100, `data: ${seen} linjer`);
});
test('forbi mål (v3.16.7): 30 skud forbi i én kamp – hver tekst én gang pr. omgang af seks, så forfra (ingen tom liste)', () => {
  const g = sp({ script: { 0.3: true, 0.62: true } , gk: 30 });   // skud i hvert tick, alle reddes/forbi; MISS_P sand, MISS_BLOCK_SHARE falsk
  const miss = g.m.events.filter((e) => e.type === 'MISS' && e.text.startsWith('🎯')).map((e) => e.text.replace(/^🎯 \[.+?\] #\d+ \S+ /, ''));
  assert.ok(miss.length >= 18, `data: ${miss.length} forbi`);
  for (let i = 0; i + 6 <= miss.length; i += 6) assert.equal(new Set(miss.slice(i, i + 6)).size, 6, `omgang ${i / 6}: ${miss.slice(i, i + 6).join(' | ')}`);
  assert.ok(miss.every((t) => t && !/undefined/.test(t)), 'aldrig en tom tekst');   // TM: "Pedersen undefined." slap før igennem
});
// TM v3.16.7: oplægsgiveren tjekkes aldrig for offside – kontra, hovedstød og linjedommerens flag (konstrueret: han står forrest)
import { VAR_RULES as VR } from '../../public/engine/match-rules.js';
test('VAR/flag (M1): oplægsgiveren står forrest, men tjekkes ikke – kontraens og afslutningens VAR og linjedommerens flag nævner en anden', () => {
  const CHECK = { [VR.GOAL_CHECK_P]: true, [VR.GOAL_FOUL_SHARE]: false };
  // Kontra (som "kontramål: oplægsgiveren …"): udeholdets første midtbane (5) er oplægsgiver – trukket helt frem
  const a = arena();
  for (const p of a.A.squad) p.skills.intercepting = 20;
  slot(a.A, 9).skills.pace = 14;
  a.A.tactics.customCoords = { 5: { x: 50, y: 6 } };
  const m = simulateMatch(a.H, a.A, stubRng({ 0.48: shots(2), 0.032: shots(2), ...CHECK }, 0.5));
  const chk = m.events.filter((e) => e.type === 'VAR_CHECK');
  assert.ok(chk.length >= 1 && m.events.some((e) => e.type === 'GOAL' && /KONTRA/.test(e.text)), `data: ${chk.length} tjek`);
  assert.ok(chk.every((e) => !e.text.includes(`stod ${tg(slot(a.A, 5))} offside`)), chk[0]?.text);
  // Linjedommerens flag ved en almindelig afslutning: oplægsgiveren (første midtbane, 5) trukket forrest – flaget rammer ikke ham
  const b = arena(); slot(b.A, 0).skills.goalkeeping = 30;
  for (const p of b.H.squad) p.varProfile.varPulse = 0;
  b.H.tactics.customCoords = { 5: { x: 50, y: 4 } };
  const f = simulateMatch(b.H, b.A, stubRng({ 0.3: shots(3), [VR.OFFSIDE_FLAG_P]: true }, 0.5));
  const flags = f.events.filter((e) => e.type === 'OFFSIDE_FLAG');
  assert.ok(flags.length >= 1, `data: ${flags.length} flag`);
  assert.ok(flags.every((e) => !e.text.includes(`${tg(slot(b.H, 5))} (`)), flags[0]?.text);
});
