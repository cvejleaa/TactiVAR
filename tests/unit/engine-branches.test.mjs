// Deterministiske tests af motorens enkelte beslutninger. En styret rng (stub) afgør hver
// sandsynlighed for sig, så en ændret bonus, tærskel eller sandsynlighed bliver rød –
// statistiske invarianter (summer, rækkefølge) kan ikke se den slags (Test Managers fund).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague, isArchetypeUnlocked, BOT_PROFILES, ARCHETYPES, defaultStarterIds } from '../../public/engine/generator.js';
import { simulateMatch, counterChance, runZone, runGroup, decisionWeights, RUN_WEIGHT } from '../../public/engine/match.js';
import { commitRound, sortStandings, playRound } from '../../public/engine/season.js';
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
    t.tactics.baseFormation = '4-4-2'; t.tactics.customCoords = {}; t.tactics.conditionalRules = [];
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
test('høje bolde kun ved HIGH_CROSSES eller DIRECT_LONG, og kun ved 55 %', () => {
  const run = (p1, s55 = true) => { const { H, A } = arena({ home: { p1 } }); return simulateMatch(H, A, stubRng({ 0.3: true, 0.55: s55 })); };
  const aerial = (m) => m.events.filter((e) => e.type === 'HEADER_GOAL' || e.label === 'Luftduel i feltet').length;
  assert.equal(aerial(run({ attackFocus: 'HIGH_CROSSES' })), 30);
  assert.equal(aerial(run({ passingStyle: 'DIRECT_LONG' })), 30);
  assert.equal(aerial(run({ passingStyle: 'SHORT', attackFocus: 'CENTRAL' })), 0);
  assert.equal(aerial(run({ attackFocus: 'HIGH_CROSSES' }, false)), 0);
});

// Hovedstød: angriber.luft + 3 > forsvarer.luft + GK·0,38 + 3. 14 > 13,8 er mål; med GK·0,4 ville det ikke være.
test('hovedstød: 14 mod 10 + målmand 10·0,38 giver mål; 13 giver vundet luftduel til forsvaret', () => {
  const run = (att) => {
    const { H, A } = arena({ home: { p1: { attackFocus: 'HIGH_CROSSES' } } });
    slot(H, 9).aerialPower = att; slot(A, 1).aerialPower = 10;
    const m = simulateMatch(H, A, stubRng({ 0.3: shots(2), 0.55: true }));
    m.scorer = slot(H, 9).id;
    return m;
  };
  const goal = run(14), miss = run(13);
  assert.equal(goal.homeGoals, 2); assert.equal(goal.stats.hAerialWon, 2);
  assert.equal(miss.homeGoals, 0); assert.equal(miss.stats.aAerialWon, 2);
  // Karakter: 2 hovedstødsmål = 6,5 + 2·1,35 = 9,2 (2·1,25 ville give 9,0)
  assert.equal(goal.ratings.home.find((r) => r.playerId === goal.scorer).rating, 9.2);
});

// VAR (next = 0,1 < 0,22): varPulse + vsTrapLong·0,045 + 0,6 > forsvarer.positioning + 0,6 (v3.6; før ·0,025).
function varRun(trap, { awayAttacks = false } = {}) {
  const { H, A } = arena();
  const [att, def] = awayAttacks ? [A, H] : [H, A];
  if (awayAttacks) for (const p of mids(A)) p.skills.passing = 11;
  const shooter = slot(att, 9);
  shooter.varProfile.varPulse = 10; shooter.counterTactics.vsTrapLong = trap;
  const d = slot(def, 1); d.skills.positioning = 11; d.skills.intercepting = 20;
  return { m: simulateMatch(H, A, stubRng({ 0.3: shots(2) }, 0.1)), shooter };
}
test('VAR: mod-kunnen mod VAR-linjen afgør (10 + 23·0,045 = 11,035 > 11; 22·0,045 = 0,99 → 10,99 < 11)', () => {
  const ok = varRun(23).m, no = varRun(22).m; // med den gamle faktor 0,025 tabte 23 også
  assert.equal(ok.events.filter((e) => e.type === 'VAR_GOAL').length, 2);
  assert.equal(no.events.filter((e) => e.type === 'VAR_NO_GOAL').length, 2);
  assert.equal(ok.stats.hVarChecks, 2);
  assert.equal(ok.homeVarNet, 2); assert.equal(no.homeVarNet, -2);
  const { m: okM, shooter } = varRun(23);
  // Startkarakter ved rul 0,1: 6,5 + (0,03 − 0,15) = 6,38; + 2·1,3 = 8,98 → 9,0 (2·1,25 ville give 8,9)
  assert.equal(okM.ratings.home.find((x) => x.playerId === shooter.id).rating, 9);
});
test('VAR: fortegn på VAR-netto, når udeholdet angriber', () => {
  assert.equal(varRun(23, { awayAttacks: true }).m.homeVarNet, -2);
  assert.equal(varRun(22, { awayAttacks: true }).m.homeVarNet, 2);
});
test('VAR-tjek kun når rullet er under 0,22', () => {
  const { H, A } = arena();
  const m = simulateMatch(H, A, stubRng({ 0.3: shots(2) }, 0.22));
  assert.equal(m.stats.hVarChecks, 0);
});

