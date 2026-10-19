// Kampmotoren (v2.5b-paritet, docs/spec.md §5). Ren funktion: holdene ændres ALDRIG –
// skader, observationer og karakterer returneres i resultatet og lægges ind af season.js.
// Rettet ift. v2.5b: auto-indskiftning sker i en kamplokal kopi (ændrede før lineupSlots
// permanent), og Hvis-Så-reglerne kører for begge hold og skifter reelt formation.
import { FORMATIONS, lineOfRole, isOutOfZone, slotPosition } from './formations.js';
import { masteryVs, counterXpForMatch } from './counter.js';
import { createSheet, finalizeSheet } from './ratings.js';
import { describeFinish, describeHeader, describeVarTiming, describeGoal, goalSpectacle } from './clues.js';

export const MAX_SUBS = 3;
const PLAN_LETTERS = ['A', 'B', 'C'];

// Hvis-Så-betingelse: "mindst N mål" bagud/foran (N = margin, 1–5), eller uafgjort.
export function ruleConditionMet(rule, own, opp) {
  const diff = own - opp, n = Math.max(1, rule.margin || 1);
  if (rule.condition === 'TRAILING') return diff <= -n;
  if (rule.condition === 'LEADING') return diff >= n;
  if (rule.condition === 'DRAW') return diff === 0;
  return false;
}
const coordsOf = (tactics) => FORMATIONS[tactics.baseFormation] || FORMATIONS['4-4-2'];
const tag = (p) => `#${p.shirtNumber} ${p.shortName}`;
// Danske navne på taktikvalg i referatet.
// Fase-duellen (v3.6, målt med tools/measure-duels.mjs): pres = INT + POS·0,85 + STA·0,35, så
// opbygning vinder ca. 55–60 % med neutrale stile (før: 96,8 % – presset kunne næsten aldrig vinde).
// Den rigtige mod-stil giver STYLE_BONUS; mod-kunnen (0–100) vejer MASTERY_WEIGHT pr. point.
export const STYLE_BONUS = 3;

// Kontra efter vundet pres (v3.9, brugeren: løb uden bold "vil koste i defensiven hvis en wb er
// løbet i position … og skal indregnes i modstanderens muligheder hvis de opsnapper bolden").
// Findes på ALLE trin (én kontra røber intet), dæmpes af taberens genpres og forstærkes af
// vinderens lynkontra. Hvert FB/WB-felt hos en taber på "Mange" løfter chancen 5 %.
const RUNS_LABEL = { FEW: 'Få', NORMAL: 'Normal', MANY: 'Mange' };
export const COUNTER_P = { FEW: 0.03, NORMAL: 0.08, MANY: 0.22 };
export const COUNTER_LOST = { COUNTER_PRESS_5S: 0.6, DROP_BACK: 1 };
export const COUNTER_WON = { FAST_COUNTER: 1.8, KEEP_POSSESSION: 0.4 };
export const COUNTER_FINISH_BONUS = 4;   // ubalanceret forsvar (kalibreres sammen med løbene)
export const CALM_BUILD_BONUS = 2;       // "Hold på bolden": næste opbygning sidder bedre
const FB_ROLES = new Set(['LB', 'RB', 'LWB', 'RWB']);
// Løb uden bold (v3.9, brugeren: "Alle kan være med til at løbe i position og afhængig af hvor
// man er på banen kan det blive til en dribletur, en aflevering (incl. tværaflevering) eller
// skud. Beslutningen kan også blive påvirket af spillerens evner til skud eller aflevering").
export const CHANCE_P = { FEW: 0.26, NORMAL: 0.3, MANY: 0.36 };
export const RUN_WEIGHT = {
  ST: { FEW: 3, NORMAL: 3, MANY: 3 }, WIDE: { FEW: 2, NORMAL: 2.5, MANY: 3 }, CM: { FEW: 1, NORMAL: 1.5, MANY: 2.5 },
  FB: { FEW: 0.2, NORMAL: 0.8, MANY: 2 }, CB: { FEW: 0.05, NORMAL: 0.1, MANY: 0.3 },
};
const RUN_GROUP = { ST: 'ST', CF: 'ST', LM: 'WIDE', RM: 'WIDE', LW: 'WIDE', RW: 'WIDE', CAM: 'WIDE', CM: 'CM', CDM: 'CM', LB: 'FB', RB: 'FB', LWB: 'FB', RWB: 'FB', CB: 'CB' };
export const runGroup = (role) => RUN_GROUP[role] ?? 'CM';
export const RUN_DUEL_BONUS = { FEW: -3, NORMAL: 0, MANY: 4 };
export const DRIBBLE_DEF_EDGE = 3;   // forsvareren står bedst i en én-mod-én (PAC+BAL ≈ 20 mod POS+STR·0,5 ≈ 15)
// Få = flere spillere bag bolden: modstanderens frispilningsløb er sværere at vinde.
export const RUN_COVER = { FEW: 5, NORMAL: 0, MANY: 0 };
export const RUN_FINISH_BONUS = 2;
// Målmandens fordel på almindelige afslutninger (v3.9): holder ligaens målniveau, efter at
// løbene og de rigtige kontraer kom til (kalibreret med `node tools/measure-duels.mjs N loeb`).
export const KEEPER_EDGE = 0;
// Dødbolde (v3.10, brugeren: "mål på hovedstød, straffe eller dødbolde. Antallet af frispark").
// Kun til holdet med bolden i en tick uden boldtab. Pr. tick: straffe 1,1 %, frispark i skudafstand
// 4,3 % (37 % direkte skud, ellers indlæg); hjørnespark efter redning/clearet luftduel 47 %;
// "stille" frispark (kun talt) 58 %. Kalibreret med `node tools/measure-duels.mjs N`.
export const PENALTY_P = 0.011, FREEKICK_P = 0.061, FK_SHOT_P = 0.37, CORNER_P = 0.9, QUIET_FOUL_P = 0.58;
export const PENALTY_BONUS = 2.3, FK_SHOT_EDGE = 4, SETPIECE_DEF_EDGE = 0.5;
// Zonen er der, løbet ender: formationens (eller den trukne) plads rykket 20 frem.
export function runZone(pos) {
  const y = pos.y - 20;
  return pos.x < 28 || pos.x > 72 ? 'WIDE' : y >= 60 ? 'DEEP' : y <= 35 ? 'HIGH' : 'MID';
}
// Beslutningens vægte: skud ~ FIN, aflevering ~ PAS (fra kanten et indlæg/tværaflevering),
// dribletur ~ (PAC+BAL)/2 – ganget med hvor godt zonen egner sig.
export const DECISION_ZONE = {
  SHOT: { WIDE: 1, DEEP: 0.6, MID: 1.5, HIGH: 3 },
  PASS: { WIDE: 3, DEEP: 2.5, MID: 1.5, HIGH: 1 },
  DRIBBLE: { WIDE: 2, DEEP: 0.5, MID: 1.5, HIGH: 1 },
};
// Evnen tæller over et gulv på 6 (min. 0,5), så en back med afslutning 5 hellere afleverer.
const over6 = (v) => Math.max(0.5, v - 6);
export function decisionWeights(sk, zone, cutbackFocus = false) {
  return {
    SHOT: over6(sk.finishing) * DECISION_ZONE.SHOT[zone],
    PASS: over6(sk.passing) * DECISION_ZONE.PASS[zone] * (cutbackFocus && zone === 'WIDE' ? 1.3 : 1),
    DRIBBLE: over6((sk.pace + sk.ballControl) / 2) * DECISION_ZONE.DRIBBLE[zone],
  };
}

