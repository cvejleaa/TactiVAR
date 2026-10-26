// Test-arenaer (v3.20.0): hver starter får sin plads' naturlige position, så "uden for position" (formations.js fitOf) er 1
// og de præcise duel-tal fra før v3.20 gælder. Tests AF positionsstraffen sætter selv positionerne.
import { FORMATIONS, positionOfRole } from '../../../public/engine/formations.js';
export function alignPositions(team) {
  const roles = (FORMATIONS[team.tactics.baseFormation] || FORMATIONS['4-4-2']).map((s) => s.r);
  team.tactics.lineupSlots.forEach((id, i) => { const p = team.squad.find((x) => x.id === id); if (p && roles[i]) p.position = positionOfRole(roles[i]); });
  return team;
}
