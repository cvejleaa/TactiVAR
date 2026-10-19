// Deterministiske tests af motorens enkelte beslutninger. En styret rng (stub) afgør hver
// sandsynlighed for sig, så en ændret bonus, tærskel eller sandsynlighed bliver rød –
// statistiske invarianter (summer, rækkefølge) kan ikke se den slags (Test Managers fund).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague, isArchetypeUnlocked, BOT_PROFILES, ARCHETYPES, defaultStarterIds } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';
import { commitRound, sortStandings } from '../../public/engine/season.js';
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
    Object.assign(ph.phase1_buildUp, { passingStyle: 'BALANCED', attackFocus: 'CENTRAL' }, o.p1);
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

// VAR (next = 0,1 < 0,22): varPulse + vsTrapLong·0,025 + 0,6 > forsvarer.positioning + 0,6.
function varRun(trap, { awayAttacks = false } = {}) {
  const { H, A } = arena();
  const [att, def] = awayAttacks ? [A, H] : [H, A];
  if (awayAttacks) for (const p of mids(A)) p.skills.passing = 11;
  const shooter = slot(att, 9);
  shooter.varProfile.varPulse = 10; shooter.counterTactics.vsTrapLong = trap;
  const d = slot(def, 1); d.skills.positioning = 11; d.skills.intercepting = 20;
  return { m: simulateMatch(H, A, stubRng({ 0.3: shots(2) }, 0.1)), shooter };
}
test('VAR: mod-kunnen mod VAR-linjen afgør (10 + 44·0,025 = 11,1 > 11; uden bonus 10 < 11)', () => {
  const ok = varRun(44).m, no = varRun(40).m; // 40·0,025 = 1,0 → 11,0 er ikke > 11
  assert.equal(ok.events.filter((e) => e.type === 'VAR_GOAL').length, 2);
  assert.equal(no.events.filter((e) => e.type === 'VAR_NO_GOAL').length, 2);
  assert.equal(ok.stats.hVarChecks, 2);
  assert.equal(ok.homeVarNet, 2); assert.equal(no.homeVarNet, -2);
  const { m: okM, shooter } = varRun(44);
  // Startkarakter ved rul 0,1: 6,5 + (0,03 − 0,15) = 6,38; + 2·1,3 = 8,98 → 9,0 (2·1,25 ville give 8,9)
  assert.equal(okM.ratings.home.find((x) => x.playerId === shooter.id).rating, 9);
});
test('VAR: fortegn på VAR-netto, når udeholdet angriber', () => {
  assert.equal(varRun(44, { awayAttacks: true }).m.homeVarNet, -2);
  assert.equal(varRun(40, { awayAttacks: true }).m.homeVarNet, 2);
});
test('VAR-tjek kun når rullet er under 0,22', () => {
  const { H, A } = arena();
  const m = simulateMatch(H, A, stubRng({ 0.3: shots(2) }, 0.22));
  assert.equal(m.stats.hVarChecks, 0);
});

test('afslutning: FIN + 4 > GK + 4; mål giver +1,25, oplæg +0,5, målmand −0,3', () => {
  const run = (fin) => { const { H, A } = arena(); slot(H, 9).skills.finishing = fin; slot(A, 0).skills.goalkeeping = 11; return { H, A, m: simulateMatch(H, A, stubRng({ 0.3: shots(2) })) }; };
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
test('bogføring: restitution 60–100, bænk +15, stjerner af snittet, mod-XP mod rigtig modstander, VAR-netto', () => {
  const L = createLeague(createRng(2));
  const [H, A] = L.teams;
  const [p, q, bench1, bench2] = [H.squad[0], H.squad[1], H.squad[11], H.squad[12]];
  p.skills.stamina = 10; p.freshness = 100; p.ratingSum = 16; p.ratingGames = 2;
  q.skills.stamina = 2; q.freshness = 61;
  bench1.freshness = 90; bench2.freshness = 70;
  const ctBefore = { ...p.counterTactics };
  const res = syntheticRound(L, { ratings: [{ playerId: p.id, rating: 5, gainedCounterXp: 10 }, { playerId: q.id, rating: 6, gainedCounterXp: 4 }] });
  commitRound(L, res, { next: () => 0.5 });
  assert.equal(p.freshness, 99);      // 100 − max(4, 14 − 5) + 8
  assert.equal(q.freshness, 60);      // 61 − 13 + 8 = 56 → gulv 60
  assert.equal(bench1.freshness, 100); assert.equal(bench2.freshness, 85);
  assert.equal(p.ratingSum, 21); assert.equal(p.ratingGames, 3); assert.equal(p.lastRating, 5);
  assert.equal(p.publicStars, starsFromRating(7)); // snit 21/3 = 7,0 → 3 stjerner (sidste karakter 5 ville give 1)
  assert.equal(p.publicStars, 3);
  assert.deepEqual(p.counterTactics, applyCounterXp(ctBefore, p.age, A, 10));
  const sH = L.leagueMetadata.standings.find((s) => s.teamId === H.id), sA = L.leagueMetadata.standings.find((s) => s.teamId === A.id);
  assert.equal(sH.varNet, 1); assert.equal(sA.varNet, -1);
  assert.equal(sH.points, 3); assert.equal(sA.lost, 1);
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
  assert.equal(p.aerialPower, Math.round(Math.max(1, Math.min(20, Math.round((p.heightCm - 168) * 0.7))) * 0.35 + p.jumpingPower * 0.35 + p.skills.strength * 0.15 + p.skills.positioning * 0.15));
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
