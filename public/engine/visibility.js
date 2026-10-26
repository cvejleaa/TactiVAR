// Hvem ser hvad – ÉT sted (docs/spec.md §3, CLAUDE.md "Spejlede/delte filer").
// UI, anti-spionage-tests og trin 2's Firestore-opdeling (public/private/secrets) bruger
// alle denne fil. I trin 1 er beskyttelsen visuel: alt ligger i browseren.

// Offentligt: alle i ligaen må se det (teams_public).
export const PUBLIC_FIELDS = ['id', 'name', 'shortName', 'shirtNumber', 'line', 'position', 'age', 'heightCm', 'freshness', 'injuryMatchesLeft', 'publicStars', 'roleTier', 'careerGames', 'lastMove',
  // Sæsonstatistik (v3.10): alt det, der står i referaterne – mål, oplæg, kort, MotM, dødboldmål.
  'sGames', 'sMinutes', 'sGoals', 'sAssists', 'sMotm', 'sYellow', 'sRed', 'sCleanSheets', 'sHeaderGoals', 'sPenaltyGoals', 'sSetPieceGoals'];
// Kun holdets ejer (teams_private).
export const OWNER_FIELDS = ['skills', 'jumpingPower', 'aerialPower', 'archetype', 'weeklyWage', 'trainingFocus', 'dev', 'lastRating', 'ratingSum', 'ratingGames', 'counterTactics', 'seasonAgeCounter', 'distanceSum', 'minutesSum', 'topSpeedMax', 'hiKmSum', 'hiDistSum', 'freeRunsSum', 'freeRunsWonSum'];
// Ingen spiller – kun motoren (teams_secrets).
export const SECRET_FIELDS = ['varProfile', 'potential'];   // potential (v3.18.0): ejeren ser kun et skøn i ord

// Den visning af en spiller, som en given seer har ret til. Felter seeren ikke må se,
// er helt fraværende i resultatet (ikke blot skjult i UI).
export function viewPlayer(player, viewerOwnsTeam) {
  const out = {};
  for (const k of PUBLIC_FIELDS) if (k in player) out[k] = player[k];
  if (viewerOwnsTeam) for (const k of OWNER_FIELDS) if (k in player) out[k] = player[k];
  // Kamphistorikken (v3.18.0) er offentlig – men karakteren (plads 7) kun for ejeren; andre ser kampens stjerner
  if (Array.isArray(player.matchLog)) out.matchLog = viewerOwnsTeam ? player.matchLog.map((e) => e.slice()) : player.matchLog.map((e) => e.map((v, i) => (i === 7 ? null : v)));
  return out;
}

// Karakterarket for én spiller set af en given seer: modstandere får kun stjerner – aldrig
// den eksakte karakter, mod-kunnen eller optjent XP.
// Løbedistance og topfart (v3.7) er også private: topfart røber farten (PAC), distance
// udholdenheden og holdets pres-niveau; andelen højintenst løb (v3.7.1) farten og presset.
export const RATING_PRIVATE_FIELDS = ['rating', 'startCounterMastery', 'gainedCounterXp', 'distanceKm', 'topSpeed', 'hiShare', 'hiKm', 'freeRuns', 'freeRunsWon'];
// Løb uden bold (v3.9) er private: de røber positionering og fart – og modstanderens indstilling.
export function viewRatingEntry(entry, viewerOwnsTeam) {
  if (viewerOwnsTeam) return { ...entry };
  const out = { ...entry };
  for (const k of RATING_PRIVATE_FIELDS) delete out[k];
  return out;
}

// Må seeren sortere/filtrere på dette felt for dette hold? (blokerer "sort-spoofing").
export function canSeeField(field, viewerOwnsTeam) {
  if (PUBLIC_FIELDS.includes(field)) return true;
  if (SECRET_FIELDS.includes(field)) return false;
  return viewerOwnsTeam;
}

// Holdtal i statistikken (v3.10, QC): sæsonsummer lægger støjen sammen væk, så tal, der følger en
// skjult indstilling, vises kun for dit eget hold – skud/xG (løb uden bold), kontraer (omstilling,
// løb, genpres), hjørnespark og VAR-tjek (høje bolde). Andre hold: det, der ikke røber en indstilling.
export const TEAM_STATS_PUBLIC = ['sMatches', 'possSum', 'fouls', 'foulsWon', 'yellows', 'reds', 'penalties', 'penaltyGoals', 'setPieceGoals', 'headerGoals', 'cleanSheets'];
// Hovedstødsmål er offentlige, fordi spillernes hovedstødsmål er det (summen kan regnes ud).
export const TEAM_STATS_OWNER = ['shots', 'onTarget', 'xg', 'freeKicks', 'corners', 'counterGoals', 'counterGoalsAgainst', 'varChecks'];
export function viewTeamStats(row, viewerOwnsTeam) {
  const out = { teamId: row.teamId, teamName: row.teamName };
  for (const k of TEAM_STATS_PUBLIC) out[k] = row[k];
  if (viewerOwnsTeam) for (const k of TEAM_STATS_OWNER) out[k] = row[k];
  return out;
}

// Kamprapporten (v3.14, match.ownReports[teamId]): spillet taktik start/slut og duel-tallene bag fuldtids-analysen.
// Kun holdets ejer – andres rapporter er fraværende i resultatet (klummen og fuldtids-analysen bruger kun seerens).
export const viewOwnReport = (match, viewerTeamId) => match?.ownReports?.[viewerTeamId] ?? null;

// Holdets egne forhold (v3.18.0): kasse, regnskab, transferliste, ungdomstilbud og bud ser kun ejeren – ÉN vagt (QC)
export const TEAM_OWNER_FIELDS = ['cashBalance', 'finance', 'listed', 'youthOffers', 'offers'];
export function viewTeam(team, viewerOwnsTeam) {
  const out = { ...team };
  if (!viewerOwnsTeam) for (const k of TEAM_OWNER_FIELDS) delete out[k];
  return out;
}
