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
