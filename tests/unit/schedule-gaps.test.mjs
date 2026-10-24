// Test Manager v3.11: huller fundet ved mutationstest af kampprogram/sæsonslut. Hver test nævner
// den mutation, den dræber – de første versioner af schedule.test.mjs/state.test.mjs lod dem overleve.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { buildSchedule, isValidSchedule, shuffledIds, SEASON_ROUNDS } from '../../public/engine/schedule.js';
import { pairRound, endSeason, playRound, commitRound } from '../../public/engine/season.js';
import { buildGazette } from '../../public/engine/gazette.js';
import { normalizeLeague } from '../../public/engine/sanitize.js';
import { MIGRATIONS, parseSave } from '../../public/state/storage.js';

const IDS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const teamsOf = (ids) => ids.map((id) => ({ id }));

// ---------- schedule.js ----------
test('Berger-programmet er fastlagt: runde 1, 2 og 8 for a–h (retning og rækkefølge) – en bevidst ændring af algoritmen skal ændre disse tal', () => {
  // Dræber: rotationsretning (push/shift), hjemmebane-skift for det faste hold og for de øvrige par – alle giver et GYLDIGT program,
  // så de øvrige egenskabstests kan ikke se forskel.
  const s = buildSchedule(IDS);
  assert.deepEqual(s[0], [['a', 'h'], ['g', 'b'], ['c', 'f'], ['e', 'd']]);
  assert.deepEqual(s[1], [['g', 'a'], ['f', 'h'], ['b', 'e'], ['d', 'c']]);
  assert.deepEqual(s[7], [['h', 'a'], ['b', 'g'], ['f', 'c'], ['d', 'e']]);
});

test('isValidSchedule: 15 runder, byttede kampe mellem runder, par med forkert længde og ikke-lister afvises (og kaster aldrig)', () => {
  const teams = teamsOf(IDS), s = buildSchedule(IDS);
  // Dræber `length === SEASON_ROUNDS` → `>=`
  assert.equal(isValidSchedule([...s, s[0]], teams), false, '15 runder');
  // Dræber fjernelsen af per-runde-tjekket "hvert hold én gang": samme 56 kampe, men to kampe byttet mellem runde 1 og 2 → a spiller to gange i runde 1
  const swapped = structuredClone(s); [swapped[0][0], swapped[1][0]] = [swapped[1][0], swapped[0][0]];
  assert.equal(isValidSchedule(swapped, teams), false, 'kampe byttet mellem runder');
  // Dræber `seen.length === ids.size` (de andre tjek fanger kun for FÅ hold): et par med tre hold, hvor a står to gange, giver 9 pladser
  // men stadig 8 forskellige kendte hold og stadig 56 forskellige "kampe" (a>h tælles som før)
  const long = structuredClone(s); long[0][0] = ['a', 'h', 'a'];
  assert.equal(isValidSchedule(long, teams), false, 'par med tre hold');
  const short = structuredClone(s); short[0][0] = ['a'];
  assert.equal(isValidSchedule(short, teams), false, 'par med ét hold');
  // Dræber `pairs.length !== ids.size / 2`: runde 1 med 3 par (det sidste har fire hold) og runde 2 med 5 par (to med ét hold) –
  // hver runde har 8 forskellige kendte hold, og der er stadig 56 forskellige "kampe", så kun længdetjekket kan se det
  const uneven = structuredClone(s);
  uneven[0] = [s[0][0], s[0][1], [...s[0][2], ...s[0][3]]];
  uneven[1] = [s[1][0], s[1][1], ['b'], ['e'], s[1][3]];
  assert.equal(isValidSchedule(uneven, teams), false, '3 og 5 par');
  // Dræber fjernelsen af Array.isArray(pairs): en runde, der ikke er en liste, skal give false – ikke en TypeError
  for (const bad of [null, 'abcdefgh', { length: 4 }, 7]) {
    const x = structuredClone(s); x[3] = bad;
    assert.doesNotThrow(() => isValidSchedule(x, teams));
    assert.equal(isValidSchedule(x, teams), false, String(bad));
  }
  assert.equal(isValidSchedule(null, teams), false); assert.equal(isValidSchedule({}, teams), false);
  assert.equal(isValidSchedule(s, teams), true, 'og det gyldige program består stadig');
});

