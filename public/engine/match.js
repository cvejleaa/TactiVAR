// Kampmotoren (v2.5b-paritet, docs/spec.md §5). Ren funktion: holdene ændres ALDRIG –
// skader, observationer og karakterer returneres i resultatet og lægges ind af season.js.
// Rettet ift. v2.5b: auto-indskiftning sker i en kamplokal kopi (ændrede før lineupSlots
// permanent), og Hvis-Så-reglerne kører for begge hold og skifter reelt formation.
import { matchBenchOf } from './career.js';
import { FORMATIONS, lineOfRole, isOutOfZone, slotPosition, fitOf, arrangeByFit } from './formations.js';
import { livePositions as livePos0, coupledPositions as coupled0, kickoffPositions, apartFrom, ONSIDE_GAP, MIN_APART } from './positions.js';
import { masteryVs, counterXpForMatch } from './counter.js';
import { createSheet, finalizeSheet } from './ratings.js';
import { assignClock } from './clock.js';
import { describeFinish, headerBand, describeVarTiming, describeGoal, goalSpectacle, pickBy, gen, pl } from './clues.js';
import { MATCH_RULES, CARD_RULES, FATIGUE_SUBS_AT_ONCE, BOT_SUBS, LIMP, MIN_PLAYERS, VAR_RULES, MISS_P, MISS_BLOCK_SHARE, MISS_CORNER_P } from './match-rules.js';
import { TIRED_PER_POINT, SUBS_LIMIT, matchCost, REST_SHARE } from './freshness.js';

const PLAN_LETTERS = ['A', 'B', 'C'];

// Hvis-Så-betingelse: "mindst N mål" bagud/foran (N = margin, 1–5), uafgjort eller uanset stilling.
export function ruleConditionMet(rule, own, opp) {
  const diff = own - opp, n = Math.max(1, rule.margin || 1);
  if (rule.condition === 'TRAILING') return diff <= -n;
  if (rule.condition === 'LEADING') return diff >= n;
  if (rule.condition === 'DRAW') return diff === 0;
  if (rule.condition === 'ANY') return true;   // v3.13: "uanset stilling" – fx en planlagt udskiftning
  return false;
}
const coordsOf = (tactics) => FORMATIONS[tactics.baseFormation] || FORMATIONS['4-4-2'];
// Hvor godt spilleren passer på pladsen (v3.20.0, formations.js fitOf) – indskiftere og erstatninger vælges inden for kæden efter den
const slotFit = (tactics, p, slot) => fitOf(p.position, coordsOf(tactics)[slot]?.r);
// ÉT valg for alle fem steder (skade før kampen, rotation, udskiftning, træthedsskift, pauseskift): den med størst score × fit
// på pladsen; ved lighed listens rækkefølge (stabil sortering). score = det, stedet vægter (friskhed, evner …).
export function pickForSlot(list, tactics, slot, score = () => 1) {
  return list.slice().sort((a, b) => score(b) * slotFit(tactics, b, slot) - score(a) * slotFit(tactics, a, slot))[0];
}
// Formationsskift i kampen: de samme spillere (og tomme pladser efter rødt) fordeles efter position; målmanden bliver i mål
function refit(side, formation) {
  const next = arrangeByFit(side.starters, formation, side.tactics.baseFormation);
  if (next[0] === side.starters[0]) side.starters = next;
}
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
export const COUNTER_FINISH_BONUS = 3;   // ubalanceret forsvar (kalibreres sammen med løbene)
export const CALM_BUILD_BONUS = 2;       // "Hold på bolden": næste opbygning sidder bedre
const FB_ROLES = new Set(['LB', 'RB', 'LWB', 'RWB']);
const WIDE_ROLES = new Set(['LB', 'RB', 'LWB', 'RWB', 'LM', 'RM', 'LW', 'RW']);   // cutbackens kant (v3.16.7)
// Løb uden bold (v3.9, brugeren: "Alle kan være med til at løbe i position og afhængig af hvor
// man er på banen kan det blive til en dribletur, en aflevering (incl. tværaflevering) eller
// skud. Beslutningen kan også blive påvirket af spillerens evner til skud eller aflevering").
export const CHANCE_P = { FEW: 0.285, NORMAL: 0.3, MANY: 0.36 };
// v3.17.0 (opbygningen styrer chancen): løft efter vundet opbygning, dæmpning uden duel – se tick'ets chance
// Løftet pr. "Løb uden bold" (v3.17.0): Mange/Få bevarer deres forhold til Normal (≈ ×1,2 / ×0,95) også efter en vundet opbygning
// – med ét løft for alle forsvandt forskellen (balance-testen: Mange +0,04 mål for mod Hold på bolden, skal ≥ 0,06).
export const BUILD_LIFT_P = { FEW: 0.298, NORMAL: 0.331, MANY: 0.418 }, OPEN_DAMP_P = 0.712;   // P(chance) ≈ 0,53 efter vundet opbygning, ≈ 0,09 uden duel (Normal; før 0,30 begge)
// Halvchancen (v3.17.0, brugeren: "fuldt realistisk" – ≈ 25 afslutninger pr. kamp): et skud uden stor fare oven i tick'et (ikke
// efter tabt bold eller et mål i samme tick), oftere efter vundet opbygning. Udfaldet er en lodtrækning på xG (HALF_XG) gange
// målmandens og skyttens faktor – ikke keeper-duellen. Egne p-værdier (unik-vagten i var-check.test.mjs).
export const HALF_P = { BUILD: 0.761, OPEN: 0.531 };   // efter tabt bold (LOST) ingen
export const HALF_XG = { GOAL: 0.02, EDGE: 0.055 };   // bevidst: kanten > feltet – feltets løse bolde er klemte og blokeres; kanten er mellemrummets frie skud (holder langskud 6–11 %)
export const HALF_MISS_P = 0.613, HALF_SAVE_ADJ = 0.1, GK_SLOPE = 0.06;
// Hjørne efter en blokeret halvchance / en redning, der tippes ud (v3.17.0: færre hovedchancer gav færre hjørner – 2,4 pr. kamp)
export const HALF_CORNER_P = { BLOCK: 0.147, SAVE: 0.071 };
export const gkFactor = (gk) => Math.max(0.5, Math.min(1.8, 1 + GK_SLOPE * (10 - gk)));   // gk = målmandens evne · friskhed
export const finFactor = (fin) => Math.max(0.5, Math.min(1.5, fin / 12));                // fin = skyttens afslutning · friskhed
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
// løbene og de rigtige kontraer kom til (kalibreret med `node tools/measure-duels.mjs N loeb`). v3.15.1: 3 → 0,3 – VAR-
// chancetypens mål (0,59 pr. kamp) skulle erstattes af almindelige afslutninger (`node tools/measure-duels.mjs 1500 var`).
export const KEEPER_EDGE = 0.3;
// Dødbolde (v3.10, brugeren: "mål på hovedstød, straffe eller dødbolde. Antallet af frispark").
// Kun til holdet med bolden i en tick uden boldtab. Pr. tick: straffe 1,1 %, frispark i skudafstand
// 4,3 % (37 % direkte skud, ellers indlæg); hjørnespark efter redning/clearet luftduel 47 %;
// "stille" frispark (kun talt) 58 %. Kalibreret med `node tools/measure-duels.mjs N`.
export const PENALTY_P = 0.011, FREEKICK_P = 0.061, FK_SHOT_P = 0.37, CORNER_P = 0.9, QUIET_FOUL_P = 0.58, QUIET_CARD_P = 0.21;
export const PENALTY_BONUS = 2.3, FK_SHOT_EDGE = 4, SETPIECE_DEF_EDGE = 4.1;   // v3.17.0: 3,75 → 4,1 – midtstopperne header nu indlæggene i stedet for at slå dem (crossTaker)
// Angrebsfokus (v3.12, brugeren: "Jeg har sat mit hold til cutbacks, og alligevel er der ikke en
// eneste reference til cutbacks i referatet"): fokus afgør chancens type for ALLE hold – teksten
// om modstanderen navngiver aldrig indstillingen (§3). Direkte lange bolde giver kun en mindre
// andel høje bolde, når fokus ikke er indlæg (før tvang de 55 % af chancerne op i luften).
// Værdierne kolliderer ikke med andre chance(p) i motoren (stub-rng'en i testene skelner på p).
export const FOCUS_SHARE = { HIGH_CROSSES: 0.52, LOW_CUTBACKS: 0.38, LONG_BALL: 0.15 };
// Luftduellen i to trin (v3.12; før vandt angriberen ≈4 % i åbent spil – mod CB + keeperens evne –
// og en vundet duel var altid mål): 1) hovedstødsspilleren mod CB'en, i åbent spil med bolden i
// fart (CROSS_EDGE); 2) hovedstødet mod keeperen (HEADER_GK_EDGE).
// En clearet høj bold eller en lukket kant giver hjørnespark med CROSS_CORNER_P (en redning: CORNER_P).
export const CROSS_CORNER_P = 0.35;
export const CROSS_EDGE = 2, HEADER_GK_EDGE = 0;
// Cutback (v3.12): kantspilleren mod backen; vundet → lagt lavt tilbage til en fri afslutter.
export const CUTBACK_FINISH_BONUS = 8, CUTBACK_DEF_EDGE = -2;
// Modgiften (v3.12, Spilføreren): lav blok fylder feltet (stærk mod indlæg, men pladsen ved
// straffesparkspletten står åben); højt gegenpres lukker kanten, før den når baglinjen.
export const BOX_BONUS = { LOW_BLOCK: 1, MID_BLOCK: 0, HIGH_GEGENPRESS: 0 };    // CB'en i luftduellen (åbent spil)
export const FLANK_BONUS = { LOW_BLOCK: -2, MID_BLOCK: 0, HIGH_GEGENPRESS: 3 }; // backen i kantduellen
// Hvem modtager bolden (v3.12, brugeren: "den spiller der var nærmest hvor bolden blev spillet
// hen"): spilleren nærmest stedet i netop dette øjeblik – positionerne følger holdets fase, pres,
// løb uden bold og boldsiden (positions.js, v3.12.1) – med vægt exp(−afstand/RECEIVE_SPREAD)·
// (RECEIVE_BASE + evne), så den nærmeste oftest, men ikke altid, når bolden.
// Pladserne er i holdets egne koordinater (lille y = fremme ved modstanderens mål).
export const RECEIVE_SPREAD = 16, RECEIVE_BASE = 10;
// Duellens mand (v3.21.0, nearPick): de NEAR_POOL nærmeste, vægt friskhed / afstand² med afstanden mindst NEAR_MIN
export const NEAR_POOL = 3, NEAR_MIN = 6;
// Rækkevidde (v3.13, brugerens eksempel: en CB på egen halvdel "når baglinjen" og lægger tilbage): den, der
// slår bolden fra kanten (cutback, indlæg), skal stå højst RECEIVE_REACH derfra – ellers fik de fjerne en hale på
// ≈ 25 %. Er ingen så tæt, alle. Afsluttere vælges uden grænse (andenbolde falder også til en stopper).
export const RECEIVE_REACH = 25;
// Den almindelige afslutning: skytten står højst så langt fra skudstedet (v3.16, Spilfører: en stopper skød fra egen halvdel;
// 28 udelukker stopperne (≈29 fra kanten), men ikke midtbanen – 18 og 25 vendte målfordelingen og modgift-båndene).
export const SHOT_REACH = 28;
// Afslutterens pulje og gentagelsesdæmpning (v3.18.0, receiver shot): mindst 4 kandidater; hver tidligere afslutning × 0,65 – halvchancen og cutbacken (den almindelige afslutning uændret: dæmpet gav den langskud imod gegenpres)
export const SHOT_POOL_MIN = 4, SHOT_REPEAT_DAMP = 0.65;
const BYLINE_Y = 6, CROSS_FROM_Y = 14;   // hvor cutbacken og indlægget slås fra (holdets egne koordinater)
// Uden for feltet (y ≥ LONGSHOT_Y i øjeblikket) er et skud et langskud. Den, der får bolden ved
// feltets kant, har tid og plads (LONGSHOT_BONUS) – det opvejer, at midtbanens afslutning er lavere
// på evneskalaen; kalibreret til dokumentets 8–10 % langskud. Men på afstand er ingen bedre end
// LONGSHOT_CAP (QC v3.12.1: med fast +7 scorede en angriber uden for feltet ≈ 90 % – oftere end
// inde i feltet): skuddets værdi er min(FIN + 8, LONGSHOT_CAP), så en god afslutter står bedre i feltet. v3.15.1: loftet
// 13 → 10 (med KEEPER_EDGE 0,3 blev langskud ellers 19 % af målene).
export const LONGSHOT_Y = 30, LONGSHOT_BONUS = 8, LONGSHOT_CAP = 10;
// Et langskud tages fra skudafstand: i billedet står skytten højst på y LONGSHOT_FAR (≈ 35–40 m) – en stopper, der
// skyder, har båret bolden frem (brugeren v3.14.3: "langskud … fra egen banehalvdel, ikke så sandsynligt").
export const LONGSHOT_FAR = 38;
// I afslutningens billede står skytten (ikke langskud) i feltet: højst så langt fra målet (≈ feltet i afspilningen, 14 %).
export const SHOT_BOX_Y = 12;
// … og foran målet: i billedet står langskytten mellem x 20 og 80 (v3.16 – ikke ved hjørneflaget).
export const LONGSHOT_X = [20, 80];
// Kontraens skytte løber så langt mod målet fra sin plads i forsvarsformen (v3.16, koblede linjer).
export const COUNTER_RUN = 24;
export const longshotBonus = (fin) => Math.min(fin + LONGSHOT_BONUS, LONGSHOT_CAP) - fin;
// En del af de almindelige afslutninger falder til en spiller ved feltets kant (andenbolde, afslag –
// dokumentet: midtbanen scorer 30–35 %); resten går mod målet.
export const EDGE_SHARE = 0.5;
// Mod en lav blok er feltet lukket: oftere afslutning fra kanten; mod højt pres sjældnere (v3.16, Spilfører: "Lav blok lukker
// feltet: de skyder udefra"). Kun tærsklen for det samme træk – mellemblok = EDGE_SHARE.
export const EDGE_BY_PRESS = { LOW_BLOCK: 0.75, MID_BLOCK: EDGE_SHARE, HIGH_GEGENPRESS: 0.35 };
// Skudstedet for den almindelige afslutning ud fra terningen og forsvarets pres (ét sted – testes direkte).
export const shotSpotFor = (roll, pressingHeight) => (roll < (EDGE_BY_PRESS[pressingHeight] ?? EDGE_SHARE) ? SPOT.EDGE : SPOT.GOAL);
// Karakterbonus for en vundet taktisk duel ("styrer midtbanen", pres-erobring). v3.15: 0,35 → 0,2 – den kom ≈10 gange pr.
// kamp, så en midtbanespiller slog en firemålsscorer til Kampens spiller (Spilførerens sæsongennemgang).
export const DUEL_BONUS = 0.2;
// VAR-offside-tjek (v3.14.1): skytten tjekkes kun selv, når han er blandt de N forreste markspillere – ellers den forreste.
export const VAR_FRONT = 2;
// I billedet står en skytte bag den VAR-tjekkede mindst så mange enheder længere tilbage.
export const VAR_BEHIND = 4;
export const SPOT = { CROSS: { x: 50, y: 16 }, CUTBACK: { x: 50, y: 28 }, GOAL: { x: 50, y: 20 }, EDGE: { x: 50, y: 32 } };
const FOCUS_LABEL = { CENTRAL: 'Centralt', HIGH_CROSSES: 'Høje indlæg', LOW_CUTBACKS: 'Lave cutbacks' };
const PASS_LABEL = { SHORT: 'korte pasninger', BALANCED: 'balanceret', DIRECT_LONG: 'direkte lange bolde' };
// Zonen er der, løbet ender: formationens (eller den trukne) plads rykket 20 frem.
export function runZone(pos) {
  const y = pos.y - 20;
  return pos.x < 28 || pos.x > 72 ? 'WIDE' : y >= 60 ? 'DEEP' : y <= 35 ? 'HIGH' : 'MID';
}
// Beslutningens vægte: skud ~ FIN, aflevering ~ PAS (fra kanten et indlæg/tværaflevering),
// dribletur ~ (PAC+BAL)/2 – ganget med hvor godt zonen egner sig.
export const DECISION_ZONE = {
  SHOT: { WIDE: 0.3, DEEP: 0.6, MID: 1.5, HIGH: 3 },   // v3.16: en kantløber skyder sjældent selv fra kanten (før 1)
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
// Bots hviler før kampen en starter, der er under grænsen + ROTATE_MARGIN (han ville ellers skiftes ud tidligt).
export const ROTATE_MARGIN = 10, ROTATE_SKILL = 2;
const LINE_WORD = { GK: 'målmand', DEF: 'forsvarsspiller', MID: 'midtbanespiller', ATT: 'angriber' };
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
  // Bænken er kamptruppens 7 (v3.18.0, matchBenchOf – ét sted); reserverne er ikke med i kampen. Med 18 spillere som før.
  const squad = new Set(matchBenchOf(team).map((p) => p.id));
  const bench = () => team.squad.filter((p) => squad.has(p.id) && !used.has(p.id) && isAvailable(p));
  // v3.13 (QC): rotationen følger botens udskiftningsgrænse – ellers stillede en bot med grænse 75 en
  // starter på 72 % og skiftede ham ud i 3. minut. Uden grænse (0) som før: under 70, frisk ≥ 85.
  const rest = team.subsLimit ? team.subsLimit + ROTATE_MARGIN : 70, freshMin = team.subsLimit ? team.subsLimit + ROTATE_MARGIN + 5 : 85;
  // v3.16.6 (Spilfører: "#16 starter for en træt #10" og straks "skadet, erstattes af #10"): skadede erstattes FØR rotationen
  // – af den friskeste i kæden, så rotationen aldrig hviler ham (den kræver en friskere i kæden) – og en hvilet spiller
  // forbliver brugt (kommer ikke ind i kampen, heller ikke ved skade).
  starters.forEach((p, slot) => {
    if (p && isAvailable(p)) return;
    const line = p ? p.line : lineOfRole(coordsOf(tactics)[slot].r);
    const inLine = bench().filter((b) => b.line === line).sort((a, b) => avgSkill(b) - avgSkill(a));   // ved lighed: bedste evner
    const sub = pickForSlot(inLine, tactics, slot, (b) => b.freshness ?? 100) || bench()[0];
    if (!sub) return;
    if (p) notes.push({ isHome, text: `📋 [${team.name}] ${tag(p)} er skadet og erstattes i startopstillingen af ${tag(sub)}.` });
    starters[slot] = sub; used.add(sub.id);
  });
  if (team.isBot) starters.forEach((p, slot) => {
    if (!p || !isAvailable(p) || (p.freshness ?? 100) >= rest) return;
    const fresh = bench().filter((b) => b.line === p.line && (b.freshness ?? 100) >= freshMin && avgSkill(b) >= avgSkill(p) - ROTATE_SKILL);
    if (!fresh.length) return;
    const sub = pickForSlot(fresh, tactics, slot, avgSkill);
    notes.push({ isHome, text: `📋 [${team.name}] ${tag(sub)} starter i stedet for en træt ${tag(p)}.` });
    starters[slot] = sub; used.add(sub.id);
  });
  return { team, isHome, tactics, starters, used, subsUsed: 0, windows: 0, lastSubMin: null, benchAvailable: bench };
}

