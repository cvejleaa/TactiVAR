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

// Koblede linjer (v3.16, Spilførerens sæsongennemgang: angriberne stod bag modstanderens sidste forsvarer i ≈100 % af
// billederne – livePositions kender ikke modstanderen). Oven på holdenes egen form (livePositions, uændret):
//  - holdet med bolden: offside-linjen er modstanderens sidste markspiller; ingen står foran den (ONSIDE_GAP), undtagen
//    løberen, der har vundet sit løb (step frem fra sin plads – han ER sluppet igennem). Det er AFLEVERINGENS øjeblik;
//    afslutningens billede flytter skytten ind i feltet (match.js momentAt – QC: ét billede pr. øjeblik).
//  - holdet uden bold: rykkes som en blok hjem, så de forreste står PRESS_GAP[pres] foran boldholdets dybeste markspiller –
//    angrebet hele vejen, midtbanen det halve, forsvaret ikke (QC: et hårdt loft gjorde lav blok og gegenpres ens).
//    Springes over ved caught (kontra): det fangede hold står fremme i sin angrebsform.
// caught: holdet med bolden har lige vundet den (kontra) – det står i forsvarsform, modstanderen i angrebsform.
// Returnerer { ball, opp, line } – begge i hvert holds egne koordinater (lille y = ved modstanderens mål); line i boldholdets.
export const ONSIDE_GAP = 1;
export const PRESS_GAP = { LOW_BLOCK: 20, MID_BLOCK: 10, HIGH_GEGENPRESS: 2 };
const SHIFT_BY_LINE = { ATT: 1, MID: 0.5, DEF: 0, GK: 0 };
// ballOn/oppOn: hvilke pladser er besat (en udvist spillers plads er tom og tæller ikke som linjen) – standard alle.
export function coupledPositions(ballTactics, oppTactics, { ballX = 50, caught = false, runner = -1, step = RUN_STEP, ballOn = null, oppOn = null } = {}) {
  const ball = livePositions(ballTactics, { attacking: !caught, ballX });
  const opp = livePositions(oppTactics, { attacking: caught, ballX: 100 - ballX });
  const onO = (i) => !oppOn || oppOn[i], onB = (i) => !ballOn || ballOn[i];
  const line = 100 - Math.max(...opp.map((p, i) => (i > 0 && onO(i) ? p.y : -Infinity)));
  for (let i = 1; i < ball.length; i++) {
    if (i === runner) ball[i] = { x: ball[i].x, y: Math.round(clamp(ball[i].y - step, FRONT_LIMIT, 95)) };
    else ball[i] = { x: ball[i].x, y: Math.max(ball[i].y, line + ONSIDE_GAP) };
  }
  if (!caught) {
    const deepest = Math.max(...ball.map((p, i) => (i > 0 && i !== runner && onB(i) ? p.y : -Infinity)));
    const want = 100 - deepest + (PRESS_GAP[oppTactics.phases?.phase2_defending?.pressingHeight] ?? PRESS_GAP.MID_BLOCK);
    const front = Math.min(...opp.map((p, i) => (i > 0 && onO(i) ? p.y : Infinity))), shift = Math.max(0, want - front);
    const coords = FORMATIONS[oppTactics.baseFormation] || FORMATIONS['4-4-2'];
    // … og ingen står foran den ønskede presse-linje (en offensiv midtbanespiller i gegenpres rykkes kun det halve)
    for (let i = 1; i < opp.length; i++) opp[i] = { x: opp[i].x, y: Math.round(clamp(Math.max(want, opp[i].y + shift * (SHIFT_BY_LINE[lineOfRole(coords[i].r)] ?? 0)), FRONT_LIMIT, 95)) };
  }
  return { ball, opp, line };
}