test('shuffledIds: en jævn blanding – hver plads får hvert hold lige ofte, og hold kan blive stående (ingen Sattolo)', () => {
  // Dræber `i > 0` → `i > 1` (første byt springes over: P(plads 0 = hold 0) = 1/4 i stedet for 1/8) og `rng * (i + 1)` → `rng * i`
  // (Sattolo: ingen holdet står på sin egen plads). 8000 deterministiske ligaer; observeret 940–1063 pr. celle, ventet 1000 – bånd 800–1200.
  const N = 8000, count = Array.from({ length: 8 }, () => new Array(8).fill(0));
  let withFixedPoint = 0;
  for (let k = 0; k < N; k++) {
    const teams = IDS.map((id, i) => ({ id, squad: [{ name: `Spiller ${k}-${i}` }, { name: `X${k * 7 + i}` }] }));
    const o = shuffledIds(teams);
    assert.deepEqual(o.slice().sort(), IDS, 'en permutation');
    o.forEach((id, pos) => count[pos][IDS.indexOf(id)]++);
    if (o.some((id, i) => id === IDS[i])) withFixedPoint++;
  }
  for (const row of count) for (const c of row) assert.ok(c > 800 && c < 1200, `celle ${c}`);
  assert.ok(withFixedPoint > N / 4);
});

// ---------- season.js ----------
test('pairRound: dit hold først, og de øvrige kampe i programmets rækkefølge (ikke omvendt)', () => {
  // Dræber `.reverse()` på resten og at resten ikke sorteres/ombyttes
  const L = createLeague(createRng(8)), idx = new Map(L.teams.map((t, i) => [t.id, i])), me = idx.get(L.teams.find((t) => !t.isBot).id);
  for (let r = 0; r < SEASON_ROUNDS; r++) {
    const want = L.schedule[r].map(([h, a]) => [idx.get(h), idx.get(a)]);
    const mine = want.filter((p) => p.includes(me)), rest = want.filter((p) => !p.includes(me));
    assert.deepEqual(pairRound(L), [...mine, ...rest], `runde ${r + 1}`);
    L.leagueMetadata.round++;
  }
});

