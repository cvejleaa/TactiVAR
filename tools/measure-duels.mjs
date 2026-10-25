// Måler fase-duellen og mod-kunnen. Kør: node tools/measure-duels.mjs [antal ligaer]
// Før v3.6 (genskab: git checkout 8b5253e -- public/engine && node tools/measure-duels.mjs 20):
// fase 1 vandt 96,7–96,8 %, 1,76 mål pr. kamp, startelleverens bedste mod-kunnen 42,5 → 67,5 på 3 runder.
// Udskriver (docs/spec.md §5, §7):
//  1. hvor ofte opbygning (fase 1) slår pres (fase 2) med ligaens egne taktikker,
//  2. samme med neutrale stile (balanceret mod mellemblok) og med en rigtig mod-stil,
//  3. hvordan dit holds mod-kunnen udvikler sig over 3 runder.
import { createRng } from '../public/engine/rng.js';
import { createLeague } from '../public/engine/generator.js';
import { playPairs, fixedPairs, commitRound } from '../public/engine/season.js';
import { COUNTER_KEYS } from '../public/engine/counter.js';
import { simulateMatch } from '../public/engine/match.js';
import { lineOfRole } from '../public/engine/formations.js';
import { replaySteps } from '../public/ui/replay.js';

const ARG_N = Number(process.argv[2] || 20);
const ROLE_GROUP = { CDM: 'CM', LB: 'FB', RB: 'FB', LWB: 'WB/kant', RWB: 'WB/kant', LM: 'WB/kant', RM: 'WB/kant', LW: 'WB/kant', RW: 'WB/kant', CAM: 'CAM/CF', CF: 'CAM/CF' };
const ROLE_ORDER = ['CM', 'WB/kant', 'FB', 'CAM/CF', 'ST', 'CB', 'GK'];
const isWin = (e) => e.label === 'Fase 1 virker';
const isFail = (e) => e.label === 'Fase 2 pres virker' || e.label === 'Offside-fælde virker';

// setup(team, i) kan sætte faser før hver runde; returnerer andel fase 1-sejre (alle hold).
export function measure(setup = null, rounds = 3, N = ARG_N) {
  let win = 0, fail = 0, ownWin = 0, ownFail = 0, goals = 0, games = 0, headers = 0, pens = 0, penGoals = 0, setPiece = 0, corners = 0, fouls = 0, freeKicks = 0;
  const series = [];
  for (let s = 1; s <= N; s++) {
    const rng = createRng(s * 7919);
    const L = createLeague(rng);
    const me = L.teams.find((t) => !t.isBot);
    const starters = () => me.squad.filter((p) => me.tactics.lineupSlots.includes(p.id));
    const avg = () => starters().reduce((a, p) => a + Math.max(...COUNTER_KEYS.map((k) => p.counterTactics[k])), 0) / 11;
    const ser = [avg()];
    for (let r = 0; r < rounds; r++) {
      if (setup) L.teams.forEach(setup);
      const res = playPairs(L, fixedPairs(L, 1), rng);
      for (const m of res.matches) {
        goals += m.homeGoals + m.awayGoals; games++; headers += m.events.filter((e) => e.type === 'HEADER_GOAL').length;
        const s = m.stats;
        pens += s.hPenalties + s.aPenalties; penGoals += s.hPenaltyGoals + s.aPenaltyGoals; setPiece += s.hSetPieceGoals + s.aSetPieceGoals;
        corners += s.hCorners + s.aCorners; fouls += s.hFouls + s.aFouls; freeKicks += s.hFreeKicks + s.aFreeKicks;
      }
      for (const m of res.matches) for (const e of m.events) {
        const mine = (e.isHome ? m.homeId : m.awayId) === me.id;
        if (isWin(e)) { win++; if (mine) ownWin++; }
        if (isFail(e)) { fail++; if (mine) ownFail++; }
      }
      commitRound(L, res, rng);
      ser.push(avg());
    }
    series.push(ser);
  }
  return { rate: win / (win + fail), n: win + fail, ownWin, ownFail, series, goalsPerMatch: goals / games, headersPerMatch: headers / games,
    penaltiesPerMatch: pens / games, penaltyRate: pens ? penGoals / pens : 0, setPieceShare: goals ? setPiece / goals : 0, cornersPerMatch: corners / games, foulsPerMatch: fouls / games, freeKicksPerMatch: freeKicks / games };
}

