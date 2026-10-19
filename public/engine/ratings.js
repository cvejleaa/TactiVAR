// Kampkarakterer, stjerner og MotM (docs/spec.md §6).
export const RATING_MIN = 3.5;
export const RATING_MAX = 10;
export const START_RATING = 6.5;
export const STAR_LIMITS = [8.35, 7.25, 6.15, 5.15]; // ≥ grænse giver 5, 4, 3, 2 stjerner; ellers 1
const CLEAN_SHEET_ROLES = new Set(['GK', 'CB', 'LB', 'RB']);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function starsFromRating(rating, noise = 0) {
  if (!rating || rating <= 0) return 0;
  const v = rating + noise;
  const i = STAR_LIMITS.findIndex((lim) => v >= lim);
  return i === -1 ? 1 : 5 - i;
}

// Støj ±0,22, så en modstanders stjerner ikke afslører den eksakte karakter.
export const starNoise = (rng) => rng.next() * 0.44 - 0.22;

export function createSheet() {
  const entries = {};
  return {
    entries,
    register(player, team, isHome, role, minIn, rng, oppMastery, slot = null) {
      if (entries[player.id]) return entries[player.id];
      entries[player.id] = {
        playerId: player.id, shirtNumber: player.shirtNumber, shortName: player.shortName,
        teamId: team.id, teamName: team.name, isUserTeam: !team.isBot, isHome, role, line: player.line, slot,
        minIn, minOut: 90, rating: START_RATING + (rng.next() * 0.3 - 0.15), stars: 0,
        startCounterMastery: oppMastery, gainedCounterXp: 0,
        goals: 0, assists: 0, saves: 0, aerialWins: 0, tacticWins: 0, yellowCard: false, injured: false, isMotM: false,
      };
      return entries[player.id];
    },
    adjust(playerId, delta) {
      const e = entries[playerId];
      if (e) e.rating = clamp(e.rating + delta, RATING_MIN, RATING_MAX);
    },
    bump(playerId, field, n = 1) {
      const e = entries[playerId];
      if (e) e[field] += n;
    },
  };
}

// Afslutter karakterarket: clean sheet, afrunding, stjerner, XP-grundlag og MotM.
export function finalizeSheet(sheet, homeGoals, awayGoals, rng, xpFor) {
  const all = Object.values(sheet.entries);
  let best = null;
  for (const e of all) {
    const conceded = e.isHome ? awayGoals : homeGoals;
    if (conceded === 0 && CLEAN_SHEET_ROLES.has(e.role)) e.rating = clamp(e.rating + 0.5, RATING_MIN, RATING_MAX);
    e.rating = Math.round(e.rating * 10) / 10;
    e.stars = starsFromRating(e.rating, starNoise(rng));
    e.gainedCounterXp = xpFor({ minutesPlayed: Math.max(10, e.minOut - e.minIn), tacticWins: e.tacticWins, goals: e.goals });
    if (!best || e.rating > best.rating) best = e;
  }
  if (best) best.isMotM = true;
  return { home: all.filter((e) => e.isHome), away: all.filter((e) => !e.isHome), motm: best };
}
