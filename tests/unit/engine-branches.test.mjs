// Deterministiske tests af motorens enkelte beslutninger. En styret rng (stub) afgør hver
// sandsynlighed for sig, så en ændret bonus, tærskel eller sandsynlighed bliver rød –
// statistiske invarianter (summer, rækkefølge) kan ikke se den slags (Test Managers fund).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague, isArchetypeUnlocked, BOT_PROFILES, ARCHETYPES, defaultStarterIds } from '../../public/engine/generator.js';
import { simulateMatch, counterChance } from '../../public/engine/match.js';
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

test('afslutning: FIN + 4 > GK + 4 + målmandsfordel 5 (v3.9; før uden); mål giver +1,25, oplæg +0,5, målmand −0,3', () => {
  const run = (fin) => { const { H, A } = arena(); slot(H, 9).skills.finishing = fin; slot(A, 0).skills.goalkeeping = 6; /* 16 > 15 / 15 > 15 falsk */ return { H, A, m: simulateMatch(H, A, stubRng({ 0.3: shots(2) })) }; };
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
  assert.equal(goalSpectacle('DRIBBLE', { pace: 12, ballControl: 12 }, 50, r(0.5)), 13.6); // 8 + 3,6 + 2
  assert.equal(goalSpectacle('COUNTER', { pace: 10 }, 50, r(0.5)), 11);           // 7 + 2 + 2
  assert.equal(goalSpectacle('CUTBACK', { passing: 10 }, 50, r(0.5)), 9.5);       // 6 + 1,5 + 2
  assert.equal(goalSpectacle('COMBINATION', { passing: 10 }, 50, r(0.5)), 9);     // 5 + 2 + 2
  assert.equal(goalSpectacle('HEADER', { aerialPower: 10 }, 50, r(0.5)), 11);     // 5 + 4 + 2
  assert.equal(goalSpectacle('VAR', {}, 50, r(0.5)), 9.5);                        // 7 + 2,5 (før v3.7: 17–25)
  assert.equal(goalSpectacle('VAR', {}, 50, r(0)), 7);
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
  assert.deepEqual(['FEW', 'NORMAL', 'MANY'].map((r) => counterChance(r, 'DROP_BACK', 'KEEP_POSSESSION')), [0.012, 0.032, 0.08]);
  assert.deepEqual(['FEW', 'NORMAL', 'MANY'].map((r) => counterChance(r, 'DROP_BACK', 'FAST_COUNTER')), [0.054, 0.144, 0.36]);
  assert.equal(counterChance('NORMAL', 'COUNTER_PRESS_5S', 'KEEP_POSSESSION'), 0.022); // 0,08·0,7·0,4 = 0,0224
  assert.equal(counterChance('NORMAL', 'COUNTER_PRESS_5S', 'FAST_COUNTER'), 0.101); // 0,08·0,7·1,8 = 0,1008
  assert.equal(counterChance('MANY', 'DROP_BACK', 'KEEP_POSSESSION', 4), 0.096);    // 0,2·0,4·1,2 for fire FB/WB
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
  // Genpres hos taberen: 0,032 udløser ikke længere, 0,022 gør
  assert.equal(counters({ home: { p3: { onBallLost: 'COUNTER_PRESS_5S' } }, script: { 0.032: true } }).kinds.length, 0);
  assert.equal(counters({ home: { p3: { onBallLost: 'COUNTER_PRESS_5S' } }, script: { 0.022: true } }).kinds.length, 30);
  // Taberen på Mange: 0,2·0,4 = 0,08 (4-4-2 har LB og RB: ·1,1 → 0,088)
  assert.equal(counters({ home: { p1: { offBallRuns: 'MANY' } }, script: { 0.088: true } }).kinds.length, 30);
  // Reddet kontra: målmand 20 (10 + 4 + 1 < 20·1 + 4)
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
  // Du taber bolden på Mange: din back nævnes; på Normal intet om løb
  const many = counters({ home: { p1: { offBallRuns: 'MANY' } }, script: { 0.088: true } }).m.events.find((e) => e.type === 'GOAL').text;
  assert.match(many, /Din LB #\d+ .+ er højt oppe efter sit løb\./);
  const normal = counters({ script: { 0.032: true } }).m.events.find((e) => e.type === 'GOAL').text;
  assert.doesNotMatch(normal, /højt oppe|løb/);
  // Modstanderen på Mange taber bolden til dig: hans indstilling nævnes aldrig
  const opp = counters({ own: 'away', away: { p1: { offBallRuns: 'MANY' } }, script: { 0.088: true } });
  assert.ok(opp.m.events.filter((e) => e.type === 'GOAL').length > 0);
  for (const e of opp.m.events) assert.doesNotMatch(e.text, /højt oppe|løb uden bold|Mange/, e.text);
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
  assert.ok(v.length === 2 && v.every((g) => g.kind === 'VAR' && g.spectacle >= 7 && g.spectacle <= 12));
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
  // v3.9 med målmandsfordel 5: skytte FIN 10 mod MV 4 (+4, +5): 14 > 13 → mål; skytte 50 %: 8,75 + 4 < 13 → redning.
  // MV 5 mod FIN 10: 14 > 14 er falsk → redning; MV 50 %: 4,375 + 9 < 14 → mål.
  const run = (shFresh, gk, gkFresh) => {
    const { H, A } = arena();
    for (const p of mids(A)) p.skills.intercepting = 1;
    slot(H, 9).freshness = shFresh; Object.assign(slot(A, 0), { freshness: gkFresh }); slot(A, 0).skills.goalkeeping = gk;
    for (const b of A.squad.slice(11)) b.skills = SK(1); // udeholdet er en bot – ingen frisk afløser at rotere ind
    const m = simulateMatch(H, A, stubRng({ 0.48: true, 0.3: true }));
    return m.homeGoals;
  };
  assert.ok(run(100, 4, 100) >= 25); assert.equal(run(50, 4, 100), 0);
  assert.equal(run(100, 5, 100), 0); assert.ok(run(100, 5, 50) >= 25);
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
        const exp = (hi) => (hi + (pl.skills.pace - 10) * 0.4) * PRESS_HI[team.tactics.phases.phase2_defending.pressingHeight] * (0.8 + 0.2 * pl.freshness / 100);
        const slotRole = slotRoles(team)[e.slot];
        const hiSlot = RUN_HI(slotRole), hiLine = RUN_HI(null, pl.line);
        assert.ok(Math.abs(e.hiShare - exp(hiSlot)) <= 1.05, `${seed} indskifter på ${slotRole} (kæde ${pl.line}): ${e.hiShare} vs forventet ${exp(hiSlot).toFixed(1)}`);
        checked++; if (Math.abs(exp(hiSlot) - exp(hiLine)) >= 3) differing++;
      }
    }
  }
  assert.ok(checked >= 8 && differing >= 3, `for lidt data: ${checked} indskiftere, ${differing} hvor pladsen og kæden adskiller sig`);
});
