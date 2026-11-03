// Karakterarkets opstilling (ren logik uden DOM, så den kan unit-testes).
import { FORMATIONS, lineOfRole, ROLE_LABEL, roleLabel } from '../engine/formations.js';
import { LINE } from './labels.js';

const LINE_ORDER = { GK: 0, DEF: 1, MID: 2, ATT: 3 };
export const isStarter = (e) => e.minIn <= 1;

// Pladsen i startformationen (fx "DM"); en indskifter får pladsen, han kom ind på. Den
// naturlige kæde vises kun, når den afviger fra pladsens (en forsvarsspiller på en midtbaneplads).
// v3.31.2: pladskoden og kæden på dansk – "DM (FOR)", ikke "CDM (DEF)" (ROLE_LABEL i formations.js, kæden gennem LINE).
// Gamle runder uden plads (før v3.5) viser den gemte rolle – også den gennem tabellen: "MS", og en indskifter "ind (FOR)".
export function placeLabel(e, formation) {
  const c = e.slot != null && formation ? FORMATIONS[formation]?.[e.slot] : null, r = c?.r ?? null;
  if (!r) return oldRole(e.role);
  if (!isStarter(e)) return `ind på ${roleLabel(r)}`;
  return lineOfRole(r, c.y) !== e.line ? `${roleLabel(r)} (${LINE[e.line] ?? e.line})` : roleLabel(r);
}
function oldRole(role) {
  if (ROLE_LABEL[role]) return ROLE_LABEL[role];
  const sub = /^SUB \((GK|DEF|MID|ATT)\)$/.exec(role ?? '');
  return sub ? `ind (${LINE[sub[1]]})` : role;
}

// Opstillingsorden: startere efter plads (målmand → angreb), indskiftere til sidst efter
// kæde og indskiftningsminut. Rækker uden plads (gamle runder) sorteres som indskiftere.
const order = (e) => (isStarter(e) && e.slot != null ? e.slot : 100 + (LINE_ORDER[e.line] ?? 4) * 10 + e.minIn / 100);
export const lineupSort = (list) => list.slice().sort((a, b) => order(a) - order(b));