// Løb uden bold (v3.9): hold A med en given indstilling mod hold B (ligaens egne bots, evt. med
// tvungen "Ved erobring"), begge baner, frisk start. Mål for/imod pr. kamp for A, kontramål imod.
export function measureRuns({ runs = 'NORMAL', lost = 'DROP_BACK', oppWon = null } = {}, N = ARG_N) {
  let gf = 0, ga = 0, cga = 0, games = 0, runsN = 0, runsWon = 0;
  for (let s = 1; s <= N; s++) {
    const rng = createRng(s * 104729);
    const L = createLeague(rng);
    for (let i = 0; i < 8; i += 2) for (const swap of [false, true]) {
      const [A, B] = [L.teams[i], L.teams[i + 1]];
      Object.assign(A.tactics.phases.phase1_buildUp, { offBallRuns: runs });
      Object.assign(A.tactics.phases.phase3_transition, { onBallLost: lost });
      B.tactics.phases.phase1_buildUp.offBallRuns = 'NORMAL';
      if (oppWon) B.tactics.phases.phase3_transition.onBallWon = oppWon;
      const m = swap ? simulateMatch(B, A, rng) : simulateMatch(A, B, rng);
      const aHome = !swap;
      gf += aHome ? m.homeGoals : m.awayGoals; ga += aHome ? m.awayGoals : m.homeGoals; games++;
      cga += m.goalsPool.filter((g) => g.kind === 'COUNTER' && g.teamName === B.name).length;
      for (const e of aHome ? m.ratings.home : m.ratings.away) { runsN += e.freeRuns; runsWon += e.freeRunsWon; }
    }
  }
  return { gf: gf / games, ga: ga / games, net: (gf - ga) / games, cga: cga / games, runs: runsN / games, runsWon: runsWon / games, games };
}
// Angrebsfokus (v3.12): hold A med pasningsstil/fokus mod hold B (ligaens bots, evt. med tvunget
// pres), begge baner. Pr. kamp for A: høje bolde og vundne luftdueller, hovedstødsmål i åbent spil,
// cutbacks (forsøg/mål/stoppet), mål for/imod – fra kampens private tællere (match.duelLog).
// Plus ligaens hovedstøds- og cutback-andel af alle mål (alle hold, egne bots).
export function measureFocus({ pass = 'BALANCED', focus = 'CENTRAL', oppPress = null } = {}, N = ARG_N) {
  const t = { gf: 0, ga: 0, crosses: 0, crossesWon: 0, headerGoals: 0, cutbacks: 0, cutbackGoals: 0, cutbacksBlocked: 0, games: 0, goals: 0, headerAll: 0, cutbackAll: 0, setPiece: 0 };
  for (let s = 1; s <= N; s++) {
    const rng = createRng(s * 15485863);
    const L = createLeague(rng);
    for (let i = 0; i < 8; i += 2) for (const swap of [false, true]) {
      const [A, B] = [L.teams[i], L.teams[i + 1]];
      Object.assign(A.tactics.phases.phase1_buildUp, { passingStyle: pass, attackFocus: focus });
      if (oppPress) B.tactics.phases.phase2_defending.pressingHeight = oppPress;
      const m = swap ? simulateMatch(B, A, rng) : simulateMatch(A, B, rng);
      const d = m.duelLog[A.id];
      t.gf += swap ? m.awayGoals : m.homeGoals; t.ga += swap ? m.homeGoals : m.awayGoals; t.games++;
      for (const k of ['crosses', 'crossesWon', 'headerGoals', 'cutbacks', 'cutbackGoals', 'cutbacksBlocked']) t[k] += d[k];
      t.goals += m.homeGoals + m.awayGoals;
      t.headerAll += m.stats.hHeaderGoals + m.stats.aHeaderGoals; t.setPiece += m.stats.hSetPieceGoals + m.stats.aSetPieceGoals;
      t.cutbackAll += m.goalsPool.filter((g) => g.kind === 'CUTBACK').length;
    }
  }
  const g = t.games;
  return { gf: t.gf / g, ga: t.ga / g, net: (t.gf - t.ga) / g, crosses: t.crosses / g, crossWinRate: t.crosses ? t.crossesWon / t.crosses : 0, headerGoals: t.headerGoals / g,
    cutbacks: t.cutbacks / g, cutbackGoals: t.cutbackGoals / g, cutbacksBlocked: t.cutbacksBlocked / g, goalsPerMatch: t.goals / g,
    headerShare: t.goals ? t.headerAll / t.goals : 0, cutbackShare: t.goals ? t.cutbackAll / t.goals : 0, setPieceShare: t.goals ? t.setPiece / t.goals : 0, games: g };
}
// Hvem og hvordan målene scores (v3.12.1, dokumentet "Spillerhøjde i Superligaen", afsnit "Mål"):
// alle mål i ligaens egne kampe fordelt på type (åbent spil inkl. langskud, dødbolde, kontra, langskud)
// og på kæde (angreb, midtbane, forsvar – indskiftere efter den kæde, de kom ind i).
export function measureGoalMix(N = ARG_N) {
  const t = { open: 0, setPiece: 0, counter: 0, longshot: 0, ATT: 0, MID: 0, DEF: 0, GK: 0 }; let n = 0, games = 0;
  const SP = new Set(['PENALTY', 'FREEKICK', 'CORNER', 'SETPIECE']);
  for (let s = 1; s <= N; s++) {
    const L = createLeague(createRng(s * 7919));
    for (let i = 0; i < 8; i += 2) {
      const m = simulateMatch(L.teams[i], L.teams[i + 1], createRng(s * 31 + i)); games++;
      const role = new Map([...m.ratings.home, ...m.ratings.away].map((e) => [`#${e.shirtNumber} ${e.shortName}|${e.teamName}`, e.role]));
      for (const g of m.goalsPool) {
        n++;
        if (SP.has(g.kind)) t.setPiece++; else { t.open++; if (g.kind === 'COUNTER') t.counter++; if (g.kind === 'LONGSHOT') t.longshot++; }
        let r = role.get(`${g.scorer}|${g.teamName}`) ?? 'ST';
        if (r.startsWith('SUB (')) r = { DEF: 'CB', MID: 'CM', ATT: 'ST', GK: 'GK' }[r.slice(5, -1)] ?? 'ST';
        t[lineOfRole(r)]++;
      }
    }
  }
  return Object.fromEntries([...Object.entries(t).map(([k, v]) => [k, v / n]), ['goalsPerMatch', n / games]]);
}
if (import.meta.url === `file://${process.argv[1]}` && process.argv[3] === 'maal') {
  const r = measureGoalMix(), pc = (x) => `${Math.round(x * 100)} %`;
  console.log(`${r.goalsPerMatch.toFixed(2)} mål pr. kamp. Type: åbent spil inkl. langskud ${pc(r.open - r.counter)} (heraf langskud ${pc(r.longshot)}), kontra ${pc(r.counter)}, dødbolde ${pc(r.setPiece)}. Kæde: angreb ${pc(r.ATT)}, midtbane ${pc(r.MID)}, forsvar ${pc(r.DEF)}.`);
}
if (import.meta.url === `file://${process.argv[1]}` && process.argv[3] === 'fokus') {
  const f = (x) => x.toFixed(2), pc = (x) => `${Math.round(x * 100)} %`;
  for (const pass of ['SHORT', 'BALANCED', 'DIRECT_LONG']) for (const focus of ['CENTRAL', 'HIGH_CROSSES', 'LOW_CUTBACKS']) {
    const r = measureFocus({ pass, focus });
    console.log(`${pass.padEnd(11)} ${focus.padEnd(12)} netto ${f(r.net)} (for ${f(r.gf)}/imod ${f(r.ga)}) · høje bolde ${f(r.crosses)} (vundet ${pc(r.crossWinRate)}, hovedstødsmål ${f(r.headerGoals)}) · cutbacks ${f(r.cutbacks)} (mål ${f(r.cutbackGoals)}, stoppet ${f(r.cutbacksBlocked)})`);
  }
  console.log('Modgift (fokus mod modstanderens pres):');
  for (const focus of ['HIGH_CROSSES', 'LOW_CUTBACKS', 'CENTRAL']) for (const oppPress of ['LOW_BLOCK', 'MID_BLOCK', 'HIGH_GEGENPRESS']) {
    const r = measureFocus({ focus, oppPress });
    console.log(`  ${focus.padEnd(12)} mod ${oppPress.padEnd(15)} netto ${f(r.net)} · vundne luftdueller ${pc(r.crossWinRate)} · cutbacks stoppet ${f(r.cutbacksBlocked)} af ${f(r.cutbacks)}`);
  }
  const all = measureFocus({ pass: 'BALANCED', focus: 'CENTRAL' });
  console.log(`Ligaen (egne bots + A balanceret/centralt): ${f(all.goalsPerMatch)} mål pr. kamp, hovedstød ${pc(all.headerShare)}, cutback ${pc(all.cutbackShare)}, dødbolde ${pc(all.setPieceShare)} af målene`);
}
if (import.meta.url === `file://${process.argv[1]}` && process.argv[3] === 'loeb') {
  const f = (x) => x.toFixed(2);
  for (const [label, o] of [['Normal', {}], ['Mange', { runs: 'MANY' }], ['Få', { runs: 'FEW' }],
    ['Normal mod Hold', { oppWon: 'KEEP_POSSESSION' }], ['Mange mod Hold', { runs: 'MANY', oppWon: 'KEEP_POSSESSION' }],
    ['Normal mod Lynkontra', { oppWon: 'FAST_COUNTER' }], ['Mange mod Lynkontra', { runs: 'MANY', oppWon: 'FAST_COUNTER' }], ['Få mod Lynkontra', { runs: 'FEW', oppWon: 'FAST_COUNTER' }], ['Få mod Hold', { runs: 'FEW', oppWon: 'KEEP_POSSESSION' }],
    ['Normal + Genpres', { lost: 'COUNTER_PRESS_5S' }]]) {
    const r = measureRuns(o);
    console.log(`${label.padEnd(22)} for ${f(r.gf)} imod ${f(r.ga)} netto ${f(r.net)} · kontramål imod ${f(r.cga)} · løb ${f(r.runs)} (fri ${f(r.runsWon)}) · ${r.games} kampe`);
  }
}

