// De 10 grundformationer. x/y i procent af banen (y=90 er eget mål, y lav = angreb).
// Kilden (v2.5b) har GK og bagkæde; resten er fastsat i samme stil (docs/spec.md §4).
const F = (...slots) => slots.map(([r, x, y]) => ({ r, x, y }));
const GK = ['GK', 50, 90];
const BACK4 = [['LB', 15, 70], ['CB', 38, 73], ['CB', 62, 73], ['RB', 85, 70]];
const BACK3 = [['CB', 25, 72], ['CB', 50, 74], ['CB', 75, 72]];
const BACK5 = [['LWB', 12, 64], ['CB', 30, 73], ['CB', 50, 75], ['CB', 70, 73], ['RWB', 88, 64]];

export const FORMATIONS = {
  '4-4-2': F(GK, ...BACK4, ['LM', 15, 45], ['CM', 38, 48], ['CM', 62, 48], ['RM', 85, 45], ['ST', 38, 20], ['ST', 62, 20]),
  '4-3-3': F(GK, ...BACK4, ['CDM', 50, 55], ['CM', 32, 44], ['CM', 68, 44], ['LW', 18, 22], ['ST', 50, 16], ['RW', 82, 22]),
  '4-2-3-1': F(GK, ...BACK4, ['CDM', 36, 56], ['CDM', 64, 56], ['LM', 18, 36], ['CAM', 50, 34], ['RM', 82, 36], ['ST', 50, 15]),
  '3-5-2': F(GK, ...BACK3, ['LWB', 12, 46], ['CDM', 38, 54], ['CDM', 62, 54], ['RWB', 88, 46], ['CAM', 50, 36], ['ST', 38, 18], ['ST', 62, 18]),
  '3-4-3': F(GK, ...BACK3, ['LM', 15, 46], ['CM', 38, 50], ['CM', 62, 50], ['RM', 85, 46], ['LW', 20, 22], ['ST', 50, 16], ['RW', 80, 22]),
  '5-3-2': F(GK, ...BACK5, ['CM', 30, 48], ['CDM', 50, 54], ['CM', 70, 48], ['ST', 38, 20], ['ST', 62, 20]),
  '5-4-1': F(GK, ...BACK5, ['LM', 15, 44], ['CM', 38, 50], ['CM', 62, 50], ['RM', 85, 44], ['ST', 50, 18]),
  '4-1-4-1': F(GK, ...BACK4, ['CDM', 50, 58], ['LM', 15, 40], ['CM', 38, 44], ['CM', 62, 44], ['RM', 85, 40], ['ST', 50, 16]),
  '4-4-1-1': F(GK, ...BACK4, ['LM', 15, 46], ['CM', 38, 50], ['CM', 62, 50], ['RM', 85, 46], ['CF', 50, 30], ['ST', 50, 15]),
  '4-3-1-2': F(GK, ...BACK4, ['CM', 30, 50], ['CDM', 50, 56], ['CM', 70, 50], ['CAM', 50, 34], ['ST', 38, 17], ['ST', 62, 17]),
};
export const FORMATION_NAMES = Object.keys(FORMATIONS);

export const MAX_ANCHOR_RADIUS = 28;
export const PITCH_BOUNDS = { minX: 8, maxX: 92, minY: 8, maxY: 82 };

const DEF_ROLES = new Set(['LB', 'CB', 'RB', 'LWB', 'RWB']);
const MID_ROLES = new Set(['CDM', 'CM', 'LM', 'RM', 'CAM']);
// Hvilken kæde en rolle i formationen tilhører – motoren vælger spillere efter dette.
export function lineOfRole(r) {
  if (r === 'GK') return 'GK';
  if (DEF_ROLES.has(r)) return 'DEF';
  if (MID_ROLES.has(r)) return 'MID';
  return 'ATT';
}

