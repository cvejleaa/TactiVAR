// Taktisk mod-kunnen: spillernes erfaring mod modstanderens stilarter (docs/spec.md §7).
export const COUNTER_KEYS = ['vsPress', 'vsLowBlock', 'vsTrapLong'];
export const COUNTER_LABELS = { vsPress: 'Mod Gegenpress', vsLowBlock: 'Mod Lav Blok', vsTrapLong: 'Mod VAR-Linje & Lange Bolde' };
const DEFAULT_MASTERY = 25;

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function initialCounterTactics(rng, age, positioning) {
  const base = Math.round((age - 16) * 2.2 + positioning * 1.5);
  const roll = () => clamp(base + rng.int(-10, 11), 12, 75);
  return { vsPress: roll(), vsLowBlock: roll(), vsTrapLong: roll() };
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

// Primær stil +XP, sekundær +50 %, øvrige ruster −1 (bund 25 for ≥26 år, ellers 12). Returnerer ny værdi.
export function applyCounterXp(counterTactics, age, oppTeam, gain) {
  const { primary, secondary } = opponentTacticKeys(oppTeam);
  const floor = age >= 26 ? 25 : 12;
  const next = { ...counterTactics };
  for (const k of COUNTER_KEYS) {
    if (k === primary) next[k] = Math.min(100, next[k] + gain);
    else if (k === secondary) next[k] = Math.min(100, next[k] + Math.floor(gain * 0.5));
    else next[k] = Math.max(floor, next[k] - 1);
  }
  return next;
}
