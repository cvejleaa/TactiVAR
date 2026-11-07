// Ændringer af eget holds taktik og opstilling – rene funktioner over holdobjektet, så de
// kan testes uden browser. UI'et kalder dem og gemmer bagefter.
import { FORMATIONS, clampPos, arrangeByFit, slotFitOf, slotPosition } from '../engine/formations.js';
import { clampSubsLimit } from '../engine/freshness.js';
import { MAX_RULES } from '../engine/match-rules.js';
import { autoMatchBench, validFocus, SQUAD_MAX, matchBenchOf } from '../engine/career.js';
import { windowOf } from '../engine/transfers.js';
import { lineupPairs, swapChanges, bandShifts } from '../engine/chemistry.js';

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
// Ét byt-sted (v3.19.0 – før tre kopier i app.js). a = den valgte (eller null), id = den, der klikkes på.
// Svar: 'deselect' (samme), 'swap' (en starter er med – swapPlayers), 'bench' (bænk ⇄ reserve – swapBench), 'select' (nyt valg).
export function swapKind(team, a, id) {
  if (a === id) return 'deselect';
  if (!a) return 'select';
  const slots = team.tactics.lineupSlots, benchIds = matchBenchOf(team).map((p) => p.id);
  if (slots.includes(a) || slots.includes(id)) return 'swap';
  return benchIds.includes(a) !== benchIds.includes(id) ? 'bench' : 'select';
}
export function pickForSwap(team, a, id) {
  const kind = swapKind(team, a, id), benchIds = matchBenchOf(team).map((p) => p.id);
  if (kind === 'swap') swapPlayers(team, a, id);
  if (kind === 'bench') swapBench(team, benchIds.includes(a) ? id : a, benchIds.includes(a) ? a : id);
  return kind;
}
// Byt-forhåndsvisningen (v3.32.3): hvad et byt a ⇄ b gør ved samspillet – simuleret med SAMME pickForSwap på en kopi af
// opstillingen og bænken (ingen anden byt-regel; QC). changes = præcis den 🤝-besked, der står efter selve byttet (swapChanges,
// højst 2 + "… og N til"); up/down = antal par, hvis bånd steg/faldt. null, når klikket ikke er et byt (vælg/fravælg).
export function swapPreview(team, ref, a, b) {
  const sim = { ...team, tactics: { ...team.tactics, lineupSlots: team.tactics.lineupSlots.slice() }, matchBench: Array.isArray(team.matchBench) ? team.matchBench.slice() : team.matchBench };
  const kind = pickForSwap(sim, a, b);
  if (kind !== 'swap' && kind !== 'bench') return null;
  // Tallene og beskeden af SAMME bandShifts (chemistry.js): et par med en skadet/udelukket tæller hverken op eller ned
  const before = lineupPairs(team, ref), after = lineupPairs(team, ref, sim.tactics.lineupSlots), sh = bandShifts(before, after);
  return { kind, up: sh.filter((x) => x.d > 0).length, down: sh.filter((x) => x.d < 0).length, changes: swapChanges(before, after) };
}
export function setAutoBench(team) { team.matchBenchAuto = true; autoMatchBench(team); return true; }

// Træningsfokus (v3.18.0): gælder, til det ændres. Massehandlingen springer dem over, fokusset ikke passer til (Målmand → kun MV)
export function setFocus(team, playerId, key) {
  const p = team.squad.find((x) => x.id === playerId);
  if (!p || !validFocus(p, key)) return false;
  p.trainingFocus = key; return true;
}
// Ungdomstilbud (v3.18.0): tag op (højst 25 i truppen; i minus intet optag – QC B5) eller lad gå. Svar: null = ok, ellers årsagen.
// v3.24.1 (Spilfører økonomi): en ungdomsspiller, der rykkes op, har samme karantæne som et køb – ellers en pengemaskine (tag begge
// tilbud, sæt til salg, tag buddene: ≈ 725.000 kr. pr. sæson uden løn og kampe). Samme regel som refillYouth (transfers.js).
export function takeYouth(team, id, league) {
  const i = (team.youthOffers ?? []).findIndex((y) => y.id === id);
  if (i < 0) return 'Tilbuddet er udløbet.';
  if (team.squad.length >= SQUAD_MAX) return `Truppen er fuld (${SQUAD_MAX} spillere).`;
  if ((team.cashBalance ?? 0) < 0) return 'Klubkassen er i minus – ingen optag, før den er i plus.';
  const y = team.youthOffers.splice(i, 1)[0];
  y.lastMove = windowOf(league);
  team.squad.push(y);
  if (team.matchBenchAuto !== false) autoMatchBench(team);
  return null;
}
export const dropYouth = (team, id) => { team.youthOffers = (team.youthOffers ?? []).filter((y) => y.id !== id); };
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

// Formationsskift (v3.20.0, brugerens valg): de samme 11 fordeles på de nye pladser efter position (formations.js arrangeByFit)
export function setFormation(team, formation) {
  if (!FORMATIONS[formation]) return false;
  const from = team.tactics.baseFormation;
  team.tactics.baseFormation = formation;
  team.tactics.customCoords = {};
  arrangeLineup(team, from);
  return true;
}
export function outOfPositionCount(team) {
  return team.tactics.lineupSlots.filter((id, i) => { const p = team.squad.find((x) => x.id === id); return p && slotFitOf(team.tactics, i, p.position) < 1; }).length;
}
// "Stil op efter position": de 11 på banen flyttes rundt, så flest står på deres naturlige position – ingen ind eller ud
export function arrangeLineup(team, from = team.tactics.baseFormation) {
  const byId = new Map(team.squad.map((p) => [p.id, p])), slots = team.tactics.lineupSlots;
  // Pladsernes TEGNEDE dybde i den formation, der stilles op i (v3.24.6 kanterne, v3.33.0 midten). Også ved et planskift (switchPreset):
  // den nye plans egne customCoords – samme som Hvis-Så til en plan (match.js refit med planens ys), så Taktik og kampen er enige (QC).
  // Et formationsskift (setFormation) har nulstillet customCoords, så dér er det ankrene.
  const ys = slots.map((_, i) => slotPosition(team.tactics, i).y);
  const next = arrangeByFit(slots.map((id) => byId.get(id) ?? null), team.tactics.baseFormation, from, ys).map((p, i) => p?.id ?? slots[i]);
  if (new Set(next).size !== slots.length) return false;
  const changed = next.some((id, i) => id !== slots[i]);
  team.tactics.lineupSlots = next;
  return changed;
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
  const from = team.tactics.baseFormation, refit = next.baseFormation !== from;
  team.tactics = next;
  if (refit) arrangeLineup(team, from);   // v3.20.0: en plan med en anden formation fordeler spillerne efter position
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