const phases = (pass, focus, height) => (t) => {
  Object.assign(t.tactics.phases.phase1_buildUp, { passingStyle: pass, attackFocus: focus });
  Object.assign(t.tactics.phases.phase2_defending, { pressingHeight: height, offsideTrap: 'OFF' });
};
if (import.meta.url === `file://${process.argv[1]}` && !['saeson', 'loeb', 'fokus', 'maal', 'formation', 'skift', 'var', 'skud', 'opbygning'].includes(process.argv[3])) {
  const pct = (x) => `${(x * 100).toFixed(1)} %`;
  const liga = measure();
  console.log(`Ligaens egne taktikker: fase 1 vinder ${pct(liga.rate)} (${liga.n} dueller, ${ARG_N} ligaer × 3 runder); ${liga.goalsPerMatch.toFixed(2)} mål pr. kamp, heraf ${liga.headersPerMatch.toFixed(2)} hovedstød.`);
  console.log(`Dødbolde: ${(liga.setPieceShare * 100).toFixed(0)} % af målene; straffe ${liga.penaltiesPerMatch.toFixed(2)} pr. kamp (${(liga.penaltyRate * 100).toFixed(0)} % scoret); hjørnespark ${liga.cornersPerMatch.toFixed(1)}, frispark begået ${liga.foulsPerMatch.toFixed(1)}, frispark i skudafstand ${liga.freeKicksPerMatch.toFixed(2)} pr. kamp.`);
  console.log(`Neutralt (balanceret/lave cutbacks mod mellemblok): fase 1 vinder ${pct(measure(phases('BALANCED', 'LOW_CUTBACKS', 'MID_BLOCK')).rate)}.`);
  // Alle spiller korte pasninger centralt mod højt gegenpress: presset har den rigtige mod-stil.
  console.log(`Rigtig mod-stil til presset (korte pasninger mod gegenpres): pres vinder ${pct(1 - measure(phases('SHORT', 'LOW_CUTBACKS', 'HIGH_GEGENPRESS')).rate)}.`);
  // Direkte lange bolde mod gegenpres: opbygningen har den rigtige mod-stil.
  console.log(`Rigtig mod-stil til opbygningen (lange bolde mod gegenpres): opbygning vinder ${pct(measure(phases('DIRECT_LONG', 'LOW_CUTBACKS', 'HIGH_GEGENPRESS')).rate)}.`);
  const mean = (i) => (liga.series.reduce((a, s) => a + s[i], 0) / ARG_N).toFixed(1);
  console.log(`Startelleverens bedste mod-kunnen: start ${mean(0)} → runde 1 ${mean(1)} → 2 ${mean(2)} → 3 ${mean(3)}`);
}