function rolesOf(side) {
  const coords = coordsOf(side.tactics);
  const defs = [], mids = [], atts = [], cbs = [];
  side.starters.forEach((p, i) => {
    if (i === 0 || !p) return;   // en udvist spillers plads er tom (v3.15)
    if (coords[i].r === 'CB') cbs.push(p);
    const line = lineOfRole(coords[i].r);
    (line === 'DEF' ? defs : line === 'MID' ? mids : atts).push(p);
  });
  // En tom kæde (udvisning, Hvis-Så-ombytning) lånes fra nabokæden – listerne er aldrig tomme og har aldrig en tom plads.
  const all = side.starters.filter((p, i) => i > 0 && p);
  const or = (...ls) => ls.find((l) => l.length) ?? all;
  return { gk: side.starters[0], defs: or(defs, mids, atts), mids: or(mids, defs.concat(atts)), atts: or(atts, mids, defs), cbs };
}

function customDragged(side) {
  const cc = side.tactics.customCoords || {};
  return Object.keys(cc).map(Number).filter((slot) => slot > 0 && slot < 11)
    .filter((slot) => side.starters[slot])   // ikke en udvist spillers tomme plads
    .map((slot) => ({ player: side.starters[slot], role: coordsOf(side.tactics)[slot].r, outOfZone: isOutOfZone(side.tactics, slot) }));
}

const avg = (arr, f) => arr.reduce((a, p) => a + f(p), 0) / Math.max(1, arr.length);

// v3.14 (Arkitekt): trukne positioner og faser gemmes KUN for et menneskestyret hold (ejerens egne valg) – før lå
// en bots fulde indstillinger i det gemte spil, selv om intet viste dem.
const endOf = (s, full) => ({ formation: s.tactics.baseFormation, starters: s.starters.map((p) => p?.id ?? null), ...(full ? { customCoords: structuredClone(s.tactics.customCoords), phases: structuredClone(s.tactics.phases) } : {}) });

// Opbygning og pres i pause- og fuldtidsanalysen (v3.16.7, Spilfører: "dit pres vandt bolden 2 af 2" var to offside-fælder): fælden
// er med i pressets tal (presset stoppede opbygningen), men står for sig – og din egen opbygnings offsides ligeså.
// Skifte-notens slutning, når loftet (FATIGUE_SUBS_AT_ONCE) er nået (v3.17.0): block = årsagen til, at der ikke kommer flere skift
// (subBlock for næste tick, eller kampens slutning), ellers venter han med left skift tilbage – intet løfte om "næste skift".
export const waitText = (block, left) => (block ? `og ${block}` : `han må vente til en senere skifte-pause (${left} skift tilbage)`);
export function duelText(d, o, half = false) {
  const off = o.trapWon, trap = d.trapWon;
  const press = trap ? `dit pres ${half ? 'har stoppet' : 'stoppede'} opbygningen ${d.pressWon} af ${pl(d.press, 'gang', 'gange')} (${pl(d.pressWon - trap, 'erobring', 'erobringer')}, ${trap} på offside).`
    : `dit pres ${half ? 'har vundet' : 'vandt'} bolden ${d.pressWon} af ${pl(d.press, 'gang', 'gange')}.`;
  const stops = d.build - d.buildWon, offTxt = !off ? '' : stops === 1 ? ' (stoppet var offside)' : off === stops ? ` (alle ${stops} stop var offside)` : ` (af de ${stops} stop var ${off} offside)`;   // v3.17.0: ikke "af de 1 stop var 1"
  const build = `Din opbygning ${half ? 'er kommet' : 'kom'} igennem ${d.buildWon} af ${pl(d.build, 'gang', 'gange')}${offTxt}`;
  // Aldrig "0 af 0 gange" (Spilfører v3.16.7): kun de dele, kampen havde
  if (!d.press) return `${build}.`;
  if (!d.build) return `${press[0].toUpperCase()}${press.slice(1)}`;
  return `${build}; ${press}`;
}

// Fuldtids-analysens angrebsdel (QC v3.12): kun de dele, dine valg (eller kampen) gav – ellers
// stod der "0 cutbacks, 0 høje bolde" til et centralt hold. Cutbacks fra løb på kanten tæller med.
function attackLine(d, ph) {
  const parts = [];
  if (ph.attackFocus === 'LOW_CUTBACKS' || d.cutbacks) parts.push(`${pl(d.cutbacks, 'cutback', 'cutbacks')} (${d.cutbackGoals} mål, ${d.cutbacksBlocked} stoppet ved kanten)`);
  if (ph.attackFocus === 'HIGH_CROSSES' || ph.passingStyle === 'DIRECT_LONG' || d.crosses) parts.push(`${pl(d.crosses, 'høj bold', 'høje bolde')} (${pl(d.crossesWon, 'vundet luftduel', 'vundne luftdueller')} i åbent spil, ${d.headerGoals} hovedstødsmål)`);
  return parts.length ? parts.join(', ') : 'ingen cutbacks eller høje bolde';
}

