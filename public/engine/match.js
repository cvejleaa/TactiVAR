// Kampmotoren (v2.5b-paritet, docs/spec.md §5). Ren funktion: holdene ændres ALDRIG –
// skader, observationer og karakterer returneres i resultatet og lægges ind af season.js.
// Rettet ift. v2.5b: auto-indskiftning sker i en kamplokal kopi (ændrede før lineupSlots
// permanent), og Hvis-Så-reglerne kører for begge hold og skifter reelt formation.
import { FORMATIONS, lineOfRole, isOutOfZone } from './formations.js';
import { masteryVs, counterXpForMatch } from './counter.js';
import { createSheet, finalizeSheet } from './ratings.js';
import { describeFinish, describeHeader, describeVarTiming } from './clues.js';

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
export const MASTERY_WEIGHT = 0.05;
// Dine egne valg i referatet (grammatisk rigtigt i en sætning om dit hold).
const YOUR_PASS = { SHORT: 'Dine korte pasninger', BALANCED: 'Din balancerede opbygning', DIRECT_LONG: 'Dine direkte lange bolde' };
const YOUR_PRESS = { LOW_BLOCK: 'din lave blok', MID_BLOCK: 'din mellemblok', HIGH_GEGENPRESS: 'dit høje gegenpres' };
const cap = (t) => t[0].toUpperCase() + t.slice(1);
const TXT = { SHORT: 'korte pasninger', BALANCED: 'balanceret opbygning', DIRECT_LONG: 'direkte lange bolde', LOW_BLOCK: 'lav blok', MID_BLOCK: 'mellemblok', HIGH_GEGENPRESS: 'højt gegenpress' };
const isAvailable = (p) => !(p.injuryMatchesLeft > 0);