// Sæson-måling (v3.7): hvilke måltyper vinder "Rundens mål", friskhed over 10 runder (bots
// roterer) og mål pr. kamp tidligt vs. sent. Kør: node tools/measure-duels.mjs [N] saeson
export function measureSeason(N = ARG_N, rounds = 10) {
  const kinds = {}, freshMe = [], freshBots = [], goalsEarly = [], goalsLate = [];
  for (let s = 1; s <= N; s++) {
    const rng = createRng(s * 104729);
    const L = createLeague(rng);
    for (let r = 1; r <= rounds; r++) {
      const res = playPairs(L, fixedPairs(L, 1 + (r % 7)), rng);
      const g = res.gazette.goalOfTheRound; if (g) kinds[g.kind] = (kinds[g.kind] || 0) + 1;
      const gpm = res.matches.reduce((a, m) => a + m.homeGoals + m.awayGoals, 0) / res.matches.length;
      (r <= 2 ? goalsEarly : r >= rounds - 1 ? goalsLate : []).push(gpm);
      commitRound(L, res, rng);
    }
    for (const t of L.teams) {
      const st = t.squad.filter((p) => t.tactics.lineupSlots.includes(p.id));
      (t.isBot ? freshBots : freshMe).push(st.reduce((a, p) => a + p.freshness, 0) / st.length);
    }
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const total = Object.values(kinds).reduce((a, b) => a + b, 0);
  // Andel højintenst løb og km pr. ROLLE i alle hele kampe (v3.8; v3.7.1 målte pr. kæde) –
  // til sammenligning med dokumentet "Spillerhøjde i Superligaen" (fysisk belastning).
  const hi = {}, km = {};
  for (let s = 1; s <= Math.min(N, 10); s++) {
    const rng = createRng(s * 7);
    const L = createLeague(rng);
    const res = playPairs(L, fixedPairs(L, 1), rng);
    for (const m of res.matches) for (const e of [...m.ratings.home, ...m.ratings.away]) if (e.hiShare != null && e.minIn <= 1 && e.minOut === 90) { (hi[ROLE_GROUP[e.role] ?? e.role] ||= []).push(e.hiShare); (km[ROLE_GROUP[e.role] ?? e.role] ||= []).push(e.distanceKm); }
  }
  const avgOf = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, mean(v)]));
  return { kinds: Object.fromEntries(Object.entries(kinds).map(([k, v]) => [k, v / total])), freshMe: mean(freshMe), freshBots: mean(freshBots), goalsEarly: mean(goalsEarly), goalsLate: mean(goalsLate), hi: avgOf(hi), km: avgOf(km) };
}
if (import.meta.url === `file://${process.argv[1]}` && process.argv[3] === 'saeson') {
  const r = measureSeason();
  console.log('Rundens mål pr. type:', Object.entries(r.kinds).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${(v * 100).toFixed(0)} %`).join(', '));
  console.log(`Startelleverens friskhed efter 10 runder: dit hold (roterer ikke her) ${r.freshMe.toFixed(1)} %, bots ${r.freshBots.toFixed(1)} %`);
  console.log(`Mål pr. kamp: runde 1–2 ${r.goalsEarly.toFixed(2)}, runde 9–10 ${r.goalsLate.toFixed(2)}`);
  console.log('Pr. rolle (hele kampe):', ROLE_ORDER.filter((k) => r.km[k] != null).map((k) => `${k} ${r.km[k].toFixed(1)} km / ${r.hi[k].toFixed(1)} % HI`).join(', '));
}

// v3.12.1 (QC: "efterprøv på dét, den rammer"): mål pr. kamp for hold 0 efter formation – og med en
// angriber trukket uden for feltet – mod hold 1 på 4-4-2. Langskudsbonussen må ikke belønne en
// angriber, der står uden for feltet (med fast +7: 4-4-1-1 1,78 og trukket ST 1,64 mod 4-4-2 1,36).
// Kør: node tools/measure-duels.mjs 400 formation
export function measureFormations(N) {
  const out = [];
  for (const [f, drag] of [['4-4-2'], ['4-2-3-1'], ['4-4-1-1'], ['3-5-2'], ['4-3-3'], ['4-4-2', true]]) {
    let gf = 0, ga = 0, ls = 0;
    for (let s = 1; s <= N; s++) {
      const L = createLeague(createRng(s)), [H, A] = [L.teams[0], L.teams[1]];
      for (const [t, form] of [[H, f], [A, '4-4-2']]) { t.tactics.baseFormation = form; t.tactics.customCoords = {}; t.tactics.conditionalRules = []; }
      if (drag) H.tactics.customCoords[9] = { x: 38, y: 32 };   // 4-4-2 plads 9 = ST
      const m = simulateMatch(H, A, createRng(s * 7 + 1));
      gf += m.homeGoals; ga += m.awayGoals;
      ls += m.goalsPool.filter((g) => g.teamName === H.name && g.kind === 'LONGSHOT').length;
    }
    out.push({ formation: f + (drag ? ' + ST trukket til y 32' : ''), for: gf / N, against: ga / N, longshots: ls / N });
  }
  return out;
}
if (import.meta.url === `file://${process.argv[1]}` && process.argv[3] === 'formation') {
  for (const r of measureFormations(ARG_N)) console.log(r.formation.padEnd(26), 'for', r.for.toFixed(2), 'imod', r.against.toFixed(2), 'langskud', r.longshots.toFixed(2));
}

// v3.13: udskiftninger over en sæson (10 runder med bogføring, så friskheden følger med). Pr. hold pr.
// kamp: skift i alt og efter årsag, minutfordeling, mål pr. kamp, startelleverens friskhed – og STA's
// betydning: friskhed i kampen ved 90' for starterne med lav (≤ 8) og høj (≥ 14) STA.
// Kør: node tools/measure-duels.mjs 30 skift. overrides = { subsLimit } til alle hold (test af grænsen).
export function measureSubs(N = ARG_N, rounds = 10, overrides = {}) {
  let games = 0, subs = 0, goals = 0;
  const why = { fatigue: 0, injury: 0, rule: 0 }, mins = { '1–45': 0, '46–60': 0, '61–75': 0, '76–90': 0 }, blocked = { n: 0 };
  const fresh = [];
  // v3.16.6 (M6): botternes træthedsskift før pausen, kampe hvor en bot skifter 3+ før pausen, og haltende uden indskiftning
  const bot = { fatigue: 0, early: 0, tripleEarly: 0, limping: 0, teamGames: 0 };
  for (let s = 1; s <= N; s++) {
    const rng = createRng(s * 15485863);
    const L = createLeague(rng);
    if (overrides.subsLimit != null) for (const t of L.teams) t.subsLimit = overrides.subsLimit;
    for (let r = 1; r <= rounds; r++) {
      const res = playPairs(L, fixedPairs(L, 1 + (r % 7)), rng);
      for (const m of res.matches) {
        games += 2; goals += m.homeGoals + m.awayGoals;
        const me = L.teams.find((t) => !t.isBot)?.name;
        for (const name of [m.homeName, m.awayName].filter((n) => n !== me)) {
          bot.teamGames++;
          const fat = m.events.filter((e) => e.type === 'SUB' && e.text.startsWith(`🔄 [${name}] #`) && / erstatter /.test(e.text));   // ikke "Skadesskift:"
          const early = fat.filter((e) => e.min < 45).length;
          bot.fatigue += fat.length; bot.early += early; if (early >= 3) bot.tripleEarly++;
          bot.limping += m.events.filter((e) => e.text?.startsWith(`🚑 [${name}] Ingen indskiftning`)).length;
        }
        for (const e of m.events) {
          if (e.type === 'SUB') {
            subs++;
            const k = /træt|erstatter/.test(e.text) && !/Skadesskift|haltende/.test(e.text) ? (/Hvis-Så/.test(e.text) ? 'rule' : 'fatigue') : /Hvis-Så/.test(e.text) ? 'rule' : 'injury';
            why[k]++;
            mins[e.min <= 45 ? '1–45' : e.min <= 60 ? '46–60' : e.min <= 75 ? '61–75' : '76–90']++;
          }
          if (e.label === 'Udskiftning ikke mulig') blocked.n++;
        }
      }
      commitRound(L, res, rng);
    }
    for (const t of L.teams) { const st = t.squad.filter((p) => t.tactics.lineupSlots.includes(p.id)); fresh.push(st.reduce((a, p) => a + p.freshness, 0) / st.length); }
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return { subsPerTeam: subs / games, why: Object.fromEntries(Object.entries(why).map(([k, v]) => [k, v / games])), mins: Object.fromEntries(Object.entries(mins).map(([k, v]) => [k, subs ? v / subs : 0])), goalsPerMatch: goals / (games / 2), startFresh: mean(fresh), blockedPerMyGame: blocked.n / (N * rounds),
    bot: { earlyShare: bot.fatigue ? bot.early / bot.fatigue : 0, tripleEarlyPerGame: bot.tripleEarly / bot.teamGames, limpingPerGame: bot.limping / bot.teamGames, fatiguePerGame: bot.fatigue / bot.teamGames } };
}
// STA's betydning i kampen: samme hold med STA sat lavt (6) eller højt (16) på alle markspillere, mod
// den samme modstander uden skift (grænse 0): mål for/imod i sidste kvarter (min ≥ 76) og i alt.
export function measureStamina(N = ARG_N, liveEnergy = true) {
  const out = {};
  for (const sta of [6, 16]) {
    let late = 0, lateAgainst = 0, gf = 0, ga = 0;
    for (let s = 1; s <= N; s++) {
      const L = createLeague(createRng(s)), [H, A] = [L.teams[0], L.teams[1]];
      for (const t of [H, A]) { t.subsLimit = 0; t.tactics.conditionalRules = []; }
      for (const p of H.squad) if (p.line !== 'GK') p.skills.stamina = sta;
      for (const p of A.squad) if (p.line !== 'GK') p.skills.stamina = 11;
      const m = simulateMatch(H, A, createRng(s * 31 + 7), liveEnergy ? {} : { liveEnergy: false });
      gf += m.homeGoals; ga += m.awayGoals;
      for (const e of m.events) if (['GOAL', 'HEADER_GOAL', 'VAR_GOAL'].includes(e.type) && e.min >= 76) { if (e.isHome) late++; else lateAgainst++; }
    }
    out[sta] = { lateNet: (late - lateAgainst) / N, net: (gf - ga) / N };
  }
  return out;
}
if (import.meta.url === `file://${process.argv[1]}` && process.argv[3] === 'skift') {
  const r = measureSubs();
  console.log(`Skift pr. hold pr. kamp ${r.subsPerTeam.toFixed(2)} (træthed ${r.why.fatigue.toFixed(2)}, skade ${r.why.injury.toFixed(2)}, Hvis-Så ${r.why.rule.toFixed(2)}) · minut: ${Object.entries(r.mins).map(([k, v]) => `${k} ${(v * 100).toFixed(0)} %`).join(', ')}`);
  console.log(`Mål pr. kamp ${r.goalsPerMatch.toFixed(2)} · startelleverens friskhed efter 10 runder ${r.startFresh.toFixed(1)} % · "kunne ikke skifte" pr. kamp for dit hold ${r.blockedPerMyGame.toFixed(2)}`);
  console.log(`Botter: træthedsskift pr. kamp ${r.bot.fatiguePerGame.toFixed(2)} · heraf før pausen ${(r.bot.earlyShare * 100).toFixed(1)} % · 3+ før pausen i ${(r.bot.tripleEarlyPerGame * 100).toFixed(2)} % af kampene · haltende uden indskiftning ${r.bot.limpingPerGame.toFixed(3)} pr. kamp`);
  const n = Math.max(400, ARG_N * 20), st = measureStamina(n), st0 = measureStamina(n, false);
  console.log(`STA 6 mod STA 16 (alle markspillere, ingen skift, ${n} kampe): netto i alt ${st[6].net.toFixed(2)} / ${st[16].net.toFixed(2)}, sidste kvarter ${st[6].lateNet.toFixed(2)} / ${st[16].lateNet.toFixed(2)} – uden friskhed i kampen (før v3.13): ${st0[6].net.toFixed(2)} / ${st0[16].net.toFixed(2)}, sidste kvarter ${st0[6].lateNet.toFixed(2)} / ${st0[16].lateNet.toFixed(2)}`);
}

// Udvisninger (v3.15): kort pr. kamp og hvad ti mand koster – mål for og imod pr. 90 min efter udvisningen, i kampe med
// præcis ét rødt kort og mindst 20 minutter tilbage. Tallene i match-rules.js (CARD_RULES) og balance.test.mjs.
export function measureCards(N = 2500) {
  let n = 0, reds = 0, second = 0, direct = 0, yellows = 0, ten = 0, own = 0, opp = 0;
  for (let s = 1; s <= N; s++) {
    const L = createLeague(createRng(s));
    const m = simulateMatch(L.teams[s % 8], L.teams[(s + 3) % 8], createRng(s * 31));
    n++; yellows += m.stats.hYellows + m.stats.aYellows;
    const rs = m.events.filter((e) => e.type === 'RED');
    for (const e of rs) { reds++; if (/Andet gule/.test(e.text)) second++; else direct++; }
    if (rs.length !== 1 || 90 - rs[0].min < 20) continue;
    const r = rs[0], left = 90 - r.min, g = m.events.filter((e) => /GOAL/.test(e.type) && e.type !== 'VAR_NO_GOAL' && e.min > r.min);
    const o = g.filter((e) => e.isHome === r.isHome).length;
    ten++; own += o / left * 90; opp += (g.length - o) / left * 90;
  }
  return { redsPerMatch: reds / n, secondYellow: second / n, direct: direct / n, yellowsPerMatch: yellows / n, tenMenMatches: ten, tenMenFor90: own / ten, tenMenAgainst90: opp / ten };
}

// Kampens spiller (v3.15): fra hvilket hold og hvilken rolle – Spilføreren: målmanden på det tabende hold vandt for tit.
export function measureMotm(N = 600) {
  let n = 0, loser = 0, gk = 0, scorer = 0;
  for (let s = 1; s <= N; s++) {
    const L = createLeague(createRng(s));
    const m = simulateMatch(L.teams[s % 8], L.teams[(s + 3) % 8], createRng(s * 31));
    const b = [...m.ratings.home, ...m.ratings.away].find((e) => e.isMotM);
    if (!b) continue;
    n++; if (b.role === 'GK') gk++; if (b.goals > 0) scorer++;
    if (m.homeGoals !== m.awayGoals && (b.isHome ? m.homeGoals < m.awayGoals : m.awayGoals < m.homeGoals)) loser++;
  }
  return { loserShare: loser / n, gkShare: gk / n, scorerShare: scorer / n };
}

// VAR som i virkeligheden (v3.15.1): skud, på mål, forbi, mål, VAR-tjek pr. slags og kendelser, offsideflag, straffe,
// røde kort, hjørnespark og målscorernes kæde – pr. kamp. Før v3.15.1 (VAR som chancetype, commit 28efc6d, N=1500):
// se balance.test.mjs. Kør: node tools/measure-duels.mjs 1500 var
export function measureVar(N = 1500) {
  const c = { games: 0, goals: 0, shots: 0, onTarget: 0, miss: 0, corners: 0, penalties: 0, reds: 0, varGoalOld: 0, goalChecks: 0, disallowed: 0, flags: 0, penChecks: 0, penOverturned: 0, penAwarded: 0, redChecks: 0, redDown: 0, redUp: 0, varChecksStat: 0, attGoals: 0, longshots: 0 };
  for (let s = 1; s <= N; s++) {
    const L = createLeague(createRng(s));
    const m = simulateMatch(L.teams[s % 8], L.teams[(s + 3) % 8], createRng(s * 31));
    const st = m.stats; c.games++;
    c.goals += m.homeGoals + m.awayGoals; c.shots += st.hShots + st.aShots; c.onTarget += st.hOnTarget + st.aOnTarget;
    c.corners += st.hCorners + st.aCorners; c.penalties += st.hPenalties + st.aPenalties; c.reds += st.hReds + st.aReds;
    c.varChecksStat += st.hVarChecks + st.aVarChecks;
    for (const e of m.events) {
      const v = e.var;
      if (e.type === 'MISS') c.miss++;
      if (e.type === 'VAR_GOAL') c.varGoalOld++;
      if (e.type === 'VAR_NO_GOAL') c.disallowed++;
      if (e.type === 'VAR_CHECK') c.goalChecks++;
      if (e.type === 'OFFSIDE_FLAG') c.flags++;
      if (e.type === 'VAR_PEN') { c.penChecks++; if (v?.verdict === 'OVERTURNED') c.penOverturned++; if (v?.verdict === 'AWARDED') c.penAwarded++; }
      if (e.type === 'VAR_RED') { c.redChecks++; if (v?.verdict === 'DOWNGRADED') c.redDown++; if (v?.verdict === 'UPGRADED') c.redUp++; }
    }
    const role = new Map([...m.ratings.home, ...m.ratings.away].map((e) => [`#${e.shirtNumber} ${e.shortName}|${e.teamName}`, e.role]));
    for (const g of m.goalsPool) {
      let r = role.get(`${g.scorer}|${g.teamName}`) ?? 'ST';
      if (r.startsWith('SUB (')) r = { DEF: 'CB', MID: 'CM', ATT: 'ST', GK: 'GK' }[r.slice(5, -1)] ?? 'ST';
      if (lineOfRole(r) === 'ATT') c.attGoals++;
      if (g.kind === 'LONGSHOT') c.longshots++;
    }
  }
  const per = Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'games').map(([k, v]) => [k, v / c.games]));
  return { ...per, games: c.games, onTargetShare: c.onTarget / c.shots, attShare: c.attGoals / c.goals, longshotShare: c.longshots / c.goals, penOverturnedShare: c.penOverturned / Math.max(1, c.penChecks) };
}
if (import.meta.url === `file://${process.argv[1]}` && process.argv[3] === 'var') {
  const r = measureVar(ARG_N), f = (x) => x.toFixed(3);
  console.log(Object.entries(r).map(([k, v]) => `${k} ${Number.isInteger(v) ? v : f(v)}`).join('\n'));
}

