// Sæsonstatistik til Liga-fanen (v3.10, brugeren: "Jeg vil gerne have noget statistik med på liga
// siden af al mulig slags" – plus "mål på hovedstød, straffe eller dødbolde. Antallet af frispark").
// Tælles fra league.statsFromRound: ældre runder er ikke gemt og kan ikke genskabes.
// Hvem der må se hvad, afgøres i visibility.js.
import { publicFacts, compactFacts } from './column.js';

// Pr. spiller (fladt på spilleren, så sanitize kan give standardværdier felt for felt).
export const PLAYER_SEASON_FIELDS = ['sGames', 'sMinutes', 'sGoals', 'sAssists', 'sMotm', 'sYellow', 'sRed', 'sCleanSheets', 'sHeaderGoals', 'sPenaltyGoals', 'sSetPieceGoals', 'freeRunsSum', 'freeRunsWonSum',
  // v3.33.1 (brugeren: "0 kampe, men alligevel … løbet km"): løbetallene for sæsonen – ved siden af karrierens distanceSum o.l.
  'sDistanceSum', 'sMinutesSum', 'sHiKmSum', 'sHiDistSum'];
export const PLAYER_SEASON_DEFAULTS = Object.fromEntries(PLAYER_SEASON_FIELDS.map((k) => [k, 0]));

// Pr. hold (på tabelrækken). Mål står allerede i tabellen og gentages ikke.
export const TEAM_STAT_FIELDS = ['sMatches', 'shots', 'onTarget', 'xg', 'possSum', 'fouls', 'foulsWon', 'freeKicks', 'corners', 'penalties', 'penaltyGoals', 'setPieceGoals', 'headerGoals', 'counterGoals', 'counterGoalsAgainst', 'varChecks', 'cleanSheets', 'yellows', 'reds'];
export const TEAM_STAT_DEFAULTS = Object.fromEntries(TEAM_STAT_FIELDS.map((k) => [k, 0]));

export const HISTORY_MAX = 60;
const SET_PIECE = new Set(['PENALTY', 'FREEKICK', 'CORNER', 'SETPIECE']);

// Bogfører én kamp: holdtal fra kampens statistik, spillertal fra karakterarket.
export function bookMatchStats(league, m) {
  const st = m.stats, stand = league.leagueMetadata.standings;
  const sides = [['h', 'a', m.homeId, m.ratings.home], ['a', 'h', m.awayId, m.ratings.away]];
  const players = new Map(league.teams.flatMap((t) => t.squad.map((p) => [p.id, p])));
  for (const [x, y, teamId, sheet] of sides) {
    const s = stand.find((r) => r.teamId === teamId);
    if (s) {
      s.sMatches++;
      s.shots += st[x + 'Shots'] ?? 0; s.onTarget += st[x + 'OnTarget'] ?? 0; s.xg += st[x + 'Xg'] ?? 0; // afrundes først i visningen
      s.possSum += Math.round(((st[x + 'Poss'] ?? 0) / Math.max(1, (st.hPoss ?? 0) + (st.aPoss ?? 0))) * 100);
      s.fouls += st[x + 'Fouls'] ?? 0; s.foulsWon += st[y + 'Fouls'] ?? 0; s.freeKicks += st[x + 'FreeKicks'] ?? 0;
      s.corners += st[x + 'Corners'] ?? 0; s.penalties += st[x + 'Penalties'] ?? 0; s.penaltyGoals += st[x + 'PenaltyGoals'] ?? 0;
      s.setPieceGoals += st[x + 'SetPieceGoals'] ?? 0; s.headerGoals += st[x + 'HeaderGoals'] ?? 0;
      s.counterGoals += st[x + 'CounterGoals'] ?? 0; s.counterGoalsAgainst += st[y + 'CounterGoals'] ?? 0;
      s.varChecks += st[x + 'VarChecks'] ?? 0;
      if ((x === 'h' ? m.awayGoals : m.homeGoals) === 0) s.cleanSheets++;
      s.yellows += sheet.reduce((a, e) => a + (e.yellows ?? (e.yellowCard ? 1 : 0)), 0);   // hvert gult kort (v3.15)
      s.reds += sheet.filter((e) => e.red).length;
    }
    for (const e of sheet) {
      const p = players.get(e.playerId);
      if (!p) continue;
      p.sGames++; p.sMinutes += Math.max(0, (e.minOut ?? 90) - (e.minIn ?? 1) + (e.minIn <= 1 ? 1 : 0));
      p.sGoals += e.goals ?? 0; p.sAssists += e.assists ?? 0;
      if (e.isMotM) p.sMotm++;
      p.sYellow += e.yellows ?? (e.yellowCard ? 1 : 0);
      if (e.red) p.sRed++;
      if (e.cleanSheet) p.sCleanSheets++;
      p.sHeaderGoals += e.headerGoals ?? 0; p.sPenaltyGoals += e.penaltyGoals ?? 0; p.sSetPieceGoals += e.setPieceGoals ?? 0;
      p.freeRunsSum += e.freeRuns ?? 0; p.freeRunsWonSum += e.freeRunsWon ?? 0;
    }
  }
}

// Én række pr. runde til "Ligaens forløb".
export function roundHistory(round, matches) {
  const kinds = {};
  let goals = 0, biggest = null, most = null;
  for (const m of matches) {
    const n = m.homeGoals + m.awayGoals, diff = Math.abs(m.homeGoals - m.awayGoals);
    goals += n;
    for (const g of m.goalsPool || []) kinds[g.kind] = (kinds[g.kind] ?? 0) + 1;
    const label = `${m.homeName} ${m.homeGoals}-${m.awayGoals} ${m.awayName}`;
    if (diff > 0 && (!biggest || diff > biggest.diff)) biggest = { diff, label };
    if (!most || n > most.goals) most = { goals: n, label };
  }
  const setPiece = Object.entries(kinds).filter(([k]) => SET_PIECE.has(k)).reduce((a, [, v]) => a + v, 0);
  // Resultaterne (v3.11) til kampprogrammet: hold-id og score pr. kamp.
  const results = matches.map((m) => ({ h: m.homeId, a: m.awayId, hG: m.homeGoals, aG: m.awayGoals }));
  // Offentlige tal pr. hold (v3.14) – klummens optakt-scouting af næste modstander ud fra hans seneste kampe.
  const facts = Object.assign({}, ...matches.map((m) => compactFacts(publicFacts(m))));
  return { round, matches: matches.length, goals, setPiece, kinds, biggest, most, results, facts };
}

// Løbetal pr. spiller – samme tal på spillerkortet og i "Dit hold" (én formel, så de ikke driver).
// scope 'career' = alle hans kampe (distanceSum …, nulstilles aldrig); 'season' = sæsonen (sDistanceSum …, v3.33.1 – fra
// league.runStatsFromRound). Topfarten findes kun for karrieren.
const RUN_KEYS = { career: ['distanceSum', 'minutesSum', 'hiKmSum', 'hiDistSum'], season: ['sDistanceSum', 'sMinutesSum', 'sHiKmSum', 'sHiDistSum'] };
export function runStats(p, scope = 'career') {
  const [dist, mins, hiKm, hiDist] = RUN_KEYS[scope].map((k) => p[k] ?? 0);
  return {
    km90: mins > 0 ? dist / mins * 90 : null,
    hiPct: hiDist > 0 ? Math.round(hiKm / hiDist * 100) : null,
    top: p.topSpeedMax > 0 ? p.topSpeedMax : null,
  };
}