export function counterChance(runs, onBallLost, onBallWon, fbCount = 0) {
  const p = (COUNTER_P[runs] ?? COUNTER_P.NORMAL) * (COUNTER_LOST[onBallLost] ?? 1) * (COUNTER_WON[onBallWon] ?? 1) * (runs === 'MANY' ? 1 + 0.05 * fbCount : 1);
  return Math.round(p * 1000) / 1000;
}
export const MASTERY_WEIGHT = 0.05;
// Dine egne valg i referatet (grammatisk rigtigt i en sætning om dit hold).
const YOUR_PASS = { SHORT: 'Dine korte pasninger', BALANCED: 'Din balancerede opbygning', DIRECT_LONG: 'Dine direkte lange bolde' };
const YOUR_PRESS = { LOW_BLOCK: 'din lave blok', MID_BLOCK: 'din mellemblok', HIGH_GEGENPRESS: 'dit høje gegenpres' };
const cap = (t) => t[0].toUpperCase() + t.slice(1);
const TXT = { SHORT: 'korte pasninger', BALANCED: 'balanceret opbygning', DIRECT_LONG: 'direkte lange bolde', LOW_BLOCK: 'lav blok', MID_BLOCK: 'mellemblok', HIGH_GEGENPRESS: 'højt gegenpress' };
const isAvailable = (p) => !(p.injuryMatchesLeft > 0);
// Friskhed virker (v3.7): en træt spiller yder 0,75 + 0,25·friskhed/100 (75 % → 93,75 %,
// 50 % → 87,5 %) – stærkt nok til, at det betaler sig at hvile en meget træt spiller.
export const freshFactor = (p) => 0.75 + 0.25 * Math.max(0, Math.min(100, p?.freshness ?? 100)) / 100;
const avgSkill = (p) => Object.values(p.skills).reduce((a, b) => a + b, 0) / 9;
// Bots roterer: en starter under 70 % hviles, hvis en frisk (≥ 85 %) bænkspiller i samme kæde
// højst er 2 svagere i gennemsnit. Ellers fik kun den menneskelige manager glæde af rotation.

// Kamplokal side: kopi af taktikken + aktuelle 11 spillere + bænk.
function prepareSide(team, isHome, notes) {
  const tactics = structuredClone(team.tactics);
  const byId = new Map(team.squad.map((p) => [p.id, p]));
  const starters = tactics.lineupSlots.map((id) => byId.get(id));
  const used = new Set(starters.filter(Boolean).map((p) => p.id));
  const bench = () => team.squad.filter((p) => !used.has(p.id) && isAvailable(p));
  if (team.isBot) starters.forEach((p, slot) => {
    if (!p || !isAvailable(p) || (p.freshness ?? 100) >= 70) return;
    const fresh = bench().filter((b) => b.line === p.line && (b.freshness ?? 100) >= 85 && avgSkill(b) >= avgSkill(p) - 2);
    if (!fresh.length) return;
    const sub = fresh.sort((a, b) => avgSkill(b) - avgSkill(a))[0];
    notes.push({ isHome, text: `📋 [${team.name}] ${tag(sub)} starter i stedet for en træt ${tag(p)}.` });
    starters[slot] = sub; used.add(sub.id); used.delete(p.id);
  });
  starters.forEach((p, slot) => {
    if (p && isAvailable(p)) return;
    const line = p ? p.line : lineOfRole(coordsOf(tactics)[slot].r);
    const sub = bench().find((b) => b.line === line) || bench()[0];
    if (!sub) return;
    if (p) notes.push({ isHome, text: `📋 [${team.name}] ${tag(p)} er skadet og erstattes i startopstillingen af ${tag(sub)}.` });
    starters[slot] = sub; used.add(sub.id);
  });
  return { team, isHome, tactics, starters, used, subsUsed: 0, benchAvailable: bench };
}

function rolesOf(side) {
  const coords = coordsOf(side.tactics);
  const defs = [], mids = [], atts = [], cbs = [];
  side.starters.forEach((p, i) => {
    if (i === 0) return;
    if (coords[i].r === 'CB') cbs.push(p);
    const line = lineOfRole(coords[i].r);
    (line === 'DEF' ? defs : line === 'MID' ? mids : atts).push(p);
  });
  const s = side.starters;
  return { gk: s[0], defs: defs.length ? defs : s.slice(1, 5), mids: mids.length ? mids : s.slice(5, 9), atts: atts.length ? atts : s.slice(9), cbs };
}

function customDragged(side) {
  const cc = side.tactics.customCoords || {};
  return Object.keys(cc).map(Number).filter((slot) => slot > 0 && slot < 11)
    .map((slot) => ({ player: side.starters[slot], role: coordsOf(side.tactics)[slot].r, outOfZone: isOutOfZone(side.tactics, slot) }));
}

const avg = (arr, f) => arr.reduce((a, p) => a + f(p), 0) / Math.max(1, arr.length);

const endOf = (s) => ({ formation: s.tactics.baseFormation, starters: s.starters.map((p) => p.id), customCoords: structuredClone(s.tactics.customCoords), phases: structuredClone(s.tactics.phases) });

