// Taktisk mod-kunnen: spillernes erfaring mod modstanderens stilarter (docs/spec.md §7).
export const COUNTER_KEYS = ['vsPress', 'vsLowBlock', 'vsTrapLong'];
export const COUNTER_LABELS = { vsPress: 'Mod Gegenpress', vsLowBlock: 'Mod Lav Blok', vsTrapLong: 'Mod VAR-Linje & Lange Bolde' };
const DEFAULT_MASTERY = 15; // v3.6-skalaen (startværdier ca. 20)
// Man kan ikke være god mod alt (brugerens ønske, v3.6): de tre værdier deler en pulje.
export const COUNTER_POOL = 100; // højst ≈33 i snit (brugeren fandt 40–50 for højt); en specialist kan nå 90·5·5
export const counterFloor = (age) => (age >= 26 ? 15 : 5);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Startværdier (v3.6, sænket fra ca. 33 i snit / 12–75): ca. 20 i snit, 5–45.
export function initialCounterTactics(rng, age, positioning) {
  const base = Math.round((age - 16) * 1.2 + positioning * 0.8);
  const roll = () => clamp(base + rng.int(-8, 8), 5, 45);
  const ct = { vsPress: roll(), vsLowBlock: roll(), vsTrapLong: roll() };
  return fitPool(ct, COUNTER_KEYS.slice().sort((a, b) => ct[b] - ct[a]), counterFloor(age)); // den højeste barberes
}

// Holder summen inden for puljen: overskuddet trækkes fra nøglerne i rækkefølgen order,
// hver ned til bunden. Kan de ikke give nok, betaler den sidste nøgle (keep) selv resten.
export function fitPool(ct, order, floor, keep = null) {
  const next = { ...ct };
  let excess = COUNTER_KEYS.reduce((a, k) => a + next[k], 0) - COUNTER_POOL;
  for (const k of order) {
    if (excess <= 0) break;
    const take = Math.min(excess, Math.max(0, next[k] - floor));
    next[k] -= take; excess -= take;
  }
  if (excess > 0 && keep) next[keep] = Math.max(floor, next[keep] - excess);
  return next;
}

// Hvilke af modstanderens stilarter, der vejer tungest (kildens getOpponentPrimaryTacticKeys).
export function opponentTacticKeys(oppTeam) {
  const ph = oppTeam?.tactics?.phases;
  if (!ph) return { primary: 'vsPress', secondary: 'vsTrapLong', label: '4-4-2 • Ukendt' };
  const press = ph.phase2_defending.pressingHeight;
  const trap = ph.phase2_defending.offsideTrap;
  const pass = ph.phase1_buildUp.passingStyle;
  const focus = ph.phase1_buildUp.attackFocus;
  const longBalls = pass === 'DIRECT_LONG' || focus === 'HIGH_CROSSES';
  const parts = [];
  let primary;
  if (press === 'HIGH_GEGENPRESS') { primary = 'vsPress'; parts.push('Gegenpress'); }
  else if (press === 'LOW_BLOCK') { primary = 'vsLowBlock'; parts.push('Lav Blok'); }
  else { primary = longBalls ? 'vsTrapLong' : 'vsPress'; parts.push('Mellemblok'); }
  let secondary = primary;
  if (trap === 'EXTREME_VAR_LINE' || longBalls) { secondary = 'vsTrapLong'; parts.push(trap === 'EXTREME_VAR_LINE' ? 'VAR-Linje' : 'Lange Bolde'); }
  else if (press === 'LOW_BLOCK') secondary = 'vsLowBlock';
  return { primary, secondary, label: `${oppTeam.tactics.baseFormation} • ${parts.join(' + ')}` };
}

export function masteryVs(player, oppTeam) {
  if (!player?.counterTactics) return DEFAULT_MASTERY;
  const { primary, secondary } = opponentTacticKeys(oppTeam);
  const ct = player.counterTactics;
  return Math.round((ct[primary] ?? DEFAULT_MASTERY) * 0.65 + (ct[secondary] ?? DEFAULT_MASTERY) * 0.35);
}

// Erfaring for én kamp: 1–5 point efter spilletid, taktiske dueller og mål (v3.6; før 4–16,
// så en starter gik fra ~45 til ~70 på 3 runder – målt med tools/measure-duels.mjs).
export function counterXpForMatch({ minutesPlayed, tacticWins, goals }) {
  const xp = Math.round((minutesPlayed / 90) * (2 + tacticWins * 0.5 + (goals > 0 ? 1 : 0)));
  return clamp(xp, 1, 5);
}

// Primær stil +XP, sekundær +50 %, øvrige ruster −1 (bund 15 for ≥26 år, ellers 5). Summen
// holdes inden for COUNTER_POOL: erfaring mod én stil koster de andre. Returnerer ny værdi.
export function applyCounterXp(counterTactics, age, oppTeam, gain) {
  const { primary, secondary } = opponentTacticKeys(oppTeam);
  const floor = counterFloor(age);
  const next = { ...counterTactics };
  for (const k of COUNTER_KEYS) {
    if (k === primary) next[k] = Math.min(100, next[k] + gain);
    else if (k === secondary) next[k] = Math.min(100, next[k] + Math.floor(gain * 0.5));
    else next[k] = Math.max(floor, next[k] - 1);
  }
  // Overskud over puljen betales af den stil, der ikke blev trænet, derefter af den sekundære.
  const unused = COUNTER_KEYS.filter((k) => k !== primary && k !== secondary);
  return fitPool(next, [...unused, ...(secondary !== primary ? [secondary] : [])], floor, primary);
}
