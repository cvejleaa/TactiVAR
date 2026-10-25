// TactiVAR Avisen efter hver runde (docs/spec.md §6). v3.7 (brugeren: "avisen er stadig
// kedelig"): overskrift pr. kamp, rundens overraskelse og dit holds løber. Fra v3.14 skrives avisen
// som en klumme (column.js) ved visning; denne gemmer rundens byggesten (spiller, mål, overraskelse, løber).
import { headlineOf, publicFacts } from './column.js';
import { motmOrder } from './ratings.js';

// Overskrifter: tre varianter pr. udfald, valgt ud fra kampens tal (ingen tilfældighed) – ét sted, i klummen.
export const headline = (m, round = 0) => headlineOf(publicFacts(m), round);

// Hvilken kamp i runden et mål faldt i: matchIdx (fra v3.7.1), ellers kampens navn; −1 = ukendt.
export const goalMatchIdx = (goal, matches) => (!goal ? -1 : Number.isInteger(goal.matchIdx) ? goal.matchIdx : (matches || []).findIndex((m) => `${m.homeName} - ${m.awayName}` === goal.match));

export const GOAL_KIND_LABEL = { LONGSHOT: 'Langskud', DRIBBLE: 'Dribletur', COUNTER: 'Kontra', CUTBACK: 'Cutback', COMBINATION: 'Kombination', SCRAMBLE: 'Løs bold i feltet', HEADER: 'Hovedstød', VAR: 'VAR-drama', PENALTY: 'Straffespark', FREEKICK: 'Frispark', CORNER: 'Hjørnespark', SETPIECE: 'Frisparksindlæg' };

// positions: teamId → { pos, points } i tabellen FØR runden (tidligst runde 3).
export function buildGazette(matches, { positions = null, round = 0 } = {}) {
  let totalGoals = 0, totalVarChecks = 0;
  const players = [], goals = [];
  for (const m of matches) {
    totalGoals += m.homeGoals + m.awayGoals;
    totalVarChecks += m.stats.hVarChecks + m.stats.aVarChecks;
    players.push(...m.ratings.home, ...m.ratings.away);
    goals.push(...m.goalsPool);
  }
  players.sort(motmOrder);   // samme rangering som Kampens spiller (ratings.js, v3.15); en udvist kan ikke blive Rundens spiller
  goals.sort((a, b) => b.spectacle - a.spectacle);
  // Din kamp står først (pairRound); fra v3.11 kan du også være udehold.
  const my = matches[0];
  const away = my.ratings.away.some((e) => e.isUserTeam) && !my.ratings.home.some((e) => e.isUserTeam);
  const [me, opp, myG, oppG] = away ? [my.awayName, my.homeName, my.awayGoals, my.homeGoals] : [my.homeName, my.awayName, my.homeGoals, my.awayGoals];
  const myResult = myG > oppG
    ? `${me} leverede et taktisk mesterstykke med ${myG}-${oppG} over ${opp}${away ? ' på udebane' : ''}.`
    : myG < oppG
      ? `Modstanderen ${opp} lykkedes med deres kampplan og vandt ${oppG}-${myG} over ${me}.`
      : `En intens taktisk skakmat mellem ${my.homeName} og ${my.awayName} endte ${my.homeGoals}-${my.awayGoals}.`;
  const defensive = goals.length ? null : players.find((p) => p.saves > 0 || p.tacticWins > 0) || players[0];

  // Rundens overraskelse: vinderen stod mindst 3 pladser og 3 point under taberen før runden.
  let upset = null;
  if (positions) for (const m of matches) {
    if (m.homeGoals === m.awayGoals) continue;
    const [w, l] = m.homeGoals > m.awayGoals ? [[m.homeId, m.homeName], [m.awayId, m.awayName]] : [[m.awayId, m.awayName], [m.homeId, m.homeName]];
    const W = positions[w[0]], L = positions[l[0]];
    if (!W || !L) continue;
    const gap = W.pos - L.pos;
    if (gap >= 3 && L.points - W.points >= 3 && (!upset || gap > upset.gap)) upset = { gap, winner: w[1], winnerPos: W.pos, loser: l[1], loserPos: L.pos, score: `${Math.max(m.homeGoals, m.awayGoals)}-${Math.min(m.homeGoals, m.awayGoals)}` };
  }

  // Dit holds løber: kun dit eget hold (km og topfart er private – visibility.js).
  const mine = players.filter((p) => p.isUserTeam && p.distanceKm > 0).sort((a, b) => b.distanceKm - a.distanceKm)[0] || null;
  const myRunner = mine ? { playerId: mine.playerId, teamId: mine.teamId, shirtNumber: mine.shirtNumber, shortName: mine.shortName, distanceKm: mine.distanceKm, topSpeed: mine.topSpeed, hiShare: mine.hiShare } : null;

  return {
    totalGoals, totalVarChecks, playerOfTheRound: players.find((p) => !p.red) || null, goalOfTheRound: goals[0] || null, defensiveAction: defensive, myResult,
    headlines: matches.map((m) => headline(m, round)), upset, myRunner,
  };
}
