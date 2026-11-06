// Karakterarkets opstilling (ren logik uden DOM, så den kan unit-testes).
import { FORMATIONS, lineOfRole, ROLE_LABEL, roleLabel, CENTRAL_ROLES, placeLabelOf } from '../engine/formations.js';
import { LINE } from './labels.js';

const LINE_ORDER = { GK: 0, DEF: 1, MID: 2, ATT: 3 };
export const isStarter = (e) => e.minIn <= 1;

// Pladsen i startformationen (fx "DM"); en indskifter får pladsen, han kom ind på. Den
// naturlige kæde vises kun, når den afviger fra pladsens (en forsvarsspiller på en midtbaneplads).
// v3.31.2: pladskoden og kæden på dansk – "DM (FOR)", ikke "CDM (DEF)" (ROLE_LABEL i formations.js, kæden gennem LINE).
// Gamle runder uden plads (før v3.5) viser den gemte rolle – også den gennem tabellen: "MS", og en indskifter "ind (FOR)".
// v3.33.0: startens rolle gemmes som den tegnede plads (match.js register/slotRoleOf) – så viser arket "CM→DM"; en indskifter
// viser formationens plads (hans tegnede dybde gemmes ikke – bevidst udeladt).
export function placeLabel(e, formation) {
  const c = e.slot != null && formation ? FORMATIONS[formation]?.[e.slot] : null, r = c?.r ?? null;
  if (!r) return oldRole(e.role);
  if (!isStarter(e)) return `ind på ${roleLabel(r)}`;
  // v3.33.0: en central plads, der blev spillet som en anden (den gemte rolle = den tegnede plads ved afspark): "CM→DM"
  const place = CENTRAL_ROLES.has(r) && CENTRAL_ROLES.has(e.role) ? placeLabelOf(r, e.role) : roleLabel(r);
  return lineOfRole(r, c.y) !== e.line ? `${place} (${LINE[e.line] ?? e.line})` : place;
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