// Kamplokal side: kopi af taktikken + aktuelle 11 spillere + bænk.
function prepareSide(team, isHome, notes) {
  const tactics = structuredClone(team.tactics);
  const byId = new Map(team.squad.map((p) => [p.id, p]));
  const starters = tactics.lineupSlots.map((id) => byId.get(id));
  const used = new Set(starters.filter(Boolean).map((p) => p.id));
  const bench = () => team.squad.filter((p) => !used.has(p.id) && isAvailable(p));
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
  const defs = [], mids = [], atts = [];
  side.starters.forEach((p, i) => {
    if (i === 0) return;
    const line = lineOfRole(coords[i].r);
    (line === 'DEF' ? defs : line === 'MID' ? mids : atts).push(p);
  });
  const s = side.starters;
  return { gk: s[0], defs: defs.length ? defs : s.slice(1, 5), mids: mids.length ? mids : s.slice(5, 9), atts: atts.length ? atts : s.slice(9) };
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
  const st = { hPoss: 10, aPoss: 10, hShots: 0, aShots: 0, hOnTarget: 0, aOnTarget: 0, hXg: 0, aXg: 0, hAerialWon: 0, aAerialWon: 0, hVarChecks: 0, aVarChecks: 0, hTacticSuccess: 0, aTacticSuccess: 0, hFouls: 0, aFouls: 0, hInjuries: 0, aInjuries: 0 };
  let hG = 0, aG = 0, homeVarNet = 0;
  const k = (side, name) => (side.isHome ? 'h' : 'a') + name;
  const other = (side) => (side === H ? A : H);

  const addEv = (min, type, category, isHome, plot, label, text, varMsg) =>
    events.push({ min, type, category, isHome, plot, label, text, varMsg, hG, aG, stats: { ...st } });
  const observe = (player, text) => observations.push({ playerId: player.id, text });
  const register = (side, p, role, minIn, slot) => sheet.register(p, side.team, side.isHome, role, minIn, rng, masteryVs(p, other(side).team), slot);

  for (const side of [H, A]) side.starters.forEach((p, i) => p && register(side, p, coordsOf(side.tactics)[i].r, 1, i));
  // Startformationen gemmes, så karakterarket kan vise spillerne på banen.
  const startFormations = { home: H.tactics.baseFormation, away: A.tactics.baseFormation };
  const hAvg = Math.round(avg(H.starters, (p) => masteryVs(p, away)));
  const aAvg = Math.round(avg(A.starters, (p) => masteryVs(p, home)));

  // Andre holds taktiske overvejelser (faser, Hvis-Så) må ikke kunne læses – kun deres
  // startopstilling. Egne valg (det menneskestyrede hold) vises fuldt.
  const own = (s) => !s.team.isBot;
  // Fase-dueller pr. hold til pause-analysen: forsøg/sejre med opbygning og med pres.
  const duelLog = Object.fromEntries([H, A].map((s) => [s.team.id, { build: 0, buildWon: 0, press: 0, pressWon: 0 }]));
  const tacticStr = (s) => { const p = s.tactics.phases; return own(s) ? `${s.tactics.baseFormation} • ${TXT[p.phase1_buildUp.passingStyle]} / ${TXT[p.phase2_defending.pressingHeight]}` : s.tactics.baseFormation; };
  const hCustom = customDragged(H);
  const customIntro = hCustom.length ? ` Bemærk: ${home.name} har trukket ${tag(hCustom[0].player)} ud af sin grundposition.` : '';
  for (const n of lineupNotes) addEv(1, 'LINEUP', 'TACTIC', n.isHome, false, 'Ændret startopstilling', n.text);
  // Kamphovedet viser startformationen – beregnes før et evt. Hvis-Så-skifte.
  const homeTacticStr = tacticStr(H), awayTacticStr = tacticStr(A);
  addEv(1, 'TACTIC_NOTE', 'TACTIC', true, false, 'Taktisk oplæg', `📋 [TAKTISK OPLÆG] ${home.name} (${homeTacticStr}) møder ${away.name} (${awayTacticStr}).${customIntro}`);

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
      const yours = mine ? ` Din opbygning er kommet igennem ${duelLog[mine.team.id].buildWon} af ${duelLog[mine.team.id].build} gange; dit pres har vundet bolden ${duelLog[mine.team.id].pressWon} af ${duelLog[mine.team.id].press} gange.` : '';
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

    // Fase 1 mod fase 2 (48 %) med sten-saks-papir-bonus og mod-kunnen.
    if (rng.chance(0.48)) {
      const pmM = masteryVs(playmaker, def.team), prM = masteryVs(presser, att.team);
      let build = playmaker.skills.passing + playmaker.skills.ballControl + pmM * MASTERY_WEIGHT + rng.next() * 7;
      let press = presser.skills.intercepting + presser.skills.positioning * 0.85 + presser.skills.stamina * 0.35 + prM * MASTERY_WEIGHT + rng.next() * 7;
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
          const counter = !own(def) ? '' : defPh.phase3_transition.onBallWon === 'FAST_COUNTER' ? ' Din lynkontra sættes straks i gang.' : ' Dit hold falder til ro på bolden.';
          const text = own(def) ? `✅ [DIT PRES VIRKER] ${cap(YOUR_PRESS[height])} lukker af: ${tag(presser)} erobrer bolden fra ${tag(playmaker)} (${att.team.name}).${counter}`
            : own(att) ? `❌ [DIN OPBYGNING STOPPES] ${YOUR_PASS[pass]} kommer ikke igennem: ${tag(presser)} (${def.team.name}) erobrer bolden fra ${tag(playmaker)}.`
            : `🛑 [FASE 1 STOPPER MOD FASE 2] ${tag(presser)} (${def.team.name}) erobrer bolden fra ${tag(playmaker)}.`;
          addEv(min, 'TACTIC_FAIL', 'TACTIC', def.isHome, false, 'Fase 2 pres virker', text);
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
      if (sheet.entries[fouler.id]) sheet.entries[fouler.id].yellowCard = true;
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
        addEv(min, 'FOUL', 'PLAY', foulSide.isHome, false, 'Frispark', `🟨 [${foulSide.team.name}] Taktisk frispark og gult kort til ${tag(fouler)}.`);
      }
    }

    // Chance (30 %): høje bolde, VAR-tjek eller almindelig afslutning.
    if (rng.chance(0.3)) {
      const cR = att === H ? hR : aR, dR = def === H ? hR : aR;
      const shooter = rng.pick(cR.atts.concat(cR.mids)), assister = rng.pick(cR.mids), defender = rng.pick(dR.defs), gk = dR.gk;
      st[k(att, 'Shots')]++;
      st[k(att, 'Xg')] += 0.13 + rng.next() * 0.22;
      const scored = () => { if (att === H) hG++; else aG++; st[k(att, 'OnTarget')]++; };
      const assist = (bonus) => { if (assister.id !== shooter.id) { sheet.adjust(assister.id, bonus); sheet.bump(assister.id, 'assists'); } };
      const high = attPh.phase1_buildUp.attackFocus === 'HIGH_CROSSES' || attPh.phase1_buildUp.passingStyle === 'DIRECT_LONG';
      if (high && rng.chance(0.55)) {
        if (shooter.aerialPower + rng.next() * 6 > defender.aerialPower + gk.skills.goalkeeping * 0.38 + rng.next() * 6) {
          scored(); st[k(att, 'AerialWon')]++; st[k(att, 'TacticSuccess')]++;
          sheet.adjust(shooter.id, 1.35); sheet.bump(shooter.id, 'goals'); sheet.bump(shooter.id, 'aerialWins'); assist(0.55);
          sheet.adjust(defender.id, -0.35); sheet.adjust(gk.id, -0.25);
          const prose = describeHeader(shooter.aerialPower);
          observe(shooter, `Luftduel (${min}. min mod ${def.team.name}): ${shooter.shortName} scorede med ${prose}.`);
          goalsPool.push({ scorer: tag(shooter), teamName: att.team.name, match: `${home.name} - ${away.name}`, min, kind: 'HEADER', spectacle: shooter.aerialPower + (min >= 80 ? 5 : 2) + rng.next() * 4, desc: `Et hovedstødsmål i ${min}. minut: efter et indlæg fra ${tag(assister)} rejste ${tag(shooter)} sig med ${prose}.` });
          addEv(min, 'HEADER_GOAL', 'HIGHLIGHT', att.isHome, true, `⚽ Hovedstødsmål: ${tag(shooter)}`, `⚽ [${att.team.name} • ${hG}-${aG}] MÅÅÅL! ${tag(shooter)} (${shooter.heightCm} cm) header bolden ind – ${prose}.`);
        } else {
          st[k(def, 'AerialWon')]++;
          sheet.adjust(defender.id, 0.4); sheet.bump(defender.id, 'aerialWins');
          addEv(min, 'INFO', 'PLAY', def.isHome, false, 'Luftduel i feltet', `✈️ [${def.team.name} forsvar] Stærk luftduel: ${tag(defender)} (${defender.heightCm} cm) stiger højest og clearer foran ${tag(shooter)}.`);
        }
      } else if (rng.next() < 0.22) {
        st[k(att, 'VarChecks')]++;
        const trapBonus = (shooter.counterTactics?.vsTrapLong ?? 30) * 0.025;
        const timing = describeVarTiming(shooter.varProfile.varPulse);
        if (shooter.varProfile.varPulse + trapBonus + rng.next() * 6 > defender.skills.positioning + rng.next() * 6) {
          scored(); homeVarNet += att === H ? 1 : -1;
          sheet.adjust(shooter.id, 1.3); sheet.bump(shooter.id, 'goals'); assist(0.5); sheet.adjust(defender.id, -0.35);
          observe(shooter, `VAR-tjek (${min}. min mod ${def.team.name}): ${shooter.shortName} ${timing}.`);
          goalsPool.push({ scorer: tag(shooter), teamName: att.team.name, match: `${home.name} - ${away.name}`, min, kind: 'VAR', spectacle: 15 + (min >= 80 ? 6 : 2) + rng.next() * 4, desc: `Ren VAR-dramatik i ${min}. minut: ${tag(shooter)} ${timing}, og målet stod ved magt.` });
          addEv(min, 'VAR_GOAL', 'HIGHLIGHT', att.isHome, true, `📺 VAR: mål godkendt – ${tag(shooter)}`, `📺 [${att.team.name} • ${hG}-${aG}] VAR-KENDELSE: MÅL GODKENDT! ${tag(shooter)} ${timing}.`, `${att.team.name}: mål godkendt`);
        } else {
          homeVarNet += att === H ? -1 : 1;
          sheet.adjust(shooter.id, -0.4); sheet.adjust(defender.id, 0.45); sheet.bump(defender.id, 'tacticWins');
          observe(shooter, `VAR-annullering (${min}. min mod ${def.team.name}): ${shooter.shortName} var en anelse for tidligt af sted.`);
          addEv(min, 'VAR_NO_GOAL', 'HIGHLIGHT', att.isHome, true, `📺 VAR: annulleret – ${tag(shooter)}`, `📺 [${att.team.name}] VAR-KENDELSE: MÅLET ANNULLERES! ${tag(defender)} (${def.team.name}) holdt linjen, og ${tag(shooter)} var offside.`, `${att.team.name}: mål annulleret`);
        }
      } else if (shooter.skills.finishing + rng.next() * 8 > gk.skills.goalkeeping + rng.next() * 8) {
        scored();
        sheet.adjust(shooter.id, 1.25); sheet.bump(shooter.id, 'goals'); assist(0.5); sheet.adjust(gk.id, -0.3);
        const prose = describeFinish(shooter.skills.finishing);
        observe(shooter, `Scoring (${min}. min mod ${def.team.name}): ${shooter.shortName} afsluttede med ${prose}.`);
        goalsPool.push({ scorer: tag(shooter), teamName: att.team.name, match: `${home.name} - ${away.name}`, min, kind: 'GOAL', spectacle: shooter.skills.finishing + (min >= 80 ? 4 : 1) + rng.next() * 5, desc: `Kombinationsfodbold i ${min}. minut: ${tag(assister)} spillede ${tag(shooter)} fri, og han sluttede af med ${prose}.` });
        addEv(min, 'GOAL', 'HIGHLIGHT', att.isHome, true, `⚽ Mål: ${tag(shooter)}`, `⚽ [${att.team.name} • ${hG}-${aG}] MÅÅÅL! ${tag(shooter)} overlister målmanden med ${prose}.`);
      } else {
        st[k(att, 'OnTarget')]++;
        sheet.adjust(gk.id, 0.5); sheet.bump(gk.id, 'saves'); sheet.adjust(shooter.id, 0.1);
        addEv(min, 'SAVE', 'PLAY', def.isHome, false, 'Redning', `🧤 [${def.team.name}] Flot redning af ${tag(gk)} på afslutning fra ${tag(shooter)} (${att.team.name}).`);
      }
    }
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