test('afslutning: FIN + 4 > GK + 4 (v3.10: ingen målmandsfordel – v3.9 havde 5); mål giver +1,25, oplæg +0,5, målmand −0,3', () => {
  const run = (fin) => { const { H, A } = arena(); slot(H, 9).skills.finishing = fin; slot(A, 0).skills.goalkeeping = 11; /* 16 > 15 / 15 > 15 falsk */ return { H, A, m: simulateMatch(H, A, stubRng({ 0.3: shots(2) })) }; };
  const { H, A, m } = run(12);
  assert.equal(m.homeGoals, 2);
  const r = (t, i) => m.ratings[t === H ? 'home' : 'away'].find((x) => x.playerId === slot(t, i).id);
  assert.equal(r(H, 9).rating, 9.0);   // 6,5 + 2·1,25
  assert.equal(r(H, 5).rating, 7.5);   // oplæg: 6,5 + 2·0,5
  assert.equal(r(H, 5).assists, 2);
  assert.equal(r(A, 0).rating, 5.9);   // 6,5 − 2·0,3, intet clean sheet
  const saved = run(11).m;
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
  assert.equal(p.freshness, 92);      // 100 − round(11,2·(1,5 − 0,30) = 13,4) = 87; + round(0,35·13) = 5
  assert.equal(q.freshness, 66);      // 61 − round(10·(1,5 − 0,06) = 14,4) = 47; + round(0,35·53) = 19
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
  assert.equal(q.freshness, 69);      // 66 − 14 = 52; + round(0,35·48) = 17 (jo mere træt, jo mere restitution)
  r = syntheticRound(L, { ratings: [{ playerId: q.id, rating: 6, gainedCounterXp: 1, distanceKm: 40 }] }); r.round = 3;
  commitRound(L, r, { next: () => 0.5 });
  assert.equal(q.freshness, 50);      // 69 − 58 = 11; + 31 = 42 → bund 50
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
  L.teams[6].tactics.conditionalRules = Array.from({ length: 8 }, (_, i) => ({ ruleId: i, minuteTrigger: 60, condition: 'DRAW', newFormation: '4-4-2' }));
  const p = L.teams[1].squad[4]; p.freshness = 70; p.aerialPower = 1;
  L.leagueMetadata.round = 6; L.teams[1].cashBalance = 123;
  const { league: N } = normalizeLeague(L);
  assert.deepEqual(N.teams[3].tactics.lineupSlots, defaultStarterIds(t3.squad));
  assert.deepEqual(N.teams[4].tactics.lineupSlots, defaultStarterIds(t4.squad));
  assert.equal(N.teams[2].tactics.baseFormation, BOT_PROFILES[2].form); // holdets egen profil, ikke profil 0
  assert.equal(N.teams[2].tacticPresets.length, 3);
  assert.equal(N.teams[5].tactics.baseFormation, BOT_PROFILES[5].form);
  assert.equal(N.teams[6].tactics.conditionalRules.length, 5);
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
  const m2 = simulateMatch(H, A, stubRng({ 0.3: true, 0.55: true }));
  assert.ok(m2.events.some((e) => e.type === 'HEADER_GOAL' || e.label === 'Luftduel i feltet'));
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
  assert.ok(ownTexts.some((t) => /Din lynkontra/.test(t)));
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
  assert.ok(half(true, 1, 10).includes('kommet igennem 14 af 14 gange; dit pres har vundet bolden 0 af 0 gange'), half(true, 1, 10));
  assert.ok(half(false, 10, 20).includes('kommet igennem 0 af 0 gange; dit pres har vundet bolden 14 af 14 gange'), half(false, 10, 20));
  assert.ok(half(false, 10, 1).includes('dit pres har vundet bolden 0 af 14 gange'), half(false, 10, 1));
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
  assert.ok(ot.length === 30 && ot.every((x) => x.startsWith('✅ [DIN OFFSIDE-FÆLDE VIRKER]')), ot[0]);
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
import { goalSpectacle, describeGoal } from '../../public/engine/clues.js';
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
test('describeGoal: tre varianter pr. type, valgt af rng; ukendt type bliver kombination', () => {
  const v = (kind, x) => describeGoal(kind, 'S', 'A', 33, { next: () => x });
  for (const kind of ['LONGSHOT', 'DRIBBLE', 'COUNTER', 'CUTBACK', 'COMBINATION', 'HEADER', 'VAR']) {
    const three = [v(kind, 0), v(kind, 0.5), v(kind, 0.99)];
    assert.equal(new Set(three).size, 3, kind);
    assert.ok(three.every((t) => t.includes('S') && t.includes('33')), kind);
  }
  assert.ok(v('LONGSHOT', 0).includes('langskud')); assert.ok(v('DRIBBLE', 0).includes('dribletur'));
  assert.equal(v('???', 0.5), v('COMBINATION', 0.5));
});

// ---------- #2 Måltyper i kampen ----------
// Hjemmeholdet har bolden og vinder alle opbygninger (INT 1); chance i alle 30 ticks (0,3);
// next = 0,5 → ingen VAR (≥ 0,22), afslutning 20 + 4 > MV 1 + 4 → mål hver gang.
function goals({ home = {}, away = {}, script = {}, shooterSkills = null, bots = false } = {}) {
  const a = arena({ home, away });
  let [H, A] = [a.H, a.A];
  if (bots) {
    [H, A] = [a.L.teams[2], a.L.teams[3]];
    for (const t of [H, A]) { for (const p of t.squad) { p.skills = SK(10); p.counterTactics = { vsPress: 25, vsLowBlock: 25, vsTrapLong: 25 }; p.injuryMatchesLeft = 0; } t.tactics.baseFormation = '4-4-2'; t.tactics.customCoords = {}; t.tactics.conditionalRules = []; t.tactics.lineupSlots = t.squad.slice(0, 11).map((p) => p.id); }
    for (const t of [H, A]) t.tactics.phases.phase1_buildUp.offBallRuns = 'NORMAL';
    Object.assign(H.tactics.phases.phase1_buildUp, { passingStyle: 'BALANCED', attackFocus: 'CENTRAL' }, home.p1);
    Object.assign(H.tactics.phases.phase3_transition, { onBallWon: 'KEEP_POSSESSION' }, home.p3);
  }
  for (const p of mids(A)) p.skills.intercepting = 1;
  slot(A, 0).skills.goalkeeping = 1;
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
  assert.match(txt('FAST_COUNTER', {}), /Din lynkontra løber ind i et organiseret forsvar\./);
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
  assert.equal(r.m.ratings.home.find((e) => e.playerId === slot(r.a.H, 9).id).goals, 30);
  assert.match(r.goals[0], /✅ #\d+ .+ løber sig fri på kanten og lægger den tværs til #\d+/);
});
test('løb: god afslutning → skud selv (fra kanten et langskud, ingen oplæg); god fart+boldkontrol → dribletur', () => {
  const shot = decide({ rm: { finishing: 20, passing: 1, pace: 1, ballControl: 1 } });
  assert.ok(shot.kinds.length === 30 && shot.kinds.every((k) => k === 'LONGSHOT'), shot.kinds.join());
  assert.equal(shot.rmE.goals, 30); assert.equal(shot.rmE.assists, 0);
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
  assert.ok(r.kinds.length === 30 && r.kinds.every((k) => k === 'COMBINATION'));
  for (const t of r.goals) assert.doesNotMatch(t, /fri/);
});
test('løb: kun DINE lave cutbacks vægter afleveringen fra kanten – en bots fokus påvirker ikke måltypen (anti-spionage)', () => {
  // Kant: skud 0,5 · aflevering 4·3 (·1,3 = 15,6) · dribling 7·2 → uden fokus dribling, med fokus aflevering
  const rm = { finishing: 4, passing: 10, pace: 13, ballControl: 13 }; // FIN 4: skudvægt 0,5, men nok til at score (4 + 4 + 2 > 1 + 4)
  const base = decide({ rm }).kinds; assert.ok(base.length >= 25 && base.every((k) => k === 'DRIBBLE'), 'uden fokus: ' + base.join());
  const mine = decide({ rm, script: {} });
  const own = (() => { const a = arena({ home: { p1: { attackFocus: 'LOW_CUTBACKS' } } }); Object.assign(slot(a.H, 8).skills, rm); for (const p of mids(a.A)) p.skills.passing = 1; for (const i of [1, 2, 3, 4]) Object.assign(slot(a.A, i).skills, { positioning: 1, intercepting: 1, strength: 1 }); slot(a.A, 0).skills.goalkeeping = 1; return a; })();
  const ownKinds = simulateMatch(own.H, own.A, stubRng({ 0.3: true })).goalsPool.map((g) => g.kind);
  assert.ok(ownKinds.length >= 25 && ownKinds.every((k) => k === 'CUTBACK'), ownKinds.join());
  own.H.isBot = true; // samme hold som bot: fokus må ikke ændre noget
  const botKinds = simulateMatch(own.H, own.A, stubRng({ 0.3: true })).goalsPool.map((g) => g.kind);
  assert.ok(botKinds.length >= 25 && botKinds.every((k) => k === 'DRIBBLE'), botKinds.join());
  assert.ok(mine.kinds.length >= 25);
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
  assert.deepEqual(decisionWeights({ finishing: 5, passing: 12, pace: 10, ballControl: 10 }, 'WIDE'), { SHOT: 0.5, PASS: 18, DRIBBLE: 8 });
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
  const sum = r.m.events.filter((e) => e.label === 'Fuldtids-analyse').map((e) => ({ ...e, text: e.text.match(/🎯 .*$/)[0] }));
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
test('måltype: cutback kræver dine lave cutbacks – for bot-hold tilfældig', () => {
  assert.ok(goals({ home: { p1: { attackFocus: 'LOW_CUTBACKS' } }, script: { 0.42: true } }).kinds.every((k) => k === 'CUTBACK'));
  assert.ok(goals({ home: { p1: { attackFocus: 'CENTRAL' } }, script: { 0.42: true } }).kinds.every((k) => k !== 'CUTBACK'));
  assert.ok(goals({ bots: true, home: { p1: { attackFocus: 'CENTRAL' } }, script: { 0.12: true } }).kinds.every((k) => k === 'CUTBACK'));
});
test('måltype: vægtet af evnerne – langskud/dribletur uden oplæg, kombination med; teksten bruges i referatet', () => {
  // Vægte ved next 0,5: kombination 4, langskud (FIN−8)·0,45, dribletur ((PAC+BAL)/2−8)·0,45.
  const comb = goals();                                          // 4 / 0,9 / 0,9 → r = 2,9 → kombination
  assert.ok(comb.kinds.length >= 25 && comb.kinds.every((k) => k === 'COMBINATION'), comb.kinds.join());
  assert.ok(comb.assister.assists > 0);
  const lng = goals({ shooterSkills: { finishing: 20 } });       // 4 / 5,4 / 0,9 → r = 5,15 → langskud
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
  const one = (sk) => { const x = goals({ shooterSkills: sk, script: { 0.3: (n) => n === 0 } }); return x.m.ratings.home.find((e) => e.playerId === slot(x.H, 9).id).rating; };
  assert.equal(one({ finishing: 20 }), 7.9); // 6,5 + 1,4
  assert.equal(one(null), 7.8);              // 6,5 + 1,25 = 7,75 → 7,8
});
test('måltype: hovedstød og VAR har egen type og tekst', () => {
  const a = arena({ home: { p1: { attackFocus: 'HIGH_CROSSES' } } });
  for (const p of mids(a.A)) p.skills.intercepting = 1;
  for (const p of a.A.squad) p.aerialPower = 1;
  slot(a.A, 0).skills.goalkeeping = 1;
  const m = simulateMatch(a.H, a.A, stubRng({ 0.48: true, 0.3: true, 0.55: true }));
  assert.ok(m.goalsPool.length >= 25 && m.goalsPool.every((g) => g.kind === 'HEADER' && g.desc.includes(`${g.min}`)));
  const v = varRun(23).m.goalsPool;
  assert.ok(v.length === 2 && v.every((g) => g.kind === 'VAR' && g.spectacle >= 5.5 && g.spectacle <= 10.5));
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
  for (let r = 0; r < 2; r++) commitRound(L, playRound(L, 1, rng), rng);
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
  // v3.10 (ingen målmandsfordel): skytte FIN 10 mod MV 9 (+4 hver): 14 > 13 → mål; skytte 50 %: 8,75 + 4 < 13 → redning.
  // MV 10 mod FIN 10: 14 > 14 er falsk → redning; MV 50 %: 8,75 + 4 → mål.
  const run = (shFresh, gk, gkFresh) => {
    const { H, A } = arena();
    for (const p of mids(A)) p.skills.intercepting = 1;
    slot(H, 9).freshness = shFresh; Object.assign(slot(A, 0), { freshness: gkFresh }); slot(A, 0).skills.goalkeeping = gk;
    for (const b of A.squad.slice(11)) b.skills = SK(1); // udeholdet er en bot – ingen frisk afløser at rotere ind
    const m = simulateMatch(H, A, stubRng({ 0.48: true, 0.3: true }));
    return m.homeGoals;
  };
  assert.ok(run(100, 9, 100) >= 25); assert.equal(run(50, 9, 100), 0);
  assert.equal(run(100, 10, 100), 0); assert.ok(run(100, 10, 50) >= 25);
});
test('friskhed virker i luftduellen – både angriber og forsvarer', () => {
  // Hovedstød: skytte-aerial·f + 3 > forsvarer-aerial·f + MV·0,38 (MV 0) + 3.
  const run = (shAir, shFresh, defFresh) => {
    const a = arena({ home: { p1: { attackFocus: 'HIGH_CROSSES' } } });
    for (const p of mids(a.A)) p.skills.intercepting = 1;
    slot(a.A, 0).skills.goalkeeping = 0;
    for (const i of [1, 2, 3, 4]) Object.assign(slot(a.A, i), { aerialPower: 10, freshness: defFresh }); // v3.8: en stopper (slot 2/3) tager luftduellen
    Object.assign(slot(a.H, 9), { aerialPower: shAir, freshness: shFresh });
    for (const b of a.A.squad.slice(11)) b.skills = SK(1); // ingen bot-rotation af den trætte forsvarer
    return simulateMatch(a.H, a.A, stubRng({ 0.48: true, 0.3: true, 0.55: true })).events.filter((e) => e.type === 'HEADER_GOAL').length;
  };
  assert.ok(run(11, 100, 100) >= 25);   // 11 > 10
  assert.equal(run(11, 50, 100), 0);    // 9,625 < 10
  assert.equal(run(10, 100, 100), 0);   // 10 > 10 er falsk
  assert.ok(run(10, 100, 50) >= 25);    // 10 > 8,75
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
    const ev = simulateMatch(a.H, a.A, stubRng({ 0.48: true, 0.3: true, 0.55: true })).events;
    return { goals: ev.filter((e) => e.type === 'HEADER_GOAL').length, clears: ev.filter((e) => e.label === 'Luftduel i feltet').map((e) => e.text) };
  };
  const r = run();
  assert.ok(r.goals >= 25, `stopperne (5) taber til skytten (11): ${r.goals}`);
  assert.equal(r.clears.length, 0);
});

// ---------- #8 Bot-rotationens filtre ----------
test('bot-rotation: bænken skal være ≥ 85 % frisk, i samme kæde og højst 2 svagere – den bedste vælges', () => {
  const setup = (benchFresh, benchSkill, otherLine = false) => {
    const { L } = arena();
    const bot = L.teams[2];
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
  round(1, 11.2, 31.5, 1, 90, { next: () => 0 });   // støj round(0·4 − 2) = −2: pris 13 − 2 = 11 → 89; + round(0,35·11) = 4 → 93
  assert.equal(p.freshness, 93);
  round(2, 5.6, 29, 46, 90, { next: () => 1 });     // støj +2: pris round(6,72) = 7 + 2 = 9 → 84; + round(5,6) = 6 → 90
  assert.equal(p.freshness, 90);
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
  const L = createLeague(createRng(31)), res = playRound(L, 1, createRng(31));
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
const CHANCE_KEY = { FEW: 0.26, NORMAL: 0.3, MANY: 0.36 };   // CHANCE_P pr. trin
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
  return { a, m, summary: m.events.find((e) => e.label === 'Fuldtids-analyse')?.text.match(/🎯 .*$/)?.[0] };
}
test('kontramål: skytten +1,25 og målmanden −0,3, tæller som skud, på mål og xG, og står i din opsummering som "kontraer imod"', () => {
  const { a, m, summary } = ctr({ tweak: (a) => { slot(a.A, 9).skills.pace = 14; } });
  assert.equal(m.awayGoals, 2); assert.equal(m.homeGoals, 0);
  assert.equal(rOf(m, 'away', a.A, 9).rating, 9.0); assert.equal(rOf(m, 'away', a.A, 9).goals, 2);   // 6,5 + 2·1,25
  assert.equal(rOf(m, 'home', a.H, 0).rating, 5.9);                                                // 6,5 − 2·0,3
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
test('kontra-afgørelsen: skyttens FIN + 4 (v3.10; v3.9: +1) mod målmandens MV, begge ·friskhed (strengt større)', () => {
  const goals9 = (o) => ctr({ tweak: (a) => { Object.assign(slot(a.A, 9).skills, { finishing: o.fin ?? 10 }); slot(a.A, 9).freshness = o.sf ?? 100; slot(a.H, 0).skills.goalkeeping = o.gk; slot(a.H, 0).freshness = o.gf ?? 100; } }).m.awayGoals;
  assert.equal(goals9({ gk: 14 }), 0);      // 10 + 4 > 14 er falsk (gk 13,9 giver mål)
  assert.equal(goals9({ gk: 13.9 }), 2);
  // Skytten træt (71 %: ·0,9275 → 9,275 + 4 = 13,275): 13,2 slås, 13,3 holder. Uden friskhed på skytten: 14 > 13,3 → mål.
  assert.equal(goals9({ sf: 71, gk: 13.2 }), 2); assert.equal(goals9({ sf: 71, gk: 13.3 }), 0);
  // Målmanden træt (0 %: ·0,75): 18 → 13,5 < 14 → mål; uden friskhed på målmanden holder 18.
  assert.equal(goals9({ gk: 18, gf: 0 }), 2); assert.equal(goals9({ gk: 18, gf: 100 }), 0);
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
test('chancer pr. tick følger løbs-indstillingen (Få 0,26, Mange 0,36) – og kun den', () => {
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
  assert.deepEqual(w('WIDE'), { SHOT: 2, PASS: 12, DRIBBLE: 12 });
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
  return { a, m, runner: slot(a.H, rslot), goals: m.events.filter((e) => e.type === 'GOAL'), summary: m.events.find((e) => e.label === 'Fuldtids-analyse')?.text.match(/🎯 .*$/)?.[0] };
}
test('løber → aflevering fra kanten: CUTBACK, oplæg til løberen (+0,15 +0,5 pr. mål), mål, observation og tekst hos modtageren', () => {
  const { a, m, runner, goals, summary } = fx({ rm: { passing: 20, finishing: 1 } });
  const fin = slot(a.H, 9);
  assert.equal(m.homeGoals, 2); assert.deepEqual(m.goalsPool.map((g) => g.kind), ['CUTBACK', 'CUTBACK']);
  assert.equal(rOf(m, 'home', a.H, 8).rating, 7.8);        // 6,5 + 2·(0,15 løb + 0,5 oplæg)
  assert.equal(rOf(m, 'home', a.H, 8).assists, 2); assert.equal(rOf(m, 'home', a.H, 8).goals, 0);
  assert.equal(rOf(m, 'home', a.H, 9).rating, 9.0);        // 6,5 + 2·1,25 – målscoreren er modtageren, ikke løberen
  assert.equal(rOf(m, 'home', a.H, 9).goals, 2);
  assert.equal(rOf(m, 'away', a.A, 0).rating, 5.9);
  assert.equal(m.goalsPool[0].scorer, tg(fin));
  assert.equal(m.goalsPool[0].spectacle, goalSpectacle('CUTBACK', { passing: 20 }, m.goalsPool[0].min, { next: () => 0.5 }));   // oplæggets PAS (20), ikke modtagerens (10)
  assert.ok(m.observations.some((o) => o.playerId === fin.id) && !m.observations.some((o) => o.playerId === runner.id));
  assert.ok(goals[0].text.includes(`✅ ${tg(runner)} løber sig fri på kanten og lægger den tværs til ${tg(fin)}.`), goals[0].text);
  const desc = goals[0].text.split(`til ${tg(fin)}. `)[1];                    // målteksten efter løbs-linjen: oplægsgiver = løberen, scorer = modtageren
  assert.ok(desc && desc.includes(tg(runner)) && desc.includes(tg(fin)), goals[0].text);
  assert.equal(summary, '🎯 Løb uden bold (Normal): 2 løb, 2 kom fri (2 mål) · kontraer imod i alt: 0 (0 mål).');
});
test('løber → skud fra kanten: LONGSHOT uden oplæg, +1,4 til løberen selv; pris i rating for en redning', () => {
  const g = fx({ rm: { finishing: 20, passing: 1, pace: 1, ballControl: 1 } });
  assert.deepEqual(g.m.goalsPool.map((x) => x.kind), ['LONGSHOT', 'LONGSHOT']);
  assert.equal(rOf(g.m, 'home', g.a.H, 8).rating, 9.6);    // 6,5 + 2·(0,15 + 1,4)
  assert.equal(sumOf(g.m, 'home', 'assists'), 0);
  assert.equal(g.m.goalsPool[0].scorer, tg(g.runner));
  assert.ok(g.goals[0].text.includes(`✅ ${tg(g.runner)} løber sig fri på kanten og skyder.`), g.goals[0].text);
  assert.equal(g.summary, '🎯 Løb uden bold (Normal): 2 løb, 2 kom fri (2 mål) · kontraer imod i alt: 0 (0 mål).');
  // Redning (v3.10: løbsbonus 2, ingen målmandsfordel): FIN 10 + 2 = 12 mod MV 12 → ikke større → redning; 10,1 → mål
  // (FIN 10: skudvægt 4 mod aflevering 1,5 + dribling 1 – løberen skyder selv)
  const save = fx({ rm: { finishing: 10, passing: 1, pace: 1, ballControl: 1 }, gk: 12 });
  assert.equal(save.m.homeGoals, 0);
  assert.equal(rOf(save.m, 'home', save.a.H, 8).rating, 7.0);   // 6,5 + 2·(0,15 + 0,1)
  const gk = rOf(save.m, 'away', save.a.A, 0);
  assert.equal(gk.saves, 2); assert.equal(gk.rating, 8.0);      // 6,5 + 2·0,5 + 0,5 clean sheet
  assert.equal(save.m.stats.hOnTarget, 2); assert.equal(save.m.stats.hShots, 2);
  const txt = save.m.events.filter((e) => e.type === 'SAVE').map((e) => e.text);
  assert.equal(txt.length, 2);
  for (const t of txt) assert.match(t, new RegExp(`^🧤 \\[.+\\] Flot redning af #\\d+ .+ på afslutning fra ${tg(save.runner).replace('#', '#')} \\(.+\\)\\. ${tg(save.runner)} løber sig fri på kanten og skyder\\.$`), t);
  assert.equal(fx({ rm: { finishing: 10.1, passing: 1, pace: 1, ballControl: 1 }, gk: 12 }).m.homeGoals, 2);
  // Friskhed: løberen træt (0 %: 10 → 7,5 + 2 = 9,5 < 10 → redning; uden friskhed 12 → mål); målmanden træt (18 → 13,5 < 14,1 → mål; uden: 18 → redning)
  assert.equal(fx({ rm: { finishing: 10, passing: 1, pace: 1, ballControl: 1 }, gk: 10, tweak: (a) => { a.H.squad.forEach((p) => { p.freshness = 0; }); } }).m.homeGoals, 0);
  assert.equal(fx({ rm: { finishing: 12.1, passing: 1, pace: 1, ballControl: 1 }, gk: 18, tweak: (a) => { a.A.squad.forEach((p) => { p.freshness = 0; }); } }).m.homeGoals, 2);
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
  const midShot = fx({ rm: { finishing: 20, passing: 1, pace: 1, ballControl: 1 }, custom: { 8: { x: 50, y: 60 } } });
  assert.ok(midShot.goals[0].text.includes('løber sig fri mellem kæderne og skyder.'), midShot.goals[0].text);
  // 3-5-2: plads 8 er CAM (50,36 → højt, "bag forsvaret"): et skud bliver COMBINATION med oplæg fra en anden
  const hi = fx({ rm: { finishing: 20, passing: 1, pace: 1, ballControl: 1 }, form: '3-5-2' });
  assert.deepEqual(hi.m.goalsPool.map((g) => g.kind), ['COMBINATION', 'COMBINATION']);
  assert.ok(hi.goals[0].text.includes(`${tg(hi.runner)} løber sig fri bag forsvaret og skyder.`), hi.goals[0].text);
  assert.equal(sumOf(hi.m, 'home', 'assists'), 2);
  assert.equal(rOf(hi.m, 'home', hi.a.H, 8).assists, 0);
  assert.equal(rOf(hi.m, 'home', hi.a.H, 8).rating, 9.3);          // 6,5 + 2·(0,15 + 1,25) – ikke solo, så ikke 1,4
  const helper = hi.m.ratings.home.find((e) => e.assists === 2);
  assert.ok(helper && helper.playerId !== hi.runner.id && helper.rating === 7.5, JSON.stringify(helper));
});
test('løber → dribletur: vundet er DRIBBLE uden oplæg (+1,4); tabt er en opsnapning med præcis grænse (PAC+BAL mod POS+STR·0,5+3, begge ·friskhed)', () => {
  const win = fx({ rm: { pace: 20, ballControl: 20, finishing: 10, passing: 1 } });
  assert.deepEqual(win.m.goalsPool.map((g) => g.kind), ['DRIBBLE', 'DRIBBLE']);
  assert.equal(rOf(win.m, 'home', win.a.H, 8).rating, 9.6); assert.equal(sumOf(win.m, 'home', 'assists'), 0);
  assert.ok(win.goals[0].text.includes(`${tg(win.runner)} løber sig fri på kanten, dribler #`) && win.goals[0].text.includes('af og afslutter selv.'), win.goals[0].text);
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
    assert.match(e.text, new RegExp(`^❌ ${tg(lost.runner)} løber sig fri på kanten, men ${tg(defd)} \\(.+\\) tager bolden i driblingen\\.$`), e.text);
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
  // Kant: skud 0,5 · aflevering 3·(PAS−6) · dribletur 2·14 = 28. PAS 13,133 → 21,4 (ingen fokus: rd 24,95 → dribletur) / 27,82 (fokus: rd 28,16 → aflevering)
  const rm = { passing: 6 + 21.4 / 3, finishing: 6, pace: 20, ballControl: 20 };
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
test('målmandens friskhed tæller i løbets afslutning (træt MV 18 = 13,5 slås af FIN 12,1 + 2; frisk MV 18 holder)', () => {
  const sh = { finishing: 12.1, passing: 1, pace: 1, ballControl: 1 };
  assert.equal(fx({ rm: sh, gk: 18, tweak: (a) => { a.A.squad.forEach((p) => { p.freshness = 0; }); } }).m.homeGoals, 2);
  assert.equal(fx({ rm: sh, gk: 18 }).m.homeGoals, 0);
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
  assert.match(g.m.events.find((x) => x.type === 'GOAL').text, /STRAFFESPARK – MÅL! #\d+ .+ fældes i feltet af #\d+ .+, og #\d+ .+ sender bolden sikkert i nettet\./);
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
  const g = sp({ script: { 0.3: true, 0.9: true }, gk: 20, tweak: (a) => { slot(a.H, 3).aerialPower = 20; } });
  // Afslutningen reddes (10 + 4 < 20 + 4); hjørnet: 20 + 3 > 10 + 7,6 + 3 + 0,5
  assert.equal(g.m.stats.hCorners, 30);
  assert.ok(g.kinds.length === 30 && g.kinds.every((k) => k === 'CORNER'), g.kinds.join());
  assert.equal(g.m.stats.hShots, 60);
  assert.equal(sp({ script: { 0.3: true }, gk: 20 }).m.stats.hCorners, 0);
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
  assert.deepEqual(L.history[0], { round: 1, matches: 1, goals: 3, setPiece: 2, kinds: { PENALTY: 1, CORNER: 1, LONGSHOT: 1 }, biggest: { diff: 1, label: `${H.name} 2-1 ${A.name}` }, most: { goals: 3, label: `${H.name} 2-1 ${A.name}` } });
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
  assert.equal(helper.rating, 8.0);                    // 6,5 + 2·0,35 (vandt presset) + 2·0,4 (oplæg); 0,5 pr. oplæg ville give 8,2
  assert.equal(m.stats.aCounterGoals, 2); assert.equal(m.stats.hCounterGoals, 0);
  // Teksten: oplægsgiveren (ikke skytten) sendte den i dybden. next 0 → første tekstvariant, der nævner ham.
  const t = run(0);
  const g = t.m.goalsPool[0];
  assert.equal(g.desc, `Kontra i ${g.min}. minut: bolden blev erobret, ${tg(slot(t.a.A, 5))} sendte den i dybden, og ${g.scorer} løb fra alle og scorede.`);
  assert.notEqual(g.scorer, tg(slot(t.a.A, 5)));
});

test('straffespark i detaljer: taker er bedste FIN, fældet spiller er en anden, ratings/statistik/bogføring/xG/pointe-tekst præcis', () => {
  const t = (a) => { slot(a.H, 10).skills.finishing = 15; };
  const { a, m, pool } = spx({ script: { 0.011: once }, tweak: t });
  const taker = slot(a.H, 10), e = rOf(m, 'home', a.H, 10);
  assert.equal(pool.length, 1); assert.equal(pool[0].kind, 'PENALTY'); assert.equal(pool[0].scorer, tg(taker));
  assert.equal(pool[0].spectacle, goalSpectacle('PENALTY', {}, pool[0].min, half));
  assert.equal(pool[0].desc, describeGoal('PENALTY', tg(taker), tg(slot(a.H, 9)), pool[0].min, half));   // fældet: første angriber (ikke taker)
  assert.equal(e.rating, 7.5);                                  // 6,5 + 1,0 (1,25 ville give 7,8)
  assert.equal(rOf(m, 'away', a.A, 0).rating, 6.4);             // MV −0,1
  assert.equal(rOf(m, 'away', a.A, 1).rating, 6.2);             // forbryderen −0,3
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
  assert.equal(e.rating, 7.9); assert.equal(rOf(m, 'away', a.A, 0).rating, 6.2);                // 6,5 + 1,4 · MV 6,5 − 0,3
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
  assert.ok(m.observations.some((o) => o.playerId === slot(a.H, 3).id && /^Luftduel \(\d+\. min mod .+\): .+ scorede med /.test(o.text)));
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
test('frisparksindlæg: forsvaret får +0,5 (i åbent spil ikke): 14,2 slår ikke dødbolden men slår åbent indlæg; 14,4 er mål', () => {
  const air = (v) => (a) => { for (const p of a.H.squad) p.aerialPower = v; };
  assert.equal(spx({ script: { 0.061: true }, tweak: air(14.2) }).m.homeGoals, 0);    // 17,2 < 17,3
  assert.equal(spx({ script: { 0.061: true }, tweak: air(14.4) }).m.homeGoals, 30);   // 17,4 > 17,3
  const open = spx({ script: { 0.3: true, 0.55: true }, home: { p1: { attackFocus: 'HIGH_CROSSES' } }, tweak: air(14.2) });
  assert.equal(open.m.homeGoals, 30, 'åbent spil: tærskel 13,8 (uden dødboldfordel)');
});
test('dødbolde vundet af forsvaret: tekst pr. type, luftsejr +0,4 og aerialWins til forsvareren, ingen dødboldmål', () => {
  const def = (a) => { for (const p of a.A.squad) p.aerialPower = 20; };
  const fk = spx({ script: { 0.061: shots(2) }, tweak: def });
  const cb = rOf(fk.m, 'away', fk.a.A, 2);
  assert.equal(fk.m.homeGoals, 0); assert.equal(fk.m.stats.aAerialWon, 2); assert.equal(fk.m.stats.hAerialWon, 0);
  assert.equal(cb.rating, 7.8); assert.equal(cb.aerialWins, 2);                // 6,5 + 2·0,4 + clean sheet 0,5
  const evs = fk.m.events.filter((x) => x.label === 'Luftduel i feltet');
  assert.equal(evs.length, 2); assert.ok(evs.every((x) => /Frisparksindlæg: #\d+ .+ \(\d+ cm\) stiger højest og clearer foran #\d+ /.test(x.text)), evs[0].text);
  assert.doesNotMatch(evs[0].text, /Hjørnespark|Stærk luftduel/);
  const co = spx({ script: { 0.3: shots(2), 0.9: true }, gk: 20, tweak: def });
  const ce = co.m.events.filter((x) => x.label === 'Luftduel i feltet');
  assert.equal(ce.length, 2); assert.ok(ce.every((x) => /Hjørnespark: #\d+ .+ stiger højest/.test(x.text)), ce[0].text);
  const open = spx({ script: { 0.3: shots(2), 0.55: true }, home: { p1: { attackFocus: 'HIGH_CROSSES' } }, tweak: def });
  const oe = open.m.events.filter((x) => x.label === 'Luftduel i feltet');
  assert.ok(oe.length === 2 && oe.every((x) => /Stærk luftduel: #\d+ /.test(x.text)), oe[0]?.text);
  assert.equal(open.m.stats.aTacticSuccess, 0, 'forsvarets luftsejr er ikke en taktisk succes');
});
test('hjørnespark-mål i detaljer: hoved +1,35, oplægsgiver (bedste PAS) +0,55, forsvarer −0,35, MV −0,25; bogført som hoved- og dødboldmål, ikke taktisk succes', () => {
  const t = (a) => { slot(a.H, 7).aerialPower = 20; slot(a.H, 6).skills.passing = 15; slot(a.H, 10).skills.finishing = 15; };
  const { a, m, pool } = spx({ script: { 0.3: shots(2), 0.9: true }, gk: 20, tweak: t });
  assert.equal(m.homeGoals, 2); assert.ok(pool.every((g) => g.kind === 'CORNER'), pool.map((g) => g.kind).join());
  const sh = rOf(m, 'home', a.H, 7), as = rOf(m, 'home', a.H, 6);
  assert.equal(sh.rating, 9.2); assert.equal(as.rating, 7.6);                    // 6,5 + 2·1,35 · 6,5 + 2·0,55
  assert.equal(as.assists, 2); assert.deepEqual([sh.goals, sh.headerGoals, sh.setPieceGoals, sh.aerialWins], [2, 2, 2, 2]);
  assert.equal(rOf(m, 'away', a.A, 2).rating, 5.8);                              // aDef 6,5 − 2·0,35
  assert.equal(rOf(m, 'away', a.A, 0).rating, 7.0);                              // MV: 6,5 + 2·0,5 (reddet 1. skud) − 2·0,25
  assert.deepEqual(stNums(m, 'h', 'Corners', 'SetPieceGoals', 'HeaderGoals', 'AerialWon', 'TacticSuccess', 'Shots'), [2, 2, 2, 2, 0, 4]);
  assert.equal(pool[0].scorer, tg(slot(a.H, 7)));
  assert.equal(pool[0].spectacle, goalSpectacle('CORNER', { aerialPower: 20 }, pool[0].min, half));
  assert.equal(pool[0].desc, describeGoal('CORNER', tg(slot(a.H, 7)), tg(slot(a.H, 6)), pool[0].min, half));
  assert.ok(m.observations.some((o) => o.playerId === slot(a.H, 7).id && /^Luftduel \(\d+\. min mod .+\): .+ scorede med /.test(o.text)));
  assert.ok(m.events.find((x) => x.type === 'HEADER_GOAL').text.includes(`MÅÅÅL PÅ HJØRNESPARK! ${tg(slot(a.H, 6))} slår hjørnesparket ind, og ${tg(slot(a.H, 7))} (`));
  // xG: skud 0,2·… + 0,04 pr. hjørnespark (ingen ekstra uden hjørnet)
  const no = spx({ script: { 0.3: shots(2) }, gk: 20, tweak: t });
  assert.ok(Math.abs(m.stats.hXg - no.m.stats.hXg - 2 * 0.04) < 1e-9, `${m.stats.hXg} ${no.m.stats.hXg}`);
});
test('hjørnespark efter redning: kun efter en reddet afslutning i åbent spil og i løb (90 %), og et vundet åbent indlæg giver ikke hjørne', () => {
  const sv = (extra) => spx({ script: { 0.3: shots(2), 0.9: true, ...extra }, gk: 20 });
  assert.equal(sv({}).m.stats.hCorners, 2);
  // Åbent indlæg: forsvaret vinder → hjørne 90 % (ikke 50 %); angriberen vinder → intet hjørne
  const hc = { home: { p1: { attackFocus: 'HIGH_CROSSES' } } };
  const lost = spx({ script: { 0.3: shots(2), 0.55: true, 0.9: true }, ...hc, tweak: (a) => { for (const p of a.A.squad) p.aerialPower = 20; } });
  assert.equal(lost.m.stats.hCorners, 2);
  const won = spx({ script: { 0.3: shots(2), 0.55: true, 0.9: true }, ...hc, tweak: (a) => { for (const p of a.H.squad) p.aerialPower = 20; } });
  assert.equal(won.m.stats.hCorners, 0); assert.equal(won.m.homeGoals, 2);
  // Redning i løb uden bold giver også hjørnespark
  const run = fx({ rm: { finishing: 1, passing: 1, pace: 1, ballControl: 1 }, gk: 20, script: { 0.9: true } });
  assert.equal(run.m.stats.hCorners, run.m.events.filter((e) => e.label === 'Redning').length);
  assert.ok(run.m.stats.hCorners >= 2, String(run.m.stats.hCorners));
});
test('åbent indlæg: er oplægsgiveren samme spiller som hovedstødsspilleren, bogføres ingen assist (kun målet)', () => {
  // lastPick: skytte = sidste af angribere+midtbane, oplægsgiver = sidste midtbanespiller = samme spiller (plads 8)
  const { a, m, pool } = spx({ script: { 0.3: once, 0.55: true }, home: { p1: { attackFocus: 'HIGH_CROSSES' } }, wrap: lastPick, tweak: (a2) => { slot(a2.H, 8).aerialPower = 20; } });
  assert.equal(pool.length, 1); assert.equal(pool[0].scorer, tg(slot(a.H, 8)));
  assert.equal(rOf(m, 'home', a.H, 8).goals, 1); assert.equal(rOf(m, 'home', a.H, 8).assists, 0); assert.equal(sumOf(m, 'home', 'assists'), 0);
});
test('hjørnespark: oplægsgiveren er den bedste afleverer; hovedstødsspilleren en anden end ham, selv om han er bedst i luften', () => {
  const t = (a) => { slot(a.H, 6).skills.passing = 15; slot(a.H, 6).aerialPower = 25; slot(a.H, 9).skills.finishing = 15; slot(a.H, 3).aerialPower = 20; };
  const { a, pool, m } = spx({ script: { 0.3: once, 0.9: true }, gk: 20, tweak: t });
  assert.equal(pool.length, 1); assert.equal(pool[0].scorer, tg(slot(a.H, 3)));
  assert.equal(rOf(m, 'home', a.H, 6).assists, 1);
});
test('bogføring pr. måltype: hovedstød i åbent spil er hovedstødsmål men ikke dødboldmål; langskud er ingen af delene', () => {
  const open = spx({ script: { 0.3: shots(2), 0.55: true }, home: { p1: { attackFocus: 'HIGH_CROSSES' } }, tweak: (a) => { slot(a.H, 9).aerialPower = 20; } });
  const e = rOf(open.m, 'home', open.a.H, 9);
  assert.deepEqual(open.pool.map((g) => g.kind), ['HEADER', 'HEADER']);
  assert.deepEqual([e.headerGoals, e.setPieceGoals, e.penaltyGoals], [2, 0, 0]);
  assert.deepEqual(stNums(open.m, 'h', 'HeaderGoals', 'SetPieceGoals', 'AerialWon', 'TacticSuccess'), [2, 0, 2, 2]);
  const plain = spx({ script: { 0.3: shots(2) }, tweak: (a) => { slot(a.H, 9).skills.finishing = 15; } });
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
  slot(a.H, 9).skills.finishing = 25; slot(a.H, 1).skills.finishing = 26; slot(a.H, 1).freshness = 0;   // pladsens FIN 26 · 0,75 + 6,3 = 25,8 < MV 26
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
  assert.equal(ft[0].text, `📊 [90' FULDTIDS-ANALYSE] ${m.homeGoals}-${m.awayGoals} til dig. Du havde 91% af bolden og ${st.hShots} afslutninger (${st.hOnTarget} på mål). Din opbygning kom igennem 30 af 30 gange; dit pres vandt bolden 0 af 0 gange.`
    + ` Dødbolde: 4 frispark i skudafstand, 0 hjørnespark, 2 straffe (0 mål) · frispark begået ${st.hFouls}, tilkendt ${st.aFouls}.`
    + ft[0].text.slice(ft[0].text.indexOf(' 🎯 Løb uden bold (Normal): ')));
  assert.match(ft[0].text, / 🎯 Løb uden bold \(Normal\): \d+ løb, \d+ kom fri \(\d+ mål\) · kontraer imod i alt: 0 \(0 mål\)\.$/);
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
test('cleanSheet i karakterarket: MV/CB/LB/RB, 0 mål imod og mindst 60 minutter (starter: minIn 1 → 59 + 1); hvert hold regnes mod sine egne mål imod', () => {
  const r = { next: () => 0.5 };
  const mkTeam = (id) => ({ id, name: id, isBot: false, tactics: { phases: { phase2_defending: { pressingHeight: 'MID_BLOCK' } } } });
  const mk = (id) => ({ id, shirtNumber: 1, shortName: id, line: 'DEF', skills: { stamina: 10, pace: 10 } });
  const s = createSheet(), th = mkTeam('h'), ta = mkTeam('a');
  const add = (id, role, minOut, team = th, isHome = true, minIn = 1) => { s.register(mk(id), team, isHome, role, minIn, r, 15, 1).minOut = minOut; };
  add('gk', 'GK', 90); add('cb60', 'CB', 60); add('cb59', 'CB', 59); add('lb61', 'LB', 61); add('rb', 'RB', 90); add('lwb', 'LWB', 90);
  add('cm', 'CM', 90); add('st', 'ST', 90); add('sub', 'SUB (DEF)', 90, th, true, 31); add('cb20', 'CB', 20);
  add('agk', 'GK', 90, ta, false); add('acb', 'CB', 90, ta, false);
  const cs = (list) => Object.fromEntries(list.map((e) => [e.playerId, e.cleanSheet]));
  // 0-1: hjemmeholdet har lukket 1 ind (ingen clean sheet), udeholdet 0 (MV og CB har)
  const res = finalizeSheet(s, 0, 1, r, counterXpForMatch);
  assert.ok(Object.values(cs(res.home)).every((v) => v === false), JSON.stringify(cs(res.home)));
  assert.deepEqual(cs(res.away), { agk: true, acb: true });
  // 0-0: positiv liste – kun de fire roller med mindst 60 minutter (cb60 = 59 + 1 ja, cb59 = 58 + 1 nej)
  const s2 = createSheet();
  const add2 = (id, role, minOut, minIn = 1) => { s2.register(mk(id), th, true, role, minIn, r, 15, 1).minOut = minOut; };
  add2('gk', 'GK', 90); add2('cb60', 'CB', 60); add2('cb59', 'CB', 59); add2('lb61', 'LB', 61); add2('rb', 'RB', 90); add2('lwb', 'LWB', 90);
  add2('cm', 'CM', 90); add2('st', 'ST', 90); add2('sub', 'SUB (DEF)', 90, 31); add2('cb20', 'CB', 20);
  assert.deepEqual(cs(finalizeSheet(s2, 0, 0, r, counterXpForMatch).home),
    { gk: true, cb60: true, cb59: false, lb61: true, rb: true, lwb: false, cm: false, st: false, sub: false, cb20: false });
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
  assert.deepEqual(L.history[0], { round: 1, matches: 2, goals: 7, setPiece: 4, kinds: { PENALTY: 1, CORNER: 1, HEADER: 1, FREEKICK: 1, SETPIECE: 1, LONGSHOT: 2 },
    biggest: { diff: 3, label: `${T0.name} 3-0 ${T1.name}` }, most: { goals: 4, label: `${T2.name} 2-2 ${T3.name}` } });   // HEADER og LONGSHOT er ikke dødbolde
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
  const pub = ['sGames', 'sMinutes', 'sGoals', 'sAssists', 'sMotm', 'sYellow', 'sCleanSheets', 'sHeaderGoals', 'sPenaltyGoals', 'sSetPieceGoals'], priv = ['freeRunsSum', 'freeRunsWonSum'];
  assert.deepEqual([...PLAYER_SEASON_FIELDS].sort(), [...pub, ...priv].sort());
  const o = viewPlayer(p, false), w = viewPlayer(p, true);
  for (const k of pub) { assert.equal(o[k], p[k], k); assert.equal(w[k], p[k], k); }
  for (const k of priv) { assert.ok(!(k in o), k); assert.equal(w[k], p[k], k); }
  const row = { teamId: 't', teamName: 'T', ...Object.fromEntries(TEAM_STAT_FIELDS.map((k, i) => [k, i + 1])) };
  const publicKeys = ['sMatches', 'possSum', 'fouls', 'foulsWon', 'yellows', 'penalties', 'penaltyGoals', 'setPieceGoals', 'headerGoals', 'cleanSheets'];
  const opp = viewTeamStats(row, false), own = viewTeamStats(row, true);
  assert.deepEqual(Object.keys(opp).sort(), ['teamId', 'teamName', ...publicKeys].sort());
  assert.equal(opp.teamId, 't'); assert.equal(opp.teamName, 'T');
  assert.deepEqual(Object.keys(own).sort(), ['teamId', 'teamName', ...TEAM_STAT_FIELDS].sort(), 'ejeren ser alle holdtal');
  for (const k of TEAM_STAT_FIELDS) assert.equal(own[k], row[k], k);
});

test('nye måltyper: tre egne tekster pr. type (aldrig kombinationsteksten), scorer og oplægsgiver på de rigtige pladser', () => {
  const v = (kind, x) => describeGoal(kind, 'S', 'A', 33, { next: () => x });
  const expected = {
    PENALTY: ['Straffespark i 33. minut: A blev fældet i feltet, og S sendte målmanden den forkerte vej.', 'S var iskold fra pletten i 33. minut, efter at A var blevet lagt ned i feltet.', 'Kold, rolig, mål: S scorede på straffespark i 33. minut.'],
    FREEKICK: ['Et frispark for vitrineskabet i 33. minut: S krøllede bolden over muren og op i hjørnet.', 'S sendte et frispark ind under overliggeren i 33. minut – målmanden nåede kun at se efter den.', 'Direkte frispark i 33. minut: S fandt det lange hjørne fra 22 meter.'],
    CORNER: ['Hjørnespark i 33. minut: A slog bolden ind, og S stangede den i mål.', 'S vandt luftduellen på As hjørnespark i 33. minut og headede ind.', 'Dødboldsstyrke i 33. minut: hjørnespark fra A, hovedstød fra S.'],
    SETPIECE: ['Frisparksindlæg i 33. minut: A lagde bolden ind, og S headede den i mål.', 'S kom først på As frispark i 33. minut og nikkede ind.', 'Indøvet dødbold i 33. minut: frispark fra A, hovedstød fra S.'],
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