export function simulateMatch(home, away, rng, opts = {}) {
  const events = [];
  const lineupNotes = [];
  const H = prepareSide(home, true, lineupNotes), A = prepareSide(away, false, lineupNotes);
  // Bevægelsen (v3.21.0, positions.js driftAt): kampens seed trækkes én gang; tick'et (curMin / 3) og holdet giver hver spiller
  // samme plads i alle kald i samme tick – modtagervalget, VAR-forreste, øjeblikkene og sporet læser de samme positioner.
  // opts.drift = false KUN til de deterministiske test-arenaer med pinnede koordinater og trukne aktører (som liveEnergy): uden
  // bevægelsen og uden afstandsvalget (nearPick) – spillet sender det aldrig.
  const driftOn = opts.drift !== false, driftSeed = driftOn ? Math.floor(rng.next() * 2 ** 31) : 0;
  const driftOf = (tac) => (!driftOn ? null : tac === H.tactics ? { seed: driftSeed, team: 1, t: curMin / 3 } : tac === A.tactics ? { seed: driftSeed, team: 2, t: curMin / 3 } : null);
  const livePositions = (tac, o = {}) => livePos0(tac, { ...o, drift: driftOf(tac) });
  const coupledPositions = (b, o, opt = {}) => coupled0(b, o, { ...opt, ballDrift: driftOf(b), oppDrift: driftOf(o) });
  const sheet = createSheet();
  const goalsPool = [], injuries = [], observations = [];
  const st = { hPoss: 10, aPoss: 10, hShots: 0, aShots: 0, hOnTarget: 0, aOnTarget: 0, hXg: 0, aXg: 0, hAerialWon: 0, aAerialWon: 0, hVarChecks: 0, aVarChecks: 0, hTacticSuccess: 0, aTacticSuccess: 0, hFouls: 0, aFouls: 0, hInjuries: 0, aInjuries: 0, hCorners: 0, aCorners: 0, hFreeKicks: 0, aFreeKicks: 0, hPenalties: 0, aPenalties: 0, hPenaltyGoals: 0, aPenaltyGoals: 0, hSetPieceGoals: 0, aSetPieceGoals: 0, hHeaderGoals: 0, aHeaderGoals: 0, hCounterGoals: 0, aCounterGoals: 0, hYellows: 0, aYellows: 0, hReds: 0, aReds: 0 };
  let hG = 0, aG = 0, homeVarNet = 0;
  const k = (side, name) => (side.isHome ? 'h' : 'a') + name;
  const other = (side) => (side === H ? A : H);

  // Varianter pr. kamp (v3.16.3, Spilfører: "styrer midtbanen" tre gange for samme spiller i én kamp – pickBy på tick'et ramte
  // samme variant hvert 4. tick): hver (familie, aktør) går videre til næste variant, hver gang den bruges. Intet rng-træk.
  // advance = false: samme variant som næste kald (etiket og tekst i samme linje).
  const varyCount = new Map();
  const vary = (list, fam, id, advance = true) => {
    const k = `${fam}|${id}`, c = varyCount.get(k) ?? 0;
    if (advance) varyCount.set(k, c + 1);
    // + runden (v3.16.7, QC): ellers fik samme spiller samme første variant i hver kamp hele sæsonen
    return pickBy(list, c + (opts.round ?? 0), fam, id);
  };
  const minClock = new Map();   // hændelsens indeks → tidligste minut på uret (Hvis-Så – clock.js)
  const goalTexts = new Set();   // kampens brugte måltekster (describeGoal – ingen gentagelse i en kamp)
  const addEv = (min, type, category, isHome, plot, label, text, varMsg) => {
    events.push({ min, type, category, isHome, plot, label, text, varMsg, hG, aG, stats: { ...st } });
    shotMoment(type);
  };
  // ---------- Kampens spor (v3.16, brugeren: "et heat map for kampen … en 2d simulering af kampen, så vi bedre kan
  // kontrollere spilmotoren"). Kun aflæsning: optageren trækker aldrig på rng og skriver aldrig i seen/seenX (QC B5 –
  // fingeraftrykket i trace-golden.test.mjs). Ét koordinatsystem: hjemmeholdet angriber mod y 0, udeholdet spejles
  // (100 − x, 100 − y); heltal. frames: et billede pr. tick (t = tick-indeks, 0 = afspark) efter boldbesiddelsen og
  // skiftene; moments: afslutningerne (mål, redning, forbi, flag, VAR-tjek) med aktørerne, hvor motoren kender dem.
  // Dødbolde (straffe, frispark, hjørne) får bevidst intet billede – motoren regner ingen placeringer dér.
  // Spillere på banen = holdets 11 pladser (en skadet uden indskiftning halter videre og står der; en udvist er væk).
  const trace = { v: 1, frames: [], moments: [] };
  let shotSide = null, shotCaught = false, setPieceNow = false, shotBy = null, shotLong = false, momentCheck = null;
  const common = (side, x, y) => (side === H ? [Math.round(x), Math.round(y)] : [Math.round(100 - x), Math.round(100 - y)]);
  const ptsOf = (side, pos, moves = null, starters = side.starters) => starters.map((p, i) => p && [p.id, ...common(side, ...(moves?.[p.id] ?? [pos[i].x, pos[i].y]))]).filter(Boolean);
  // Ét billede pr. øjeblik (QC v3.16): positionerne i seen er AFLEVERINGENS øjeblik (koblede linjer). I et afslutnings-
  // øjeblik (mål, redning, forbi) er skytten sluppet ind i feltet – han tegnes på højst SHOT_BOX_Y og foran målet (et langskud
  // og en skytte bag en VAR-tjekket holdkammerat undtaget). I et offside-øjeblik (VAR-tjek, annulleret mål, flag) tegnes den
  // tjekkede på den side af linjen, kendelsen siger (QC B2: billedet følger kendelsen; kendelsen er stadig lodtrækningen).
  function momentAt(side, atkPos, moves, spot, caught, extra = {}) {
    const def = other(side), x = seenX[side.team.id] ?? 50, kind = events.at(-1)?.type;
    const defPos = seen[def.team.id] ?? coupledPositions(side.tactics, def.tactics, { ballX: x, caught, ...onOf(side, def) }).opp;
    const mv = { ...(moves || {}) };
    const shooter = extra.scorer ?? extra.shooter?.id ?? null;
    const ownXY = (id) => { if (mv[id]) return mv[id]; const i = side.starters.findIndex((p) => p?.id === id); return i > 0 ? [atkPos[i].x, atkPos[i].y] : null; };
    const line = 100 - Math.max(...def.starters.map((p, i) => (i > 0 && p ? defPos[i].y : -Infinity)));
    const b = extra.behind?.id === shooter ? extra.behind : null;
    if (PASS_MOMENTS.has(kind)) {
      const c = momentCheck && ownXY(momentCheck.id);
      if (c) mv[momentCheck.id] = [c[0], momentCheck.offside ? line - 1 : line + ONSIDE_GAP];
    } else if (shooter != null && !b) {
      const c = ownXY(shooter);
      // Langskud: fra skudafstand foran målet – også når det reddes eller går forbi (QC v3.16: kun målet var klemt)
      if (c) mv[shooter] = shotLong ? [Math.min(LONGSHOT_X[1], Math.max(LONGSHOT_X[0], c[0])), Math.min(LONGSHOT_FAR, Math.max(LONGSHOT_Y, c[1]))]
        : [Math.min(70, Math.max(30, c[0])), Math.min(c[1], SHOT_BOX_Y)];
    }
    if (b) { const c = ownXY(shooter); if (c && c[1] < b.y) mv[shooter] = [c[0], b.y]; }
    // Skytten står ikke oven i målmanden (Spilfører v3.16.1: hovedstødsmålene lå alle på keeperen) – et skridt til siden
    const s0 = shooter != null && ownXY(shooter), gk = def.starters[0] && [100 - defPos[0].x, 100 - defPos[0].y];
    if (s0 && gk && Math.hypot(s0[0] - gk[0], s0[1] - gk[1]) < MIN_APART) mv[shooter] = [gk[0] + (s0[0] < gk[0] ? -1 : 1) * MIN_APART, s0[1]];
    const att = ptsOf(side, atkPos, mv), dpts = ptsOf(def, defPos);
    // Bolden ved skytten (Spilfører v3.16: bolden stod på en fast plet, mens skytten stod ved hjørneflaget). 📍 er uændret.
    const at = shooter != null && att.find((q) => q[0] === shooter);
    const ball = at ? [at[1], at[2]] : common(side, spot.x, spot.y);
    trace.moments.push({ t: curMin / 3, ev: events.length - 1, kind, side: side === H ? 'h' : 'a', ball, h: side === H ? att : dpts, a: side === H ? dpts : att,
      shooter, ...(shotLong && shooter != null && !PASS_MOMENTS.has(kind) ? { long: true } : {}), ...(extra.scorer ? { scorer: extra.scorer, assist: extra.assist ?? null } : {}) });
  }
  const PASS_MOMENTS = new Set(['VAR_CHECK', 'VAR_NO_GOAL', 'OFFSIDE_FLAG']);
  const SHOT_MOMENTS = new Set(['SAVE', 'MISS', 'OFFSIDE_FLAG', 'VAR_CHECK', 'VAR_NO_GOAL']);
  function shotMoment(type) {
    if (setPieceNow || !shotSide || !SHOT_MOMENTS.has(type)) return;
    momentAt(shotSide, seen[shotSide.team.id] ?? coupledPositions(shotSide.tactics, other(shotSide).tactics, onOf(shotSide, other(shotSide))).ball, null, SPOT.GOAL, shotCaught, { shooter: shotBy });
  }
  // Afspark: begge hold i egen halvdel, presset sammen så formationen kan genkendes (v3.16.1: "7 spillere på midterlinjen").
  function kickoffFrame() {
    trace.frames.push({ t: 0, poss: null, ball: [50, 50], h: ptsOf(H, kickoffPositions(H.tactics, H.starters.map(Boolean))), a: ptsOf(A, kickoffPositions(A.tactics, A.starters.map(Boolean))) });
  }
  // Grundbilledet pr. tick (v3.16.1, brugeren: "ingen udvikling i starten af kampen"; QC B1): tick'ets opbygning FØR
  // afslutningerne, men tegnet ud fra duellens udfald, som allerede er trukket (ingen nye træk – ingen kamp ændres):
  //  - ingen duel: bolden hos opspilleren, og holdene forskudt efter hans side af banen;
  //  - opbygningen vinder: bolden spillet frem til angriberen på linjen – run: true;
  //  - presset vinder: forsvaret har erobret bolden (caught-formen), bolden hos presseren – lost: true;
  //  - offside-fælden: angriberen står foran linjen, bolden hos ham – offside: true.
  // poss er tick'ets besiddelse. Spillerne er dem på banen ved tick'ets start (et rødt kort i tick'et står efter billedet).
  const OFFSIDE_DRAW = 3;
  function tickFrame(t, att) {
    const def = other(att), st0 = new Map([[H, H.starters.slice()], [A, A.starters.slice()]]);
    let done = false;
    return (outcome, { playmaker, presser, striker, defs = [] } = {}) => {
      if (done) return; done = true;
      const on = (s) => st0.get(s).map(Boolean), slot = (s, p) => (p ? st0.get(s).indexOf(p) : -1);
      const pm = slot(att, playmaker), base = livePositions(att.tactics, { attacking: true, ballX: 50 });
      const x0 = pm > 0 ? base[pm].x : seenX[att.team.id] ?? 50;
      const draw = (ballX, holder = null) => {
        let ballSide = att, oppSide = def, k, at;
        if (outcome === 'press') {
          ballSide = def; oppSide = att;
          k = coupledPositions(def.tactics, att.tactics, { ballX: 100 - ballX, caught: true, ballOn: on(def), oppOn: on(att) });
          at = k.ball[slot(def, presser)];
        } else {
          // Opbygningen vundet: bolden spillet frem til angriberen på linjen – ikke et løb alene mod målmanden (Spilfører
          // v3.16.1: løberen var ofte en anden end tick'ets skytte og stod ved keeperen, også når der slet ikke kom en afslutning)
          const runner = outcome === 'trap' ? slot(att, striker) : -1;
          k = coupledPositions(att.tactics, def.tactics, { ballX, runner, ballOn: on(att), oppOn: on(def) });
          // Offside: angriberen lige foran linjen (OFFSIDE_DRAW), ikke et helt løb frem – han blev fanget, ikke sluppet igennem
          if (outcome === 'trap' && runner > 0) {
            k.ball[runner] = { x: k.ball[runner].x, y: k.line - OFFSIDE_DRAW };
            apartFrom(k.ball, [runner], k.opp, k.opp.map((q, i) => i).filter((i) => on(def)[i]));   // ved siden af forsvareren, ikke oven i ham
          }
          at = k.ball[runner > 0 ? runner : outcome === 'build' ? slot(att, striker) : holder ?? pm];
        }
        const ball = at ? common(ballSide, at.x, at.y) : common(att, ballX, 50);
        const shape = (s) => (s === ballSide ? k.ball : k.opp);
        return { t, poss: att === H ? 'h' : 'a', ...(outcome === 'press' ? { lost: true } : {}), ...(outcome === 'build' ? { run: true } : {}), ...(outcome === 'trap' ? { offside: true } : {}), ball, h: ptsOf(H, shape(H), null, st0.get(H)), a: ptsOf(A, shape(A), null, st0.get(A)) };
      };
      // Ingen duel og samme billede som forrige tick (samme opspiller to gange, v3.16.2 – brugeren: "minut 24 og 27 er ens i
      // 2d"): holdet spiller den rundt bagfra – bolden hos forsvareren nærmest opspilleren. Kun boldholderen skifter; formen er
      // den samme (QC: ingen opfundne positioner). Efter en duel må to billeder gerne være ens – underteksten siger udfaldet.
      let f = draw(x0);
      const prev = trace.frames.at(-1), key = (q) => JSON.stringify([q.h, q.a, q.ball]);
      if (outcome === 'none' && pm > 0 && prev && key(prev) === key(f)) {
        const live = livePositions(att.tactics, { attacking: true, ballX: x0 });
        const back = defs.map((p) => slot(att, p)).filter((i) => i > 0).sort((a, b) => Math.abs(live[a].x - live[pm].x) - Math.abs(live[b].x - live[pm].x) || a - b)[0];
        if (back) f = draw(x0, back);
      }
      trace.frames.push(f);
    };
  }
  const observe = (player, text) => observations.push({ playerId: player.id, text });
  // Løbet følger pladsen (v3.8): også en indskifter løber efter den rolle, han kommer ind på.
  // Friskhed i kampen (v3.13, freshness.js): tabet indtil nu efter arkets drain90 og minutterne på
  // banen. opts.liveEnergy = false KUN til de deterministiske test-arenaer (deres tærskler forudsætter
  // fuld friskhed hele kampen) – spillet selv sender aldrig flaget (vagt i tests).
  const live = opts.liveEnergy !== false;
  // tickFoul: tick'ets forseelse ({ side, p }) – et frispark i samme tick er den forseelse, ikke en ny (v3.16.6, Spilfører:
  // "Gult kort til X" og "Frispark efter Ys forseelse" i samme minut)
  let curMin = 1, sentOffThisTick = false, varBehind = null, tickFoul = null;
  // Med færre mand (v3.15): ekstra tab af friskhed siden udvisningen (side.shortMins = summen af minutter × manglende mand).
  const sideOf = (p) => (sheet.entries[p.id]?.isHome ? H : A);
  // Kun minutter, hvor spilleren selv var på banen (QC: en indskifter efter udvisningen arvede ellers hele tabet).
  const shortMinutes = (side, minIn) => (minIn <= (side.firstDown ?? Infinity) ? side.shortMins ?? 0 : 0) + (side.down ? side.down * Math.max(0, curMin - Math.max(side.downSince, minIn)) : 0);
  const lostAt = (p) => { const e = sheet.entries[p.id]; return live && e?.drain90 ? e.drain90 * (Math.max(0, curMin - e.minIn) + CARD_RULES.SHORT_DRAIN * shortMinutes(sideOf(p), e.minIn)) / 90 : 0; };
  const matchFresh = (p) => (p.freshness ?? 100) - lostAt(p);
  const shortF = (side) => 1 - CARD_RULES.SHORT_PER_MAN * (side?.down ?? 0);
  // Haltende: skadet i kampen uden indskiftning (sheet.entries.injured – en udskiftet skadet står ikke på banen)
  const limping = (p) => !!(p && sheet.entries[p.id]?.injured);
  const fit = (list) => { const f = list.filter((p) => p && !limping(p)); return f.length ? f : list; };
  // Uden for position (v3.20.0): pladsens fit (formations.js FIT) – den plads, han står på NU (skift og Hvis-Så tæller med)
  const posF = (p) => { const side = sideOf(p), slot = side ? side.starters.indexOf(p) : -1; return slot >= 0 ? slotFit(side.tactics, p, slot) : 1; };
  const ff = (p) => freshFactor(p) * (1 - TIRED_PER_POINT * lostAt(p)) * shortF(sideOf(p)) * (limping(p) ? LIMP.factor : 1) * posF(p);
  const register = (side, p, role, minIn, slot) => sheet.register(p, side.team, side.isHome, role, minIn, rng, masteryVs(p, other(side).team), slot, slot != null ? coordsOf(side.tactics)[slot].r : role);

  for (const side of [H, A]) side.starters.forEach((p, i) => p && register(side, p, coordsOf(side.tactics)[i].r, 1, i));
  // Startformationen gemmes, så karakterarket kan vise spillerne på banen.
  const startFormations = { home: H.tactics.baseFormation, away: A.tactics.baseFormation };
  const startPhases = { home: structuredClone(H.tactics.phases), away: structuredClone(A.tactics.phases) };
  const hAvg = Math.round(avg(H.starters, (p) => masteryVs(p, away)));
  const aAvg = Math.round(avg(A.starters, (p) => masteryVs(p, home)));

  // Andre holds taktiske overvejelser (faser, Hvis-Så) må ikke kunne læses – kun deres
  // startopstilling. Egne valg (det menneskestyrede hold) vises fuldt.
  const own = (s) => !s.team.isBot;
  // Fase-dueller pr. hold til pause-analysen: forsøg/sejre med opbygning og med pres.
  const duelLog = Object.fromEntries([H, A].map((s) => [s.team.id, { build: 0, buildWon: 0, press: 0, pressWon: 0, runs: 0, runsWon: 0, runGoals: 0, countersAgainst: 0, counterGoalsAgainst: 0,
    crosses: 0, crossesWon: 0, headerGoals: 0, cutbacks: 0, cutbacksBlocked: 0, cutbackGoals: 0, trapWon: 0 }]));   // trapWon: pres-sejre ved offside-fælden (v3.16.7)
  // Modtageren: spilleren nær det sted, bolden spilles hen (se RECEIVE_SPREAD). exclude = afleveren.
  // ctx = { attacking, ballX } – øjeblikket (positions.js). Positionerne huskes til øjebliksbilledet ved mål.
  let seen = {}, seenX = {};
  // Begge holds positioner i øjeblikket (v3.16, koblede linjer – positions.js coupledPositions): ét sted, som modtagervalget,
  // VAR-forreste, langskud, 📍 og sporet læser (seen/seenX). ctx: attacking (side har bolden), caught (side har lige vundet
  // bolden – kontra, står i forsvarsform), ballX (side's egne koordinater), runner/step (løberen, der er sluppet igennem).
  const onOf = (b, o) => ({ ballOn: b.starters.map(Boolean), oppOn: o.starters.map(Boolean) });   // tomme pladser (udvist) tæller ikke
  function shapes(side, ctx = {}) {
    const x = ctx.ballX ?? 50, o = other(side);
    if (ctx.attacking === false && !ctx.caught) {   // side forsvarer – modstanderen har bolden
      const r = coupledPositions(o.tactics, side.tactics, { ballX: 100 - x, ...onOf(o, side) });
      seen[o.team.id] = r.ball; seenX[o.team.id] = 100 - x; seen[side.team.id] = r.opp; seenX[side.team.id] = x;
      return r.opp;
    }
    const r = coupledPositions(side.tactics, o.tactics, { ballX: x, caught: !!ctx.caught, runner: ctx.runner ?? -1, step: ctx.step, ...onOf(side, o) });
    seen[side.team.id] = r.ball; seenX[side.team.id] = x; seen[o.team.id] = r.opp; seenX[o.team.id] = 100 - x;
    return r.ball;
  }
  // prefer: plads-filtre (i → bool) i prioriteret rækkefølge (v3.16.7). Rækkevidden går forud for pladsen: først de
  // foretrukne inden for rækkevidde, så alle inden for rækkevidde, så de foretrukne, så alle.
  // shot (v3.18.0, Spilfører: "N. Jakobsen 13 afslutninger" – 5-4-1's eneste angriber fik alt): en afslutter vælges blandt
  // mindst SHOT_POOL_MIN (de nærmeste ikke-stoppere fyldes på), og hver afslutning, han allerede er valgt til i kampen, dæmper
  // hans vægt med SHOT_REPEAT_DAMP. Samme ene rng-træk.
  const shotPicks = new Map();
  function receiver(side, spot, skill, exclude = null, ctx = { attacking: true, ballX: 50 }, reach = Infinity, prefer = null, shot = false) {
    const pos = shapes(side, ctx), d = (i) => Math.hypot(pos[i].x - spot.x, pos[i].y - spot.y);
    const all = side.starters.map((p, i) => ({ p, i })).filter(({ p, i }) => i > 0 && p && p !== exclude);
    let near = all.filter(({ i }) => d(i) <= reach);
    if (shot && near.length < SHOT_POOL_MIN) {
      const roles = coordsOf(side.tactics), more = all.filter((c) => !near.includes(c) && roles[c.i].r !== 'CB').sort((a, b) => d(a.i) - d(b.i));
      near = [...near, ...more.slice(0, SHOT_POOL_MIN - near.length)];
    }
    const pick = (l) => (prefer ?? []).map((f) => l.filter(({ i }) => f(i))).find((x) => x.length);
    const cand = pick(near) ?? (near.length ? near : null) ?? pick(all) ?? all;
    const w = cand.map(({ p, i }) => Math.exp(-d(i) / RECEIVE_SPREAD) * (RECEIVE_BASE + Math.max(0, skill(p))) * (shot ? SHOT_REPEAT_DAMP ** (shotPicks.get(p.id) ?? 0) : 1));
    let r = rng.next() * w.reduce((a, b) => a + b, 0);
    const chosen = (cand[w.findIndex((x) => (r -= x) < 0)] ?? cand.at(-1)).p;
    if (shot) shotPicks.set(chosen.id, (shotPicks.get(chosen.id) ?? 0) + 1);
    return chosen;
  }
  // Duellens mand efter afstand (v3.21.0, brugeren: "så må spillet også blive mere præcist"; Spilfører: vægtet blandt de
  // nærmeste, ikke altid den nærmeste – ellers samles duellerne på én): blandt de NEAR_POOL nærmeste af cands (holdet side's
  // pladser i pos) vægter hver friskhed / afstand² (afstanden mindst NEAR_MIN). Ét rng-træk som rng.pick; skriver ikke i seen.
  const nearRank = new Map();
  const mirrorPt = (q) => (q ? { x: 100 - q.x, y: 100 - q.y } : { x: 50, y: 50 });
  function nearPick(side, cands, pt, pos) {
    if (!driftOn) return rng.pick(cands);   // test-arenaerne (opts.drift = false): motoren fra før v3.21 – også valget
    const l = cands.map((p) => ({ p, i: side.starters.indexOf(p) })).filter(({ i }) => i > 0 && pos[i])
      .map((c) => ({ ...c, d: Math.max(NEAR_MIN, Math.hypot(pos[c.i].x - pt.x, pos[c.i].y - pt.y)) })).sort((a, b) => a.d - b.d || a.i - b.i).slice(0, NEAR_POOL);
    if (!l.length) return rng.pick(cands);
    const w = l.map(({ p, d }) => Math.max(0.05, ff(p)) / d ** 2);
    let r = rng.next() * w.reduce((a, b) => a + b, 0);
    const k = Math.max(0, w.findIndex((x) => (r -= x) < 0));
    nearRank.set(l[k].p.id, k);   // 0 = den nærmeste – teksten siger kun "nærmest" om ham (QC)
    return l[k].p;
  }
  // Cutbackens afslutter (v3.18.0): ikke en midtstopper, når en anden er inden for SHOT_REACH (Spilfører: "#3 lagde den tilbage
  // til midtstopperen")
  const notCB = (side) => [(i) => coordsOf(side.tactics)[i].r !== 'CB'];
  // Øjebliksbillede ved et mål i åbent spil (v3.12.1, brugeren valgte at kunne SE bevægelsen): KUN
  // dit holds positioner gemmes (QC, §3 – modstanderens røber pres og løb): ved dit mål dit angreb,
  // ved et mål imod dit forsvar i øjeblikket. Punkter pr. spiller-id (indskiftere, Hvis-Så-skift).
  // Hænges på den seneste hændelse; spot = hvor bolden kom (holdets egne koordinater).
  // caught = dit hold mistede bolden i angrebet (kontra imod): det står i angrebsform, ikke i sin blok.
  // moves = { spiller-id: [x, y] }: hvor aktørerne var i selve hændelsen (cutbackens oplægsgiver ved baglinjen,
  // scoreren på pletten) – billedet viser handlingen, ikke kun holdets form (brugerens eksempel v3.13).
  function snapshot(side, scorer, helper, spot = SPOT.GOAL, caught = false, moves = null) {
    if (seen[side.team.id]) momentAt(side, seen[side.team.id], moves, spot, caught, { scorer: scorer.id, assist: helper && helper !== scorer ? helper.id : null, behind: varBehind });
    const mine = [H, A].find(own);
    if (!mine) return;
    const ev = events.at(-1), attacking = side === mine;
    const pos = attacking ? seen[side.team.id] : seen[mine.team.id] ?? livePositions(mine.tactics, { attacking: caught, ballX: caught ? 50 : 100 - (seenX[side.team.id] ?? 50) });
    if (!pos) return;
    ev.snapshot = {
      attacking, formation: mine.tactics.baseFormation,
      pts: mine.starters.map((p, i) => p && (attacking && moves?.[p.id] ? [p.id, ...moves[p.id]] : [p.id, pos[i].x, pos[i].y])).filter(Boolean),
      scorer: attacking ? scorer.id : null, assist: attacking && helper && helper !== scorer ? helper.id : null,
      ball: attacking ? [spot.x, spot.y] : [100 - spot.x, 100 - spot.y],
    };
    // VAR tjekkede en holdkammerat foran skytten (v3.15.1): skytten tegnes aldrig foran den tjekkede (brugeren v3.14.2) –
    // mindst VAR_BEHIND længere tilbage, og bolden ved ham.
    const pt = attacking && varBehind?.id === scorer.id && ev.snapshot.pts.find((q) => q[0] === scorer.id);
    if (pt && pt[2] < varBehind.y) { pt[2] = varBehind.y; ev.snapshot.ball = [pt[1], pt[2]]; }
    varBehind = null;
  }

  // Er spilleren blandt de VAR_FRONT forreste markspillere i øjeblikket (laveste y = nærmest modstanderens mål)? Uden rng.
  // Rækkefølgen forrest → bagerst (laveste y). Med koblede linjer står flere på linjen; holdets egen form (rå y) afgør så,
  // hvem der er forrest (v3.16 – ellers blev "den forreste" vilkårlig).
  function frontOrder(side) {
    const pos = seen[side.team.id];
    if (!pos) return null;
    const raw = livePositions(side.tactics, { attacking: true, ballX: seenX[side.team.id] ?? 50 });
    return side.starters.map((p, i) => ({ p, i })).filter(({ p, i }) => i > 0 && p).sort((a, b) => (pos[a.i].y - pos[b.i].y) || (raw[a.i].y - raw[b.i].y) || (a.i - b.i));
  }
  // exclude: oplægsgiveren – han spillede bolden og kan ikke være offside i sit eget oplæg (v3.16.7, Spilfører)
  function frontOf(side, exclude = null) { return frontOrder(side)?.find((x) => x.p !== exclude)?.p ?? null; }
  function isFront(side, p) {
    const order = frontOrder(side);
    if (!order) return true;
    const k = order.findIndex((x) => x.p === p);
    if (k < 0) return false;   // ikke længere på banen (skiftet ud i samme minut) – den forreste tjekkes
    return k < VAR_FRONT;
  }

  // Offside-tjekket (VAR ved mål og straffe, linjedommerens flag): den forreste af VAR_FRONT tjekkes – står skytten bagved,
  // hans forreste holdkammerat (brugeren v3.14.1). Duellen fra før v3.15.1: løbets timing (varPulse) og modkunnen mod
  // fælden mod forsvarerens placering – en lodtrækning, så én kendelse ikke afslører spillerens trin (QC).
  function offsideCheck(att, shooter, defender, helper = null) {
    const off = isFront(att, shooter) ? shooter : frontOf(att, helper) ?? shooter;
    const trapBonus = (off.counterTactics?.vsTrapLong ?? 15) * 0.045; // v3.6: samme effekt (≈0,8) på den lavere skala
    const onside = off.varProfile.varPulse + trapBonus + rng.next() * 6 > defender.skills.positioning + rng.next() * 6;
    return { off, other: off.id !== shooter.id, onside };
  }
  // VAR ved et mål (v3.15.1, Spilfører og QC): kendelsen falder FØR målet bogføres, så et annulleret mål aldrig tæller
  // (mål, skud på mål, karakterer, statistik, Rundens mål). Brugeren ser spændingen: "📺 Bolden er i nettet – men VAR kigger
  // på det" med stillingen talt op, så enten målet (med "VAR: målet står") eller annulleringen, hvor stillingen falder
  // tilbage. Returnerer null (annulleret) eller tillægget til målteksten ('' uden synligt tjek).
  // VAR ± i stillingen (season.js): kun kendelser, VAR ændrede – et godkendt mål giver 0 (før +1).
  // noOffside: bolden blev spillet tilbage (cutback) – modtageren kan ikke være offside, så kun frisparket tjekkes (Spilfører).
  // helper: oplægsgiveren (tjekkes ikke for offside i sit eget oplæg)
  function varGoalCheck(att, def, dR, min, shooter, defender = null, noOffside = false, helper = null) {
    varBehind = null;
    if (!rng.chance(VAR_RULES.GOAL_CHECK_P)) return '';
    defender ??= rng.pick(dR.defs) ?? dR.gk;
    st[k(att, 'VarChecks')]++;
    const foul = rng.chance(VAR_RULES.GOAL_FOUL_SHARE) || noOffside;
    const o = foul ? { off: shooter, other: false, onside: rng.next() * 30 > shooter.varProfile.cynicism + 4 } : offsideCheck(att, shooter, defender, helper);
    const what = foul ? `skubbede ${tag(shooter)} ${tag(defender)} i opspillet` : `stod ${tag(o.off)} offside`;
    momentCheck = foul ? null : { id: o.off.id, offside: !o.onside };
    if (att === H) hG++; else aG++;
    addEv(min, 'VAR_CHECK', 'HIGHLIGHT', att.isHome, false, `📺 VAR tjekker målet`, `📺 [${att.team.name} • ${hG}-${aG}] Bolden er i nettet – men VAR kigger på det: ${what}? …`, `${att.team.name}: målet tjekkes …`);
    events.at(-1).var = { kind: foul ? 'FOUL' : 'OFFSIDE', verdict: o.onside ? 'STANDS' : 'OVERTURNED' };
    if (att === H) hG--; else aG--;
    if (!o.onside) {
      homeVarNet += att === H ? -1 : 1;
      if (foul) {
        st[k(att, 'Fouls')]++; sheet.adjust(shooter.id, -0.3);
        addEv(min, 'VAR_NO_GOAL', 'HIGHLIGHT', att.isHome, true, `📺 VAR: annulleret – ${tag(shooter)}`, `📺 [${att.team.name} • ${hG}-${aG}] VAR-KENDELSE: MÅLET ANNULLERES! Dommeren har set skærmen: ${tag(shooter)} skubbede ${tag(defender)} (${def.team.name}) i opspillet – frispark.`, `${att.team.name}: mål annulleret`);
        return null;
      }
      sheet.adjust(o.off.id, -0.4); sheet.adjust(defender.id, 0.45); sheet.bump(defender.id, 'tacticWins');
      observe(o.off, `VAR-annullering (mod ${def.team.name}): ${o.off.shortName} var en anelse for tidligt af sted.`);
      const why = o.other ? `${tag(defender)} (${def.team.name}) holdt linjen, og ${tag(o.off)} stod offside og var med i situationen, da ${tag(shooter)} skød` : `${tag(defender)} (${def.team.name}) holdt linjen, og ${tag(shooter)} var offside`;
      addEv(min, 'VAR_NO_GOAL', 'HIGHLIGHT', att.isHome, true, `📺 VAR: annulleret – ${tag(o.off)}`, `📺 [${att.team.name} • ${hG}-${aG}] VAR-KENDELSE: MÅLET ANNULLERES! ${why}.`, `${att.team.name}: mål annulleret`);
      return null;
    }
    if (foul) return ` 📺 VAR: målet står – ${tag(shooter)} gik til bolden, ikke til manden.`;
    const timing = describeVarTiming(o.off.varProfile.varPulse);
    observe(o.off, `VAR-tjek (mod ${def.team.name}): ${o.off.shortName} ${timing}.`);
    if (o.other) varBehind = { id: shooter.id, y: (seen[att.team.id]?.[att.starters.indexOf(o.off)]?.y ?? 0) + VAR_BEHIND };
    return o.other ? ` 📺 VAR: målet står – ${tag(o.off)} foran ${tag(shooter)} stod ikke offside; han ${timing}.` : ` 📺 VAR: målet står – ${tag(shooter)} ${timing}.`;
  }
  // Forbi (v3.15.1): en afslutning, keeperen ikke skal redde. Ét sted for alle afslutninger (åbent spil, kontra, hovedstød,
  // frispark). Ingen redning, intet skud på mål; en blokeret afslutning kan give hjørnespark (withCorner = false: kalderen giver selv hjørnet).
  // Returnerer om skuddet gik forbi.
  const missUsed = new Set();
  const MISS_TXT = ['skyder forbi den lange stolpe', 'sender bolden over mål', 'rammer stolpen', 'skyder en meter forbi', 'får ikke ram på bolden – den triller forbi', 'banker bolden over overliggeren'];
  function missed(att, def, cR, dR, min, shooter, withCorner = true, how = 'afslutningen') {
    if (!rng.chance(MISS_P)) return false;
    if (rng.chance(MISS_BLOCK_SHARE)) {
      const blocker = rng.pick(dR.defs) ?? dR.gk;
      sheet.adjust(blocker.id, 0.1);
      addEv(min, 'MISS', 'PLAY', def.isHome, false, 'Blokeret', `🧱 [${def.team.name}] ${tag(blocker)} kaster sig ind foran ${how} fra ${tag(shooter)} (${att.team.name}).`);
      if (withCorner && rng.chance(MISS_CORNER_P)) corner(att, def, cR, dR, min);
      return true;
    }
    // Samme ene rng-træk som rng.pick, men blandt de tekster, kampen ikke har brugt (v3.16.7, Spilfører: "rammer stolpen" 3 gange
    // på 18 minutter); alle brugt → forfra. Listen er uændret (replay.js læser "stolpe"/"over" i teksten).
    const r = rng.next(), free = MISS_TXT.filter((t) => !missUsed.has(t)), miss = free[Math.floor(r * free.length)];
    missUsed.add(miss); if (missUsed.size === MISS_TXT.length) missUsed.clear();
    addEv(min, 'MISS', 'PLAY', att.isHome, false, 'Forbi', `🎯 [${att.team.name}] ${tag(shooter)} ${miss}.`);
    return true;
  }

  const fbCount = (side) => coordsOf(side.tactics).filter((c) => FB_ROLES.has(c.r)).length;
  // Kontra mod et hold, der lige har tabt bolden. Returnerer om der blev scoret.
  function counterAttack(win, lose, min, wR, lR) {
    shotSide = win; shotCaught = true; setPieceNow = false; shotBy = null; shotLong = false; momentCheck = null;
    // Kontraens afslutter: den hurtigste nær målet i øjeblikket (v3.12.1, dokumentet "Mål": kontramål
    // fordeles på angreb og midtbane) – ikke altid en angriber.
    const shooter = receiver(win, SPOT.GOAL, (p) => p.skills.pace, null, { caught: true, ballX: 50 }), gk = lR.gk;
    shotBy = shooter;
    // Skytten løber fra sin plads mod målet (COUNTER_RUN) – afslutningen sker i feltet, ikke ved midterlinjen (Spilfører v3.16)
    shapes(win, { caught: true, ballX: 50, runner: win.starters.indexOf(shooter), step: COUNTER_RUN });
    duelLog[lose.team.id].countersAgainst++;
    st[k(win, 'Shots')]++;
    st[k(win, 'Xg')] += 0.2 + rng.next() * 0.2;
    // Kun DIT holds egen indstilling må forklare kontraen; modstanderens nævnes aldrig.
    // Den back/wingback, der har løbet mest frem i kampen – kun nævnt, hvis han faktisk har løbet.
    const fbSlots = own(lose) && lose.tactics.phases.phase1_buildUp.offBallRuns === 'MANY' ? coordsOf(lose.tactics).map((c, i) => i).filter((i) => i > 0 && FB_ROLES.has(coordsOf(lose.tactics)[i].r) && lose.starters[i]) : [];
    const runsOf = (i) => sheet.entries[lose.starters[i].id]?.freeRuns ?? 0;
    const fbSlot = fbSlots.filter((i) => runsOf(i) > 0).sort((x, y) => runsOf(y) - runsOf(x))[0] ?? -1;
    const why = fbSlot > 0 ? ` Din ${coordsOf(lose.tactics)[fbSlot].r} ${tag(lose.starters[fbSlot])} er højt oppe efter sit løb.` : '';
    if (shooter.skills.finishing * ff(shooter) + rng.next() * 8 + COUNTER_FINISH_BONUS > gk.skills.goalkeeping * ff(gk) + rng.next() * 8) {
      // Oplægsgiveren vælges FØR VAR (v3.16.7): han spillede bolden og tjekkes ikke for offside
      const helper = helperFor(wR, shooter, rng.pick(wR.mids.filter((p) => p !== shooter)));
      const varOk = varGoalCheck(win, lose, lR, min, shooter, null, false, helper);
      if (varOk === null) return false;
      if (win === H) hG++; else aG++;
      st[k(win, 'OnTarget')]++;
      duelLog[lose.team.id].counterGoalsAgainst++;
      sheet.adjust(shooter.id, 1.25); sheet.bump(shooter.id, 'goals'); sheet.adjust(gk.id, -0.3);
      st[k(win, 'CounterGoals')]++;
      // Oplægsgiveren, teksten nævner, får også assisten (v3.10 – ellers modsagde statistikken referatet).
      sheet.adjust(helper.id, 0.4); sheet.bump(helper.id, 'assists');
      const desc = describeGoal('COUNTER', tag(shooter), tag(helper), min, rng, goalTexts);
      goalsPool.push({ scorer: tag(shooter), teamName: win.team.name, match: `${home.name} - ${away.name}`, min, kind: 'COUNTER', spectacle: goalSpectacle('COUNTER', { pace: shooter.skills.pace }, min, rng), desc });
      addEv(min, 'GOAL', 'HIGHLIGHT', win.isHome, true, `⚽ Kontramål: ${tag(shooter)}`, `⚽ [${win.team.name} • ${hG}-${aG}] MÅÅÅL PÅ KONTRA!${why} ${desc}${varOk}`);
      snapshot(win, shooter, helper, SPOT.GOAL, true);
      return true;
    }
    if (missed(win, lose, wR, lR, min, shooter, true, 'kontraens afslutning')) return false;
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
  // Oplægsgiveren er aldrig skytten selv (Spilfører v3.16.4: "#7 fandt #7" – fx kontraen, når skytten er kædens eneste
  // midtbanespiller). Er kandidaten skytten eller ingen, tages den bedste afleverer blandt de andre markspillere; intet rng,
  // så kun de kampe ændres. Én vagt for alle mål med oplæg: kontra, finishAttempt og luftduellen (tools/measure-assist.mjs).
  const helperFor = (R, shooter, cand) => (cand && cand !== shooter ? cand : best(outfield(R).filter((p) => p && p !== shooter), (p) => p.skills.passing));
  const SP_KIND = { hjørnespark: 'CORNER', frispark: 'SETPIECE' };
  const isSetPieceKind = (kind) => kind === 'PENALTY' || kind === 'FREEKICK' || kind === 'CORNER' || kind === 'SETPIECE';
  // Bogfører et mål af typen kind for skytten (måltype pr. spiller og pr. hold til statistikken).
  function bookKind(side, scorer, kind) {
    if (kind === 'HEADER' || kind === 'CORNER' || kind === 'SETPIECE') { sheet.bump(scorer.id, 'headerGoals'); st[k(side, 'HeaderGoals')]++; }
    if (kind === 'PENALTY') sheet.bump(scorer.id, 'penaltyGoals');
    if (isSetPieceKind(kind)) { sheet.bump(scorer.id, 'setPieceGoals'); st[k(side, 'SetPieceGoals')]++; }
  }
  // Høj bold i feltet: åbent spil (indlæg/lang bold) eller dødbold (hjørnespark/frisparksindlæg).
  // Høje bolde tages af en midtstopper, når holdet har en på banen (v3.8); den trukne forsvarer
  // afgør hvilken – ingen ekstra terning. To trin (v3.12): duellen, så hovedstødet mod keeperen.
  // source (åbent spil): 'cross' eller 'long' – kun til teksten for dit eget hold.
  // Returnerer 'goal', 'saved', 'missed', 'disallowed' (VAR) eller 'cleared'.
  function aerialDuel(att, def, cR, dR, min, shooter, assister, defender, setPiece = null, source = null, snapMoves = null) {
    if (!setPiece) { shotSide = att; shotCaught = false; setPieceNow = false; shotBy = shooter; shotLong = false; momentCheck = null; assister = helperFor(cR, shooter, assister); }
    const gk = dR.gk;
    const aDef = dR.cbs.length ? (dR.cbs.includes(defender) ? defender : dR.cbs[Math.max(0, dR.defs.indexOf(defender)) % dR.cbs.length]) : defender;
    const kind = setPiece ? SP_KIND[setPiece] : 'HEADER';
    const log = duelLog[att.team.id];
    if (!setPiece) log.crosses++;
    const box = setPiece ? SETPIECE_DEF_EDGE : (BOX_BONUS[def.tactics.phases.phase2_defending.pressingHeight] ?? 0);
    if (shooter.aerialPower * ff(shooter) + rng.next() * 6 + (setPiece ? 0 : CROSS_EDGE) <= aDef.aerialPower * ff(aDef) + rng.next() * 6 + box) {
      st[k(def, 'AerialWon')]++;
      sheet.adjust(aDef.id, 0.4); sheet.bump(aDef.id, 'aerialWins');
      // Kun dit eget hold får sin kilde nævnt (dit indlæg / din lange bold).
      const what = setPiece ? (setPiece === 'hjørnespark' ? 'Hjørnespark' : 'Frisparksindlæg') : own(att) ? (source === 'long' ? 'Din lange bold' : 'Dit indlæg') : 'Stærk luftduel';
      addEv(min, 'INFO', 'PLAY', def.isHome, false, 'Luftduel i feltet', `✈️ [${def.team.name} forsvar] ${what}: ${tag(aDef)} (${aDef.heightCm} cm) ${vary(['stiger højest og clearer', 'vinder duellen og header væk', 'kommer først og rydder', 'hamrer bolden ud af feltet'], 'clear', aDef.id)} foran ${tag(shooter)} (${att.team.name}).`);
      return 'cleared';
    }
    st[k(att, 'AerialWon')]++; if (!setPiece) { st[k(att, 'TacticSuccess')]++; log.crossesWon++; }
    sheet.adjust(shooter.id, 0.4); sheet.bump(shooter.id, 'aerialWins');
    if (shooter.aerialPower * ff(shooter) + rng.next() * 8 > gk.skills.goalkeeping * ff(gk) + rng.next() * 8 + HEADER_GK_EDGE) {
      // VAR tjekker også hovedstød på dødbolde – dér tjekker det i virkeligheden oftest (QC).
      const varOk = varGoalCheck(att, def, dR, min, shooter, aDef, setPiece === 'hjørnespark', assister);   // intet offside direkte fra et hjørnespark (IFAB Law 11)
      if (varOk === null) return 'disallowed';
      goalFor(att); if (!setPiece) log.headerGoals++;
      sheet.adjust(shooter.id, 0.95); sheet.bump(shooter.id, 'goals');
      if (assister && assister.id !== shooter.id) { sheet.adjust(assister.id, 0.55); sheet.bump(assister.id, 'assists'); }
      sheet.adjust(aDef.id, -0.35); sheet.adjust(gk.id, -0.25);
      bookKind(att, shooter, kind);
      const prose = vary(headerBand(shooter.aerialPower), 'head', shooter.id);
      observe(shooter, `Luftduel (mod ${def.team.name}): ${shooter.shortName} scorede med ${prose}.`);
      goalsPool.push({ scorer: tag(shooter), teamName: att.team.name, match: `${home.name} - ${away.name}`, min, kind, spectacle: goalSpectacle(kind, { aerialPower: shooter.aerialPower }, min, rng), desc: describeGoal(kind, tag(shooter), tag(assister ?? shooter), min, rng, goalTexts) });
      const how = setPiece ? `MÅÅÅL PÅ ${setPiece.toUpperCase()}! ${tag(assister)} slår ${setPiece}et ind, og ${tag(shooter)} (${shooter.heightCm} cm) header bolden ind – ${prose}.`
        // Oplægsgiveren nævnes, som Rundens mål gør (v3.16.7, Spilfører) – "oplæg", ikke "indlæg": en lang bold er ingen
        // indlæg, og kilden må ikke røbe modstanderens stil (QC)
        : `MÅÅÅL! ${tag(shooter)} (${shooter.heightCm} cm) header bolden ind efter oplæg fra ${tag(assister)} – ${prose}.`;
      addEv(min, 'HEADER_GOAL', 'HIGHLIGHT', att.isHome, true, `⚽ Hovedstødsmål: ${tag(shooter)}`, `⚽ [${att.team.name} • ${hG}-${aG}] ${how}${varOk}`);
      if (!setPiece) snapshot(att, shooter, assister, SPOT.CROSS, false, snapMoves);
      return 'goal';
    }
    if (missed(att, def, cR, dR, min, shooter, false, 'hovedstødet')) return 'missed';
    st[k(att, 'OnTarget')]++;
    sheet.adjust(gk.id, 0.5); sheet.bump(gk.id, 'saves');
    addEv(min, 'SAVE', 'PLAY', def.isHome, false, 'Hovedstød reddet', `🧤 [${def.team.name}] ${tag(gk)} redder hovedstødet fra ${tag(shooter)} (${att.team.name}, ${shooter.heightCm} cm), der vandt luftduellen.`);
    return 'saved';
  }
  // Dødboldens hovedstødsspiller: en af de tre bedste i luften (også stopperne går med op).
  const headerTarget = (R, taker) => rng.pick(fit(outfield(R).filter((p) => p && p !== taker)).sort((a, b) => b.aerialPower - a.aerialPower).slice(0, 3));
  // Indlæggets tager ved hjørne og frispark (v3.17.0, Spilfører: midtstopperne slog hjørnerne – den bedste afleverer blandt
  // alle): bedste afleverer på en kantplads (WIDE_ROLES, også backerne) eller på midtbanen; kun uden dem en anden. Ingen rng.
  function crossTaker(side, R) {
    const roles = coordsOf(side.tactics), role = (p) => roles[side.starters.indexOf(p)]?.r;
    const pool = fit(outfield(R)), wide = pool.filter((p) => WIDE_ROLES.has(role(p)) || lineOfRole(role(p) ?? '') === 'MID');
    return best(wide.length ? wide : pool, (p) => p.skills.passing);
  }
  function corner(att, def, cR, dR, min) {
    setPieceNow = true;
    st[k(att, 'Corners')]++; st[k(att, 'Shots')]++; st[k(att, 'Xg')] += 0.04; // hovedstødet er en afslutning
    const taker = crossTaker(att, cR);
    aerialDuel(att, def, cR, dR, min, headerTarget(cR, taker), taker, rng.pick(dR.defs), 'hjørnespark');
  }
  // Afslutning mod keeperen (v3.12: samlet fra løbs-grenen og den almindelige afslutning, så
  // cutbacken ikke blev en tredje kopi). kind kan være en funktion, der afgøres efter skuddet
  // (den almindelige afslutning vælger type efter evnerne). Langskud og dribletur er solo.
  // lead = dit holds egen indledning ("✅ … lægger den tilbage til …"). Returnerer om der blev scoret.
  function finishAttempt(att, def, cR, dR, min, finisher, helper, kind, { bonus = 0, lead = '', onGoal = null, snapMoves = null } = {}) {
    shotSide = att; shotCaught = false; setPieceNow = false; shotBy = finisher; shotLong = kind === 'LONGSHOT'; momentCheck = null;
    helper = helperFor(cR, finisher, helper);
    const gk = dR.gk, fs = finisher.skills;
    if (fs.finishing * ff(finisher) + rng.next() * 8 + bonus > gk.skills.goalkeeping * ff(gk) + rng.next() * 8 + KEEPER_EDGE) {
      return scoreFinish(att, def, dR, min, finisher, helper, kind, { lead, onGoal, snapMoves });
    }
    return noGoal(att, def, cR, dR, min, finisher, helper, kind, lead);
  }
  // Målet fra en afslutning (v3.17.0 trukket ud af finishAttempt – også halvchancen bruger det): VAR før bogføringen,
  // karakterer, Rundens mål, linjen og øjebliksbilledet. false = VAR annullerede.
  function scoreFinish(att, def, dR, min, finisher, helper, kind, { lead = '', onGoal = null, snapMoves = null } = {}) {
    const gk = dR.gk, fs = finisher.skills;
    const varOk = varGoalCheck(att, def, dR, min, finisher, null, kind === 'CUTBACK', helper);
    if (varOk === null) return false;
    goalFor(att);
    const kd = typeof kind === 'function' ? kind() : kind, solo = kd === 'LONGSHOT' || kd === 'DRIBBLE' || kd === 'SCRAMBLE';   // SCRAMBLE: løs bold i feltet (halvchancen) – intet oplæg
    shotLong = kd === 'LONGSHOT';
    onGoal?.(kd);
    bookKind(att, finisher, kd);
    sheet.adjust(finisher.id, solo ? 1.4 : 1.25); sheet.bump(finisher.id, 'goals'); sheet.adjust(gk.id, -0.3);
    if (!solo && helper && helper.id !== finisher.id) { sheet.adjust(helper.id, 0.5); sheet.bump(helper.id, 'assists'); }
    const prose = describeFinish(fs.finishing);
    observe(finisher, `Scoring (mod ${def.team.name}): ${finisher.shortName} afsluttede med ${prose}.`);
    const desc = describeGoal(kd, tag(finisher), tag(helper ?? finisher), min, rng, lead ? null : goalTexts);   // med dit holds indledning vises desc ikke – den må ikke bruge en variant op (v3.16.7; samme rng-træk)
    // Med dit holds indledning (lead) fortæller den allerede oplægget – kun en kort slutning, ikke hele beskrivelsen
    // igen (brugeren v3.14.3: "cutback bliver noteret 2 gange i teksten"). "Rundens mål" bruger den fulde (desc).
    // Slutter indledningen med afslutterens navn ("… lægger den tilbage til #7."), sparker han den ind; ellers (løberen
    // skød selv – også "løber sig fri og skyder" i en kombination) sad bolden i nettet (QC v3.14.3).
    const end = !lead ? desc : lead.endsWith(`${tag(finisher)}.`) ? 'Han sparkede den ind.' : 'Bolden sad i nettet.';
    // I selve målets linje uden løbets ✅ (Spilfører v3.16.3: "MÅÅÅL! ✅ …"); Rundens mål genfortæller samme hændelse
    const told = lead ? `${lead.replace(/^✅ /, '')} ${end}` : desc;
    goalsPool.push({ scorer: tag(finisher), teamName: att.team.name, match: `${home.name} - ${away.name}`, min, kind: kd, spectacle: goalSpectacle(kd, { finishing: fs.finishing, pace: fs.pace, ballControl: fs.ballControl, passing: (helper ?? finisher).skills.passing }, min, rng), desc: told });
    addEv(min, 'GOAL', 'HIGHLIGHT', att.isHome, true, `⚽ Mål: ${tag(finisher)}`, `⚽ [${att.team.name} • ${hG}-${aG}] MÅÅÅL! ${told}${varOk}`);
    // Solo-mål (langskud, dribletur): bolden står ved skytten – ikke på en fast plet i feltet (QC). Et langskud fra
    // skudafstand: skytten flyttes højst til LONGSHOT_FAR (v3.14.3).
    const live = solo && seen[att.team.id]?.[att.starters.indexOf(finisher)];
    const at = live && (kd === 'LONGSHOT' ? { x: Math.min(LONGSHOT_X[1], Math.max(LONGSHOT_X[0], live.x)), y: Math.min(live.y, LONGSHOT_FAR) } : live);
    const moves = at && at !== live ? { ...snapMoves, [finisher.id]: [at.x, at.y] } : snapMoves;
    snapshot(att, finisher, solo ? null : helper, at || (kd === 'CUTBACK' ? SPOT.CUTBACK : SPOT.GOAL), false, moves);
    return true;
  }
  // Ingen mål efter keeper-duellen: linjedommerens flag, forbi eller redning (+ evt. hjørne)
  function noGoal(att, def, cR, dR, min, finisher, helper, kind, lead) {
    const gk = dR.gk;
    // Linjedommerens flag (v3.15.1, Spilfører: offside uden mål er ikke VAR): afslutningen tæller ikke – ingen redning, intet
    // hjørne. Ikke et VAR-tjek (VarChecks) og intet i VAR ± – kun offside-duellen.
    if (kind !== 'CUTBACK' && rng.chance(VAR_RULES.OFFSIDE_FLAG_P)) {   // bolden er spillet tilbage – ingen offside (v3.16.7)
      const flagDef = rng.pick(dR.defs) ?? gk, o = offsideCheck(att, finisher, flagDef, helper);
      if (!o.onside) {
        momentCheck = { id: o.off.id, offside: true };
        sheet.adjust(o.off.id, -0.1); sheet.adjust(flagDef.id, 0.2);
        addEv(min, 'OFFSIDE_FLAG', 'PLAY', def.isHome, false, 'Offside', `🚩 [${def.team.name}] Linjedommeren løfter flaget efter afslutningen fra ${tag(finisher)} – ${o.other ? `${tag(o.off)} (${att.team.name}) stod offside i opspillet` : 'han stod offside'}.`);
        return false;
      }
    }
    if (missed(att, def, cR, dR, min, finisher)) return false;
    st[k(att, 'OnTarget')]++;
    sheet.adjust(gk.id, 0.5); sheet.bump(gk.id, 'saves'); sheet.adjust(finisher.id, 0.1);
    // Dit holds opspil (lead) står FØR redningen – det skete først (Spilfører v3.16.4)
    // – og så kun "men X redder" (Spilfører v3.16.6: skytten stod ellers to gange i samme linje)
    addEv(min, 'SAVE', 'PLAY', def.isHome, false, 'Redning', lead ? `🧤 [${att.team.name}] ${lead.replace('✅ ', '').replace(/\.$/, '')} – men ${tag(gk)} (${def.team.name}) redder.` : `🧤 [${def.team.name}] Flot redning af ${tag(gk)} på afslutning fra ${tag(finisher)} (${att.team.name}).`);
    if (rng.chance(CORNER_P)) corner(att, def, cR, dR, min);
    return false;
  }
  // Halvchancen (v3.17.0): et skud uden stor fare – fra kanten af feltet eller en løs bold i feltet. Mål efter xG · målmand ·
  // skytte (lodtrækning, ikke keeper-duellen); ellers forbi/blokeret (egne tekster uden stolpe – stolpen er et højdepunkt,
  // Spilfører) eller en let redning (easySaves: tæller i 🧤, ikke i fradraget). Ingen hjørne og intet flag. Linjerne er
  // dæmpede (minor), og øjeblikket er mærket half – Højdepunkter viser det kun som mål. Returnerer om der blev scoret.
  const BLOCK_VERBS = ['kaster sig ind foran', 'blokerer', 'får et ben i vejen for', 'lukker af for'];
  const HALF_MISS_TXT = ['skyder forbi', 'sender bolden over mål', 'skyder et godt stykke forbi', 'rammer den ikke rent – den går forbi', 'skyder højt over mål'];   // "over mål": replay.js tegner den over (shotOver)
  const halfMissUsed = new Set();
  // Botternes FASE-linjer (v3.17.0, Spilfører: ≈ 14 pr. kamp i referaterne mellem to botter): kun den første pr. hold og slags
  // (opbygning igennem / stoppet) vises – de øvrige står i data (quiet; målingerne tæller dem) men ikke i referatet. Pr. halvleg
  // gav det 6,2 pr. kamp (bånd ≤ 6). Intet rng. Mærker seneste hændelse.
  const faseSeen = new Set();
  function faseQuiet(team, kind) {
    const key = `${team.id}|${kind}`;
    if (faseSeen.has(key)) events.at(-1).quiet = true; else faseSeen.add(key);
  }
  function halfChance(att, def, cR, dR, min) {
    const spot = shotSpotFor(rng.next(), def.tactics.phases.phase2_defending.pressingHeight);
    const shooter = receiver(att, spot, (p) => p.skills.finishing, null, { attacking: true, ballX: 50 }, SHOT_REACH, null, true);
    const sp = seen[att.team.id]?.[att.starters.indexOf(shooter)], long = !!sp && sp.y >= LONGSHOT_Y;
    shotSide = att; shotCaught = false; setPieceNow = false; shotBy = shooter; shotLong = long; momentCheck = null;
    const xg = spot === SPOT.EDGE ? HALF_XG.EDGE : HALF_XG.GOAL, gk = dR.gk;
    st[k(att, 'Shots')]++; st[k(att, 'Xg')] += xg;
    const mark = () => { const mo = trace.moments.at(-1); if (mo && mo.ev === events.length - 1) mo.half = true; events.at(-1).minor = true; };
    if (rng.next() < xg * gkFactor(gk.skills.goalkeeping * ff(gk)) * finFactor(shooter.skills.finishing * ff(shooter))) {
      return scoreFinish(att, def, dR, min, shooter, null, long ? 'LONGSHOT' : 'SCRAMBLE');
    }
    const how = long ? 'langskuddet' : 'skuddet';   // "… foran langskuddet fra #9" – ikke to gange "fra" (QC)
    if (rng.chance(HALF_MISS_P)) {
      if (rng.chance(MISS_BLOCK_SHARE)) {
        const blocker = rng.pick(dR.defs) ?? gk;
        sheet.adjust(blocker.id, 0.05);
        // Varianter (v3.17.0, Spilfører: "kaster sig ind foran" 484 gange på en sæson); replay.js finder blokeren på verbet
        addEv(min, 'MISS', 'PLAY', def.isHome, false, 'Blokeret', `🧱 [${def.team.name}] ${tag(blocker)} ${vary(BLOCK_VERBS, 'block', def.team.id)} ${how} fra ${tag(shooter)} (${att.team.name}).`);
        mark();
        if (rng.chance(HALF_CORNER_P.BLOCK)) corner(att, def, cR, dR, min);
        return false;
      } else {
        const r = rng.next(), free = HALF_MISS_TXT.filter((t) => !halfMissUsed.has(t)), miss = free[Math.floor(r * free.length)];
        halfMissUsed.add(miss); if (halfMissUsed.size === HALF_MISS_TXT.length) halfMissUsed.clear();
        addEv(min, 'MISS', 'PLAY', att.isHome, false, 'Forbi', `🎯 [${att.team.name}] ${tag(shooter)} ${miss}${long ? ' fra distancen' : ''}.`);
      }
      mark();
      return false;
    }
    st[k(att, 'OnTarget')]++;
    sheet.adjust(gk.id, HALF_SAVE_ADJ); sheet.bump(gk.id, 'easySaves');
    const out = rng.chance(HALF_CORNER_P.SAVE);   // tippet ud til hjørne – ellers griber han
    addEv(min, 'SAVE', 'PLAY', def.isHome, false, 'Redning', out ? `🧤 [${def.team.name}] ${tag(gk)} tipper ${how} fra ${tag(shooter)} (${att.team.name}) ud til hjørnespark.`
      : `🧤 [${def.team.name}] ${tag(gk)} ${vary(['griber', 'samler', 'har styr på'], 'easy', gk.id)} ${how} fra ${tag(shooter)} (${att.team.name}).`);
    mark();
    if (out) corner(att, def, cR, dR, min);
    return false;
  }
  // Cutback (v3.12): en kantspiller går mod baglinjen (side efter terning) og møder den back, der
  // står nærmest; vinder han, lægges bolden lavt tilbage til en afslutter ved straffesparkspletten.
  // Kaldt med et allerede talt skud (xg) – en lukket kant er ingen afslutning.
  // Forsvareren på kanten (v3.16.7 fra cutback(); v3.17.0 også løbs-cutbacken): backen på sin side, ellers en kantspiller dér
  // (kantmidtbane, ikke en kantangriber – efter et Hvis-Så-skift til 3-4-3 var det angriberen), ellers en forsvars- eller
  // midtbanespiller – aldrig en angriber. wx = angrebets kant (angriberens koordinater). Ét rng-træk.
  function flankBack(def, wx) {
    const dRole = (i) => coordsOf(def.tactics)[i].r, bSide = wx < 50 ? 'R' : 'L';
    return receiver(def, { x: 100 - wx, y: 72 }, (p) => p.skills.pace + p.skills.positioning, null, { attacking: false, ballX: 100 - wx }, Infinity,
      [(i) => FB_ROLES.has(dRole(i)) && dRole(i)[0] === bSide, (i) => WIDE_ROLES.has(dRole(i)) && lineOfRole(dRole(i)) !== 'ATT' && dRole(i)[0] === bSide,
      (i) => lineOfRole(dRole(i)) !== 'ATT']);
  }
  function cutback(att, def, cR, dR, min, xg) {
    const wx = rng.next() < 0.5 ? 12 : 88;
    // Roller (v3.16.7, Spilfører: midtstoppere lavede cutbacks, angribere lukkede kanten i eget felt): kantmanden er en kant- eller
    // back-plads på den side, ellers den nærmeste (smal formation); backen er backen på sin side, ellers en kantspiller dér,
    // ellers en forsvars- eller midtbanespiller – aldrig en angriber. Samme ene rng-træk pr. valg.
    const roleOf = (side) => (i) => coordsOf(side.tactics)[i].r, flank = (x) => (x < 50 ? 'L' : 'R');
    const aR = roleOf(att), wSide = flank(wx);
    const winger = receiver(att, { x: wx, y: 30 }, (p) => p.skills.pace + p.skills.ballControl, null, { attacking: true, ballX: wx }, RECEIVE_REACH,
      [(i) => WIDE_ROLES.has(aR(i)) && aR(i)[0] === wSide]);
    const back = flankBack(def, wx);
    const log = duelLog[att.team.id], ws = winger.skills, bs = back.skills;
    log.cutbacks++;
    if ((ws.pace + ws.ballControl) * ff(winger) + rng.next() * 8
      <= (bs.pace + bs.positioning) * ff(back) + rng.next() * 8 + CUTBACK_DEF_EDGE + (FLANK_BONUS[def.tactics.phases.phase2_defending.pressingHeight] ?? 0)) {
      log.cutbacksBlocked++;
      st[k(att, 'Shots')]--; st[k(att, 'Xg')] -= xg;
      sheet.adjust(back.id, 0.3); sheet.bump(back.id, 'tacticWins');
      addEv(min, 'INFO', 'PLAY', def.isHome, false, 'Kanten lukket', own(att)
        ? `❌ Dit cutback-forsøg stoppes: ${tag(back)} (${def.team.name}) lukker kanten mod ${tag(winger)}.`
        : `🛡️ [${def.team.name}] ${tag(back)} lukker kanten mod ${tag(winger)} (${att.team.name}).`);
      if (rng.chance(CROSS_CORNER_P)) corner(att, def, cR, dR, min);
      return;
    }
    const finisher = receiver(att, SPOT.CUTBACK, (p) => p.skills.finishing, winger, { attacking: true, ballX: wx }, SHOT_REACH, notCB(att), true);
    const lead = own(att) ? `✅ ${tag(winger)} når baglinjen og lægger den lavt tilbage til ${tag(finisher)}.` : '';
    if (!lead) addEv(min, 'INFO', 'PLAY', att.isHome, false, 'Mod baglinjen', `↩️ [${att.team.name}] ${tag(winger)} kommer forbi ${tag(back)} og spiller bolden tilbage i feltet.`);
    sheet.adjust(winger.id, 0.15);
    finishAttempt(att, def, cR, dR, min, finisher, winger, 'CUTBACK', { bonus: CUTBACK_FINISH_BONUS, lead, onGoal: () => { log.cutbackGoals++; },
      snapMoves: { [winger.id]: [wx, BYLINE_Y], [finisher.id]: [SPOT.CUTBACK.x, SPOT.CUTBACK.y] } });
  }
  // Straffe-VAR (v3.15.1): byVar = VAR kaldte dommeren ud til et straffespark, han ikke så (PEN_AWARD_P). Ellers tjekkes en
  // given straffe med PEN_CHECK_P: filmning (den fældedes theatre – lodtrækning) eller offside i opspillet. Kendelsen falder
  // FØR straffen tælles (frispark, straffe, skud, xG, fælderens karakter – QC: ellers målte straffebåndet forkert).
  function penalty(att, def, cR, dR, min, byVar = false) {
    setPieceNow = true;
    const taker = best(fit(outfield(cR)), (p) => p.skills.finishing), fouled = rng.pick(cR.atts.concat(cR.mids)), fouler = rng.pick(dR.defs), gk = dR.gk;
    const skipped = best(outfield(cR), (p) => p.skills.finishing), limps = skipped !== taker;   // den sædvanlige skytte halter
    let varNote = '';
    if (byVar) {
      st[k(att, 'VarChecks')]++; homeVarNet += att === H ? 1 : -1;
      addEv(min, 'VAR_PEN', 'HIGHLIGHT', att.isHome, true, '📺 VAR: straffespark', `📺 [${att.team.name}] Spillet fortsatte, men VAR kalder dommeren ud til skærmen: ${tag(fouled)} blev fældet i feltet af ${tag(fouler)} (${def.team.name}). Efter at have set skærmen dømmer han straffespark!`, `${att.team.name}: straffespark`);
      events.at(-1).var = { kind: 'PENALTY', verdict: 'AWARDED' };
      varNote = ' (dømt efter VAR)';
    } else if (rng.chance(VAR_RULES.PEN_CHECK_P)) {
      // Spilfører: straffen dømmes FØRST – så tjekker VAR, og kendelsen kan vende den.
      st[k(att, 'VarChecks')]++;
      const offside = rng.chance(VAR_RULES.PEN_OFFSIDE_SHARE);
      // Positionerne i opspillet (TM v3.15.1: uden dem var den tjekkede altid den fældede – "den forreste" gjaldt ikke)
      if (offside) shapes(att, { attacking: true, ballX: 50 });
      const o = offside ? offsideCheck(att, fouled, fouler) : { onside: rng.next() * 40 > fouled.varProfile.theatre };
      addEv(min, 'VAR_PEN', 'HIGHLIGHT', att.isHome, false, '📺 VAR tjekker straffen', `📺 [${att.team.name}] Dommeren peger på pletten – ${tag(fouled)} går ned i feltet efter kontakt med ${tag(fouler)} (${def.team.name}). Men VAR tjekker ${offside ? 'for offside i opspillet' : 'om der var kontakt nok'} …`, `${att.team.name}: straffesparket tjekkes …`);
      events.at(-1).var = { kind: offside ? 'OFFSIDE' : 'DIVE', verdict: o.onside ? 'STANDS' : 'OVERTURNED' };
      if (!o.onside) {
        homeVarNet += att === H ? -1 : 1;
        const text = offside ? `📺 [${att.team.name}] VAR-KENDELSE: STRAFFESPARKET ANNULLERES! ${o.other ? `${tag(o.off)} stod offside i opspillet, før ${tag(fouled)} blev fældet` : `${tag(fouled)} stod offside, før han blev fældet`}.`
          : `📺 [${att.team.name}] VAR-KENDELSE: Dommeren går ud til skærmen … ingen kontakt. Straffesparket annulleres.`;
        addEv(min, 'VAR_NO_PEN', 'HIGHLIGHT', att.isHome, true, '📺 VAR: straffe annulleret', text, `${att.team.name}: straffesparket annulleres`);
        if (offside) { sheet.adjust(o.off.id, -0.2); return; }
        st[k(att, 'Fouls')]++; sheet.adjust(fouled.id, -0.3);
        booking(att, fouled, min, 'Gult kort til', ' for filmning', true);
        return;
      }
      varNote = ' 📺 VAR: straffesparket står.';
    }
    st[k(def, 'Fouls')]++; st[k(att, 'Penalties')]++; st[k(att, 'Shots')]++; st[k(att, 'Xg')] += 0.76;
    sheet.adjust(fouler.id, -0.3);
    const why = `${tag(fouled)} fældes i feltet af ${tag(fouler)} (${def.team.name})`, self = taker.id === fouled.id;
    if (taker.skills.finishing * ff(taker) + rng.next() * 8 + PENALTY_BONUS > gk.skills.goalkeeping * ff(gk) + rng.next() * 8) {
      goalFor(att); st[k(att, 'PenaltyGoals')]++;
      sheet.adjust(taker.id, 1.0); sheet.bump(taker.id, 'goals'); sheet.adjust(gk.id, -0.1);
      bookKind(att, taker, 'PENALTY');
      const desc = describeGoal('PENALTY', tag(taker), tag(fouled), min, rng, goalTexts);
      goalsPool.push({ scorer: tag(taker), teamName: att.team.name, match: `${home.name} - ${away.name}`, min, kind: 'PENALTY', spectacle: goalSpectacle('PENALTY', {}, min, rng), desc });
      addEv(min, 'GOAL', 'HIGHLIGHT', att.isHome, true, `⚽ Straffespark: ${tag(taker)}`, `⚽ [${att.team.name} • ${hG}-${aG}] STRAFFESPARK – MÅL! ${why}${limps ? `. ${tag(skipped)} halter – ${self ? 'den fældede' : tag(taker)} tager straffen og sender` : `, og ${self ? 'han tager det selv og sender' : `${tag(taker)} sender`}`} bolden sikkert i nettet.${varNote}`);
    } else {
      st[k(att, 'OnTarget')]++;
      sheet.adjust(gk.id, 0.8); sheet.bump(gk.id, 'saves'); sheet.adjust(taker.id, -0.4);
      addEv(min, 'SAVE', 'HIGHLIGHT', def.isHome, true, `🧤 Straffe reddet: ${tag(gk)}`, `🧤 [${def.team.name}] STRAFFESPARK REDDET! ${why}${limps ? `. ${tag(skipped)} halter – ${tag(taker)} tager straffen, men ${tag(gk)} redder` : `, men ${tag(gk)} redder fra ${self ? 'ham' : tag(taker)}`}.${varNote}`);
    }
  }
  function freeKick(att, def, cR, dR, min) {
    setPieceNow = true;
    // Samme forseelse som tick'ets kort/skade (fortalt og talt én gang); ellers en ny, der tælles her
    const same = tickFoul?.side === def;   // en udvist tackler når aldrig hertil (rødt kort stopper tick'et)
    const fouler = same ? tickFoul.p : rng.pick(dR.defs.concat(dR.mids)), gk = dR.gk;
    if (!same) st[k(def, 'Fouls')]++;
    st[k(att, 'FreeKicks')]++;
    if (rng.chance(FK_SHOT_P)) {
      const taker = best(fit(outfield(cR)), (p) => p.skills.finishing + p.skills.passing);
      const skipped = best(outfield(cR), (p) => p.skills.finishing + p.skills.passing), halt = skipped !== taker ? `${tag(skipped)} halter, så ${tag(taker)} tager frisparket` : '';
      st[k(att, 'Shots')]++; st[k(att, 'Xg')] += 0.07;
      if (taker.skills.finishing * ff(taker) + rng.next() * 8 > gk.skills.goalkeeping * ff(gk) + rng.next() * 8 + FK_SHOT_EDGE) {
        goalFor(att);
        sheet.adjust(taker.id, 1.4); sheet.bump(taker.id, 'goals'); sheet.adjust(gk.id, -0.3);
        bookKind(att, taker, 'FREEKICK');
        const desc = describeGoal('FREEKICK', tag(taker), tag(taker), min, rng, goalTexts);
        goalsPool.push({ scorer: tag(taker), teamName: att.team.name, match: `${home.name} - ${away.name}`, min, kind: 'FREEKICK', spectacle: goalSpectacle('FREEKICK', { finishing: taker.skills.finishing }, min, rng), desc });
        addEv(min, 'GOAL', 'HIGHLIGHT', att.isHome, true, `⚽ Frisparksmål: ${tag(taker)}`, `⚽ [${att.team.name} • ${hG}-${aG}] FRISPARKSMÅL! Frispark efter ${gen(tag(fouler))} (${def.team.name}) forseelse${halt ? `. ${halt}` : ''}: ${desc}`);
      } else if (!missed(att, def, cR, dR, min, taker, false, 'frisparket')) {
        st[k(att, 'OnTarget')]++;
        sheet.adjust(gk.id, 0.4); sheet.bump(gk.id, 'saves');
        addEv(min, 'SAVE', 'PLAY', def.isHome, false, 'Frispark reddet', `🧤 [${def.team.name}] ${tag(gk)} redder ${gen(tag(taker))} frispark (${att.team.name}) fra kanten af feltet.${halt ? ` (${att.team.name}: ${halt}.)` : ''}`);
      }
      return;
    }
    const taker = crossTaker(att, cR);
    st[k(att, 'Shots')]++; st[k(att, 'Xg')] += 0.1;
    aerialDuel(att, def, cR, dR, min, headerTarget(cR, taker), taker, rng.pick(dR.defs), 'frispark');
  }

  // Udskiftningsreglerne (match-rules.js): højst maxSubs skift i højst maxWindows pauser; flere skift i
  // samme tick er én pause, og halvlegen (45') tæller ikke. Årsag, når der IKKE kan skiftes, eller null.
  // keep: udskiftninger/pauser, der holdes tilbage (botternes skade-reserve, BOT_SUBS) – teksten gælder kun uden (dit hold).
  const subBlock = (side, min, keep = null) => side.subsUsed >= MATCH_RULES.maxSubs - (keep?.subs ?? 0) ? `alle ${MATCH_RULES.maxSubs} udskiftninger er brugt`
    : (min !== 45 && min !== side.lastSubMin && side.windows >= MATCH_RULES.maxWindows - (keep?.windows ?? 0)) ? `alle ${MATCH_RULES.maxWindows} skifte-pauser er brugt` : null;
  // Indskiftning i den kamplokale kopi. Returnerer indskifteren eller null. pick = den valgte
  // bænkspiller (træthed/Hvis-Så); text = referatets tekst (ellers skadesskiftets).
  function substitute(side, slot, min, reason, pick = null, text = null) {
    if (subBlock(side, min)) return null;
    const out = side.starters[slot];
    if (!out) return null;   // en udvist spillers plads – der må ikke skiftes ind (v3.15)
    const bench = side.benchAvailable();
    const sub = pick ?? (pickForSlot(bench.filter((b) => b.line === out.line), side.tactics, slot) || bench[0]);
    if (!sub) return null;
    side.subsUsed++;
    if (min !== 45 && min !== side.lastSubMin) side.windows++;
    side.lastSubMin = min;
    side.starters[slot] = sub; side.used.add(sub.id);
    sheet.entries[out.id].minOut = min;
    register(side, sub, `SUB (${out.line})`, min, slot);
    addEv(min, 'SUB', 'HIGHLIGHT', side.isHome, true, `🔄 ${tag(sub)} ind for ${tag(out)}`, text ?? `🔄 [${side.team.name}] ${reason}: ${tag(sub)} erstatter ${tag(out)}.`);
    return sub;
  }

  // Kort (v3.15): ét sted. Karakterarket gemmer antal gule (0–2) og rødt ('SECOND_YELLOW' | 'DIRECT'); kamptal,
  // holdtal og sæsonstatistik regnes alle derfra (QC: før talte tre steder forskelligt).
  const MEN = ['', 'én', 'to', 'tre', 'fire', 'fem', 'seks', 'syv', 'otte', 'ni', 'ti', 'elleve'];
  // force (v3.15.1): kortet er givet efter en VAR-kendelse (filmning, et rødt kort trukket tilbage til gult) – ingen "holder igen".
  function booking(side, p, min, before, after = '', force = false) {
    const e = sheet.entries[p.id];
    if (!e || e.red) return;
    if (e.yellows && !force && !rng.chance(CARD_RULES.SECOND_YELLOW_P)) return;   // han holder igen – frisparket, men intet kort
    e.yellows = (e.yellows ?? 0) + 1; e.yellowCard = true; st[k(side, 'Yellows')]++;
    if (e.yellows === 1) addEv(min, 'FOUL', 'PLAY', side.isHome, false, 'Gult kort', `🟨 [${side.team.name}] ${before} ${tag(p)}${after}.`);
    else sendOff(side, p, min, 'SECOND_YELLOW');
  }
  const canSendOff = (side, p) => { const e = sheet.entries[p.id]; return !!e && !e.red && side.starters.indexOf(p) >= 1 && side.starters.filter(Boolean).length > MIN_PLAYERS; };
  function sendOff(side, p, min, kind, varNote = '') {
    if (!canSendOff(side, p)) return;
    const e = sheet.entries[p.id], slot = side.starters.indexOf(p);
    e.red = kind; e.minOut = min; st[k(side, 'Reds')]++;
    sheet.adjust(p.id, -1);
    // Tiden med færre mand gemmes, før tallet stiger (lostAt regner minutter × manglende mand).
    if (side.down) side.shortMins = (side.shortMins ?? 0) + side.down * Math.max(0, curMin - side.downSince);
    side.down = (side.down ?? 0) + 1; side.downSince = curMin; side.firstDown ??= curMin;
    side.starters[slot] = null; sentOffThisTick = true;
    const left = side.starters.filter(Boolean).length;
    const why = kind === 'DIRECT' ? `Direkte rødt kort til ${tag(p)} for den grove tackling` : `Andet gule kort til ${tag(p)}`;
    observe(p, `Udvist (mod ${other(side).team.name}): ${kind === 'DIRECT' ? 'direkte rødt kort' : 'andet gule kort'}.`);
    addEv(min, 'RED', 'HIGHLIGHT', side.isHome, true, `🟥 Udvist: ${tag(p)}`, `${kind === 'DIRECT' ? '🟥' : '🟨🟥'} [${side.team.name}] ${why} – han er udvist! ${side.team.name} må spille resten af kampen med ${MEN[left] ?? left} mand.${varNote}`);
  }

  function checkTriggers(side, min) {
    const own = side.isHome ? hG : aG, opp = side.isHome ? aG : hG;
    side.tactics.conditionalRules.forEach((rule) => {
      const n0 = events.length;   // reglens hændelser står aldrig før dens minut på uret (clock.js minClock)
      try { checkRule(rule); } finally { for (let i = n0; i < events.length; i++) minClock.set(i, Math.max(minClock.get(i) ?? 0, rule.minuteTrigger | 0)); }
    });
    function checkRule(rule) {
      if (rule.used || min < rule.minuteTrigger) return;
      if (!ruleConditionMet(rule, own, opp)) return;
      if (rule.action === 'SUB') { rule.used = true; ruleSub(side, rule, min); return; }
      const from = side.tactics.baseFormation;
      // Skift til en af holdets egne planer: formation, trukne positioner og faser følger med, og Hvis-Så-reglerne kører
      // videre. v3.20.0: med en ny formation fordeles de 11 efter position (refit) – før beholdt de pladsnumrene.
      const plan = Number.isInteger(rule.newPlan) ? side.team.tacticPresets?.[rule.newPlan] : null;
      if (plan && FORMATIONS[plan.baseFormation]) {
        rule.used = true;
        // Spiller holdet allerede præcis den plan, er skiftet en tom handling – intet logges.
        const same = plan.baseFormation === side.tactics.baseFormation && JSON.stringify(plan.phases) === JSON.stringify(side.tactics.phases) && JSON.stringify(plan.customCoords || {}) === JSON.stringify(side.tactics.customCoords || {});
        if (same) return;
        if (plan.baseFormation !== side.tactics.baseFormation) refit(side, plan.baseFormation);
        side.tactics.baseFormation = plan.baseFormation;
        // Kampens taktik ændres kun ved genanvisning (aldrig i stedet), så planens objekter
        // kan bruges direkte; resultatets endState er en kopi.
        side.tactics.customCoords = plan.customCoords || {};
        side.tactics.phases = plan.phases;
        const name = `Plan ${PLAN_LETTERS[rule.newPlan]}`;
        announceShift(side, min, `${side.team.name} skifter til ${name}`, `📋 [${side.team.name} • Hvis-Så] Holdet skifter fra ${from} til ${name} (${plan.baseFormation}, ${TXT[plan.phases.phase1_buildUp.passingStyle]} / ${TXT[plan.phases.phase2_defending.pressingHeight]})${withMen(side)}.`);
        return;
      }
      if (!FORMATIONS[rule.newFormation]) return;
      rule.used = true;
      // Allerede i formationen (v3.17.0: 3-4-3 "skiftede" til 3-4-3 og blandede pladserne): intet skift og ingen linje – men kun
      // for en bot eller uden trukne positioner; ellers nulstiller dit skift dine positioner, og det er din regel (QC)
      if (rule.newFormation === from && (side.team.isBot || !Object.keys(side.tactics.customCoords || {}).length)) return;
      const remap = rule.slotRemapping;
      const validRemap = Array.isArray(remap) && remap.length === 11 && new Set(remap).size === 11 && remap.every((i) => i >= 0 && i < 11);
      // v3.20.0: dit hold (ombytningen kan ikke redigeres i UI'et) og en bot uden ombytning fordeles efter position;
      // en bots bevidste ombytning (generator.js BOT_PROFILES) bevares
      // Samme formation (dine trukne positioner nulstilles): ingen omrokering – din opstilling er bevidst (QC K1)
      if (rule.newFormation === from) { /* kun trækkene */ } else if (!side.team.isBot || !validRemap || remap.every((v, i) => v === i)) refit(side, rule.newFormation);
      else { const old = side.starters.slice(); side.starters = remap.map((i) => old[i]); }
      side.tactics.baseFormation = rule.newFormation;
      side.tactics.customCoords = {};
      announceShift(side, min, `${side.team.name} skifter til ${rule.newFormation}`, `📋 [${side.team.name} • Hvis-Så] Holdet skifter fra ${from} til ${rule.newFormation}${withMen(side)}.`);
    }
  }

  // Træthedsskift (v3.13, brugeren: grænsen skal gælde "uanset hvor langt man er kommet i kampen. Hvis
  // alle ens udskiftninger så bliver brugt tidligt på det er det bare ærgeligt"). Alle under holdets
  // grænse skiftes, lavest friskhed først; bruges pausen, tages også dem med, der højst er NEAR over.
  // Ind: rask bænkspiller i samme kæde, selv mindst NEAR over grænsen, bedste evnesnit · friskhed –
  // ikke en, som en af dine Hvis-Så-regler skal bruge. Målmanden skiftes ikke for træthed.
  // Dit hold får at vide, når grænsen ikke kan følges; en bots grænse og friskhed nævnes aldrig (§3).
  function fatigueSubs(side, min) {
    const limit = side.team.subsLimit || 0;
    if (!limit || min >= 90) return;   // i sidste tick sparer et skift intet og koster indskifteren bænkens +15 (QC)
    if (!own(side) && min < BOT_SUBS.fromMin) return;   // botter: træthedsskift først fra pausen (BOT_SUBS)
    const reserved = new Set(side.tactics.conditionalRules.filter((r) => r.action === 'SUB' && !r.used).map((r) => r.subIn));
    const onPitch = () => side.starters.map((p, i) => ({ p, i, f: p && matchFresh(p) })).filter(({ p, i }) => i > 0 && p && !sheet.entries[p.id]?.injured);
    const tired = onPitch().filter((c) => c.f < limit).sort((a, b) => a.f - b.f);
    if (!tired.length) return;
    side.noted ||= new Set();
    // key: uden "N skift tilbage" i nøglen (QC v3.17.0 – ellers en ny linje, hver gang N ændrer sig)
    const note = (p, why, key = why) => { if (!own(side) || side.noted.has(p.id + key)) return; side.noted.add(p.id + key); addEv(min, 'INFO', 'TACTIC', side.isHome, false, 'Udskiftning ikke mulig', `📋 [${side.team.name}] ${tag(p)} er under din udskiftningsgrænse (${Math.floor(matchFresh(p))} % – grænse ${limit} %), men ${why}.`); };
    const swap = (c, near) => {
      const block = subBlock(side, min, !own(side) && min < BOT_SUBS.until ? BOT_SUBS.keep : null);
      if (block) { if (!near) note(c.p, block); return false; }
      const cands = side.benchAvailable().filter((b) => b.line === c.p.line && !reserved.has(b.id) && (b.freshness ?? 100) >= limit + SUBS_LIMIT.near);
      const pick = pickForSlot(cands, side.tactics, c.i, (b) => avgSkill(b) * (b.freshness ?? 100));
      if (!pick) {
        const held = side.benchAvailable().some((b) => b.line === c.p.line && reserved.has(b.id) && (b.freshness ?? 100) >= limit + SUBS_LIMIT.near);
        if (!near) note(c.p, held ? `den friske ${LINE_WORD[c.p.line] ?? 'spiller'} på bænken er sat til en af dine Hvis-Så-regler` : `der er ingen frisk ${LINE_WORD[c.p.line] ?? 'spiller'} på bænken`);
        return false;
      }
      const f = Math.floor(c.f);   // rundet NED: 69,6 må ikke stå som "70 % – under din grænse 70 %"
      const text = own(side)
        ? `🔄 [${side.team.name}] ${tag(c.p)} ud (træt, ${f} % – ${near ? (min === 45 ? 'tages med i pausen' : 'tages med i samme skifte-pause') : `under din grænse ${limit} %`}) – ${tag(pick)} ind.`
        : `🔄 [${side.team.name}] ${tag(pick)} erstatter ${tag(c.p)}.`;
      const ok = !!substitute(side, c.i, min, 'Udskiftning', pick, text);
      if (ok && own(side)) events.at(-1).tactical = true;   // dit valg (grænsen) – med i "Kun taktik"
      return ok;
    };
    // Højst FATIGUE_SUBS_AT_ONCE ad gangen (v3.15, brugerens valg "spred skift") – også i pausen (Spilfører: ellers skiftede
    // botterne stadig 4–5 i 45'). De trætteste først; resten venter til næste skift (dit hold får det at vide).
    const cap = FATIGUE_SUBS_AT_ONCE;
    let done = 0;
    const waiting = [];
    for (const c of tired) {
      if (done >= cap) { waiting.push(c); continue; }
      if (swap(c, false)) done++;
    }
    // Intet løfte om "næste skift" (v3.17.0, Spilfører: han kom aldrig ud – trættere fik de sidste skift, eller pauserne var
    // brugt): en senere pause med antallet tilbage, eller årsagen til, at der ikke kommer flere
    const after = () => waitText(min + 3 < 90 ? subBlock(side, min + 3) : 'kampen er snart slut', MATCH_RULES.maxSubs - side.subsUsed);
    for (const c of waiting) note(c.p, `højst ${FATIGUE_SUBS_AT_ONCE} træthedsskift ad gangen – ${after()}`, 'loft');
    if (!done) return;
    for (const c of onPitch().filter((x) => x.f >= limit && x.f < limit + SUBS_LIMIT.near).sort((a, b) => a.f - b.f)) { if (done >= cap) break; if (swap(c, true)) done++; }
  }

  // Manuel udskiftning fra en Hvis-Så-regel (v3.13): spillerne er angivet med id, så de findes, uanset hvilken
  // plads de står på nu. Kan den ikke udføres, får dit hold at vide hvorfor (en bots regler tier).
  function ruleSub(side, rule, min) {
    const slot = side.starters.findIndex((p, i) => i > 0 && p?.id === rule.subOut);
    const out = side.team.squad.find((p) => p.id === rule.subOut), inP = side.benchAvailable().find((p) => p.id === rule.subIn);
    const name = (id) => { const p = side.team.squad.find((x) => x.id === id); return p ? tag(p) : 'spilleren'; };
    const why = slot < 0 ? `${name(rule.subOut)} er ${sheet.entries[rule.subOut]?.red ? 'udvist' : 'ikke på banen'}` : !inP ? `${name(rule.subIn)} er ikke på bænken (skadet, allerede brugt eller i startopstillingen)` : subBlock(side, min);
    if (why) {
      if (own(side)) addEv(min, 'TRIGGER', 'TACTIC', side.isHome, false, 'Hvis-Så-skift ikke udført', `📋 [${side.team.name} • Hvis-Så] Udskiftningen kunne ikke udføres: ${why}.`);
      return;
    }
    const text = own(side) ? `🔄 [${side.team.name} • Hvis-Så] ${tag(out)} ud – ${tag(inP)} ind (din Hvis-Så-regel).` : `🔄 [${side.team.name}] ${tag(inP)} erstatter ${tag(out)}.`;
    if (substitute(side, slot, min, 'Hvis-Så', inP, text)) events.at(-1).tactical = own(side);
  }

  // Med færre mand siger planskiftet det (Spilfører v3.16.4: "4-4-2" med ti mand er ikke en 4-4-2)
  const withMen = (side) => (side.down ? ` med ${MEN[side.starters.filter(Boolean).length]} mand` : '');
  // Et modstanderholds Hvis-Så-skift kan ses på banen, men ikke læses: ingen regel,
  // intet minut-kriterium, ingen ny formation.
  function announceShift(side, min, label, text) {
    if (own(side)) addEv(min, 'TRIGGER', 'HIGHLIGHT', side.isHome, true, label, text);
    // Varianter uden rng (v3.16.3, Spilfører: "omorganiserer sig" i 49 af 56 kampe) – stadig uden regel og ny formation (§3)
    else addEv(min, 'TRIGGER', 'HIGHLIGHT', side.isHome, true, `${side.team.name} ${vary(['omorganiserer sig', 'skifter form', 'flytter rundt'], 'reorg', side.team.id, false)}`, `🔁 [${side.team.name}] ${vary(['Holdet omorganiserer sig på banen.', 'Holdet skifter form – spillerne får nye pladser.', 'Træneren flytter rundt på holdet.'], 'reorg', side.team.id)}`);
  }

  kickoffFrame();
  for (let min = 3; min <= 90; min += 3) {
    // Flaget nulstilles ved hvert tick (QC v3.15.1: et kort for filmning i straffen – efter tjekket herunder – lækkede ellers
    // ind i næste minut og sprang dets dødbolde og chancer over).
    curMin = min; sentOffThisTick = false; varBehind = null; tickFoul = null;
    seen = {}; momentCheck = null;   // øjebliksbilledet hører til dette tick
    if (min === 45) {
      const hp = Math.round((st.hPoss / (st.hPoss + st.aPoss)) * 100);
      const leader = st.hTacticSuccess >= st.aTacticSuccess ? home : away;
      // Dit holds egen duel-statistik (kun egne valg nævnes – modstanderens stil røbes ikke).
      const mine = [H, A].find(own);
      const yours = mine && duelLog[mine.team.id].build + duelLog[mine.team.id].press ? ` ${duelText(duelLog[mine.team.id], duelLog[other(mine).team.id], true)}` : '';
      addEv(min, 'HALFTIME', 'TACTIC', true, false, 'Pause-analyse', `⏸️ [PAUSE-ANALYSE] Stillingen er ${hG}-${aG}. ${home.name} har haft ${hp}% af bolden. ${leader.name} har vundet flest taktiske dueller (${Math.max(st.hTacticSuccess, st.aTacticSuccess)}).${yours}`);
    }
    // I pausen skiftes en haltende ud, hvis der er et skift tilbage (pausen koster ingen skifte-pause) – v3.16.6
    if (min === 45) for (const side of [H, A]) side.starters.forEach((p, slot) => {
      if (slot === 0 || !limping(p)) return;
      // Som træthedsskiftet: den friskeste i kæden, der ikke er sat til en Hvis-Så-regel – ellers en anden markspiller (QC)
      const reserved = new Set(side.tactics.conditionalRules.filter((r) => r.action === 'SUB' && !r.used).map((r) => r.subIn));
      const free = side.benchAvailable().filter((b) => !reserved.has(b.id) && b.line !== 'GK').sort((a, b) => (b.freshness ?? 100) - (a.freshness ?? 100));
      const pick = pickForSlot(free.filter((b) => b.line === p.line), side.tactics, slot, (b) => b.freshness ?? 100) ?? free[0];
      if (pick) substitute(side, slot, min, 'Pauseskift for den haltende', pick);
    });
    checkTriggers(H, min); checkTriggers(A, min);
    fatigueSubs(H, min); fatigueSubs(A, min);

    let hR = rolesOf(H), aR = rolesOf(A);
    const hMid = avg(hR.mids, (p) => p.skills.passing + p.skills.ballControl) * shortF(H);
    const aMid = avg(aR.mids, (p) => p.skills.passing + p.skills.ballControl) * shortF(A);
    const homeHasBall = hMid + hAvg * 0.03 + rng.next() * 8 >= aMid + aAvg * 0.03 + rng.next() * 7.5;
    if (homeHasBall) st.hPoss += 3; else st.aPoss += 3;
    const att = homeHasBall ? H : A, def = homeHasBall ? A : H;
    shotSide = null; setPieceNow = false;
    const frame = tickFrame(min / 3, att);
    const attR = homeHasBall ? hR : aR, defR = homeHasBall ? aR : hR;
    const attPh = att.tactics.phases, defPh = def.tactics.phases;
    // Presseren er den, der står nærmest opspilleren i tick'ets billede (v3.21.0 – nearPick); før en tilfældig midtbanespiller
    const playmaker = rng.pick(attR.mids), back = rng.pick(defR.defs), striker = rng.pick(attR.atts);
    const tickPos = coupledPositions(att.tactics, def.tactics, { ballX: livePositions(att.tactics, { attacking: true, ballX: 50 })[att.starters.indexOf(playmaker)]?.x ?? 50, ...onOf(att, def) });
    const presser = nearPick(def, defR.mids, mirrorPt(tickPos.ball[att.starters.indexOf(playmaker)]), tickPos.opp);
    const who = { playmaker, presser, striker, defs: attR.defs };

    // Trukne positioner vurderes (25 %): uden for zonen straffes, inden for belønnes.
    const customs = customDragged(att);
    if (customs.length && rng.chance(0.25)) {
      const cp = rng.pick(customs);
      if (cp.outOfZone) {
        st[k(def, 'TacticSuccess')]++;
        sheet.adjust(cp.player.id, -0.45); sheet.adjust(presser.id, DUEL_BONUS); sheet.bump(presser.id, 'tacticWins');
        addEv(min, 'TACTIC_FAIL', 'TACTIC', def.isHome, false, 'Ude af zone', `⚠️ [TAKTIK FEJLER • CUSTOM POS] ${tag(cp.player)} (${att.team.name}) står for langt fra sin ${cp.role}-zone, og ${tag(presser)} udnytter hullet.`);
        frame('press', who);
        continue;
      }
      st[k(att, 'TacticSuccess')]++;
      sheet.adjust(cp.player.id, 0.4); sheet.bump(cp.player.id, 'tacticWins');
      addEv(min, 'TACTIC_WIN', 'TACTIC', att.isHome, false, 'Custom pos virker', `✅ [TAKTIK VIRKER • CUSTOM POS] Den justerede placering af ${tag(cp.player)} (${att.team.name}) skaber overtal i mellemrummet.`);
    }

    // Fase 1 mod fase 2 (48 %) med sten-saks-papir-bonus og mod-kunnen. Vinder forsvaret
    // duellen, er bolden tabt, og angriberen får ingen chance i samme tick (v3.6 – før kunne
    // "❌ din opbygning stoppes" efterfølges af dit mål i samme minut).
    let ballLost = false, tickDuel = 'OPEN';   // tickDuel (v3.17.0): BUILD = opbygningen vundet, LOST = stoppet, OPEN = ingen duel
    if (rng.chance(0.48)) {
      const pmM = masteryVs(playmaker, def.team), prM = masteryVs(presser, att.team);
      let build = (playmaker.skills.passing + playmaker.skills.ballControl) * ff(playmaker) + pmM * MASTERY_WEIGHT + rng.next() * 7;
      if (att.calm) { build += CALM_BUILD_BONUS; att.calm = false; } // "Hold på bolden" efter sidste erobring
      let press = (presser.skills.intercepting + presser.skills.positioning * 0.85 + presser.skills.stamina * 0.35) * ff(presser) + prM * MASTERY_WEIGHT + rng.next() * 7;
      const pass = attPh.phase1_buildUp.passingStyle, focus = attPh.phase1_buildUp.attackFocus, height = defPh.phase2_defending.pressingHeight;
      if (pass === 'SHORT' && height === 'LOW_BLOCK') build += STYLE_BONUS;
      if (pass === 'DIRECT_LONG' && height === 'HIGH_GEGENPRESS') build += STYLE_BONUS;
      if (height === 'HIGH_GEGENPRESS' && pass === 'SHORT') press += STYLE_BONUS;
      if (height === 'LOW_BLOCK' && focus === 'CENTRAL') press += STYLE_BONUS;
      duelLog[att.team.id].build++; duelLog[def.team.id].press++;
      tickDuel = build >= press ? 'BUILD' : 'LOST';
      if (build >= press) {
        sheet.bump(presser.id, 'duels');   // 🤼: presserens duel (offside-fælden er bagkædens, ikke hans)
        duelLog[att.team.id].buildWon++;
        st[k(att, 'TacticSuccess')]++;
        sheet.adjust(playmaker.id, DUEL_BONUS); sheet.bump(playmaker.id, 'tacticWins');
        // Ingen besked afhængig af mod-kunnen mod modstanderen – den ville røbe deres stil.
        // Varianter uden rng (v3.16.3, Spilfører: "styrer midtbanen" ×420 pr. sæson) – vary: næste variant for samme spiller i kampen
        const note = ' ' + vary([`${tag(playmaker)} styrer midtbanen.`, `${tag(playmaker)} finder den frie mand.`, `${tag(playmaker)} spiller sig ud af presset.`, `${tag(playmaker)} vender op og sætter spillet i gang.`], 'mid', playmaker.id);
        // Kun dit eget holds valg navngives; modstanderens stil beskrives ikke.
        // Teksten er den samme, uanset om en stilbonus afgjorde duellen (ellers røbede ordvalget modstanderens stil).
        const text = own(att) ? `✅ [DIN OPBYGNING VIRKER] ${YOUR_PASS[pass]} bryder igennem ${gen(def.team.name)} pres.${note}`
          : own(def) ? `❌ [DIT PRES BRYDES] ${att.team.name} spiller sig igennem ${YOUR_PRESS[height]} – presset når ikke frem.${note}`
          : `✅ [FASE 1 VIRKER • ${att.team.name}] ${vary([`${att.team.name} spiller sig igennem ${gen(def.team.name)} pres.`, `${att.team.name} kommer forbi ${gen(def.team.name)} pres.`, `${gen(def.team.name)} pres bliver spillet over.`], 'fase1', att.team.id)}${note}`;
        addEv(min, 'TACTIC_WIN', 'TACTIC', att.isHome, false, 'Fase 1 virker', text);
        if (!own(att) && !own(def)) faseQuiet(att.team, 'win');
        frame('build', who);
      } else {
        ballLost = true;
        duelLog[def.team.id].pressWon++;
        st[k(def, 'TacticSuccess')]++;
        if (defPh.phase2_defending.offsideTrap !== 'OFF' && rng.chance(0.45)) {
          duelLog[def.team.id].trapWon++;   // med i pressWon (presset stoppede opbygningen), men tælles for sig (Spilfører v3.16.6)
          sheet.adjust(back.id, 0.4); sheet.adjust(striker.id, -0.25); sheet.bump(back.id, 'tacticWins');
          // Kun din egen offside-fælde navngives; hos modstandere er det blot en offside.
          // Det fulde banner første gang pr. halvleg, derefter en kort linje (v3.16.7, Spilfører: 399 banner-linjer på en sæson,
          // "dirigerer linjen perfekt" 30 gange) – intet rng
          const half = min < 45 ? 1 : 2, shown = (def.trapShown ||= new Set()).has(half);   // 45'-tick'et er 2. halvlegs første (efter pausen – clock.js)
          def.trapShown.add(half);
          const offTxt = own(def) ? (shown ? `✅ [DIN OFFSIDE-FÆLDE] ${vary([`${tag(striker)} (${att.team.name}) fanget offside – ${tag(back)} holder linjen.`, `Offside: ${tag(striker)} (${att.team.name}) går for tidligt.`, `Linjen holder – ${tag(striker)} (${att.team.name}) står offside.`], 'trap', def.team.id)}`
              : `✅ [DIN OFFSIDE-FÆLDE VIRKER] ${tag(striker)} (${att.team.name}) fanges. ${tag(back)} dirigerer linjen perfekt.`)
            : own(att) ? `❌ [DIN OPBYGNING STOPPES] ${tag(striker)} fanges offside.`
            : `🛑 [FASE 2 VIRKER • ${def.team.name}] ${tag(striker)} (${att.team.name}) fanges offside.`;
          addEv(min, 'TACTIC_FAIL', 'TACTIC', def.isHome, false, 'Offside-fælde virker', offTxt);
          if (!own(att) && !own(def)) faseQuiet(def.team, 'stop');
          frame('trap', who);
        } else {
          sheet.adjust(presser.id, DUEL_BONUS); sheet.adjust(playmaker.id, -0.2); sheet.bump(presser.id, 'tacticWins'); sheet.bump(presser.id, 'duels'); sheet.bump(presser.id, 'duelsWon');
          // Kontra (v3.9): afgøres FØR teksten, så "din lynkontra" kun loves, når den kommer.
          const won = defPh.phase3_transition.onBallWon;
          const goesCounter = rng.chance(counterChance(attPh.phase1_buildUp.offBallRuns, attPh.phase3_transition.onBallLost, won, fbCount(att)));
          if (!goesCounter && won === 'KEEP_POSSESSION') def.calm = true;
          const counter = !own(def) ? '' : won === 'FAST_COUNTER' ? (goesCounter ? ' Din lynkontra sættes straks i gang.' : ' ' + vary(['Din lynkontra løber ind i et organiseret forsvar.', 'Modstanderen når hjem, før lynkontraen kommer i gang.', 'Lynkontraen bremses – de er hurtigt tilbage i position.'], 'lyn', presser.id))
            : (goesCounter ? ' Dit hold ser hullet og går direkte.' : ' Dit hold falder til ro på bolden.');
          const text = own(def) ? `✅ [DIT PRES VIRKER] ${cap(YOUR_PRESS[height])} lukker af: ${tag(presser)} erobrer bolden fra ${tag(playmaker)} (${att.team.name}) – han stod ${nearRank.get(presser.id) === 0 ? 'nærmest' : 'tæt på'}.${counter}`
            : own(att) ? `❌ [DIN OPBYGNING STOPPES] ${YOUR_PASS[pass]} kommer ikke igennem: ${tag(presser)} (${def.team.name}) erobrer bolden fra ${tag(playmaker)} (${att.team.name}).`
            : `🛑 [FASE 2 VIRKER • ${def.team.name}] ${tag(presser)} erobrer bolden fra ${tag(playmaker)} (${att.team.name}).`;   // holdmærke som de andre (v3.17.0)
          addEv(min, 'TACTIC_FAIL', 'TACTIC', def.isHome, false, 'Fase 2 pres virker', text);
          if (!own(att) && !own(def)) faseQuiet(def.team, 'stop');
          frame('press', who);
          if (goesCounter) counterAttack(def, att, min, defR, attR);
        }
      }
    }

    frame('none', who);   // ingen duel i tick'et (no-op, hvis duellen allerede tegnede billedet)
    // Frispark (6 %), heraf skade (40 %) med indskiftning.
    if (rng.chance(0.06)) {
      const victimSide = rng.chance(0.5) ? H : A, foulSide = other(victimSide);
      const fR = foulSide === H ? hR : aR;
      const slots = victimSide.starters.map((p, i) => i).filter((i) => i > 0 && victimSide.starters[i]);
      const slot = slots[rng.int(0, slots.length - 1)];
      const victim = victimSide.starters[slot], fouler = rng.pick(fR.defs.concat(fR.mids));
      st[k(foulSide, 'Fouls')]++; tickFoul = { side: foulSide, p: fouler };
      sheet.adjust(fouler.id, -0.35);
      if (rng.chance(0.4)) {
        const matches = rng.int(1, 3);
        st[k(victimSide, 'Injuries')]++;
        injuries.push({ playerId: victim.id, teamId: victimSide.team.id, matches, min });
        if (sheet.entries[victim.id]) sheet.entries[victim.id].injured = true;
        observe(victim, `Kamp-skade (mod ${foulSide.team.name}): ${victim.shortName} måtte udgå efter en hård tackling.`);
        addEv(min, 'INJURY', 'HIGHLIGHT', victimSide.isHome, true, `🚑 Skade: ${tag(victim)}`, `🚑 [${victimSide.team.name}] ${tag(victim)} bliver skadet efter en tackling fra ${tag(fouler)} (${foulSide.team.name}) og er ude i ${matches} ${matches === 1 ? 'kamp' : 'kampe'}.`);
        // Skade-frisparket giver intet gult kort, men den grove tackling kan koste et direkte rødt kort (v3.15) – kun her, så tilfældighederne i resten af kampen
        // ikke flytter sig (QC). Frisparket er offentligt; kortet afhænger ikke af nogen skjult indstilling.
        // Rødt-kort-VAR (v3.15.1, IFAB: kun direkte rødt tjekkes): RED_CHECK_P af de røde kort tjekkes – den kyniske
        // (cynicism) beholder oftere kortet; ellers trækkes det tilbage til gult. En grov tackling uden kort kan opgraderes
        // (RED_UPGRADE_P, igen oftere for den kyniske). VAR ± (season.js): tilbagetrukket +1 og opgraderet −1 for det
        // hold, der begik frisparket.
        if (rng.chance(CARD_RULES.DIRECT_RED_P)) {
          // Har han allerede gult, ville et nedgraderet kort alligevel give rødt – så tjekkes kortet ikke (QC v3.15.1).
          if (canSendOff(foulSide, fouler) && !sheet.entries[fouler.id]?.yellows && rng.chance(VAR_RULES.RED_CHECK_P)) {
            st[k(foulSide, 'VarChecks')]++;
            const down = rng.next() * 30 > fouler.varProfile.cynicism + 10;
            // Spilfører: kortet vises FØRST – så tjekker VAR, og kendelsen kan vende det.
            addEv(min, 'VAR_RED', 'HIGHLIGHT', foulSide.isHome, false, '📺 VAR tjekker det røde kort', `📺 [${foulSide.team.name}] Dommeren viser ${tag(fouler)} det røde kort for tacklingen – men VAR tjekker situationen …`, `${foulSide.team.name}: det røde kort tjekkes …`);
            events.at(-1).var = { kind: 'RED', verdict: down ? 'DOWNGRADED' : 'CONFIRMED' };
            if (down) {
              homeVarNet += foulSide === H ? 1 : -1;
              addEv(min, 'VAR_NO_RED', 'HIGHLIGHT', foulSide.isHome, true, '📺 VAR: rødt bliver gult', `📺 [${foulSide.team.name}] VAR-KENDELSE: Dommeren går ud til skærmen … ${tag(fouler)} ramte bolden først. Det røde kort trækkes tilbage – det bliver gult.`, `${foulSide.team.name}: rødt bliver gult`);
              booking(foulSide, fouler, min, 'Gult kort til', ' efter VAR-tjekket', true);
            } else sendOff(foulSide, fouler, min, 'DIRECT', ' 📺 VAR: det røde kort står.');
          } else sendOff(foulSide, fouler, min, 'DIRECT');
        } else if (canSendOff(foulSide, fouler) && rng.chance(VAR_RULES.RED_UPGRADE_P) && rng.next() * 22 < fouler.varProfile.cynicism) {
          st[k(foulSide, 'VarChecks')]++; homeVarNet += foulSide === H ? -1 : 1;
          addEv(min, 'VAR_RED', 'HIGHLIGHT', foulSide.isHome, true, '📺 VAR: opgraderet til rødt', `📺 [${foulSide.team.name}] VAR kalder dommeren ud til skærmen: ${gen(tag(fouler))} tackling var med knopperne forrest. Efter at have set skærmen giver han rødt kort!`, `${foulSide.team.name}: rødt kort`);
          events.at(-1).var = { kind: 'RED', verdict: 'UPGRADED' };
          sendOff(foulSide, fouler, min, 'DIRECT');
        }
        // Kortet står FØR indskiftningen (v3.16.7, Spilfører: skade 57', skift 58', rødt kort 59') – dommeren giver kortet, så skiftes der
        if (!substitute(victimSide, slot, min, 'Skadesskift')) {
          // Han bliver på banen (haltende – LIMP) og spiller videre: intet udminut
          // Årsagen er offentlig (skift og pauser ses i referatet) – QC v3.13.
          const why = subBlock(victimSide, min) ?? 'der er ingen rask spiller på bænken';
          addEv(min, 'INFO', 'PLAY', victimSide.isHome, false, 'Ingen indskiftning', `🚑 [${victimSide.team.name}] Ingen indskiftning mulig (${why}) – holdet spiller videre med ${tag(victim)} haltende.`);
        }
        // Listerne bygges igen efter skiftet (v3.17.0, Spilfører: den skadet udskiftede fik gult kort i det stille frispark
        // lige efter) – resten af tick'et (frispark, chance) bruger indskifteren. rolesOf trækker ingen rng.
        hR = rolesOf(H); aR = rolesOf(A);
      } else {
        // Gult kort kun her – skade-frisparkets tekst nævner intet kort (v3.10). Andet gule giver rødt (v3.15).
        booking(foulSide, fouler, min, 'Taktisk frispark og gult kort til');
      }
    }

    if (sentOffThisTick) { sentOffThisTick = false; continue; }   // rødt kort: spillet stopper (se nedenfor)
    // "Stille" frispark – kun talt, ingen hændelse (realistisk antal pr. kamp).
    if (rng.chance(QUIET_FOUL_P)) {
      st[k(def, 'Fouls')]++;
      // Hvert femte giver gult kort (v3.10, QC: ellers ≈0,5 gule pr. hold – Superligaen ≈2).
      if (rng.chance(QUIET_CARD_P)) {
        const dRq = def === H ? hR : aR, fouler = rng.pick(dRq.defs.concat(dRq.mids));
        sheet.adjust(fouler.id, -0.2); tickFoul = { side: def, p: fouler };
        booking(def, fouler, min, 'Gult kort til', ' for et frispark');
      }
    }
    // Et rødt kort stopper spillet (v3.15, QC): resten af minuttet springes over, så den udviste ikke dukker op igen i
    // samme tick fra de lister (hR/aR), der blev lavet før udvisningen. Næste tick bygger dem uden ham.
    if (sentOffThisTick) { sentOffThisTick = false; continue; }
    // Halvchancen før tick'ets dødbolde og chance (v3.17.0): ikke efter tabt bold; scores der, kommer der ingen ny afslutning
    const halfGoal = !ballLost && rng.chance(HALF_P[tickDuel] ?? HALF_P.OPEN) && halfChance(att, def, att === H ? hR : aR, def === H ? hR : aR, min);
    // Dødbolde til holdet med bolden (v3.10): straffe, frispark i skudafstand – ikke efter tabt bold.
    if (halfGoal) { /* mål på halvchancen – minuttet er brugt */ }
    else if (!ballLost && rng.chance(PENALTY_P)) penalty(att, def, att === H ? hR : aR, def === H ? hR : aR, min);
    else if (!ballLost && rng.chance(VAR_RULES.PEN_AWARD_P)) penalty(att, def, att === H ? hR : aR, def === H ? hR : aR, min, true);
    else if (!ballLost && rng.chance(FREEKICK_P)) freeKick(att, def, att === H ? hR : aR, def === H ? hR : aR, min);
    // Chance (30 %): angrebsfokus afgør typen (v3.12) – høj bold, cutback – ellers en afslutning (løb uden bold eller
    // almindeligt skud). Ikke efter tabt bold. VAR er ikke en chancetype (v3.15.1) – det tjekker målet bagefter.
    // Opbygningen styrer chancen (v3.17.0, Spilfører: "0 af 10" og alligevel 3-1): efter en vundet opbygning løftes chancen
    // (BUILD_LIFT_P oven i), uden duel dæmpes den (OPEN_DAMP_P) – færre hovedchancer i alt; halvchancen fylder resten. Egne p-værdier, så
    // testenes scriptede terning (CHANCE_P.NORMAL = 0,3) er uændret.
    else if (!ballLost && !(tickDuel === 'OPEN' && rng.chance(OPEN_DAMP_P))
      && (rng.chance(CHANCE_P[attPh.phase1_buildUp.offBallRuns] ?? CHANCE_P.NORMAL) || (tickDuel === 'BUILD' && rng.chance(BUILD_LIFT_P[attPh.phase1_buildUp.offBallRuns] ?? BUILD_LIFT_P.NORMAL)))) {
      const cR = att === H ? hR : aR, dR = def === H ? hR : aR;
      const ph1 = attPh.phase1_buildUp, focus = ph1.attackFocus;
      const assister = rng.pick(cR.mids), defender = rng.pick(dR.defs), gk = dR.gk;
      st[k(att, 'Shots')]++;
      const shotXg = 0.13 + rng.next() * 0.22;
      st[k(att, 'Xg')] += shotXg;
      if (focus === 'HIGH_CROSSES' ? rng.chance(FOCUS_SHARE.HIGH_CROSSES) : ph1.passingStyle === 'DIRECT_LONG' && rng.chance(FOCUS_SHARE.LONG_BALL)) {
        // Høj bold i åbent spil – samme luftduel som dødboldene. Hovedstødsspilleren er den, der står
        // nær feltets midte; indlægget slås fra kanten, den lange bold fra midtbanen.
        const source = focus === 'HIGH_CROSSES' ? 'cross' : 'long';
        const cx = source === 'cross' ? (rng.next() < 0.5 ? 12 : 88) : 50, ctx = { attacking: true, ballX: cx };
        const target = receiver(att, SPOT.CROSS, (p) => p.aerialPower, null, ctx);
        const from = source === 'cross' ? receiver(att, { x: cx, y: 30 }, (p) => p.skills.passing, target, ctx, RECEIVE_REACH) : assister;
        // Billedet: indlæggeren ude på kanten, hovedstødsspilleren i feltet (den lange bold slås fra hans plads).
        const moves = { [target.id]: [SPOT.CROSS.x, SPOT.CROSS.y], ...(source === 'cross' ? { [from.id]: [cx, CROSS_FROM_Y] } : {}) };
        const res = aerialDuel(att, def, cR, dR, min, target, from, defender, null, source, moves);
        if (res !== 'goal' && res !== 'disallowed' && rng.chance(res === 'saved' ? CORNER_P : CROSS_CORNER_P)) corner(att, def, cR, dR, min);
        continue;
      }
      if (focus === 'LOW_CUTBACKS' && rng.chance(FOCUS_SHARE.LOW_CUTBACKS)) { cutback(att, def, cR, dR, min, shotXg); continue; }
      // Skytten er den, der står nærmest målet (oftest angriberen) – ikke en tilfældig spiller.
      const shotSpot = shotSpotFor(rng.next(), defPh.phase2_defending.pressingHeight);
      // Kun spillere inden for SHOT_REACH af skudstedet afslutter (Spilfører v3.16: en stopper skød fra egen halvdel)
      const shooter = receiver(att, shotSpot, (p) => p.skills.finishing, null, { attacking: true, ballX: 50 }, SHOT_REACH);
      {
        // Løb uden bold (v3.9): en markspiller forsøger at løbe sig fri. Vinder han løbet, træffer
        // han en beslutning (skud/aflevering/dribletur) efter zone og evner; ellers en almindelig
        // afslutning som før. Kun DIT holds løb fortælles i referatet. (v3.16: afspilningen viser løberen RUN_STEP længere
        // fremme i afslutningens øjeblik – også modstanderens; brugerens valg "begge hold fuldt synlige", spec §3.)
        const runs = attPh.phase1_buildUp.offBallRuns ?? 'NORMAL';
        const attC = coordsOf(att.tactics);
        const all = att.starters.map((p, i) => ({ p, i })).filter(({ p, i }) => i > 0 && p), sound = all.filter(({ p }) => !limping(p));
        const pool = sound.length ? sound : all;   // en haltende løber ikke fri
        const wts = pool.map(({ i }) => RUN_WEIGHT[runGroup(attC[i].r)][runs] ?? 1);
        let rr = rng.next() * wts.reduce((x, y) => x + y, 0);
        const pick = pool[Math.max(0, wts.findIndex((w) => (rr -= w) < 0))] ?? pool.at(-1);
        const runner = pick.p, rs = runner.skills, zone = runZone(slotPosition(att.tactics, pick.i));
        // En kantløber møder backen på sin kant (v3.17.0, Spilfører: løbs-cutbacken nævnte en tilfældig forsvarer) – samme
        // forsvarer i løbet, driblingen og teksten
        // I midten dækker den forsvarer, der står nærmest løberen (v3.21.0 – nearPick); på kanten backen på hans side
        const runPos = zone === 'WIDE' ? null : coupledPositions(att.tactics, def.tactics, { ballX: 50, ...onOf(att, def) });
        const marker = zone === 'WIDE' ? flankBack(def, slotPosition(att.tactics, pick.i).x < 50 ? 12 : 88) : nearPick(def, dR.defs, mirrorPt(runPos.ball[pick.i]), runPos.opp);
        sheet.bump(runner.id, 'freeRuns'); duelLog[att.team.id].runs++;
        const runWon = (rs.positioning + rs.pace * 0.5) * ff(runner) + rng.next() * 8 + (RUN_DUEL_BONUS[runs] ?? 0)
          > (marker.skills.positioning + marker.skills.intercepting * 0.5) * ff(marker) + rng.next() * 8 + (RUN_COVER[defPh.phase1_buildUp.offBallRuns] ?? 0);
        sheet.bump(marker.id, 'duels'); if (!runWon) sheet.bump(marker.id, 'duelsWon');
        if (runWon) {
          sheet.bump(runner.id, 'freeRunsWon'); duelLog[att.team.id].runsWon++; sheet.adjust(runner.id, 0.15);
          // Løberen står nu længere fremme end sin levende position (positions.js) – det er dét
          // billede, afleveringen spilles ud fra, og som ses på minibanen ved målet.
          const rctx = { attacking: true, ballX: zone === 'WIDE' ? (slotPosition(att.tactics, pick.i).x < 50 ? 12 : 88) : 50, runner: pick.i };
          shapes(att, rctx);
          // Angrebsfokus vægter for alle hold (v3.12, brugerens valg); teksten nævner det kun for dit hold.
          const w = decisionWeights(rs, zone, focus === 'LOW_CUTBACKS');
          let rd = rng.next() * (w.SHOT + w.PASS + w.DRIBBLE);
          const choice = ['SHOT', 'PASS', 'DRIBBLE'].find((c) => (rd -= w[c]) < 0) || 'SHOT';
          const where = { WIDE: 'på kanten', DEEP: 'dybt i banen', MID: 'mellem kæderne', HIGH: 'bag forsvaret' }[zone];
          const yourRun = own(att) ? `✅ ${tag(runner)} løber sig fri ${where}` : '';
          let finisher = runner, helper = rng.pick(cR.mids.filter((p) => p !== runner).concat(cR.atts.filter((p) => p !== runner))) ?? assister, kind, lead = '';
          if (choice === 'PASS') {
            finisher = receiver(att, zone === 'WIDE' ? SPOT.CUTBACK : SPOT.GOAL, (p) => p.skills.finishing, runner, rctx, SHOT_REACH, notCB(att), true);
            helper = runner; kind = zone === 'WIDE' ? 'CUTBACK' : 'COMBINATION';
            lead = yourRun && `${yourRun} og ${zone !== 'WIDE' ? 'spiller' : focus === 'LOW_CUTBACKS' ? 'lægger den lavt tilbage til' : 'lægger den tværs til'} ${tag(finisher)}.`;
            // Modstanderens løbs-cutback står også i referatet – neutralt som cutback() (§3) – så "Dit felt: cutbacks stoppet
            // x af y" passer med de linjer, du kan læse (QC v3.16.5-planen; før blev de talt uden at blive vist)
            if (zone === 'WIDE' && !own(att)) addEv(min, 'INFO', 'PLAY', att.isHome, false, 'Mod baglinjen', `↩️ [${att.team.name}] ${tag(runner)} kommer forbi ${tag(marker)} og spiller bolden tilbage i feltet.`);
          } else if (choice === 'DRIBBLE') {
            const beat = (rs.pace + rs.ballControl) * ff(runner) + rng.next() * 8
              > (marker.skills.positioning + marker.skills.strength * 0.5) * ff(marker) + rng.next() * 8 + DRIBBLE_DEF_EDGE;
            if (!beat) {
              // Opsnapning: ingen afslutning – og samme kontra-tjek som efter et vundet pres.
              st[k(att, 'Shots')]--; st[k(att, 'Xg')] -= shotXg;
              sheet.adjust(marker.id, 0.3); sheet.bump(marker.id, 'tacticWins');
              addEv(min, 'INFO', 'PLAY', def.isHome, false, 'Opsnappet', own(att) ? `❌ [${att.team.name}] ${tag(runner)} løber sig fri ${where}, men ${tag(marker)} (${def.team.name}) tager bolden i driblingen.` : `🛡️ [${def.team.name}] ${tag(marker)} tager bolden fra ${tag(runner)} (${att.team.name}).`);
              if (rng.chance(counterChance(runs, attPh.phase3_transition.onBallLost, defPh.phase3_transition.onBallWon, fbCount(att)))) counterAttack(def, att, min, dR, cR);
              continue;
            }
            kind = 'DRIBBLE';
            lead = yourRun && `${yourRun}, dribler ${tag(marker)} af og afslutter selv.`;
          } else {
            // Langskud efter samme regel som den almindelige afslutning: løberen står uden for feltet (LONGSHOT_Y) i øjeblikket
            // (v3.16 – før gav zonen langskud, også for en kantløber ved hjørneflaget).
            const rp = seen[att.team.id]?.[pick.i];
            kind = rp && rp.y >= LONGSHOT_Y ? 'LONGSHOT' : 'COMBINATION';
            lead = yourRun && `${yourRun} og skyder.`;
          }
          // En aflevering fra kanten er en rigtig cutback – tælles med i fuldtids-analysens cutbacks.
          const log = duelLog[att.team.id], cut = kind === 'CUTBACK';
          if (cut) log.cutbacks++;
          finishAttempt(att, def, cR, dR, min, finisher, helper, kind, { bonus: RUN_FINISH_BONUS, lead, onGoal: () => { log.runGoals++; if (cut) log.cutbackGoals++; } });
        } else {
          // Ikke fri: almindelig afslutning. Typen afgøres efter evnerne, når bolden er inde
          // (langskud og dribletur vægtet af evnerne; cutback og kontra kommer kun fra deres egne hændelser).
          const sk = shooter.skills;
          // Langskud = skytten står uden for feltet i øjeblikket (v3.12.1, dokumentet "Mål": langskud
          // 8–10 %). Inde i feltet: kombination eller dribletur efter evnerne.
          const sp = seen[att.team.id]?.[att.starters.indexOf(shooter)], outside = !!sp && sp.y >= LONGSHOT_Y;
          finishAttempt(att, def, cR, dR, min, shooter, assister, outside ? 'LONGSHOT' : () => {
            const w = { COMBINATION: 4, DRIBBLE: Math.max(0, (sk.pace + sk.ballControl) / 2 - 8) * 0.45 };
            let r = rng.next() * (w.COMBINATION + w.DRIBBLE);
            return Object.keys(w).find((x) => (r -= w[x]) < 0) || 'COMBINATION';
          }, { bonus: outside ? longshotBonus(sk.finishing) : 0 });
        }
      }
    }
  }

  // Fuldtids-analyse (v3.10, brugeren: "Ved pausen får jeg information om hvordan min opbygning
  // har klaret sig, men det får jeg ikke af vide ved fuldtid") – kun dit hold, dine valg og tal.
  const meSide = [H, A].find(own);
  // Hvad udskiftningerne sparede (v3.13, Spilfører: en svagere indskifter skal kunne forstås som et valg):
  // de udskiftede (ikke skadede) løb færre km – friskheden efter kampen regnes efter km-prisen (freshness.js).
  if (meSide) {
    const off = Object.values(sheet.entries).filter((e) => e.teamId === meSide.team.id && e.minIn <= 1 && e.minOut < 90 && !e.injured && !e.red);
    // Efter restitutionen (41 % af det, der mangler) er gevinsten 59 % af den sparede pris (QC: ellers stod 12 for 7).
    const saved = Math.round((1 - REST_SHARE) * off.reduce((a, e) => a + matchCost(e.km90 * (90 - e.minOut) / 90, meSide.team.squad.find((p) => p.id === e.playerId)?.skills.stamina ?? 10), 0));
    if (off.length && saved >= 1) addEv(90, 'INFO', 'TACTIC', meSide.isHome, false, 'Udskiftninger', `🔋 [${meSide.team.name}] ${off.length === 1 ? 'Din udskiftede spiller' : `Dine ${off.length} udskiftede spillere`} sparede ca. ${saved} point friskhed til ${opts.lastOfSeason ? 'første runde i næste sæson' : 'næste runde'}.`);
  }
  // Dit holds egen kamprapport (v3.14, brugerens valg: klummen skal kunne bruge fuldtids-analysens tal): den
  // spillede taktik (start/slut) og dueltallene pr. menneskestyret side. Ejer-privat (visibility.js
  // viewOwnReport) – fuldtids-analysen og klummens "din kamp" læser BEGGE herfra, så de aldrig modsiger hinanden.
  const ownReports = Object.fromEntries([H, A].filter(own).map((s) => {
    const d = duelLog[s.team.id], o = duelLog[other(s).team.id], side = s.isHome ? 'home' : 'away';
    return [s.team.id, { side, start: { formation: startFormations[side], phases: startPhases[side] }, end: { formation: s.tactics.baseFormation, phases: structuredClone(s.tactics.phases) },
      ...d, oppCutbacks: o.cutbacks, oppCutbacksBlocked: o.cutbacksBlocked, oppCrosses: o.crosses, oppCrossesWon: o.crossesWon, oppTrapWon: o.trapWon }];
  }));
  if (meSide) {
    const d = ownReports[meSide.team.id], ph = meSide.tactics.phases.phase1_buildUp, runs = ph.offBallRuns ?? 'NORMAL';
    const p = meSide.isHome ? 'h' : 'a', poss = Math.round((st[p + 'Poss'] / (st.hPoss + st.aPoss)) * 100);
    const [myG, oppG] = meSide.isHome ? [hG, aG] : [aG, hG];
    addEv(90, 'FULLTIME', 'TACTIC', meSide.isHome, false, 'Fuldtids-analyse',
      `📊 [FULDTIDS-ANALYSE] ${myG > oppG ? `Sejr ${myG}-${oppG} til dig` : myG < oppG ? `Nederlag ${myG}-${oppG}` : `Uafgjort ${myG}-${oppG}`}. Du havde ${poss}% af bolden og ${pl(st[p + 'Shots'], 'afslutning', 'afslutninger')} (${st[p + 'OnTarget']} på mål). ${duelText(d, duelLog[other(meSide).team.id])}`
      + ` Dødbolde: ${st[p + 'FreeKicks']} frispark i skudafstand, ${st[p + 'Corners']} hjørnespark, ${st[p + 'Penalties']} straffespark (${st[p + 'PenaltyGoals']} mål) · frispark begået ${st[p + 'Fouls']}, tilkendt ${st[(p === 'h' ? 'a' : 'h') + 'Fouls']}.`
      + ` 🎯 Løb uden bold (${RUNS_LABEL[runs]}): ${d.runs} løb, ${d.runsWon} kom fri (${d.runGoals} mål) · kontraer imod i alt: ${d.countersAgainst} (${d.counterGoalsAgainst} mål).`
      // v3.12 (brugeren: "ikke en eneste reference til cutbacks"): dit angreb efter dine valg og
      // dit felt – modstanderens indstilling navngives ikke, kun hvad dit forsvar mødte.
      + ` ⚔️ Angreb (${FOCUS_LABEL[ph.attackFocus] ?? ph.attackFocus} · ${PASS_LABEL[ph.passingStyle] ?? ph.passingStyle}): ${attackLine(d, ph)}.`
      + ` 🛡️ Dit felt: modstanderens cutbacks stoppet ${d.oppCutbacksBlocked} af ${d.oppCutbacks} · luftdueller i åbent spil vundet ${d.oppCrosses - d.oppCrossesWon} af ${d.oppCrosses}.`);
  }
  const ratings = finalizeSheet(sheet, hG, aG, rng, counterXpForMatch);
  addEv(90, 'END', 'HIGHLIGHT', true, false, 'Slutfløjt', `🏁 SLUTFLØJT! ${home.name} ${hG} - ${aG} ${away.name}.${ratings.motm ? ` Kampens spiller: #${ratings.motm.shirtNumber} ${ratings.motm.shortName} (${ratings.motm.teamName}).` : ''}`);

  // Rigtige minutter (v3.16.4): uret lægges på referatet bagefter – kun visning, intet træk (clock.js)
  const stoppage = assignClock(events, minClock);
  const result = {
    round: opts.round ?? 0,
    homeId: home.id, awayId: away.id, homeName: home.name, awayName: away.name,
    homeTacticStr, awayTacticStr, startFormations,
    // Formation og opstilling ved slutfløjt (efter Hvis-Så-skifter og indskiftninger).
    endState: { home: endOf(H, own(H)), away: endOf(A, own(A)) },
    ownReports,
    homeGoals: hG, awayGoals: aG, homeVarNet,
    driftSeed: driftOn ? driftSeed : null,   // v3.21.0: bevægelsens seed (positions.js driftAt) – til test-oraklerne; følger med i gemmet (et tal, røber intet)
    events, stats: st, ratings, goalsPool, injuries, observations, trace, stoppage,
  };
  // Holdenes private tællere pr. hold-id – kun til måleværktøjet; ikke-optællelig, så de
  // aldrig gemmes eller vises (de røber taktik).
  Object.defineProperty(result, 'duelLog', { value: duelLog, enumerable: false });
  return result;
}