export function simulateMatch(home, away, rng, opts = {}) {
  const events = [];
  const lineupNotes = [];
  const H = prepareSide(home, true, lineupNotes), A = prepareSide(away, false, lineupNotes);
  const sheet = createSheet();
  const goalsPool = [], injuries = [], observations = [];
  const st = { hPoss: 10, aPoss: 10, hShots: 0, aShots: 0, hOnTarget: 0, aOnTarget: 0, hXg: 0, aXg: 0, hAerialWon: 0, aAerialWon: 0, hVarChecks: 0, aVarChecks: 0, hTacticSuccess: 0, aTacticSuccess: 0, hFouls: 0, aFouls: 0, hInjuries: 0, aInjuries: 0, hCorners: 0, aCorners: 0, hFreeKicks: 0, aFreeKicks: 0, hPenalties: 0, aPenalties: 0, hPenaltyGoals: 0, aPenaltyGoals: 0, hSetPieceGoals: 0, aSetPieceGoals: 0, hHeaderGoals: 0, aHeaderGoals: 0, hCounterGoals: 0, aCounterGoals: 0 };
  let hG = 0, aG = 0, homeVarNet = 0;
  const k = (side, name) => (side.isHome ? 'h' : 'a') + name;
  const other = (side) => (side === H ? A : H);

  const addEv = (min, type, category, isHome, plot, label, text, varMsg) =>
    events.push({ min, type, category, isHome, plot, label, text, varMsg, hG, aG, stats: { ...st } });
  const observe = (player, text) => observations.push({ playerId: player.id, text });
  // Løbet følger pladsen (v3.8): også en indskifter løber efter den rolle, han kommer ind på.
  const register = (side, p, role, minIn, slot) => sheet.register(p, side.team, side.isHome, role, minIn, rng, masteryVs(p, other(side).team), slot, slot != null ? coordsOf(side.tactics)[slot].r : role);

  for (const side of [H, A]) side.starters.forEach((p, i) => p && register(side, p, coordsOf(side.tactics)[i].r, 1, i));
  // Startformationen gemmes, så karakterarket kan vise spillerne på banen.
  const startFormations = { home: H.tactics.baseFormation, away: A.tactics.baseFormation };
  const hAvg = Math.round(avg(H.starters, (p) => masteryVs(p, away)));
  const aAvg = Math.round(avg(A.starters, (p) => masteryVs(p, home)));

  // Andre holds taktiske overvejelser (faser, Hvis-Så) må ikke kunne læses – kun deres
  // startopstilling. Egne valg (det menneskestyrede hold) vises fuldt.
  const own = (s) => !s.team.isBot;
  // Fase-dueller pr. hold til pause-analysen: forsøg/sejre med opbygning og med pres.
  const duelLog = Object.fromEntries([H, A].map((s) => [s.team.id, { build: 0, buildWon: 0, press: 0, pressWon: 0, runs: 0, runsWon: 0, runGoals: 0, countersAgainst: 0, counterGoalsAgainst: 0 }]));
  const fbCount = (side) => coordsOf(side.tactics).filter((c) => FB_ROLES.has(c.r)).length;
  // Kontra mod et hold, der lige har tabt bolden. Returnerer om der blev scoret.
  function counterAttack(win, lose, min, wR, lR) {
    const shooter = rng.pick(wR.atts), gk = lR.gk;
    duelLog[lose.team.id].countersAgainst++;
    st[k(win, 'Shots')]++;
    st[k(win, 'Xg')] += 0.2 + rng.next() * 0.2;
    // Kun DIT holds egen indstilling må forklare kontraen; modstanderens nævnes aldrig.
    // Den back/wingback, der har løbet mest frem i kampen – kun nævnt, hvis han faktisk har løbet.
    const fbSlots = own(lose) && lose.tactics.phases.phase1_buildUp.offBallRuns === 'MANY' ? coordsOf(lose.tactics).map((c, i) => i).filter((i) => i > 0 && FB_ROLES.has(coordsOf(lose.tactics)[i].r) && lose.starters[i]) : [];
    const runsOf = (i) => sheet.entries[lose.starters[i].id]?.freeRuns ?? 0;
    const fbSlot = fbSlots.filter((i) => runsOf(i) > 0).sort((x, y) => runsOf(y) - runsOf(x))[0] ?? -1;
    const why = fbSlot > 0 ? ` Din ${coordsOf(lose.tactics)[fbSlot].r} ${tag(lose.starters[fbSlot])} er højt oppe efter sit løb.` : '';
    if (shooter.skills.finishing * freshFactor(shooter) + rng.next() * 8 + COUNTER_FINISH_BONUS > gk.skills.goalkeeping * freshFactor(gk) + rng.next() * 8) {
      if (win === H) hG++; else aG++;
      st[k(win, 'OnTarget')]++;
      duelLog[lose.team.id].counterGoalsAgainst++;
      sheet.adjust(shooter.id, 1.25); sheet.bump(shooter.id, 'goals'); sheet.adjust(gk.id, -0.3);
      st[k(win, 'CounterGoals')]++;
      // Oplægsgiveren, teksten nævner, får også assisten (v3.10 – ellers modsagde statistikken referatet).
      const helper = rng.pick(wR.mids);
      if (helper && helper.id !== shooter.id) { sheet.adjust(helper.id, 0.4); sheet.bump(helper.id, 'assists'); }
      const desc = describeGoal('COUNTER', tag(shooter), tag(helper ?? shooter), min, rng);
      goalsPool.push({ scorer: tag(shooter), teamName: win.team.name, match: `${home.name} - ${away.name}`, min, kind: 'COUNTER', spectacle: goalSpectacle('COUNTER', { pace: shooter.skills.pace }, min, rng), desc });
      addEv(min, 'GOAL', 'HIGHLIGHT', win.isHome, true, `⚽ Kontramål: ${tag(shooter)}`, `⚽ [${win.team.name} • ${hG}-${aG}] MÅÅÅL PÅ KONTRA!${why} ${desc}`);
      return true;
    }
    st[k(win, 'OnTarget')]++;
    sheet.adjust(gk.id, 0.5); sheet.bump(gk.id, 'saves');
    addEv(min, 'SAVE', 'PLAY', lose.isHome, false, 'Kontra reddet', `🧤 [${lose.team.name}] ${win.team.name} kontrer, men ${tag(gk)} redder fra ${tag(shooter)}.${why}`);
    return false;
  }
  const tacticStr = (s) => { const p = s.tactics.phases; return own(s) ? `${s.tactics.baseFormation} • ${TXT[p.phase1_buildUp.passingStyle]} / ${TXT[p.phase2_defending.pressingHeight]}` : s.tactics.baseFormation; };
  const hCustom = customDragged(H);
  const customIntro = hCustom.length ? ` Bemærk: ${home.name} har trukket ${tag(hCustom[0].player)} ud af sin grundposition.` : '';
  for (const n of lineupNotes) addEv(1, 'LINEUP', 'TACTIC', n.isHome, false, 'Ændret startopstilling', n.text);
  // Kamphovedet viser startformationen – beregnes før et evt. Hvis-Så-skifte.
  const homeTacticStr = tacticStr(H), awayTacticStr = tacticStr(A);
  addEv(1, 'TACTIC_NOTE', 'TACTIC', true, false, 'Taktisk oplæg', `📋 [TAKTISK OPLÆG] ${home.name} (${homeTacticStr}) møder ${away.name} (${awayTacticStr}).${customIntro}`);

  // ---------- Luftduel og dødbolde (v3.10) ----------
  const goalFor = (side) => { if (side === H) hG++; else aG++; st[k(side, 'OnTarget')]++; };
  const best = (list, f) => list.filter(Boolean).reduce((b, p) => (f(p) > f(b) ? p : b));
  const outfield = (R) => [...R.defs, ...R.mids, ...R.atts];
  const SP_KIND = { hjørnespark: 'CORNER', frispark: 'SETPIECE' };
  const isSetPieceKind = (kind) => kind === 'PENALTY' || kind === 'FREEKICK' || kind === 'CORNER' || kind === 'SETPIECE';
  // Bogfører et mål af typen kind for skytten (måltype pr. spiller og pr. hold til statistikken).
  function bookKind(side, scorer, kind) {
    if (kind === 'HEADER' || kind === 'CORNER' || kind === 'SETPIECE') { sheet.bump(scorer.id, 'headerGoals'); st[k(side, 'HeaderGoals')]++; }
    if (kind === 'PENALTY') sheet.bump(scorer.id, 'penaltyGoals');
    if (isSetPieceKind(kind)) { sheet.bump(scorer.id, 'setPieceGoals'); st[k(side, 'SetPieceGoals')]++; }
  }
  // Høj bold i feltet: åbent spil (indlæg) eller dødbold (hjørnespark/frisparksindlæg).
  // Høje bolde tages af en midtstopper, når holdet har en på banen (v3.8); den trukne forsvarer
  // afgør hvilken – ingen ekstra terning. Dødbolde: forsvaret står klar (+1,5).
  function aerialDuel(att, def, cR, dR, min, shooter, assister, defender, setPiece = null) {
    const gk = dR.gk;
    const aDef = dR.cbs.length ? (dR.cbs.includes(defender) ? defender : dR.cbs[Math.max(0, dR.defs.indexOf(defender)) % dR.cbs.length]) : defender;
    const kind = setPiece ? SP_KIND[setPiece] : 'HEADER';
    if (shooter.aerialPower * freshFactor(shooter) + rng.next() * 6 > aDef.aerialPower * freshFactor(aDef) + gk.skills.goalkeeping * 0.38 + rng.next() * 6 + (setPiece ? SETPIECE_DEF_EDGE : 0)) {
      goalFor(att); st[k(att, 'AerialWon')]++; if (!setPiece) st[k(att, 'TacticSuccess')]++;
      sheet.adjust(shooter.id, 1.35); sheet.bump(shooter.id, 'goals'); sheet.bump(shooter.id, 'aerialWins');
      if (assister && assister.id !== shooter.id) { sheet.adjust(assister.id, 0.55); sheet.bump(assister.id, 'assists'); }
      sheet.adjust(aDef.id, -0.35); sheet.adjust(gk.id, -0.25);
      bookKind(att, shooter, kind);
      const prose = describeHeader(shooter.aerialPower);
      observe(shooter, `Luftduel (${min}. min mod ${def.team.name}): ${shooter.shortName} scorede med ${prose}.`);
      goalsPool.push({ scorer: tag(shooter), teamName: att.team.name, match: `${home.name} - ${away.name}`, min, kind, spectacle: goalSpectacle(kind, { aerialPower: shooter.aerialPower }, min, rng), desc: describeGoal(kind, tag(shooter), tag(assister ?? shooter), min, rng) });
      const how = setPiece ? `MÅÅÅL PÅ ${setPiece.toUpperCase()}! ${tag(assister)} slår ${setPiece}et ind, og ${tag(shooter)} (${shooter.heightCm} cm) header bolden ind – ${prose}.`
        : `MÅÅÅL! ${tag(shooter)} (${shooter.heightCm} cm) header bolden ind – ${prose}.`;
      addEv(min, 'HEADER_GOAL', 'HIGHLIGHT', att.isHome, true, `⚽ Hovedstødsmål: ${tag(shooter)}`, `⚽ [${att.team.name} • ${hG}-${aG}] ${how}`);
      return true;
    }
    st[k(def, 'AerialWon')]++;
    sheet.adjust(aDef.id, 0.4); sheet.bump(aDef.id, 'aerialWins');
    addEv(min, 'INFO', 'PLAY', def.isHome, false, 'Luftduel i feltet', setPiece
      ? `✈️ [${def.team.name} forsvar] ${setPiece === 'hjørnespark' ? 'Hjørnespark' : 'Frisparksindlæg'}: ${tag(aDef)} (${aDef.heightCm} cm) stiger højest og clearer foran ${tag(shooter)}.`
      : `✈️ [${def.team.name} forsvar] Stærk luftduel: ${tag(aDef)} (${aDef.heightCm} cm) stiger højest og clearer foran ${tag(shooter)}.`);
    return false;
  }
  // Dødboldens hovedstødsspiller: en af de tre bedste i luften (også stopperne går med op).
  const headerTarget = (R, taker) => rng.pick(outfield(R).filter((p) => p && p !== taker).sort((a, b) => b.aerialPower - a.aerialPower).slice(0, 3));
  function corner(att, def, cR, dR, min) {
    st[k(att, 'Corners')]++; st[k(att, 'Shots')]++; st[k(att, 'Xg')] += 0.04; // hovedstødet er en afslutning
    const taker = best(outfield(cR), (p) => p.skills.passing);
    aerialDuel(att, def, cR, dR, min, headerTarget(cR, taker), taker, rng.pick(dR.defs), 'hjørnespark');
  }
  function penalty(att, def, cR, dR, min) {
    const taker = best(outfield(cR), (p) => p.skills.finishing), fouled = rng.pick(cR.atts.concat(cR.mids)), fouler = rng.pick(dR.defs), gk = dR.gk;
    st[k(def, 'Fouls')]++; st[k(att, 'Penalties')]++; st[k(att, 'Shots')]++; st[k(att, 'Xg')] += 0.76;
    sheet.adjust(fouler.id, -0.3);
    const why = `${tag(fouled)} fældes i feltet af ${tag(fouler)} (${def.team.name})`;
    if (taker.skills.finishing * freshFactor(taker) + rng.next() * 8 + PENALTY_BONUS > gk.skills.goalkeeping * freshFactor(gk) + rng.next() * 8) {
      goalFor(att); st[k(att, 'PenaltyGoals')]++;
      sheet.adjust(taker.id, 1.0); sheet.bump(taker.id, 'goals'); sheet.adjust(gk.id, -0.1);
      bookKind(att, taker, 'PENALTY');
      const desc = describeGoal('PENALTY', tag(taker), tag(fouled), min, rng);
      goalsPool.push({ scorer: tag(taker), teamName: att.team.name, match: `${home.name} - ${away.name}`, min, kind: 'PENALTY', spectacle: goalSpectacle('PENALTY', {}, min, rng), desc });
      addEv(min, 'GOAL', 'HIGHLIGHT', att.isHome, true, `⚽ Straffespark: ${tag(taker)}`, `⚽ [${att.team.name} • ${hG}-${aG}] STRAFFESPARK – MÅL! ${why}, og ${tag(taker)} sender bolden sikkert i nettet.`);
    } else {
      st[k(att, 'OnTarget')]++;
      sheet.adjust(gk.id, 0.8); sheet.bump(gk.id, 'saves'); sheet.adjust(taker.id, -0.4);
      addEv(min, 'SAVE', 'HIGHLIGHT', def.isHome, true, `🧤 Straffe reddet: ${tag(gk)}`, `🧤 [${def.team.name}] STRAFFESPARK REDDET! ${why}, men ${tag(gk)} redder fra ${tag(taker)}.`);
    }
  }
  function freeKick(att, def, cR, dR, min) {
    const fouler = rng.pick(dR.defs.concat(dR.mids)), gk = dR.gk;
    st[k(def, 'Fouls')]++; st[k(att, 'FreeKicks')]++;
    if (rng.chance(FK_SHOT_P)) {
      const taker = best(outfield(cR), (p) => p.skills.finishing + p.skills.passing);
      st[k(att, 'Shots')]++; st[k(att, 'Xg')] += 0.07;
      if (taker.skills.finishing * freshFactor(taker) + rng.next() * 8 > gk.skills.goalkeeping * freshFactor(gk) + rng.next() * 8 + FK_SHOT_EDGE) {
        goalFor(att);
        sheet.adjust(taker.id, 1.4); sheet.bump(taker.id, 'goals'); sheet.adjust(gk.id, -0.3);
        bookKind(att, taker, 'FREEKICK');
        const desc = describeGoal('FREEKICK', tag(taker), tag(taker), min, rng);
        goalsPool.push({ scorer: tag(taker), teamName: att.team.name, match: `${home.name} - ${away.name}`, min, kind: 'FREEKICK', spectacle: goalSpectacle('FREEKICK', { finishing: taker.skills.finishing }, min, rng), desc });
        addEv(min, 'GOAL', 'HIGHLIGHT', att.isHome, true, `⚽ Frisparksmål: ${tag(taker)}`, `⚽ [${att.team.name} • ${hG}-${aG}] FRISPARKSMÅL! Frispark efter ${tag(fouler)}s (${def.team.name}) forseelse – ${desc}`);
      } else {
        st[k(att, 'OnTarget')]++;
        sheet.adjust(gk.id, 0.4); sheet.bump(gk.id, 'saves');
        addEv(min, 'SAVE', 'PLAY', def.isHome, false, 'Frispark reddet', `🧤 [${def.team.name}] ${tag(gk)} redder ${tag(taker)}s frispark (${att.team.name}) fra kanten af feltet.`);
      }
      return;
    }
    const taker = best(outfield(cR), (p) => p.skills.passing);
    st[k(att, 'Shots')]++; st[k(att, 'Xg')] += 0.1;
    aerialDuel(att, def, cR, dR, min, headerTarget(cR, taker), taker, rng.pick(dR.defs), 'frispark');
  }

  // Indskiftning i den kamplokale kopi. Returnerer indskifteren eller null.
  function substitute(side, slot, min, reason) {
    if (side.subsUsed >= MAX_SUBS) return null;
    const out = side.starters[slot];
    const bench = side.benchAvailable();
    const sub = bench.find((b) => b.line === out.line) || bench[0];
    if (!sub) return null;
    side.subsUsed++;
    side.starters[slot] = sub; side.used.add(sub.id);
    sheet.entries[out.id].minOut = min;
    register(side, sub, `SUB (${out.line})`, min, slot);
    addEv(min, 'SUB', 'HIGHLIGHT', side.isHome, true, `🔄 ${tag(sub)} ind for ${tag(out)}`, `🔄 [${side.team.name}] ${reason}: ${tag(sub)} erstatter ${tag(out)}.`);
    return sub;
  }

  function checkTriggers(side, min) {
    const own = side.isHome ? hG : aG, opp = side.isHome ? aG : hG;
    side.tactics.conditionalRules.forEach((rule) => {
      if (rule.used || min < rule.minuteTrigger) return;
      if (!ruleConditionMet(rule, own, opp)) return;
      const from = side.tactics.baseFormation;
      // Skift til en af holdets egne planer: formation, trukne positioner og faser følger
      // med; spillerne beholder deres pladser, og Hvis-Så-reglerne kører videre.
      const plan = Number.isInteger(rule.newPlan) ? side.team.tacticPresets?.[rule.newPlan] : null;
      if (plan && FORMATIONS[plan.baseFormation]) {
        rule.used = true;
        // Spiller holdet allerede præcis den plan, er skiftet en tom handling – intet logges.
        const same = plan.baseFormation === side.tactics.baseFormation && JSON.stringify(plan.phases) === JSON.stringify(side.tactics.phases) && JSON.stringify(plan.customCoords || {}) === JSON.stringify(side.tactics.customCoords || {});
        if (same) return;
        side.tactics.baseFormation = plan.baseFormation;
        // Kampens taktik ændres kun ved genanvisning (aldrig i stedet), så planens objekter
        // kan bruges direkte; resultatets endState er en kopi.
        side.tactics.customCoords = plan.customCoords || {};
        side.tactics.phases = plan.phases;
        const name = `Plan ${PLAN_LETTERS[rule.newPlan]}`;
        announceShift(side, min, `${side.team.name} skifter til ${name}`, `📋 [${side.team.name} • Hvis-Så] I ${min}. minut skifter holdet fra ${from} til ${name} (${plan.baseFormation}, ${TXT[plan.phases.phase1_buildUp.passingStyle]} / ${TXT[plan.phases.phase2_defending.pressingHeight]}).`);
        return;
      }
      if (!FORMATIONS[rule.newFormation]) return;
      rule.used = true;
      const remap = rule.slotRemapping;
      if (Array.isArray(remap) && remap.length === 11 && new Set(remap).size === 11 && remap.every((i) => i >= 0 && i < 11)) {
        const old = side.starters.slice();
        side.starters = remap.map((i) => old[i]);
      }
      side.tactics.baseFormation = rule.newFormation;
      side.tactics.customCoords = {};
      announceShift(side, min, `${side.team.name} skifter til ${rule.newFormation}`, `📋 [${side.team.name} • Hvis-Så] I ${min}. minut skifter holdet fra ${from} til ${rule.newFormation}.`);
    });
  }

  // Et modstanderholds Hvis-Så-skift kan ses på banen, men ikke læses: ingen regel,
  // intet minut-kriterium, ingen ny formation.
  function announceShift(side, min, label, text) {
    if (own(side)) addEv(min, 'TRIGGER', 'HIGHLIGHT', side.isHome, true, label, text);
    else addEv(min, 'TRIGGER', 'HIGHLIGHT', side.isHome, true, `${side.team.name} omorganiserer sig`, `🔁 [${side.team.name}] Holdet omorganiserer sig på banen.`);
  }

  for (let min = 3; min <= 90; min += 3) {
    if (min === 45) {
      const hp = Math.round((st.hPoss / (st.hPoss + st.aPoss)) * 100);
      const leader = st.hTacticSuccess >= st.aTacticSuccess ? home : away;
      // Dit holds egen duel-statistik (kun egne valg nævnes – modstanderens stil røbes ikke).
      const mine = [H, A].find(own);
      const yours = mine && duelLog[mine.team.id].build + duelLog[mine.team.id].press ? ` Din opbygning er kommet igennem ${duelLog[mine.team.id].buildWon} af ${duelLog[mine.team.id].build} gange; dit pres har vundet bolden ${duelLog[mine.team.id].pressWon} af ${duelLog[mine.team.id].press} gange.` : '';
      addEv(min, 'HALFTIME', 'TACTIC', true, false, 'Pause-analyse', `⏸️ [45' PAUSE-ANALYSE] Stillingen er ${hG}-${aG}. ${home.name} har haft ${hp}% af bolden. ${leader.name} har vundet flest taktiske dueller (${Math.max(st.hTacticSuccess, st.aTacticSuccess)}).${yours}`);
    }
    checkTriggers(H, min); checkTriggers(A, min);

    const hR = rolesOf(H), aR = rolesOf(A);
    const hMid = avg(hR.mids, (p) => p.skills.passing + p.skills.ballControl);
    const aMid = avg(aR.mids, (p) => p.skills.passing + p.skills.ballControl);
    const homeHasBall = hMid + hAvg * 0.03 + rng.next() * 8 >= aMid + aAvg * 0.03 + rng.next() * 7.5;
    if (homeHasBall) st.hPoss += 3; else st.aPoss += 3;
    const att = homeHasBall ? H : A, def = homeHasBall ? A : H;
    const attR = homeHasBall ? hR : aR, defR = homeHasBall ? aR : hR;
    const attPh = att.tactics.phases, defPh = def.tactics.phases;
    const playmaker = rng.pick(attR.mids), presser = rng.pick(defR.mids), back = rng.pick(defR.defs), striker = rng.pick(attR.atts);

    // Trukne positioner vurderes (25 %): uden for zonen straffes, inden for belønnes.
    const customs = customDragged(att);
    if (customs.length && rng.chance(0.25)) {
      const cp = rng.pick(customs);
      if (cp.outOfZone) {
        st[k(def, 'TacticSuccess')]++;
        sheet.adjust(cp.player.id, -0.45); sheet.adjust(presser.id, 0.35); sheet.bump(presser.id, 'tacticWins');
        addEv(min, 'TACTIC_FAIL', 'TACTIC', def.isHome, false, 'Ude af zone', `⚠️ [TAKTIK FEJLER • CUSTOM POS] ${tag(cp.player)} (${att.team.name}) står for langt fra sin ${cp.role}-zone, og ${tag(presser)} udnytter hullet.`);
        continue;
      }
      st[k(att, 'TacticSuccess')]++;
      sheet.adjust(cp.player.id, 0.4); sheet.bump(cp.player.id, 'tacticWins');
      addEv(min, 'TACTIC_WIN', 'TACTIC', att.isHome, false, 'Custom pos virker', `✅ [TAKTIK VIRKER • CUSTOM POS] Den justerede placering af ${tag(cp.player)} (${att.team.name}) skaber overtal i mellemrummet.`);
    }

    // Fase 1 mod fase 2 (48 %) med sten-saks-papir-bonus og mod-kunnen. Vinder forsvaret
    // duellen, er bolden tabt, og angriberen får ingen chance i samme tick (v3.6 – før kunne
    // "❌ din opbygning stoppes" efterfølges af dit mål i samme minut).
    let ballLost = false;
    if (rng.chance(0.48)) {
      const pmM = masteryVs(playmaker, def.team), prM = masteryVs(presser, att.team);
      let build = (playmaker.skills.passing + playmaker.skills.ballControl) * freshFactor(playmaker) + pmM * MASTERY_WEIGHT + rng.next() * 7;
      if (att.calm) { build += CALM_BUILD_BONUS; att.calm = false; } // "Hold på bolden" efter sidste erobring
      let press = (presser.skills.intercepting + presser.skills.positioning * 0.85 + presser.skills.stamina * 0.35) * freshFactor(presser) + prM * MASTERY_WEIGHT + rng.next() * 7;
      const pass = attPh.phase1_buildUp.passingStyle, focus = attPh.phase1_buildUp.attackFocus, height = defPh.phase2_defending.pressingHeight;
      if (pass === 'SHORT' && height === 'LOW_BLOCK') build += STYLE_BONUS;
      if (pass === 'DIRECT_LONG' && height === 'HIGH_GEGENPRESS') build += STYLE_BONUS;
      if (height === 'HIGH_GEGENPRESS' && pass === 'SHORT') press += STYLE_BONUS;
      if (height === 'LOW_BLOCK' && focus === 'CENTRAL') press += STYLE_BONUS;
      duelLog[att.team.id].build++; duelLog[def.team.id].press++;
      if (build >= press) {
        duelLog[att.team.id].buildWon++;
        st[k(att, 'TacticSuccess')]++;
        sheet.adjust(playmaker.id, 0.35); sheet.bump(playmaker.id, 'tacticWins');
        // Ingen besked afhængig af mod-kunnen mod modstanderen – den ville røbe deres stil.
        const note = ` ${tag(playmaker)} styrer midtbanen.`;
        // Kun dit eget holds valg navngives; modstanderens stil beskrives ikke.
        // Teksten er den samme, uanset om en stilbonus afgjorde duellen (ellers røbede ordvalget modstanderens stil).
        const text = own(att) ? `✅ [DIN OPBYGNING VIRKER] ${YOUR_PASS[pass]} bryder igennem ${def.team.name}s pres.${note}`
          : own(def) ? `❌ [DIT PRES BRYDES] ${att.team.name} spiller sig igennem ${YOUR_PRESS[height]}.${note}`
          : `✅ [FASE 1 VIRKER • ${att.team.name}] ${att.team.name} spiller sig igennem ${def.team.name}s pres.${note}`;
        addEv(min, 'TACTIC_WIN', 'TACTIC', att.isHome, false, 'Fase 1 virker', text);
      } else {
        ballLost = true;
        duelLog[def.team.id].pressWon++;
        st[k(def, 'TacticSuccess')]++;
        if (defPh.phase2_defending.offsideTrap !== 'OFF' && rng.chance(0.45)) {
          sheet.adjust(back.id, 0.4); sheet.adjust(striker.id, -0.25); sheet.bump(back.id, 'tacticWins');
          // Kun din egen offside-fælde navngives; hos modstandere er det blot en offside.
          const offTxt = own(def) ? `✅ [DIN OFFSIDE-FÆLDE VIRKER] ${tag(striker)} (${att.team.name}) fanges. ${tag(back)} dirigerer linjen perfekt.`
            : own(att) ? `❌ [DIN OPBYGNING STOPPES] ${tag(striker)} fanges offside.`
            : `🛑 [FASE 2 VIRKER • ${def.team.name}] ${tag(striker)} (${att.team.name}) fanges offside.`;
          addEv(min, 'TACTIC_FAIL', 'TACTIC', def.isHome, false, 'Offside-fælde virker', offTxt);
        } else {
          sheet.adjust(presser.id, 0.35); sheet.adjust(playmaker.id, -0.2); sheet.bump(presser.id, 'tacticWins');
          // Kontra (v3.9): afgøres FØR teksten, så "din lynkontra" kun loves, når den kommer.
          const won = defPh.phase3_transition.onBallWon;
          const goesCounter = rng.chance(counterChance(attPh.phase1_buildUp.offBallRuns, attPh.phase3_transition.onBallLost, won, fbCount(att)));
          if (!goesCounter && won === 'KEEP_POSSESSION') def.calm = true;
          const counter = !own(def) ? '' : won === 'FAST_COUNTER' ? (goesCounter ? ' Din lynkontra sættes straks i gang.' : ' Din lynkontra løber ind i et organiseret forsvar.')
            : (goesCounter ? ' Dit hold ser hullet og går direkte.' : ' Dit hold falder til ro på bolden.');
          const text = own(def) ? `✅ [DIT PRES VIRKER] ${cap(YOUR_PRESS[height])} lukker af: ${tag(presser)} erobrer bolden fra ${tag(playmaker)} (${att.team.name}).${counter}`
            : own(att) ? `❌ [DIN OPBYGNING STOPPES] ${YOUR_PASS[pass]} kommer ikke igennem: ${tag(presser)} (${def.team.name}) erobrer bolden fra ${tag(playmaker)}.`
            : `🛑 [FASE 1 STOPPER MOD FASE 2] ${tag(presser)} (${def.team.name}) erobrer bolden fra ${tag(playmaker)}.`;
          addEv(min, 'TACTIC_FAIL', 'TACTIC', def.isHome, false, 'Fase 2 pres virker', text);
          if (goesCounter) counterAttack(def, att, min, defR, attR);
        }
      }
    }

    // Frispark (6 %), heraf skade (40 %) med indskiftning.
    if (rng.chance(0.06)) {
      const victimSide = rng.chance(0.5) ? H : A, foulSide = other(victimSide);
      const fR = foulSide === H ? hR : aR;
      const slot = rng.int(1, 10);
      const victim = victimSide.starters[slot], fouler = rng.pick(fR.defs.concat(fR.mids));
      st[k(foulSide, 'Fouls')]++;
      sheet.adjust(fouler.id, -0.35);
      if (rng.chance(0.4)) {
        const matches = rng.int(1, 3);
        st[k(victimSide, 'Injuries')]++;
        injuries.push({ playerId: victim.id, teamId: victimSide.team.id, matches, min });
        if (sheet.entries[victim.id]) sheet.entries[victim.id].injured = true;
        observe(victim, `Kamp-skade (${min}. min mod ${foulSide.team.name}): ${victim.shortName} måtte udgå efter en hård tackling.`);
        addEv(min, 'INJURY', 'HIGHLIGHT', victimSide.isHome, true, `🚑 Skade: ${tag(victim)}`, `🚑 [${victimSide.team.name}] ${tag(victim)} bliver skadet efter en tackling fra ${tag(fouler)} (${foulSide.team.name}) og er ude i ${matches} ${matches === 1 ? 'kamp' : 'kampe'}.`);
        if (!substitute(victimSide, slot, min, 'Skadesskift')) {
          sheet.entries[victim.id].minOut = min;
          addEv(min, 'INFO', 'PLAY', victimSide.isHome, false, 'Ingen indskiftning', `[${victimSide.team.name}] Ingen indskiftning mulig – holdet spiller videre med ${tag(victim)} haltende.`);
        }
      } else {
        // Gult kort kun her – skade-frisparkets tekst nævner intet kort (v3.10).
        if (sheet.entries[fouler.id]) sheet.entries[fouler.id].yellowCard = true;
        addEv(min, 'FOUL', 'PLAY', foulSide.isHome, false, 'Frispark', `🟨 [${foulSide.team.name}] Taktisk frispark og gult kort til ${tag(fouler)}.`);
      }
    }

    // "Stille" frispark – kun talt, ingen hændelse (realistisk antal pr. kamp).
    if (rng.chance(QUIET_FOUL_P)) st[k(def, 'Fouls')]++;
    // Dødbolde til holdet med bolden (v3.10): straffe, frispark i skudafstand – ikke efter tabt bold.
    if (!ballLost && rng.chance(PENALTY_P)) penalty(att, def, att === H ? hR : aR, def === H ? hR : aR, min);
    else if (!ballLost && rng.chance(FREEKICK_P)) freeKick(att, def, att === H ? hR : aR, def === H ? hR : aR, min);
    // Chance (30 %): høje bolde, VAR-tjek eller almindelig afslutning – ikke efter tabt bold.
    else if (!ballLost && rng.chance(CHANCE_P[attPh.phase1_buildUp.offBallRuns] ?? CHANCE_P.NORMAL)) {
      const cR = att === H ? hR : aR, dR = def === H ? hR : aR;
      const shooter = rng.pick(cR.atts.concat(cR.mids)), assister = rng.pick(cR.mids), defender = rng.pick(dR.defs), gk = dR.gk;
      st[k(att, 'Shots')]++;
      const shotXg = 0.13 + rng.next() * 0.22;
      st[k(att, 'Xg')] += shotXg;
      const scored = () => { if (att === H) hG++; else aG++; st[k(att, 'OnTarget')]++; };
      const assist = (bonus) => { if (assister.id !== shooter.id) { sheet.adjust(assister.id, bonus); sheet.bump(assister.id, 'assists'); } };
      const high = attPh.phase1_buildUp.attackFocus === 'HIGH_CROSSES' || attPh.phase1_buildUp.passingStyle === 'DIRECT_LONG';
      if (high && rng.chance(0.55)) {
        // Indlæg i åbent spil – samme luftduel som dødboldene. Clearet bold kan give hjørnespark.
        if (!aerialDuel(att, def, cR, dR, min, shooter, assister, defender) && rng.chance(CORNER_P)) corner(att, def, cR, dR, min);
      } else if (rng.next() < 0.22) {
        st[k(att, 'VarChecks')]++;
        const trapBonus = (shooter.counterTactics?.vsTrapLong ?? 15) * 0.045; // v3.6: samme effekt (≈0,8) på den lavere skala
        const timing = describeVarTiming(shooter.varProfile.varPulse);
        if (shooter.varProfile.varPulse + trapBonus + rng.next() * 6 > defender.skills.positioning + rng.next() * 6) {
          scored(); homeVarNet += att === H ? 1 : -1;
          sheet.adjust(shooter.id, 1.3); sheet.bump(shooter.id, 'goals'); assist(0.5); sheet.adjust(defender.id, -0.35);
          observe(shooter, `VAR-tjek (${min}. min mod ${def.team.name}): ${shooter.shortName} ${timing}.`);
          goalsPool.push({ scorer: tag(shooter), teamName: att.team.name, match: `${home.name} - ${away.name}`, min, kind: 'VAR', spectacle: goalSpectacle('VAR', {}, min, rng), desc: describeGoal('VAR', tag(shooter), tag(assister), min, rng) });
          addEv(min, 'VAR_GOAL', 'HIGHLIGHT', att.isHome, true, `📺 VAR: mål godkendt – ${tag(shooter)}`, `📺 [${att.team.name} • ${hG}-${aG}] VAR-KENDELSE: MÅL GODKENDT! ${tag(shooter)} ${timing}.`, `${att.team.name}: mål godkendt`);
        } else {
          homeVarNet += att === H ? -1 : 1;
          sheet.adjust(shooter.id, -0.4); sheet.adjust(defender.id, 0.45); sheet.bump(defender.id, 'tacticWins');
          observe(shooter, `VAR-annullering (${min}. min mod ${def.team.name}): ${shooter.shortName} var en anelse for tidligt af sted.`);
          addEv(min, 'VAR_NO_GOAL', 'HIGHLIGHT', att.isHome, true, `📺 VAR: annulleret – ${tag(shooter)}`, `📺 [${att.team.name}] VAR-KENDELSE: MÅLET ANNULLERES! ${tag(defender)} (${def.team.name}) holdt linjen, og ${tag(shooter)} var offside.`, `${att.team.name}: mål annulleret`);
        }
      } else {
        // Løb uden bold (v3.9): en markspiller forsøger at løbe sig fri. Vinder han løbet, træffer
        // han en beslutning (skud/aflevering/dribletur) efter zone og evner; ellers en almindelig
        // afslutning som før. Kun DIT holds løb fortælles – modstanderens "fri" kan ikke tælles op.
        const runs = attPh.phase1_buildUp.offBallRuns ?? 'NORMAL';
        const attC = coordsOf(att.tactics);
        const pool = att.starters.map((p, i) => ({ p, i })).filter(({ p, i }) => i > 0 && p);
        const wts = pool.map(({ i }) => RUN_WEIGHT[runGroup(attC[i].r)][runs] ?? 1);
        let rr = rng.next() * wts.reduce((x, y) => x + y, 0);
        const pick = pool[Math.max(0, wts.findIndex((w) => (rr -= w) < 0))] ?? pool.at(-1);
        const runner = pick.p, rs = runner.skills;
        sheet.bump(runner.id, 'freeRuns'); duelLog[att.team.id].runs++;
        const runWon = (rs.positioning + rs.pace * 0.5) * freshFactor(runner) + rng.next() * 8 + (RUN_DUEL_BONUS[runs] ?? 0)
          > (defender.skills.positioning + defender.skills.intercepting * 0.5) * freshFactor(defender) + rng.next() * 8 + (RUN_COVER[defPh.phase1_buildUp.offBallRuns] ?? 0);
        if (runWon) {
          sheet.bump(runner.id, 'freeRunsWon'); duelLog[att.team.id].runsWon++; sheet.adjust(runner.id, 0.15);
          const zone = runZone(slotPosition(att.tactics, pick.i));
          // Kun DIT holds angrebsfokus vægter (ellers røbede cutback-andelen modstanderens fokus).
          const w = decisionWeights(rs, zone, own(att) && attPh.phase1_buildUp.attackFocus === 'LOW_CUTBACKS');
          let rd = rng.next() * (w.SHOT + w.PASS + w.DRIBBLE);
          const choice = ['SHOT', 'PASS', 'DRIBBLE'].find((c) => (rd -= w[c]) < 0) || 'SHOT';
          const where = { WIDE: 'på kanten', DEEP: 'dybt i banen', MID: 'mellem kæderne', HIGH: 'bag forsvaret' }[zone];
          const yourRun = own(att) ? `✅ ${tag(runner)} løber sig fri ${where}` : '';
          let finisher = runner, helper = rng.pick(cR.mids.filter((p) => p !== runner).concat(cR.atts.filter((p) => p !== runner))) ?? assister, kind, solo = false, lead = '';
          if (choice === 'PASS') {
            finisher = rng.pick(cR.atts.concat(cR.mids).filter((p) => p !== runner)) ?? runner;
            helper = runner; kind = zone === 'WIDE' ? 'CUTBACK' : 'COMBINATION';
            lead = yourRun && `${yourRun} og ${zone === 'WIDE' ? 'lægger den tværs til' : 'spiller'} ${tag(finisher)}.`;
          } else if (choice === 'DRIBBLE') {
            const beat = (rs.pace + rs.ballControl) * freshFactor(runner) + rng.next() * 8
              > (defender.skills.positioning + defender.skills.strength * 0.5) * freshFactor(defender) + rng.next() * 8 + DRIBBLE_DEF_EDGE;
            if (!beat) {
              // Opsnapning: ingen afslutning – og samme kontra-tjek som efter et vundet pres.
              st[k(att, 'Shots')]--; st[k(att, 'Xg')] -= shotXg;
              sheet.adjust(defender.id, 0.3); sheet.bump(defender.id, 'tacticWins');
              addEv(min, 'INFO', 'PLAY', def.isHome, false, 'Opsnappet', own(att) ? `❌ ${tag(runner)} løber sig fri ${where}, men ${tag(defender)} (${def.team.name}) tager bolden i driblingen.` : `🛡️ [${def.team.name}] ${tag(defender)} tager bolden fra ${tag(runner)} (${att.team.name}).`);
              if (rng.chance(counterChance(runs, attPh.phase3_transition.onBallLost, defPh.phase3_transition.onBallWon, fbCount(att)))) counterAttack(def, att, min, dR, cR);
              continue;
            }
            kind = 'DRIBBLE'; solo = true;
            lead = yourRun && `${yourRun}, dribler ${tag(defender)} af og afslutter selv.`;
          } else {
            kind = zone === 'HIGH' ? 'COMBINATION' : 'LONGSHOT'; solo = kind === 'LONGSHOT';
            lead = yourRun && `${yourRun} og skyder.`;
          }
          const fs = finisher.skills;
          if (fs.finishing * freshFactor(finisher) + rng.next() * 8 + RUN_FINISH_BONUS > gk.skills.goalkeeping * freshFactor(gk) + rng.next() * 8 + KEEPER_EDGE) {
            scored(); duelLog[att.team.id].runGoals++; bookKind(att, finisher, kind);
            sheet.adjust(finisher.id, solo ? 1.4 : 1.25); sheet.bump(finisher.id, 'goals'); sheet.adjust(gk.id, -0.3);
            if (!solo && helper && helper.id !== finisher.id) { sheet.adjust(helper.id, 0.5); sheet.bump(helper.id, 'assists'); }
            const prose = describeFinish(fs.finishing);
            observe(finisher, `Scoring (${min}. min mod ${def.team.name}): ${finisher.shortName} afsluttede med ${prose}.`);
            const desc = describeGoal(kind, tag(finisher), tag(helper ?? finisher), min, rng);
            goalsPool.push({ scorer: tag(finisher), teamName: att.team.name, match: `${home.name} - ${away.name}`, min, kind, spectacle: goalSpectacle(kind, { finishing: fs.finishing, pace: fs.pace, ballControl: fs.ballControl, passing: (helper ?? finisher).skills.passing }, min, rng), desc });
            addEv(min, 'GOAL', 'HIGHLIGHT', att.isHome, true, `⚽ Mål: ${tag(finisher)}`, `⚽ [${att.team.name} • ${hG}-${aG}] MÅÅÅL! ${lead ? lead + ' ' : ''}${desc}`);
          } else {
            st[k(att, 'OnTarget')]++;
            sheet.adjust(gk.id, 0.5); sheet.bump(gk.id, 'saves'); sheet.adjust(finisher.id, 0.1);
            addEv(min, 'SAVE', 'PLAY', def.isHome, false, 'Redning', `🧤 [${def.team.name}] Flot redning af ${tag(gk)} på afslutning fra ${tag(finisher)} (${att.team.name}).${lead ? ' ' + lead.replace('✅ ', '') : ''}`);
            if (rng.chance(CORNER_P)) corner(att, def, cR, dR, min);
          }
        } else if (shooter.skills.finishing * freshFactor(shooter) + rng.next() * 8 > gk.skills.goalkeeping * freshFactor(gk) + rng.next() * 8 + KEEPER_EDGE) {
          scored();
          // Måltypen afgøres ÉT sted og bruges i referat, observation, avis og karakterark (v3.7).
          // Cutback følger kun DIT holds valg; for andre hold er det tilfældigt (ellers røbede det
          // modstanderens angrebsfokus). Langskud og dribletur er vægtet af evnerne.
          const ph1 = attPh.phase1_buildUp, sk = shooter.skills;
          // COUNTER kommer kun fra en rigtig kontra (v3.9) – ikke som et label her.
          const cutbackOk = own(att) ? ph1.attackFocus === 'LOW_CUTBACKS' && rng.chance(0.42) : rng.chance(0.12);
          let kind = cutbackOk ? 'CUTBACK' : null;
          if (!kind) {
            const w = { COMBINATION: 4, LONGSHOT: Math.max(0, sk.finishing - 8) * 0.45, DRIBBLE: Math.max(0, (sk.pace + sk.ballControl) / 2 - 8) * 0.45 };
            let r = rng.next() * (w.COMBINATION + w.LONGSHOT + w.DRIBBLE);
            kind = Object.keys(w).find((k) => (r -= w[k]) < 0) || 'COMBINATION';
          }
          const solo = kind === 'LONGSHOT' || kind === 'DRIBBLE'; // ingen oplægsgiver
          bookKind(att, shooter, kind);
          sheet.adjust(shooter.id, solo ? 1.4 : 1.25); sheet.bump(shooter.id, 'goals'); if (!solo) assist(0.5); sheet.adjust(gk.id, -0.3);
          const prose = describeFinish(shooter.skills.finishing);
          observe(shooter, `Scoring (${min}. min mod ${def.team.name}): ${shooter.shortName} afsluttede med ${prose}.`);
          const desc = describeGoal(kind, tag(shooter), tag(assister), min, rng);
          goalsPool.push({ scorer: tag(shooter), teamName: att.team.name, match: `${home.name} - ${away.name}`, min, kind, spectacle: goalSpectacle(kind, { finishing: sk.finishing, pace: sk.pace, ballControl: sk.ballControl, passing: assister.skills.passing }, min, rng), desc });
          addEv(min, 'GOAL', 'HIGHLIGHT', att.isHome, true, `⚽ Mål: ${tag(shooter)}`, `⚽ [${att.team.name} • ${hG}-${aG}] MÅÅÅL! ${desc}`);
        } else {
          st[k(att, 'OnTarget')]++;
          sheet.adjust(gk.id, 0.5); sheet.bump(gk.id, 'saves'); sheet.adjust(shooter.id, 0.1);
          addEv(min, 'SAVE', 'PLAY', def.isHome, false, 'Redning', `🧤 [${def.team.name}] Flot redning af ${tag(gk)} på afslutning fra ${tag(shooter)} (${att.team.name}).`);
          if (rng.chance(CORNER_P)) corner(att, def, cR, dR, min);
        }
      }
    }
  }

  // Fuldtids-analyse (v3.10, brugeren: "Ved pausen får jeg information om hvordan min opbygning
  // har klaret sig, men det får jeg ikke af vide ved fuldtid") – kun dit hold, dine valg og tal.
  const meSide = [H, A].find(own);
  if (meSide) {
    const d = duelLog[meSide.team.id], runs = meSide.tactics.phases.phase1_buildUp.offBallRuns ?? 'NORMAL';
    const p = meSide.isHome ? 'h' : 'a', poss = Math.round((st[p + 'Poss'] / (st.hPoss + st.aPoss)) * 100);
    const [myG, oppG] = meSide.isHome ? [hG, aG] : [aG, hG];
    addEv(90, 'FULLTIME', 'TACTIC', meSide.isHome, false, 'Fuldtids-analyse',
      `📊 [90' FULDTIDS-ANALYSE] ${myG}-${oppG} til dig. Du havde ${poss}% af bolden og ${st[p + 'Shots']} afslutninger (${st[p + 'OnTarget']} på mål). Din opbygning kom igennem ${d.buildWon} af ${d.build} gange; dit pres vandt bolden ${d.pressWon} af ${d.press} gange.`
      + ` Dødbolde: ${st[p + 'FreeKicks']} frispark i skudafstand, ${st[p + 'Corners']} hjørnespark, ${st[p + 'Penalties']} straffe (${st[p + 'PenaltyGoals']} mål) · frispark begået ${st[p + 'Fouls']}, tilkendt ${st[(p === 'h' ? 'a' : 'h') + 'Fouls']}.`
      + ` 🎯 Løb uden bold (${RUNS_LABEL[runs]}): ${d.runs} løb, ${d.runsWon} kom fri (${d.runGoals} mål) · kontraer imod i alt: ${d.countersAgainst} (${d.counterGoalsAgainst} mål).`);
  }
  const ratings = finalizeSheet(sheet, hG, aG, rng, counterXpForMatch);
  addEv(90, 'END', 'HIGHLIGHT', true, false, 'Slutfløjt', `🏁 SLUTFLØJT! ${home.name} ${hG} - ${aG} ${away.name}.${ratings.motm ? ` Kampens spiller: #${ratings.motm.shirtNumber} ${ratings.motm.shortName} (${ratings.motm.teamName}).` : ''}`);

  return {
    round: opts.round ?? 0,
    homeId: home.id, awayId: away.id, homeName: home.name, awayName: away.name,
    homeTacticStr, awayTacticStr, startFormations,
    // Formation og opstilling ved slutfløjt (efter Hvis-Så-skifter og indskiftninger).
    endState: { home: endOf(H), away: endOf(A) },
    homeGoals: hG, awayGoals: aG, homeVarNet,
    events, stats: st, ratings, goalsPool, injuries, observations,
  };
}
