// Levende positioner (v3.12.1, brugeren: "Det her er ikke godt nok 'Spillerne står på deres
// plads, de bevæger sig ikke under kampen.' Vi måler hvor langt de løber i kampen … løbe uden
// bold"). Hvor holdets spillere står i netop dette øjeblik – i holdets egne koordinater (lille y =
// fremme ved modstanderens mål). Ét sted: modtagervalget og øjebliksbilledet ved mål bruger det.
// Udgangspunktet er den (evt. trukne) plads, så brugerens opstilling stadig betyder noget.
import { FORMATIONS, slotPosition, lineOfRole } from './formations.js';
import { RUNS_ROLES } from './ratings.js';

// Med bolden rykker holdet op pr. rolle; løb uden bold (holdets indstilling) skubber de samme
// roller, som løber flere km på "Mange" (RUNS_ROLES i ratings.js – én tabel, QC), ekstra frem.
// Uden bolden ligger holdet efter sit eget pres (+ = tilbage): lav blok trækker alle ned, højt
// gegenpres skubber midtbane og angreb op. En spiller, der vinder et løb uden bold, står RUN_STEP
// længere fremme end sin levende position (løbet regnes fra, hvor han er – aldrig baglæns).
export const ADVANCE = { CB: 14, FB: 20, MID: 16, ATT: 6 };
export const RUNS_PUSH = { FEW: -2, NORMAL: 0, MANY: 6 };
export const SHAPE = { LOW_BLOCK: { all: 10, front: 0 }, MID_BLOCK: { all: 0, front: 0 }, HIGH_GEGENPRESS: { all: 0, front: -12 } };
// Holdet forskydes mod boldsiden; ingen kommer længere frem end FRONT_LIMIT (målfeltet).
export const BALL_PULL = 0.3, FRONT_LIMIT = 8, RUN_STEP = 12;
const FB = new Set(['LB', 'RB', 'LWB', 'RWB']);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// tactics: holdets taktik i kampen (formation, trukne pladser, faser). attacking: holdet har bolden.
// ballX: hvor på banens bredde bolden er (i holdets egne koordinater). runner: pladsen på en spiller,
// der lige har vundet et løb uden bold. Returnerer 11 punkter.
export function livePositions(tactics, { attacking = true, ballX = 50, runner = -1 } = {}) {
  const coords = FORMATIONS[tactics.baseFormation] || FORMATIONS['4-4-2'];
  const ph = tactics.phases || {};
  const runs = RUNS_PUSH[ph.phase1_buildUp?.offBallRuns] ?? 0, shape = SHAPE[ph.phase2_defending?.pressingHeight] ?? SHAPE.MID_BLOCK;
  return coords.map((c, i) => {
    const base = slotPosition(tactics, i);
    if (i === 0) return { x: base.x, y: base.y };   // målmanden bliver i målet
    const line = lineOfRole(c.r);
    let y = base.y;
    if (attacking) {
      const adv = c.r === 'CB' ? ADVANCE.CB : FB.has(c.r) ? ADVANCE.FB : line === 'ATT' ? ADVANCE.ATT : ADVANCE.MID;
      y = base.y - adv - (RUNS_ROLES.has(c.r) ? runs : 0) - (i === runner ? RUN_STEP : 0);
    } else y = base.y + shape.all + (line === 'DEF' ? 0 : shape.front);
    return { x: Math.round(clamp(base.x + (ballX - 50) * BALL_PULL, 3, 97)), y: Math.round(clamp(y, FRONT_LIMIT, 95)) };
  });
}
