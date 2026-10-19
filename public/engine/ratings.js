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
    register(player, team, isHome, role, minIn, rng, oppMastery, slot = null, runRole = role) {
      if (entries[player.id]) return entries[player.id];
      const run = runProfile(player, team, rng, runRole);
      entries[player.id] = {
        playerId: player.id, shirtNumber: player.shirtNumber, shortName: player.shortName,
        teamId: team.id, teamName: team.name, isUserTeam: !team.isBot, isHome, role, line: player.line, slot,
        minIn, minOut: 90, rating: START_RATING + (rng.next() * 0.3 - 0.15), stars: 0,
        startCounterMastery: oppMastery, gainedCounterXp: 0,
        goals: 0, assists: 0, saves: 0, aerialWins: 0, tacticWins: 0, yellowCard: false, injured: false, isMotM: false,
        km90: run.km90, topSpeed: run.topSpeed, hiShare: run.hiShare, distanceKm: 0, hiKm: 0,
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

// Løb pr. 90 min og topfart (v3.7, brugeren: "hvor langt en spiller løber … og måske deres
// topfart"). Fra v3.8 efter PLADSEN i kampen (dokumentet "Spillerhøjde i Superligaen",
// fysisk belastning): central midtbane løber længst (12+ km), wingbacks og kanter har flest
// højintense løb, angribere/offensive færre km men eksplosive, midtstoppere færrest km.
// Udholdenhed og eget pres trækker op/ned; en ukendt rolle falder tilbage på kæden.
export const RUN_BY_ROLE = {
  GK: { km: 5.5, hi: 2 },
  CB: { km: 9.5, hi: 5 },
  LB: { km: 10.6, hi: 11 }, RB: { km: 10.6, hi: 11 },
  LWB: { km: 11.0, hi: 13 }, RWB: { km: 11.0, hi: 13 }, LM: { km: 11.0, hi: 13 }, RM: { km: 11.0, hi: 13 }, LW: { km: 11.0, hi: 13 }, RW: { km: 11.0, hi: 13 },
  CDM: { km: 11.8, hi: 8 }, CM: { km: 11.8, hi: 8 },
  CAM: { km: 10.8, hi: 10 }, CF: { km: 10.8, hi: 10 },
  ST: { km: 10.0, hi: 11 },
};
const RUN_BY_LINE = { GK: 'GK', DEF: 'CB', MID: 'CM', ATT: 'ST' };
export const runBase = (role, line) => RUN_BY_ROLE[role] ?? RUN_BY_ROLE[RUN_BY_LINE[line]] ?? { km: 10, hi: 8 };
const PRESS_RUN = { HIGH_GEGENPRESS: 1.06, MID_BLOCK: 1, LOW_BLOCK: 0.96 };
export function runProfile(player, team, rng, role) {
  const sta = player.skills?.stamina ?? 10, pac = player.skills?.pace ?? 10;
  const base = runBase(role, player.line);
  const press = PRESS_RUN[team.tactics?.phases?.phase2_defending?.pressingHeight] ?? 1;
  const km90 = base.km * (0.9 + sta * 0.01) * press * (0.96 + rng.next() * 0.08);
  const topSpeed = Math.round(clamp(25 + pac * 0.45 + (player.line === 'GK' ? -3 : 0) + (rng.next() * 2 - 1), 22, 36) * 10) / 10;
  // Andel højintenst løb (over ca. 20 km/t; v3.7.1, brugeren: "hvor stor en andel af deres løb
  // der er højintense løb"): rolle-basis, fart, pres og friskhed trækker op/ned,
  // ±1 %-point støj, klemt 1–20 %.
  const fresh = Math.max(0, Math.min(100, player.freshness ?? 100));
  const hiShare = Math.round(clamp((base.hi + (pac - 10) * 0.4) * (PRESS_HI[team.tactics?.phases?.phase2_defending?.pressingHeight] ?? 1) * (0.8 + 0.2 * fresh / 100) + (rng.next() * 2 - 1), 1, 20) * 10) / 10;
  return { km90, topSpeed, hiShare };
}
const PRESS_HI = { HIGH_GEGENPRESS: 1.15, MID_BLOCK: 1, LOW_BLOCK: 0.9 };

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
    // Løbedistance for spilletiden; rate pr. 90 min fjernes igen (den røber udholdenheden).
    e.distanceKm = Math.round(e.km90 * (Math.max(0, e.minOut - e.minIn) / 90) * 10) / 10;
    e.hiKm = Math.round(e.distanceKm * e.hiShare / 100 * 100) / 100;
    // For kort tid til en rigtig spurt eller en meningsfuld HI-andel (støj på få minutter).
    if (e.minOut - e.minIn < 10) { e.topSpeed = null; e.hiShare = null; e.hiKm = null; } // tæller heller ikke i sæsonens HI-andel
    delete e.km90;
    if (!best || e.rating > best.rating) best = e;
  }
  if (best) best.isMotM = true;
  return { home: all.filter((e) => e.isHome), away: all.filter((e) => !e.isHome), motm: best };
}