test('endSeason: arkivet har den rigtige tabel, mester, din placering, topscorer og din bedste – med kendte, forskellige tal', async () => {
  const L = createLeague(createRng(5));
  const me = L.teams.find((t) => !t.isBot), bots = L.teams.filter((t) => t.isBot);
  const md = L.leagueMetadata;
  md.seasonNumber = 3; md.round = 28; L.seasonStartRound = 15; L.statsFromRound = 15;
  // Tabel i blandet rækkefølge: point 5..40, ens point (25) afgøres på målforskel, så på mål for
  const pts = new Map([[bots[0].id, 25], [bots[1].id, 25], [me.id, 40], [bots[2].id, 10], [bots[3].id, 5], [bots[4].id, 30], [bots[5].id, 15], [bots[6].id, 20]]);
  md.standings.forEach((s) => Object.assign(s, { played: 14, won: 1, drawn: 2, lost: 3, goalsFor: 10, goalsAgainst: 9, points: pts.get(s.teamId) }));
  md.standings.find((s) => s.teamId === bots[1].id).goalsFor = 20; // 25 point, +11 → foran bots[0] (+1)
  const sorted = [me, bots[4], bots[1], bots[0], bots[6], bots[5], bots[2], bots[3]]; // [40, 30, 25(+11), 25(+1), 20, 15, 10, 5]
  // Spillere: topscorer afgøres på oplæg (to med 9 mål); min bedste på kåringer, så mål
  const p = (team, i) => team.squad[i];
  for (const t of L.teams) for (const q of t.squad) Object.assign(q, { sGoals: 0, sAssists: 0, sMotm: 0, sGames: 0 });
  Object.assign(p(bots[0], 3), { sGoals: 9, sAssists: 1, sGames: 14, sMotm: 99 });
  Object.assign(p(bots[2], 4), { sGoals: 9, sAssists: 4, sGames: 14 }); // topscorer: samme mål, flest oplæg
  Object.assign(p(bots[3], 5), { sGoals: 2, sAssists: 20, sGames: 14 });
  Object.assign(p(me, 1), { sGames: 14, sMotm: 2, sGoals: 1, sAssists: 9 });
  Object.assign(p(me, 2), { sGames: 14, sMotm: 2, sGoals: 6, sAssists: 0 }); // min bedste: lige mange kåringer, flere mål
  Object.assign(p(me, 3), { sGames: 14, sMotm: 1, sGoals: 8, sAssists: 0 });
  Object.assign(p(me, 4), { sGames: 0, sMotm: 9, sGoals: 8, sAssists: 0 }); // spillede aldrig → ikke min bedste
  // Forløbet: kun runde 15–28 tæller (mål = rundenummer, 4 kampe pr. runde)
  L.history = [14, ...Array.from({ length: 14 }, (_, i) => 15 + i), 29].map((round) => ({ round, goals: round, matches: 4, kinds: {} }));
  delete L.seasons; // endSeason skal selv oprette arkivet
  // v3.16.3: den seneste sæsons tabelrække har VAR ± og holdtallene – med data, så en ombytning/udeladelse ses
  const myRow = md.standings.find((r) => r.teamId === me.id);
  Object.assign(myRow, { varNet: -3, shots: 41, cleanSheets: 6, reds: 2 });
  const s = endSeason(L, 28, true);
  const who = (t, q, goals, motm) => ({ playerId: q.id, teamId: t.id, teamName: t.name, shirtNumber: q.shirtNumber, shortName: q.shortName, goals, motm });
  assert.deepEqual(s.table.map((r) => r.teamId), sorted.map((t) => t.id), 'sorteret efter point, målforskel, mål for');
  const { TEAM_STAT_FIELDS } = await import('../../public/engine/stats.js');
  assert.deepEqual(s.table[0], { teamId: me.id, teamName: me.name, played: 14, won: 1, drawn: 2, lost: 3, goalsFor: 10, goalsAgainst: 9, points: 40,
    varNet: -3, ...Object.fromEntries(TEAM_STAT_FIELDS.map((k) => [k, myRow[k]])) });
  assert.deepEqual([s.table[0].shots, s.table[0].cleanSheets, s.table[0].reds], [41, 6, 2]);
  // Mesteren med det, der afgør (point → målforskel → mål for) – og nr. 2 (bots[4]: 30 point, +1, 10 mål)
  assert.deepEqual(s.champion, { teamId: me.id, teamName: me.name, points: 40, goalDiff: 1, goalsFor: 10, runnerUp: { teamName: bots[4].name, points: 30, goalDiff: 1, goalsFor: 10 } });
  assert.equal(s.myPos, 1);
  assert.deepEqual(s.topScorer, who(bots[2], p(bots[2], 4), 9, 0));
  assert.deepEqual(s.myBest, who(me, p(me, 2), 6, 2));
  assert.deepEqual([s.seasonNumber, s.fromRound, s.toRound, s.programmed], [3, 15, 28, true]);
  assert.equal(s.goals, (15 + 28) * 14 / 2, 'mål i runde 15–28, hverken 14 eller 29');
  assert.equal(s.matches, 56);
  assert.equal(L.seasons.length, 1); assert.equal(L.seasons[0], s);
  assert.equal(md.seasonNumber, 4); assert.equal(L.seasonStartRound, 29); assert.equal(L.statsFromRound, 29);
  assert.equal(L.history.length, 16, 'forløbet bevares');
  // Min placering er ikke 1, når jeg ikke er mester (dræber 0-baseret placering)
  const L2 = createLeague(createRng(6)), me2 = L2.teams.find((t) => !t.isBot);
  L2.leagueMetadata.standings.forEach((st) => { st.points = st.teamId === me2.id ? 3 : 9; st.goalsFor = st.goalsAgainst = 1; });
  L2.history = [];
  const s2 = endSeason(L2, 14, false);
  assert.equal(s2.myPos, 8); assert.equal(s2.programmed, false);
  assert.notEqual(s2.champion.teamId, me2.id);
  assert.equal(s2.topScorer, null, 'ingen mål → ingen topscorer (dræber p.sGoals >= 0)');
  assert.equal(s2.myBest, null, 'ingen har spillet → ingen bedste');
  assert.equal(s2.goals, 0);
  // seasonNumber mangler: sæson 2 efter slutningen
  const L3 = createLeague(createRng(7)); delete L3.leagueMetadata.seasonNumber;
  endSeason(L3, 14, true);
  assert.equal(L3.leagueMetadata.seasonNumber, 2);
});

