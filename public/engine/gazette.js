// TactiVAR Avisen efter hver runde (docs/spec.md §6). v3.7 (brugeren: "avisen er stadig
// kedelig"): overskrift pr. kamp, rundens overraskelse og dit holds løber. Den lange klumme i
// fire afsnit er spec §10.3 og bygges ovenpå denne.

// Overskrifter: tre varianter pr. udfald, valgt ud fra kampens tal (ingen tilfældighed).
const HEADLINES = {
  BIG: [(w, l, s) => `${w} knuser ${l} ${s}`, (w, l, s) => `Opvisning: ${w} sender ${l} hjem med ${s}`, (w, l, s) => `${l} får klø – ${w} vinder ${s}`],
  WIN: [(w, l, s) => `${w} slår ${l} ${s}`, (w, l, s) => `${w} snupper sejren mod ${l} (${s})`, (w, l, s) => `Tre point til ${w} efter ${s} mod ${l}`],
  DRAW0: [(h, a) => `Målløst mellem ${h} og ${a}`, (h, a) => `Taktisk skak: ${h} og ${a} deler 0-0`, (h, a) => `Ingen vinder – ${h} og ${a} spiller 0-0`],
  DRAW: [(h, a, s) => `Point deles: ${h} – ${a} ${s}`, (h, a, s) => `${h} og ${a} skilles ${s}`, (h, a, s) => `Uafgjort ${s} mellem ${h} og ${a}`],
};
export function headline(m, round = 0) {
  const hG = m.homeGoals, aG = m.awayGoals, pick = (list) => list[(hG * 7 + aG * 3 + round) % list.length];
  if (hG === aG) return hG === 0 ? pick(HEADLINES.DRAW0)(m.homeName, m.awayName) : pick(HEADLINES.DRAW)(m.homeName, m.awayName, `${hG}-${aG}`);
  const [w, l, s] = hG > aG ? [m.homeName, m.awayName, `${hG}-${aG}`] : [m.awayName, m.homeName, `${aG}-${hG}`];
  return pick(Math.abs(hG - aG) >= 3 ? HEADLINES.BIG : HEADLINES.WIN)(w, l, s);
}

// Hvilken kamp i runden et mål faldt i: matchIdx (fra v3.7.1), ellers kampens navn; −1 = ukendt.
export const goalMatchIdx = (goal, matches) => (!goal ? -1 : Number.isInteger(goal.matchIdx) ? goal.matchIdx : (matches || []).findIndex((m) => `${m.homeName} - ${m.awayName}` === goal.match));

export const GOAL_KIND_LABEL = { LONGSHOT: 'Langskud', DRIBBLE: 'Dribletur', COUNTER: 'Kontra', CUTBACK: 'Cutback', COMBINATION: 'Kombination', HEADER: 'Hovedstød', VAR: 'VAR-drama', PENALTY: 'Straffespark', FREEKICK: 'Frispark', CORNER: 'Hjørnespark', SETPIECE: 'Frisparksindlæg' };

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
  players.sort((a, b) => b.rating - a.rating || (b.goals * 2 + b.assists) - (a.goals * 2 + a.assists));
  goals.sort((a, b) => b.spectacle - a.spectacle);
  const my = matches[0];
  const myResult = my.homeGoals > my.awayGoals
    ? `${my.homeName} leverede et taktisk mesterstykke med ${my.homeGoals}-${my.awayGoals} over ${my.awayName}.`
    : my.homeGoals < my.awayGoals
      ? `Modstanderen ${my.awayName} lykkedes med deres kampplan og vandt ${my.awayGoals}-${my.homeGoals} over ${my.homeName}.`
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
    totalGoals, totalVarChecks, playerOfTheRound: players[0] || null, goalOfTheRound: goals[0] || null, defensiveAction: defensive, myResult,
    headlines: matches.map((m) => headline(m, round)), upset, myRunner,
  };
}
