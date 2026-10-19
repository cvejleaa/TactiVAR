// Måler fase-duellen og mod-kunnen. Kør: node tools/measure-duels.mjs [antal ligaer]
// Udskriver (docs/spec.md §5, §7):
//  1. hvor ofte opbygning (fase 1) slår pres (fase 2) med ligaens egne taktikker,
//  2. samme med neutrale stile (balanceret mod mellemblok) og med en rigtig mod-stil,
//  3. hvordan dit holds mod-kunnen udvikler sig over 3 runder.
import { createRng } from '../public/engine/rng.js';
import { createLeague } from '../public/engine/generator.js';
import { playRound, commitRound } from '../public/engine/season.js';
import { COUNTER_KEYS } from '../public/engine/counter.js';

const N = Number(process.argv[2] || 20);
const isWin = (e) => e.label === 'Fase 1 virker';
const isFail = (e) => e.label === 'Fase 2 pres virker' || e.label === 'Offside-fælde virker';

// setup(team, i) kan sætte faser før hver runde; returnerer andel fase 1-sejre (alle hold).
export function measure(setup = null, rounds = 3) {
  let win = 0, fail = 0, ownWin = 0, ownFail = 0, goals = 0, games = 0;
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
      for (const m of res.matches) { goals += m.homeGoals + m.awayGoals; games++; }
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
  return { rate: win / (win + fail), n: win + fail, ownWin, ownFail, series, goalsPerMatch: goals / games };
}

const phases = (pass, focus, height) => (t) => {
  Object.assign(t.tactics.phases.phase1_buildUp, { passingStyle: pass, attackFocus: focus });
  Object.assign(t.tactics.phases.phase2_defending, { pressingHeight: height, offsideTrap: 'OFF' });
};
if (import.meta.url === `file://${process.argv[1]}`) {
  const pct = (x) => `${(x * 100).toFixed(1)} %`;
  const liga = measure();
  console.log(`Ligaens egne taktikker: fase 1 vinder ${pct(liga.rate)} (${liga.n} dueller, ${N} ligaer × 3 runder); ${liga.goalsPerMatch.toFixed(2)} mål pr. kamp.`);
  console.log(`Neutralt (balanceret/lave cutbacks mod mellemblok): fase 1 vinder ${pct(measure(phases('BALANCED', 'LOW_CUTBACKS', 'MID_BLOCK')).rate)}.`);
  // Alle spiller korte pasninger centralt mod højt gegenpress: presset har den rigtige mod-stil.
  console.log(`Rigtig mod-stil til presset (korte pasninger mod gegenpres): pres vinder ${pct(1 - measure(phases('SHORT', 'LOW_CUTBACKS', 'HIGH_GEGENPRESS')).rate)}.`);
  // Direkte lange bolde mod gegenpres: opbygningen har den rigtige mod-stil.
  console.log(`Rigtig mod-stil til opbygningen (lange bolde mod gegenpres): opbygning vinder ${pct(measure(phases('DIRECT_LONG', 'LOW_CUTBACKS', 'HIGH_GEGENPRESS')).rate)}.`);
  const mean = (i) => (liga.series.reduce((a, s) => a + s[i], 0) / N).toFixed(1);
  console.log(`Startelleverens bedste mod-kunnen: start ${mean(0)} → runde 1 ${mean(1)} → 2 ${mean(2)} → 3 ${mean(3)}`);
}