// ---------- gazette.js ----------
test('avisen: uafgjort beskrives med hjemmeholdet først og dets mål først – også når du er udehold', () => {
  const m = (userAway) => ({
    homeId: 'h', awayId: 'a', homeName: 'Hjemmehold', awayName: 'Udehold', homeGoals: 2, awayGoals: 2, goalsPool: [], stats: { hVarChecks: 0, aVarChecks: 0 },
    ratings: { home: [{ isUserTeam: !userAway, rating: 6, goals: 0, assists: 0 }], away: [{ isUserTeam: userAway, rating: 6, goals: 0, assists: 0 }] },
  });
  for (const away of [false, true]) assert.equal(buildGazette([m(away)]).myResult, 'En intens taktisk skakmat mellem Hjemmehold og Udehold endte 2-2.');
});

// ---------- sanitize.js ----------
test('normalizeLeague: sæsonstart accepteres præcis fra "lige begyndt" til "sidste runde" – 14 runder efter start er for sent', () => {
  // Dræber `md.round + 1 - start` → `md.round - start`, `next >= 14` → `> 14` / `>= 15`, `next < 0` → `< -1`, fjernelsen af tjekkene og isInteger
  const run = (round, start) => { const L = createLeague(createRng(2)); L.leagueMetadata.round = round; L.seasonStartRound = start; return normalizeLeague(L).league.seasonStartRound; };
  assert.equal(run(0, 1), 1, 'første runde i sæson 1 (next = 0)');
  assert.equal(run(13, 1), 1, 'sidste runde i sæsonen (next = 13) røres ikke');
  assert.equal(run(14, 1), 15, 'next = 14: sæsonen er slut, ny starter ved runde 15');
  assert.equal(run(15, 1), 16, 'next = 15');
  assert.equal(run(14, 15), 15, 'lige afsluttet sæson (next = 0) røres ikke');
  assert.equal(run(27, 15), 15, 'sæson 2, sidste runde');
  assert.equal(run(28, 15), 29, 'sæson 2 er slut');
  assert.equal(run(0, 2), 1, 'start efter næste runde (next = -1) rettes');
  assert.equal(run(5, 20), 6, 'start langt ude i fremtiden rettes');
  assert.equal(run(5, undefined), 6, 'manglende start rettes'); assert.equal(run(5, '3'), 6, 'tekst som start rettes'); assert.equal(run(5, 2.5), 6, 'brøk rettes');
  // Arkivet oprettes, hvis det mangler – og røres ikke, hvis det findes
  const L = createLeague(createRng(2)); delete L.seasons;
  assert.deepEqual(normalizeLeague(L).league.seasons, []);
  const L2 = createLeague(createRng(2)); L2.seasons = [{ seasonNumber: 1 }];
  assert.deepEqual(normalizeLeague(L2).league.seasons, [{ seasonNumber: 1 }]);
});

