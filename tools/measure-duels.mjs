// Måler fase-duellen og mod-kunnen. Kør: node tools/measure-duels.mjs [antal ligaer]
// Før v3.6 (genskab: git checkout 8b5253e -- public/engine && node tools/measure-duels.mjs 20):
// fase 1 vandt 96,7–96,8 %, 1,76 mål pr. kamp, startelleverens bedste mod-kunnen 42,5 → 67,5 på 3 runder.
// Udskriver (docs/spec.md §5, §7):
//  1. hvor ofte opbygning (fase 1) slår pres (fase 2) med ligaens egne taktikker,
//  2. samme med neutrale stile (balanceret mod mellemblok) og med en rigtig mod-stil,
//  3. hvordan dit holds mod-kunnen udvikler sig over 3 runder.
import { createRng } from '../public/engine/rng.js';
import { createLeague } from '../public/engine/generator.js';
import { playRound, commitRound } from '../public/engine/season.js';
import { COUNTER_KEYS } from '../public/engine/counter.js';
import { simulateMatch } from '../public/engine/match.js';

const ARG_N = Number(process.argv[2] || 20);
const ROLE_GROUP = { CDM: 'CM', LB: 'FB', RB: 'FB', LWB: 'WB/kant', RWB: 'WB/kant', LM: 'WB/kant', RM: 'WB/kant', LW: 'WB/kant', RW: 'WB/kant', CAM: 'CAM/CF', CF: 'CAM/CF' };
const ROLE_ORDER = ['CM', 'WB/kant', 'FB', 'CAM/CF', 'ST', 'CB', 'GK'];
const isWin = (e) => e.label === 'Fase 1 virker';
const isFail = (e) => e.label === 'Fase 2 pres virker' || e.label === 'Offside-fælde virker';

// setup(team, i) kan sætte faser før hver runde; returnerer andel fase 1-sejre (alle hold).
export function measure(setup = null, rounds = 3, N = ARG_N) {
  let win = 0, fail = 0, ownWin = 0, ownFail = 0, goals = 0, games = 0, headers = 0;
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
      const res = playRound(L, 1, rng);
      for (const m of res.matches) { goals += m.homeGoals + m.awayGoals; games++; headers += m.events.filter((e) => e.type === 'HEADER_GOAL').length; }
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
  return { rate: win / (win + fail), n: win + fail, ownWin, ownFail, series, goalsPerMatch: goals / games, headersPerMatch: headers / games };
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
if (import.meta.url === `file://${process.argv[1]}` && !['saeson', 'loeb'].includes(process.argv[3])) {
  const pct = (x) => `${(x * 100).toFixed(1)} %`;
  const liga = measure();
  console.log(`Ligaens egne taktikker: fase 1 vinder ${pct(liga.rate)} (${liga.n} dueller, ${ARG_N} ligaer × 3 runder); ${liga.goalsPerMatch.toFixed(2)} mål pr. kamp, heraf ${liga.headersPerMatch.toFixed(2)} hovedstød.`);
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
      const res = playRound(L, 1 + (r % 7), rng);
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
    const res = playRound(L, 1, rng);
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
