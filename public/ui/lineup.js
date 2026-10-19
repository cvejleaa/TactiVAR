// Karakterarkets opstilling (ren logik uden DOM, så den kan unit-testes).
import { FORMATIONS, lineOfRole } from '../engine/formations.js';

const LINE_ORDER = { GK: 0, DEF: 1, MID: 2, ATT: 3 };
export const isStarter = (e) => e.minIn <= 1;

// Pladsen i startformationen (fx "DM"); en indskifter får pladsen, han kom ind på. Den
// naturlige kæde vises kun, når den afviger fra pladsens (en forsvarsspiller på en midtbaneplads).
// Gamle runder uden plads (før v3.5) viser rollen, som den blev gemt.
export function placeLabel(e, formation) {
  const r = e.slot != null && formation ? FORMATIONS[formation]?.[e.slot]?.r : null;
  if (!r) return e.role;
  if (!isStarter(e)) return `ind på ${r}`;
  return lineOfRole(r) !== e.line ? `${r} (${e.line})` : r;
}

// Opstillingsorden: startere efter plads (målmand → angreb), indskiftere til sidst efter
// kæde og indskiftningsminut. Rækker uden plads (gamle runder) sorteres som indskiftere.
const order = (e) => (isStarter(e) && e.slot != null ? e.slot : 100 + (LINE_ORDER[e.line] ?? 4) * 10 + e.minIn / 100);
export const lineupSort = (list) => list.slice().sort((a, b) => order(a) - order(b));