// ---------- storage.js: migreringen 5 → 6 ----------
test('MIGRATIONS[5]: løfter til skema 6, bygger selv programmet, arkiverer kun når der er spillet, og tåler en liga uden hold', () => {
  const L0 = createLeague(createRng(4)); delete L0.schedule; delete L0.seasonStartRound; delete L0.seasons;
  // Frisk liga (runde 0): intet at arkivere, sæson 1 fortsætter. Dræber `> 0` → `>= 0` (tom sæson i arkivet) og fjernet seasonNumber-default.
  const fresh = MIGRATIONS[5]({ schemaVersion: 5, league: structuredClone(L0), notes: {} });
  assert.equal(fresh.schemaVersion, 6);
  assert.ok(isValidSchedule(fresh.league.schedule, fresh.league.teams), 'programmet bygges i selve migreringen, ikke først af sanitize');
  assert.deepEqual(fresh.league.schedule, buildSchedule(fresh.league.teams.map((t) => t.id)));
  assert.equal(fresh.league.seasonStartRound, 1);
  assert.equal((fresh.league.seasons || []).length, 0, 'ingen tom sæson 1 i arkivet');
  assert.equal(fresh.league.leagueMetadata.seasonNumber, 1);
  const noNum = structuredClone(L0); delete noNum.leagueMetadata.seasonNumber;
  assert.equal(MIGRATIONS[5]({ schemaVersion: 5, league: noNum }).league.leagueMetadata.seasonNumber, 1, 'manglende sæsonnummer → 1');
  noNum.leagueMetadata.round = 3; delete noNum.leagueMetadata.seasonNumber;
  assert.equal(MIGRATIONS[5]({ schemaVersion: 5, league: noNum }).league.leagueMetadata.seasonNumber, 2, 'efter arkivering af sæson 1 → 2');
  // Uden tabel eller uden hold: ingen undtagelse (dræber fjernelse af `Array.isArray(md.standings)` og `!L || !teams`-vagten)
  const noTable = structuredClone(L0); noTable.leagueMetadata.round = 3; delete noTable.leagueMetadata.standings;
  assert.doesNotThrow(() => MIGRATIONS[5]({ schemaVersion: 5, league: noTable }));
  assert.equal(MIGRATIONS[5]({ schemaVersion: 5, league: noTable }).schemaVersion, 6);
  for (const league of [undefined, null, {}, { teams: 'x' }]) {
    let out; assert.doesNotThrow(() => { out = MIGRATIONS[5]({ schemaVersion: 5, league }); }, JSON.stringify(league));
    assert.equal(out.schemaVersion, 6);
  }
  assert.equal(parseSave(JSON.stringify({ schemaVersion: 5, league: null })).ok, false, 'et gem uden liga afvises pænt');
});

test('commitRound: avisen og arkivet hører til samme sæson-slut; et gem midt i en sæson får ingen sæsonslut', () => {
  // Dræber `=== SEASON_ROUNDS` → `>= SEASON_ROUNDS - 1` (sæsonslut efter runde 13) – og at seasonEnd kun hænger på 14. runde
  const L = createLeague(createRng(12)), rng = createRng(12), ends = [];
  for (let r = 1; r <= 15; r++) {
    const res = playRound(L, rng); commitRound(L, res, rng);
    ends.push(!!res.gazette.seasonEnd);
    assert.equal(L.seasons.length, r >= 14 ? 1 : 0, `efter runde ${r}`);
  }
  assert.deepEqual(ends, [...Array(13).fill(false), true, false]);
});
