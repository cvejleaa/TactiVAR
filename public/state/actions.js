// Ændringer af eget holds taktik og opstilling – rene funktioner over holdobjektet, så de
// kan testes uden browser. UI'et kalder dem og gemmer bagefter.
import { FORMATIONS, clampPos } from '../engine/formations.js';

const IDENTITY = Array.from({ length: 11 }, (_, i) => i);

// Bytter to spillere: to startere bytter plads; starter ⇄ bænk lader bænkspilleren overtage
// pladsen (og dens trukne position). To bænkspillere: intet sker.
export function swapPlayers(team, idA, idB) {
  const slots = team.tactics.lineupSlots;
  const a = slots.indexOf(idA), b = slots.indexOf(idB);
  if (idA === idB || (a < 0 && b < 0)) return false;
  if (a >= 0 && b >= 0) { slots[a] = idB; slots[b] = idA; }
  else if (a >= 0) slots[a] = idB;
  else slots[b] = idA;
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

export const MAX_RULES = 5;
export function addRule(team) {
  const rules = team.tactics.conditionalRules;
  if (rules.length >= MAX_RULES) return false;
  rules.push({ ruleId: Math.max(0, ...rules.map((r) => r.ruleId)) + 1, minuteTrigger: 75, condition: 'LEADING_BY_1', newFormation: '5-4-1', slotRemapping: IDENTITY.slice() });
  return true;
}
export const updateRule = (team, i, patch) => Object.assign(team.tactics.conditionalRules[i], patch);
export const removeRule = (team, i) => team.tactics.conditionalRules.splice(i, 1);