// Uden for position (v3.20.0) – ÉN tabel for motor, opstilling og visning (spec §5). Formationens rolle → naturlig position;
// egen plads 100 %, naboplads 97,5 %, anden markplads 94 %, målmand ⇄ markspiller 85 % (ganges på duellerne i match.js ff).
// Kalibreret med tools/measure-position.mjs (4200 kampe): 8 mand på naboplads koster ud over ombytningen selv 0,58 mål pr. kamp
// med 95/88/75 (planens tal), 0,29 med 97,5/94/85 og 0,16 med 98,5/96/90 – brugerens "mildt" = ≈ 0,15 for 4-5 forkerte.
const ROLE_POSITION = { GK: 'GK', CB: 'CB', LB: 'FB', RB: 'FB', LWB: 'FB', RWB: 'FB', CDM: 'DM', CM: 'CM', LM: 'WM', RM: 'WM', LW: 'WM', RW: 'WM', CAM: 'AM', CF: 'AM', ST: 'ST' };
export const positionOfRole = (r) => ROLE_POSITION[r] ?? null;
export const FIT = { own: 1, near: 0.975, other: 0.94, keeper: 0.85 };
const NEAR = new Set(['CB-FB', 'CB-DM', 'FB-WM', 'DM-CM', 'CM-AM', 'CM-WM', 'AM-ST', 'AM-WM', 'WM-ST'].flatMap((k) => [k, k.split('-').reverse().join('-')]));
export function fitOf(position, role) {
  const want = positionOfRole(role);
  if (!position || !want || position === want) return FIT.own;
  if ((position === 'GK') !== (want === 'GK')) return FIT.keeper;
  return NEAR.has(`${position}-${want}`) ? FIT.near : FIT.other;
}
// De SAMME spillere fordelt på formationens pladser efter position (v3.20.0): den fordeling, der giver størst samlet fit
// (ungarsk metode – optimal og deterministisk; en grådig fordeling gav 4-2-3-1 7 i stedet for 2 uden for position). Ved lighed
// bliver en spiller stående. Målmanden står i mål, hvis der er en. players[i] = spilleren på plads i (null = tom plads).
// Bruges ved ny liga, migrering, formationsskift og "Stil op efter position".
// from = formationen før skiftet: ved lighed bliver en spiller på sin side (LB → LM, ikke RM) og helst på sin plads.
const sideOf = (r) => (r?.[0] === 'L' ? 'L' : r?.[0] === 'R' ? 'R' : 'C');
export function arrangeByFit(players, formation, from = formation) {
  const before = (FORMATIONS[from] || FORMATIONS['4-4-2']).map((s) => s.r), after = (FORMATIONS[formation] || FORMATIONS['4-4-2']).map((s) => s.r);
  return pickByFit(players, formation, () => 1, (i, slot) => (sideOf(before[i]) === sideOf(after[slot]) ? 4 : 0) + (i === slot ? 1 : 0));   // siden vejer mere end pladsnummeret (5-3-2: LM blev RWB)
}
// Vælg og fordel: de bedste 11 af kandidaterne efter score(p) × fit × kæde (en spiller kan sidde over). Målmand uden for mål og
// markspiller i mål kun, hvis der ikke er andre (−10). stays(i, slot) × 0,001 afgør ved lighed (side og plads).
const CHAIN_MISS = 0.85;
export function pickByFit(candidates, formation, score, stays = () => false) {
  const roles = (FORMATIONS[formation] || FORMATIONS['4-4-2']).map((s) => s.r), n = Math.max(candidates.length, roles.length);
  const value = (i, slot) => {
    const p = candidates[i]; if (!p || slot >= roles.length) return 0;
    const keeperMiss = (p.position === 'GK') !== (roles[slot] === 'GK');
    // Kæden først (motoren vælger efter kæde – en angriber på en stopperplads har angriberens evner): × 0,85 uden for kæden
    const chain = p.line && p.line !== lineOfRole(roles[slot]) ? CHAIN_MISS : 1;
    return (keeperMiss ? -10 : score(p) * fitOf(p.position, roles[slot]) * chain) + stays(i, slot) * 0.001;
  };
  const cost = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, slot) => -value(i, slot)));
  const slotOf = hungarian(cost, n), out = new Array(roles.length).fill(null);
  slotOf.forEach((slot, i) => { if (slot < roles.length) out[slot] = candidates[i] ?? null; });
  return out;
}
// Mindste samlede pris for en n×n-tildeling (rækker → kolonner). Klassisk O(n³) med potentialer.
function hungarian(c, n) {
  const u = new Array(n + 1).fill(0), v = new Array(n + 1).fill(0), p = new Array(n + 1).fill(0), way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i; let j0 = 0; const minv = new Array(n + 1).fill(Infinity), used = new Array(n + 1).fill(false);
    do {
      used[j0] = true; const i0 = p[j0]; let delta = Infinity, j1 = 0;
      for (let j = 1; j <= n; j++) if (!used[j]) {
        const cur = c[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= n; j++) if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const slotOf = new Array(n);
  for (let j = 1; j <= n; j++) slotOf[p[j] - 1] = j - 1;
  return slotOf;
}

export function clampPos({ x, y }) {
  const b = PITCH_BOUNDS;
  return { x: Math.max(b.minX, Math.min(b.maxX, x)), y: Math.max(b.minY, Math.min(b.maxY, y)) };
}

// Faktisk position for et slot: trukket position hvis den findes, ellers formationens anker.
export function slotPosition(tactics, slot) {
  const anchor = (FORMATIONS[tactics.baseFormation] || FORMATIONS['4-4-2'])[slot];
  const c = tactics.customCoords && tactics.customCoords[slot];
  return c ? { x: c.x, y: c.y } : { x: anchor.x, y: anchor.y };
}

export function anchorDistance(tactics, slot) {
  const anchor = (FORMATIONS[tactics.baseFormation] || FORMATIONS['4-4-2'])[slot];
  const p = slotPosition(tactics, slot);
  return Math.hypot(p.x - anchor.x, p.y - anchor.y);
}

export const isOutOfZone = (tactics, slot) => anchorDistance(tactics, slot) > MAX_ANCHOR_RADIUS;
