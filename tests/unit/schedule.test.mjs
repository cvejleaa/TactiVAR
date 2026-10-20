// Kampprogram og sæsonslut (v3.11, brugeren: "Kampprogram" – fast program, ingen modstandervalg).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { buildSchedule, isValidSchedule, SEASON_ROUNDS, seasonRoundOf } from '../../public/engine/schedule.js';
import { playRound, commitRound, pairRound, tableBefore } from '../../public/engine/season.js';
import { buildGazette } from '../../public/engine/gazette.js';
import { normalizeLeague } from '../../public/engine/sanitize.js';

const IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

test('Berger-program: 14 runder à 4 kampe, hvert hold én gang pr. runde, alle mødes to gange med byttet hjemmebane, 7 hjemme og 7 ude', () => {
  const s = buildSchedule(IDS);
  assert.equal(s.length, SEASON_ROUNDS);
  for (const pairs of s) { assert.equal(pairs.length, 4); assert.deepEqual(pairs.flat().sort(), IDS); }
  const meet = new Map();
  for (const [h, a] of s.flat()) meet.set(`${h}>${a}`, (meet.get(`${h}>${a}`) ?? 0) + 1);
  for (const x of IDS) for (const y of IDS) if (x !== y) assert.equal(meet.get(`${x}>${y}`), 1, `${x} hjemme mod ${y} præcis én gang`);
  for (const x of IDS) {
    const home = s.filter((ps) => ps.some(([h]) => h === x)).length;
    assert.equal(home, 7, `${x}: 7 hjemmekampe`);
    // Anden halvdel er første halvdel spejlet
    for (let r = 0; r < 7; r++) {
      const p1 = s[r].find((p) => p.includes(x)), p2 = s[r + 7].find((p) => p.includes(x));
      assert.deepEqual(p2, [p1[1], p1[0]]);
    }
    // Ingen lange stræk: højst 2 hjemme- eller udekampe i træk inden for hver halvdel
    for (const half of [s.slice(0, 7), s.slice(7)]) {
      let run = 0, last = null, max = 0;
      for (const ps of half) { const hm = ps.some(([h]) => h === x); run = hm === last ? run + 1 : 1; last = hm; max = Math.max(max, run); }
      assert.ok(max <= 2, `${x}: ${max} i træk`);
    }
  }
  assert.ok(isValidSchedule(s, IDS.map((id) => ({ id }))));
});

test('isValidSchedule afviser et program med en manglende runde, et hold to gange i samme runde, et ukendt hold eller en gentaget runde', () => {
  const teams = IDS.map((id) => ({ id }));
  const s = buildSchedule(IDS);
  assert.equal(isValidSchedule(s.slice(1), teams), false);
  const dup = structuredClone(s); dup[3][0] = [dup[3][1][0], dup[3][0][1]];
  assert.equal(isValidSchedule(dup, teams), false);
  const unknown = structuredClone(s); unknown[0][0][0] = 'z';
  assert.equal(isValidSchedule(unknown, teams), false);
  assert.equal(isValidSchedule(undefined, teams), false);
  const again = structuredClone(s); again[2] = again[3];
  assert.equal(isValidSchedule(again, teams), false, 'hver runde gyldig for sig, men to hold mødes tre gange');
});

test('ny liga: gyldigt program, blandet holdorden der er fast for samme liga (samme seed → samme program), sæson 1 fra runde 1', () => {
  const L = createLeague(createRng(3)), L2 = createLeague(createRng(3)), L3 = createLeague(createRng(4));
  assert.ok(isValidSchedule(L.schedule, L.teams));
  assert.deepEqual(L.schedule, L2.schedule);
  assert.notDeepEqual(L.schedule, buildSchedule(L.teams.map((t) => t.id)), 'holdorden blandet');
  assert.notDeepEqual(L.schedule[0], L3.schedule[0]);
  assert.equal(L.seasonStartRound, 1); assert.deepEqual(L.seasons, []);
});

test('pairRound følger programmet, og kampen med dit hold står først i alle 14 runder – mindst én gang som udehold', () => {
  const L = createLeague(createRng(8)), rng = createRng(8);
  const idx = new Map(L.teams.map((t, i) => [t.id, i])), me = L.teams.find((t) => !t.isBot).id;
  let away = 0;
  for (let r = 0; r < SEASON_ROUNDS; r++) {
    const pairs = pairRound(L);
    const want = L.schedule[r].map(([h, a]) => [idx.get(h), idx.get(a)]);
    assert.deepEqual(pairs.slice().sort(), want.slice().sort(), `runde ${r + 1} = programmet, samme retning`);
    assert.ok(pairs[0].includes(idx.get(me)), `runde ${r + 1}: din kamp først`);
    if (pairs[0][1] === idx.get(me)) away++;
    const res = playRound(L, rng);
    assert.deepEqual(res.matches.map((m) => [m.homeId, m.awayId]), pairs.map(([h, a]) => [L.teams[h].id, L.teams[a].id]), 'det spillede = det viste');
    commitRound(L, res, rng);
  }
  assert.equal(away, 7);
});

