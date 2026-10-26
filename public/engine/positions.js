// Levende positioner (v3.12.1, brugeren: "Det her er ikke godt nok 'Spillerne står på deres
// plads, de bevæger sig ikke under kampen.' Vi måler hvor langt de løber i kampen … løbe uden
// bold"). Hvor holdets spillere står i netop dette øjeblik – i holdets egne koordinater (lille y =
// fremme ved modstanderens mål). Ét sted: modtagervalget og øjebliksbilledet ved mål bruger det.
// Udgangspunktet er den (evt. trukne) plads, så brugerens opstilling stadig betyder noget.
import { FORMATIONS, slotPosition, lineOfRole } from './formations.js';
import { RUNS_ROLES, runBase } from './ratings.js';

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

// Bevægelse (v3.21.0, brugeren: "skal kortet passe til kilometerne, skal motoren flytte spillerne mere rundt i kampen … så
// må spillet også blive mere præcist"). Hver markspiller bevæger sig glidende om sin levende position: to bølger pr. akse med
// tilfældig fase og periode (DRIFT_PERIODS tick), en ren funktion af (kampens seed, hold, plads, tick) – samme sted i alle
// kald i samme tick, så modtagervalget, VAR-forreste, øjeblikket og grundbilledet ser det samme (QC: ingen rng pr. kald).
// Udslaget pr. akse følger rollen (DRIFT_AXES: backen langs linjen, CM i en boks, stopperen lidt) × rollens løb (runBase km,
// samme tabel som km-tallet) × holdets pres og løb. Ingen udholdenhed (brugeren: modstanderens kort må ikke røbe den).
export const DRIFT_AXES = {
  CB: [5, 5], LB: [5, 16], RB: [5, 16], LWB: [6, 18], RWB: [6, 18], CDM: [11, 10], CM: [14, 13], CAM: [12, 11],
  LM: [8, 17], RM: [8, 17], LW: [8, 16], RW: [8, 16], CF: [10, 8], ST: [8, 6],
};
export const DRIFT_PERIODS = [[6, 11], [2.5, 4]], DRIFT_MIX = [0.65, 0.35], DRIFT_KM = 10.6;
export const DRIFT_PRESS = { LOW_BLOCK: 0.85, MID_BLOCK: 1, HIGH_GEGENPRESS: 1.2 }, DRIFT_RUNS = { FEW: 0.9, NORMAL: 1, MANY: 1.15 };
const hash01 = (...k) => {
  let h = 2166136261;
  for (const v of k) { h ^= v | 0; h = Math.imul(h, 16777619); h ^= h >>> 13; h = Math.imul(h, 0x5bd1e995); h ^= h >>> 15; }
  return (h >>> 0) / 4294967296;
};
// drift: { seed, team, t } – udeladt (afspark, tests, værktøjer) = ingen bevægelse. Returnerer [dx, dy] i holdets koordinater.
export function driftAt(drift, role, slot, phases = {}) {
  const ax = DRIFT_AXES[role];
  if (!drift || !ax) return [0, 0];
  const f = (runBase(role).km / DRIFT_KM) * (DRIFT_PRESS[phases.phase2_defending?.pressingHeight] ?? 1) * (DRIFT_RUNS[phases.phase1_buildUp?.offBallRuns] ?? 1);
  return [0, 1].map((a) => ax[a] * f * DRIFT_PERIODS.reduce((sum, [lo, hi], w) => {
    const per = lo + (hi - lo) * hash01(drift.seed, drift.team, slot, a, w, 1), ph = 2 * Math.PI * hash01(drift.seed, drift.team, slot, a, w, 2);
    return sum + DRIFT_MIX[w] * Math.sin((2 * Math.PI * drift.t) / per + ph);
  }, 0));
}

