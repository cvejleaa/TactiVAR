// v3.14 Test Manager: kanarie med POSITIV tilladelsesliste. column.test.mjs' kanarie forgifter en NEGATIV liste
// (RATING_PRIVATE_FIELDS, text/label/varMsg/stats på events, desc/spectacle på mål, phases/customCoords) – så en læsning
// af noget, der ikke står på listen, slipper igennem: stats.hXg/hTacticSuccess/hVarChecks/hFreeKicks (røber skud-kvalitet,
// taktik-succes og indstillinger), m.injuries, m.homeVarNet, gazette.myRunner (km/topfart) og karakteren i gazetten. Her
// forgiftes ALT undtagen det, klummen må læse. Mutation: lad publicFacts/buildColumn læse st.hXg → kun denne test bliver rød.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { playRound, commitRound, pairRound, sortStandings } from '../../public/engine/season.js';
import { buildColumn, RATING_PUBLIC } from '../../public/engine/column.js';

function season(seed, rounds) {
  const rng = createRng(seed), L = createLeague(rng), out = [];
  for (let r = 0; r < rounds; r++) {
    const res = playRound(L, rng); commitRound(L, res, rng);
    const lr = L.lastRound, me = L.teams.find((t) => !t.isBot);
    out.push({ matches: lr.matches, gazette: lr.gazette, history: L.history.filter((x) => x.round >= L.seasonStartRound && x.round <= lr.round),
      table: sortStandings(L.leagueMetadata.standings).map((x) => ({ teamId: x.teamId, teamName: x.teamName, points: x.points })),
      next: pairRound(L).map(([h, a]) => ({ homeId: L.teams[h].id, homeName: L.teams[h].name, awayId: L.teams[a].id, awayName: L.teams[a].name })),
      viewerTeamId: me.id, round: lr.round });
  }
  return out;
}
let trips = 0;
const lock = (obj, allowed) => {
  if (!obj || typeof obj !== 'object') return;
  for (const k of Object.keys(obj)) if (!allowed.includes(k)) { trips++; Object.defineProperty(obj, k, { get() { throw new Error(`KANARIE: ${k}`); }, enumerable: true, configurable: true }); }
};
const STATS_OK = ['hPoss', 'aPoss', 'hShots', 'aShots', 'hOnTarget', 'aOnTarget', 'hCorners', 'aCorners', 'hAerialWon', 'aAerialWon', 'hYellows', 'aYellows'];
function poisoned(input) {
  const p = structuredClone(input);
  // structuredClone bevarer delte referencer (rundens mål ER en post i goalsPool, rundens spiller en karakterlinje): tag kopier FØR noget forgiftes
  if (p.gazette) for (const k of ['playerOfTheRound', 'goalOfTheRound', 'defensiveAction', 'upset']) if (p.gazette[k]) p.gazette[k] = { ...p.gazette[k] };
  for (const m of p.matches) {
    const owner = m.homeId === p.viewerTeamId ? 'home' : m.awayId === p.viewerTeamId ? 'away' : null;
    lock(m, ['homeId', 'awayId', 'homeName', 'awayName', 'homeGoals', 'awayGoals', 'events', 'goalsPool', 'ratings', 'stats', 'startFormations', 'endState', 'ownReports']);
    lock(m.stats, STATS_OK);
    for (const e of m.events) lock(e, ['type', 'category', 'min', 'isHome', 'hG', 'aG']);   // category: kun udførte Hvis-Så-skift tæller (QC F16)
    for (const g of m.goalsPool) lock(g, ['kind', 'min', 'scorer', 'teamName']);
    lock(m.ratings, ['home', 'away']);
    for (const side of ['home', 'away']) for (const e of m.ratings[side]) lock(e, RATING_PUBLIC);
    lock(m.endState.home, ['formation']); lock(m.endState.away, ['formation']);
    lock(m.ownReports, owner ? [p.viewerTeamId] : []);   // kun seerens egen rapport må røres
  }
  const g = p.gazette;
  if (g) {
    lock(g, ['playerOfTheRound', 'goalOfTheRound', 'defensiveAction', 'upset']);
    lock(g.playerOfTheRound, ['playerId', 'teamId']);
    lock(g.goalOfTheRound, []); lock(g.defensiveAction, []);
    lock(g.upset, ['winner', 'loser', 'winnerPos', 'loserPos', 'score']);
  }
  for (const r of p.history) lock(r, ['round', 'results', 'facts']);
  return p;
}
test('kanarie med tilladelsesliste: klummen læser kun de offentlige tal – intet andet på kampe, begivenheder, mål, karakterer, endState, rapporter, gazette og historik', () => {
  let n = 0;
  for (const seed of [11, 12]) for (const input of season(seed, 7)) {
    const clean = buildColumn(input);
    const p = poisoned(input);
    assert.throws(() => p.matches[0].stats.hXg, /KANARIE/);
    assert.throws(() => p.matches[0].injuries, /KANARIE/);
    assert.deepEqual(buildColumn(p), clean);
    n++;
  }
  assert.ok(n === 14 && trips > 5000, `forgiftede felter ${trips}`);
});
