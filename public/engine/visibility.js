// Hvem ser hvad – ÉT sted (docs/spec.md §3, CLAUDE.md "Spejlede/delte filer").
// UI, anti-spionage-tests og trin 2's Firestore-opdeling (public/private/secrets) bruger
// alle denne fil. I trin 1 er beskyttelsen visuel: alt ligger i browseren.

// Offentligt: alle i ligaen må se det (teams_public).
export const PUBLIC_FIELDS = ['id', 'name', 'shortName', 'shirtNumber', 'line', 'age', 'heightCm', 'freshness', 'injuryMatchesLeft', 'publicStars', 'roleTier'];
// Kun holdets ejer (teams_private).
export const OWNER_FIELDS = ['skills', 'jumpingPower', 'aerialPower', 'archetype', 'weeklyWage', 'marketValue', 'lastRating', 'ratingSum', 'ratingGames', 'counterTactics', 'seasonAgeCounter'];
// Ingen spiller – kun motoren (teams_secrets).
export const SECRET_FIELDS = ['varProfile'];

// Den visning af en spiller, som en given seer har ret til. Felter seeren ikke må se,
// er helt fraværende i resultatet (ikke blot skjult i UI).
export function viewPlayer(player, viewerOwnsTeam) {
  const out = {};
  for (const k of PUBLIC_FIELDS) if (k in player) out[k] = player[k];
  if (viewerOwnsTeam) for (const k of OWNER_FIELDS) if (k in player) out[k] = player[k];
  return out;
}

// Må seeren sortere/filtrere på dette felt for dette hold? (blokerer "sort-spoofing").
export function canSeeField(field, viewerOwnsTeam) {
  if (PUBLIC_FIELDS.includes(field)) return true;
  if (SECRET_FIELDS.includes(field)) return false;
  return viewerOwnsTeam;
}
