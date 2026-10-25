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
//  - holdet med bolden: offside-linjen er modstanderens sidste markspiller; holdet presses SAMMEN, så den forreste står på
//    linjen (ONSIDE_GAP) og den bageste, hvor han stod – undtagen løberen, der har vundet sit løb (step frem fra sin plads –
//    han ER sluppet igennem). Det er AFLEVERINGENS øjeblik; afslutningens billede flytter skytten ind i feltet (match.js).
//  - holdet uden bold: presses sammen, så de forreste står PRESS_GAP[pres] foran boldholdets dybeste markspiller og
//    bagkæden, hvor den stod. Springes over ved caught (kontra): det fangede hold står fremme i sin angrebsform.
// v3.16.1 (brugeren: "2 spillere stående lige oven i hinanden … 7 spillere på midterlinjen"): lineær sammenpresning i stedet
// for klemning – rækkefølge og indbyrdes afstand bevares, så formationen kan genkendes; to fra samme hold, der står
// nærmere end MIN_APART (fx to trukne pladser), skubbes fra hinanden på tværs.
// caught: holdet med bolden har lige vundet den (kontra) – det står i forsvarsform, modstanderen i angrebsform.
// Returnerer { ball, opp, line } – begge i hvert holds egne koordinater (lille y = ved modstanderens mål); line i boldholdets.
export const ONSIDE_GAP = 1, MIN_APART = 6;
export const PRESS_GAP = { LOW_BLOCK: 20, MID_BLOCK: 10, HIGH_GEGENPRESS: 2 };
// Presser holdets markspillere (pladserne i idx) sammen foran 'to': de, der står inden for SQUEEZE_SPAN af linjen eller foran
// den, mappes lineært fra [forreste, to + SQUEEZE_SPAN] til [to, to + SQUEEZE_SPAN]; resten står, hvor de stod. Ingen foran
// 'to', rækkefølgen bevares, og kun de forreste rækker rykker (midtbanen bag angriberne flyttes kun lidt).
// Holdet beholder mindst MIN_DEPTH fra forreste til bageste (QC v3.16.1: ellers kunne et højt boldhold presse modstanderens
// blok sammen til én linje igen).
export const SQUEEZE_SPAN = 12, MIN_DEPTH = 18;
// minDepth kun for holdet uden bold: boldholdets forreste må aldrig rykke forbi linjen (offside).
function squeeze(pts, idx, to, minDepth = 0) {
  if (!idx.length) return;
  if (minDepth) to = Math.min(to, Math.max(...idx.map((i) => pts[i].y)) - minDepth);
  const front = Math.min(...idx.map((i) => pts[i].y)), edge = to + SQUEEZE_SPAN;
  if (front >= to) return;
  for (const i of idx) {
    if (pts[i].y >= edge) continue;
    const y = to + ((pts[i].y - front) * (edge - to)) / (edge - front);
    pts[i] = { x: pts[i].x, y: Math.round(clamp(y, FRONT_LIMIT, 95)) };
  }
}
// To fra samme hold må ikke stå oven i hinanden: den ene skubbes på tværs (deterministisk, efter pladsnummer).
function spread(pts, idx) {
  for (let pass = 0; pass < 3; pass++) for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) {
    const p = pts[idx[a]], q = pts[idx[b]];
    if (Math.hypot(p.x - q.x, p.y - q.y) >= MIN_APART) continue;
    const dir = q.x >= p.x ? 1 : -1, dx = Math.ceil((MIN_APART - Math.abs(q.x - p.x)) / 2);
    pts[idx[a]] = { x: Math.round(clamp(p.x - dir * dx, 3, 97)), y: p.y };
    pts[idx[b]] = { x: Math.round(clamp(q.x + dir * dx, 3, 97)), y: q.y };
  }
}
// Og ikke oven i en modspiller (QC v3.16.1: angriberen på linjen stod ofte på samme x som stopperen, han står ved): boldholdets
// spiller skubbes på tværs – kun x, så linjen og offside-billedet er uændrede.
// Ved sidelinjen skubbes han den anden vej; tre gennemløb, så et skub ikke lander oven i den næste modspiller.
export function apartFrom(pts, idx, other, oidx) {
  for (let pass = 0; pass < 3; pass++) for (const i of idx) for (const j of oidx) {
    const p = pts[i], q = { x: 100 - other[j].x, y: 100 - other[j].y };   // modspillerens plads i dette holds koordinater
    if (Math.hypot(p.x - q.x, p.y - q.y) >= MIN_APART) continue;
    let x = q.x + (p.x >= q.x ? 1 : -1) * MIN_APART;
    if (x < 3 || x > 97) x = q.x - (p.x >= q.x ? 1 : -1) * MIN_APART;
    pts[i] = { x: Math.round(x), y: p.y };
  }
}
// ballOn/oppOn: hvilke pladser er besat (en udvist spillers plads er tom og tæller ikke som linjen) – standard alle.
export function coupledPositions(ballTactics, oppTactics, { ballX = 50, caught = false, runner = -1, step = RUN_STEP, ballOn = null, oppOn = null } = {}) {
  const ball = livePositions(ballTactics, { attacking: !caught, ballX });
  const opp = livePositions(oppTactics, { attacking: caught, ballX: 100 - ballX });
  const onO = (i) => !oppOn || oppOn[i], onB = (i) => !ballOn || ballOn[i];
  const outB = ball.map((p, i) => i).filter((i) => i > 0 && onB(i)), outO = opp.map((p, i) => i).filter((i) => i > 0 && onO(i));
  const line = 100 - Math.max(...outO.map((i) => opp[i].y));
  if (runner > 0) ball[runner] = { x: ball[runner].x, y: Math.round(clamp(ball[runner].y - step, FRONT_LIMIT, 95)) };
  const rest = outB.filter((i) => i !== runner);
  squeeze(ball, rest, line + ONSIDE_GAP);
  spread(ball, rest);
  if (!caught) {
    const deepest = Math.max(...rest.map((i) => ball[i].y));
    const want = 100 - deepest + (PRESS_GAP[oppTactics.phases?.phase2_defending?.pressingHeight] ?? PRESS_GAP.MID_BLOCK);
    squeeze(opp, outO, want, MIN_DEPTH);
  }
  spread(opp, outO);
  apartFrom(ball, outB, opp, [0, ...outO]);   // også løberen og ved målmanden
  // Ved en erobring står det fangede hold i angrebsform: dets enlige angriber kan stå på boldholdets målmand (TM v3.16.1)
  // – og skubbet væk fra målmanden må han ikke lande på en forsvarer (v3.17.0: 5-3-2 → 4-4-2 gav to brikker oven i hinanden)
  if (caught) apartFrom(opp, outO, ball, [0, ...outB]);
  return { ball, opp, line };
}
// Afspark (v3.16.1, brugeren: "7 spillere stående på midterlinjen ved start"): holdet i sin forsvarsform, presset sammen
// ind i egen halvdel (forreste på KICKOFF_Y), så formationen kan genkendes.
export const KICKOFF_Y = 53, KICKOFF_OWN = 51;
export function kickoffPositions(tactics, on = null) {
  const pts = livePositions(tactics, { attacking: false, ballX: 50 });
  const idx = pts.map((p, i) => i).filter((i) => i > 0 && (!on || on[i]));
  squeeze(pts, idx, KICKOFF_Y, MIN_DEPTH);
  squeeze(pts, idx, KICKOFF_OWN);   // egen halvdel vinder over dybden (QC v3.16.1: en bagkæde trukket over y 71)
  spread(pts, idx);
  return pts;
}
