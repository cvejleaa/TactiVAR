// TactiVAR Avisen efter hver runde (v2.5b-paritet, docs/spec.md §6). Den lange klumme i
// fire afsnit er spec §10.3 og bygges ovenpå denne.
export function buildGazette(matches) {
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
  return { totalGoals, totalVarChecks, playerOfTheRound: players[0] || null, goalOfTheRound: goals[0] || null, defensiveAction: defensive, myResult };
}
