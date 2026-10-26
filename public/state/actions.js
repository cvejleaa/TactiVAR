// Ændringer af eget holds taktik og opstilling – rene funktioner over holdobjektet, så de
// kan testes uden browser. UI'et kalder dem og gemmer bagefter.
import { FORMATIONS, clampPos } from '../engine/formations.js';
import { clampSubsLimit } from '../engine/freshness.js';
import { MAX_RULES } from '../engine/match-rules.js';
import { autoMatchBench, validFocus } from '../engine/career.js';

const IDENTITY = Array.from({ length: 11 }, (_, i) => i);

// Kamptruppen (v3.18.0): en reserve byttes med en bænkspiller (din udtagelse – automatikken slås fra), eller "Udtag automatisk"
export function swapBench(team, reserveId, benchId) {
  const bench = team.matchBench, on = new Set(team.tactics.lineupSlots);
  if (!Array.isArray(bench) || on.has(reserveId) || bench.includes(reserveId) || !team.squad.some((p) => p.id === reserveId)) return false;
  const i = bench.indexOf(benchId);
  if (i < 0) return false;
  bench[i] = reserveId; team.matchBenchAuto = false;
  return true;
}
export function setAutoBench(team) { team.matchBenchAuto = true; autoMatchBench(team); return true; }

// Træningsfokus (v3.18.0): gælder, til det ændres. Massehandlingen springer dem over, fokusset ikke passer til (Målmand → kun MV)
export function setFocus(team, playerId, key) {
  const p = team.squad.find((x) => x.id === playerId);
  if (!p || !validFocus(p, key)) return false;
  p.trainingFocus = key; return true;
}
export const setFocusMany = (team, ids, key) => ids.filter((id) => setFocus(team, id, key)).length;

// Bytter to spillere: to startere bytter plads; starter ⇄ bænk lader bænkspilleren overtage
// pladsen (og dens trukne position). To bænkspillere: intet sker.
export function swapPlayers(team, idA, idB) {
  const slots = team.tactics.lineupSlots;
  const a = slots.indexOf(idA), b = slots.indexOf(idB);
  if (idA === idB || (a < 0 && b < 0)) return false;
  if (a >= 0 && b >= 0) { slots[a] = idB; slots[b] = idA; }
  else if (a >= 0) slots[a] = idB;
  else slots[b] = idA;
  // Bænken (v3.18.0): den, der går ud, overtager indskifterens plads på bænken – bænk og startere overlapper aldrig (QC B2)
  if (Array.isArray(team.matchBench) && (a < 0 || b < 0)) {
    const inId = a < 0 ? idA : idB, outId = a < 0 ? idB : idA, i = team.matchBench.indexOf(inId);
    if (i >= 0) team.matchBench[i] = outId;
  }
  return true;
}

export function setFormation(team, formation) {
  if (!FORMATIONS[formation]) return false;
  team.tactics.baseFormation = formation;
  team.tactics.customCoords = {};
  return true;
}

// Målmanden (plads 0) kan ikke trækkes.
export function moveSlot(team, slot, pos) {
  if (slot <= 0 || slot > 10) return false;
  team.tactics.customCoords[slot] = clampPos(pos);
  return true;
}

export const resetDrag = (team) => { team.tactics.customCoords = {}; };

export function setPhase(team, phase, field, value) {
  team.tactics.phases[phase][field] = value;
}

// Plan A/B/C: den aktive taktik gemmes i sin plads, og den valgte hentes frem.
// Opstillingen (hvem der spiller) følger med holdet, ikke med planen.
export function switchPreset(team, fromIdx, toIdx) {
  if (fromIdx === toIdx) return false;
  team.tacticPresets[fromIdx] = structuredClone(team.tactics);
  const next = structuredClone(team.tacticPresets[toIdx]);
  next.lineupSlots = team.tactics.lineupSlots.slice();
  team.tactics = next;
  return true;
}

// Holdets udskiftningsgrænse (v3.13): på holdet, ikke i planen – planskift ændrer den ikke. 0 = fra.
export const setSubsLimit = (team, v) => { team.subsLimit = clampSubsLimit(v); };

export { MAX_RULES };
export function addRule(team) {
  const rules = team.tactics.conditionalRules;
  if (rules.length >= MAX_RULES) return false;
  rules.push({ ruleId: Math.max(0, ...rules.map((r) => r.ruleId)) + 1, minuteTrigger: 75, condition: 'LEADING', margin: 1, newFormation: '5-4-1', newPlan: null, slotRemapping: IDENTITY.slice(), action: 'SHIFT', subOut: null, subIn: null });
  return true;
}
export const updateRule = (team, i, patch) => Object.assign(team.tactics.conditionalRules[i], patch);

// Den aktive plan holdes lig med live-taktikken, så "Plan A" i en Hvis-Så-regel er
// præcis det, man ser på tavlen.
export function syncActivePreset(team, activeIdx) {
  team.tacticPresets[activeIdx] = structuredClone(team.tactics);
}
export const removeRule = (team, i) => team.tactics.conditionalRules.splice(i, 1);