test('sæsonslut efter runde 14: tabel og sæsonstatistik arkiveres og nulstilles; spillere, friskhed og forløb bevares; runde 15 = programmets runde 1', () => {
  const L = createLeague(createRng(11)), rng = createRng(11);
  for (let r = 0; r < 13; r++) commitRound(L, playRound(L, rng), rng);
  assert.equal(L.leagueMetadata.seasonNumber, 1);
  const res = playRound(L, rng);
  commitRound(L, res, rng);
  // Lige før nulstillingen: et snapshot af det, der skal arkiveres, kan ikke tages her – men tabellen er gemt i arkivet
  const [s1] = L.seasons;
  assert.equal(L.seasons.length, 1);
  assert.equal(s1.seasonNumber, 1); assert.equal(s1.programmed, true); assert.equal(s1.fromRound, 1); assert.equal(s1.toRound, 14);
  assert.equal(s1.table.length, 8);
  assert.ok(s1.table.every((r) => r.played === 14), 'alle spillede 14');
  assert.equal(s1.table.reduce((a, r) => a + r.goalsFor, 0), s1.goals, 'mål i tabellen = mål i forløbet');
  assert.equal(s1.matches, 56);
  for (let i = 1; i < 8; i++) assert.ok(s1.table[i - 1].points >= s1.table[i].points, 'sorteret');
  assert.deepEqual(s1.champion, { teamId: s1.table[0].teamId, teamName: s1.table[0].teamName, points: s1.table[0].points });
  assert.equal(res.gazette.seasonEnd, s1, 'avisen har mesteren');
  assert.ok(s1.topScorer && s1.topScorer.goals > 0);
  assert.ok(s1.myPos >= 1 && s1.myPos <= 8);
  // Nulstillet
  assert.ok(L.leagueMetadata.standings.every((s) => s.played === 0 && s.points === 0 && s.sMatches === 0));
  assert.ok(L.teams.every((t) => t.squad.every((p) => p.sGames === 0 && p.sGoals === 0 && p.sCleanSheets === 0)));
  assert.equal(L.leagueMetadata.seasonNumber, 2); assert.equal(L.seasonStartRound, 15); assert.equal(L.statsFromRound, 15);
  // Bevaret
  assert.equal(L.history.length, 14); assert.ok(L.teams.some((t) => t.squad.some((p) => p.ratingGames > 0 && p.freshness < 100)));
  assert.equal(L.leagueMetadata.round, 14);
  // Næste runde er programmets runde 1
  const idx = new Map(L.teams.map((t, i) => [t.id, i]));
  assert.deepEqual(pairRound(L).slice().sort(), L.schedule[0].map(([h, a]) => [idx.get(h), idx.get(a)]).sort());
  assert.equal(seasonRoundOf(L, 15), 1);
  // Ingen "overraskelse" i sæsonens første to runder (tabellen er tom), først fra sæsonens runde 3
  assert.equal(tableBefore(L, 15), null); assert.equal(tableBefore(L, 16), null); assert.notEqual(tableBefore(L, 17), null);
  // Anden sæson slutter også
  for (let r = 0; r < 14; r++) commitRound(L, playRound(L, rng), rng);
  assert.equal(L.seasons.length, 2); assert.equal(L.seasons[1].fromRound, 15); assert.equal(L.seasons[1].toRound, 28);
});

// Avisen: fra v3.11 kan du være udehold – teksten må ikke kalde dig "modstanderen".
const fakeMatch = (homeName, awayName, hG, aG, userAway) => ({
  homeId: 'h', awayId: 'a', homeName, awayName, homeGoals: hG, awayGoals: aG, goalsPool: [], stats: { hVarChecks: 0, aVarChecks: 0 },
  ratings: { home: [{ isUserTeam: !userAway, rating: 6, goals: 0, assists: 0 }], away: [{ isUserTeam: userAway, rating: 6, goals: 0, assists: 0 }] },
});
test('avisen: din kamp beskrives fra dit holds side – også når du er udehold', () => {
  assert.equal(buildGazette([fakeMatch('Bot FC', 'Mine', 0, 2, true)]).myResult, 'Mine leverede et taktisk mesterstykke med 2-0 over Bot FC på udebane.');
  assert.equal(buildGazette([fakeMatch('Bot FC', 'Mine', 3, 1, true)]).myResult, 'Modstanderen Bot FC lykkedes med deres kampplan og vandt 3-1 over Mine.');
  assert.equal(buildGazette([fakeMatch('Mine', 'Bot FC', 2, 0, false)]).myResult, 'Mine leverede et taktisk mesterstykke med 2-0 over Bot FC.');
  assert.equal(buildGazette([fakeMatch('Mine', 'Bot FC', 0, 1, false)]).myResult, 'Modstanderen Bot FC lykkedes med deres kampplan og vandt 1-0 over Mine.');
});

test('normalizeLeague: et ødelagt program genskabes deterministisk, og en sæsonstart uden for sæsonen rettes til næste runde', () => {
  const L = createLeague(createRng(2));
  L.leagueMetadata.round = 20;
  L.seasonStartRound = 1; // runde 21 ville være sæsonens runde 21
  L.schedule[2] = L.schedule[3];
  const { league, problems } = normalizeLeague(L);
  assert.deepEqual(problems, []);
  assert.ok(isValidSchedule(league.schedule, league.teams));
  assert.deepEqual(league.schedule, buildSchedule(league.teams.map((t) => t.id)));
  assert.equal(league.seasonStartRound, 21);
  // Et gyldigt program og en gyldig sæsonstart røres ikke
  const L2 = createLeague(createRng(2)); L2.leagueMetadata.round = 9; L2.seasonStartRound = 1;
  const before = structuredClone(L2.schedule);
  normalizeLeague(L2);
  assert.deepEqual(L2.schedule, before); assert.equal(L2.seasonStartRound, 1);
});