// tactics: holdets taktik i kampen (formation, trukne pladser, faser). attacking: holdet har bolden.
// ballX: hvor på banens bredde bolden er (i holdets egne koordinater). runner: pladsen på en spiller,
// der lige har vundet et løb uden bold. Returnerer 11 punkter.
export function livePositions(tactics, { attacking = true, ballX = 50, runner = -1, drift = null } = {}) {
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
    const [dx] = driftAt(drift, c.r, i, ph);   // bredden her; dybden lægges på efter sammenpresningen (coupledPositions)
    return { x: Math.round(clamp(base.x + (ballX - 50) * BALL_PULL + dx, 3, 97)), y: Math.round(clamp(y, FRONT_LIMIT, 95)) };
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
// v3.21.0: med bevægelsen står flere tæt – skubbet gentages, til ingen står oven i hinanden (før 3 gennemløb)
export const SEPARATE_PASSES = 3, SEPARATE_ROUNDS = 4, ROW_MAX = 5;
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
  for (let pass = 0; pass < SEPARATE_PASSES; pass++) for (let a = 0; a < idx.length; a++) for (let b = a + 1; b < idx.length; b++) {
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
  for (let pass = 0; pass < SEPARATE_PASSES; pass++) for (const i of idx) for (const j of oidx) {
    const p = pts[i], q = { x: 100 - other[j].x, y: 100 - other[j].y };   // modspillerens plads i dette holds koordinater
    if (Math.hypot(p.x - q.x, p.y - q.y) >= MIN_APART) continue;
    let x = q.x + (p.x >= q.x ? 1 : -1) * MIN_APART;
    if (x < 3 || x > 97) x = q.x - (p.x >= q.x ? 1 : -1) * MIN_APART;
    pts[i] = { x: Math.round(x), y: p.y };
  }
  // v3.21.0: står han stadig for tæt (mange i bevægelse – skubbet ovenfor landede på den næste), flyttes han til den nærmeste
  // ledige plads på tværs – fri af modspillerne OG holdkammeraterne. Rører ikke billeder, hvor skubbet ovenfor slog til.
  const opps = oidx.map((j) => ({ x: 100 - other[j].x, y: 100 - other[j].y }));
  const clash = (i, x) => opps.some((q) => Math.hypot(x - q.x, pts[i].y - q.y) < MIN_APART) || [0, ...idx].some((k) => k !== i && Math.hypot(x - pts[k].x, pts[i].y - pts[k].y) < MIN_APART);
  for (const i of idx) {
    if (!clash(i, pts[i].x)) continue;
    for (let d = 1; d <= 60; d++) {
      const x = [pts[i].x - d, pts[i].x + d].find((v) => v >= 3 && v <= 97 && !clash(i, v));
      if (x != null) { pts[i] = { x, y: pts[i].y }; break; }
    }
  }
}
// Bevægelsen i dybden (v3.21.0) EFTER sammenpresningen: ellers presser squeeze de bevægede ind i samme bånd ved linjen (7 på en
// række). Grænserne holder billedet ærligt: boldholdet kommer ikke forbi offside-linjen (lo), og modstanderens dybeste bliver,
// hvor han stod (linjen er hans) – de andre kommer ikke bag ham (hi).
function applyDepth(pts, tactics, drift, idx, lo, hi, rowIdx = idx, fade = 0) {
  if (!drift) return;
  const coords = FORMATIONS[tactics.baseFormation] || FORMATIONS['4-4-2'], ph = tactics.phases || {};
  const a = Math.max(FRONT_LIMIT, lo), z = Math.min(95, hi);
  const at = (y0, dy) => { let y = y0 + dy; y = y < a ? a + (a - y) : y > z ? z - (y - z) : y; return Math.round(clamp(y, a, z)); };   // spejlet ved grænsen, ikke klemt: ellers står de på linjen i én række
  // fade: tæt på grænsen dæmpes udslaget i BEGGE retninger (boldholdets angribere holder linjen) – et spejl alene ville kun
  // sende dem bagud og give flere langskud (målt: langskud 8 → 14 % af målene)
  const damp = (i) => (fade ? clamp((pts[i].y - a) / fade, 0, 1) : 1);
  const y0 = new Map(idx.map((i) => [i, pts[i].y])), dys = new Map(idx.map((i) => [i, driftAt(drift, coords[i].r, i, ph)[1] * damp(i)]));
  for (const i of idx) pts[i] = { x: pts[i].x, y: at(y0.get(i), dys.get(i)) };
  // Ingen række på mere end ROW_MAX (v3.16.1-vagten): lander han i en fuld række, prøves den anden vej, det halve og dobbelte
  const row = (i, y) => rowIdx.filter((k) => k !== i && Math.abs(pts[k].y - y) <= 3).length + 1;
  for (let pass = 0; pass < 2; pass++) for (const i of idx) {
    if (row(i, pts[i].y) <= ROW_MAX) continue;
    const d = dys.get(i), best = [-d, d / 2, -d / 2, 0, 2 * d, -2 * d].map((k) => at(y0.get(i), k)).reduce((m, y) => (row(i, y) < row(i, m) ? y : m), pts[i].y);
    pts[i] = { x: pts[i].x, y: best };
    if (row(i, best) > ROW_MAX) for (let k = 1; k <= 15; k++) {   // stadig fuld: den nærmeste dybde med plads
      const toward = y0.get(i) < best ? -1 : 1, y = [best + toward * k, best - toward * k].find((v) => v >= a && v <= z && row(i, v) <= ROW_MAX);   // først mod hans plads – ikke altid bagud
      if (y != null) { pts[i] = { x: pts[i].x, y }; break; }
    }
  }
  // Holdet beholder sin dybde (MIN_DEPTH): ellers ingen bevægelse i dybden i dette billede
  const ys = rowIdx.map((i) => pts[i].y);
  if (Math.max(...ys) - Math.min(...ys) < MIN_DEPTH) for (const i of idx) pts[i] = { x: pts[i].x, y: y0.get(i) };
}
// ballOn/oppOn: hvilke pladser er besat (en udvist spillers plads er tom og tæller ikke som linjen) – standard alle.
export function coupledPositions(ballTactics, oppTactics, { ballX = 50, caught = false, runner = -1, step = RUN_STEP, ballOn = null, oppOn = null, ballDrift = null, oppDrift = null } = {}) {
  const ball = livePositions(ballTactics, { attacking: !caught, ballX, drift: ballDrift });
  const opp = livePositions(oppTactics, { attacking: caught, ballX: 100 - ballX, drift: oppDrift });
  const onO = (i) => !oppOn || oppOn[i], onB = (i) => !ballOn || ballOn[i];
  const outB = ball.map((p, i) => i).filter((i) => i > 0 && onB(i)), outO = opp.map((p, i) => i).filter((i) => i > 0 && onO(i));
  const line = 100 - Math.max(...outO.map((i) => opp[i].y));
  if (runner > 0) ball[runner] = { x: ball[runner].x, y: Math.round(clamp(ball[runner].y - step, FRONT_LIMIT, 95)) };
  const rest = outB.filter((i) => i !== runner);
  squeeze(ball, rest, line + ONSIDE_GAP);
  applyDepth(ball, ballTactics, ballDrift, rest, line + ONSIDE_GAP, 95, outB, SQUEEZE_SPAN);
  spread(ball, rest);
  if (!caught) {
    const deepest = Math.max(...rest.map((i) => ball[i].y));
    const want = 100 - deepest + (PRESS_GAP[oppTactics.phases?.phase2_defending?.pressingHeight] ?? PRESS_GAP.MID_BLOCK);
    squeeze(opp, outO, want, MIN_DEPTH);
  }
  // Modstanderens forreste kommer ikke forbi boldholdets bageste (trace-lines-vagten)
  const lastO = Math.max(...outO.map((i) => opp[i].y)), keep = outO.find((i) => opp[i].y === lastO), deepB = Math.max(...rest.map((i) => ball[i].y));
  applyDepth(opp, oppTactics, oppDrift, outO.filter((i) => i !== keep), 100 - deepB, lastO, outO);
  spread(opp, outO);
  // v3.21.0: skubbet fra en modspiller kan lande på en holdkammerat – gentaget, til begge dele holder
  for (let r = 0; r < SEPARATE_ROUNDS; r++) { apartFrom(ball, outB, opp, [0, ...outO]); spread(ball, outB); }
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