// Skud og afslutninger (v3.17.0, balance-gennemgangen): skud, andel på mål, konvertering (mål pr. skud på mål), forbi,
// redninger, hjørner og xG mod mål pr. kamp – plus målmandens effekt (hjemmeholdets keeper sat til 6 og til 16, samme
// kampe), kampens størrelse (JSON-bytes, det gemte resultat vokser med hændelserne) og trin i Højdepunkter.
export function measureShots(N = 400) {
  const c = { games: 0, goals: 0, shots: 0, onTarget: 0, miss: 0, saves: 0, corners: 0, xg: 0, bytes: 0, highlightSteps: 0 };
  for (let s = 1; s <= N; s++) {
    const L = createLeague(createRng(s));
    const m = simulateMatch(L.teams[s % 8], L.teams[(s + 3) % 8], createRng(s * 31));
    const st = m.stats; c.games++;
    c.goals += m.homeGoals + m.awayGoals; c.shots += st.hShots + st.aShots; c.onTarget += st.hOnTarget + st.aOnTarget;
    c.corners += st.hCorners + st.aCorners; c.xg += st.hXg + st.aXg;
    c.miss += m.events.filter((e) => e.type === 'MISS').length; c.saves += m.events.filter((e) => e.type === 'SAVE').length;
    c.bytes += JSON.stringify(m).length;
    c.highlightSteps += replaySteps(m.trace, true, m.events).length;   // Højdepunkter: afslutninger + skud-trin
  }
  const per = Object.fromEntries(Object.entries(c).filter(([k]) => k !== 'games').map(([k, v]) => [k, v / c.games]));
  return { ...per, games: c.games, onTargetShare: c.onTarget / c.shots, conversion: c.goals / c.onTarget, xgPerGoal: c.xg / c.goals };
}
export function measureKeeper(N = 400, low = 6, high = 16) {
  const against = (gk) => {
    let ga = 0;
    for (let s = 1; s <= N; s++) {
      const L = createLeague(createRng(s));
      const H = L.teams[s % 8], A = L.teams[(s + 3) % 8];
      const keeper = H.squad.find((p) => p.id === H.tactics.lineupSlots[0]);
      keeper.skills.goalkeeping = gk;
      ga += simulateMatch(H, A, createRng(s * 31)).awayGoals;
    }
    return ga / N;
  };
  const lo = against(low), hi = against(high);
  return { low: lo, high: hi, diff: lo - hi };
}
// Opbygningen og chancen (v3.17.0): pr. tick holdet med bolden (trace.frames: run = opbygningen vundet, lost/offside =
// stoppet, ellers ingen duel) og om det skød i samme tick (skud-tallet i hændelsernes stats-kopi, tick for tick).
// Plus: hold med højst 1 vundet af mindst 6 opbygninger – hvor ofte vinder de alligevel?
export function measureBuild(N = 400) {
  // pr. udfald: [tick, med skud, xG i alt, med stor chance (xG-spring ≥ 0,13 = en hovedchance)]
  const t = { run: [0, 0, 0, 0], stop: [0, 0, 0, 0], none: [0, 0, 0, 0] };
  let weak = 0, weakWins = 0;
  const pairs = [];
  for (let s = 1; s <= N; s++) {
    const L = createLeague(createRng(s));
    const m = simulateMatch(L.teams[s % 8], L.teams[(s + 3) % 8], createRng(s * 31));
    const at = new Map();   // tick → [hShots, aShots, hXg, aXg] efter tick'et (hændelsernes stats-kopi)
    for (const e of m.events) if (e.stats && e.min % 3 === 0) at.set(e.min / 3, [e.stats.hShots, e.stats.aShots, e.stats.hXg, e.stats.aXg]);
    let prev = [0, 0, 0, 0];
    const duel = { h: [0, 0], a: [0, 0] };
    for (let k = 1; k <= 30; k++) {
      const cur = at.get(k) ?? prev, f = m.trace.frames.find((q) => q.t === k);
      if (f?.poss) {
        // Kun holdet med bolden (pres-vinderens egne afslutninger i samme tick tælles ikke her – QC)
        const i = f.poss === 'h' ? 0 : 1, shot = cur[i] > prev[i], xg = cur[2 + i] - prev[2 + i];
        const kind = f.run ? 'run' : f.lost || f.offside ? 'stop' : 'none';
        t[kind][0]++; if (shot) t[kind][1]++; t[kind][2] += Math.max(0, xg); if (xg >= 0.13) t[kind][3]++;
        if (kind !== 'none') { duel[f.poss][1]++; if (kind === 'run') duel[f.poss][0]++; }
      }
      prev = cur;
    }
    for (const [side, gf, ga] of [['h', m.homeGoals, m.awayGoals], ['a', m.awayGoals, m.homeGoals]]) {
      const [won, all] = duel[side];
      pairs.push([won - (duel[side === 'h' ? 'a' : 'h'][0]), gf - ga]);
      if (all >= 6 && won <= 1) { weak++; if (gf > ga) weakWins++; }
    }
  }
  const p = (k, j = 1) => t[k][j] / Math.max(1, t[k][0]);
  const mx = pairs.reduce((a, q) => a + q[0], 0) / pairs.length, my = pairs.reduce((a, q) => a + q[1], 0) / pairs.length;
  const cov = pairs.reduce((a, q) => a + (q[0] - mx) * (q[1] - my), 0), vx = pairs.reduce((a, q) => a + (q[0] - mx) ** 2, 0), vy = pairs.reduce((a, q) => a + (q[1] - my) ** 2, 0);
  return { pRun: p('run'), pStop: p('stop'), pNone: p('none'), lift: p('run') / p('none'), xgRun: p('run', 2), xgNone: p('none', 2), xgLift: p('run', 2) / p('none', 2),
    bigRun: p('run', 3), bigNone: p('none', 3), bigLift: p('run', 3) / p('none', 3), corr: cov / Math.sqrt(vx * vy), weak, weakWinShare: weak ? weakWins / weak : 0 };
}
// FASE-linjer i kampe uden dit hold (bot mod bot) pr. kamp
export function measureFaseLines(N = 400) {
  let lines = 0, games = 0;
  for (let s = 1; s <= N; s++) {
    const L = createLeague(createRng(s));
    const H = L.teams[s % 8], A = L.teams[(s + 3) % 8];
    if (!H.isBot || !A.isBot) continue;
    const m = simulateMatch(H, A, createRng(s * 31));
    games++; lines += m.events.filter((e) => /^\S+ \[FASE /.test(e.text ?? '')).length;
  }
  return { perMatch: lines / Math.max(1, games), games };
}
if (import.meta.url === `file://${process.argv[1]}` && process.argv[3] === 'skud') {
  const N = ARG_N;
  console.log(JSON.stringify({ shots: measureShots(N), keeper: measureKeeper(N), fase: measureFaseLines(N) }, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v), 1));
}
if (import.meta.url === `file://${process.argv[1]}` && process.argv[3] === 'opbygning') {
  console.log(JSON.stringify(measureBuild(ARG_N), (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v), 1));
}
