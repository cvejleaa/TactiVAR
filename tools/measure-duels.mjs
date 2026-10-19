// Måler hvor ofte fase 1 (opbygning) slår fase 2 (pres) og hvor meget mod-kunnen stiger.
// Kør: node tools/measure-duels.mjs [antal ligaer]   (docs/spec.md §5, §7)
import { createRng } from '../public/engine/rng.js';
import { createLeague } from '../public/engine/generator.js';
import { playRound, commitRound } from '../public/engine/season.js';
import { COUNTER_KEYS } from '../public/engine/counter.js';

const N = Number(process.argv[2] || 20);
let win = 0, fail = 0, ownWin = 0, ownFail = 0;
const xpAfter = []; // gennemsnitlig mod-kunnen for eget hold efter runde 1..3
for (let s = 1; s <= N; s++) {
  const rng = createRng(s * 7919);
  const L = createLeague(rng);
  const me = L.teams.find((t) => !t.isBot);
  const avg = () => me.squad.reduce((a, p) => a + COUNTER_KEYS.reduce((b, k) => b + p.counterTactics[k], 0) / 3, 0) / me.squad.length;
  const series = [avg()];
  for (let r = 0; r < 3; r++) {
    const res = playRound(L, 1, rng);
    for (const m of res.matches) for (const e of m.events) {
      const mine = (e.isHome ? m.homeId : m.awayId) === me.id;
      if (e.label === 'Fase 1 virker') { win++; if (mine) ownWin++; }
      if (e.label === 'Fase 2 pres virker' || e.label === 'Offside-fælde virker') { fail++; if (mine) ownFail++; }
    }
    commitRound(L, res, rng);
    series.push(avg());
  }
  xpAfter.push(series);
}
const pct = (a, b) => `${((a / (a + b)) * 100).toFixed(1)} %`;
console.log(`Fase 1 vinder ${pct(win, fail)} af duellerne (${win + fail} dueller i ${N} ligaer × 3 runder).`);
console.log(`Dit hold: ${ownWin} vundne opbygninger, ${ownFail} vundne pres/offside.`);
const mean = (i) => (xpAfter.reduce((a, s) => a + s[i], 0) / N).toFixed(1);
console.log(`Gns. mod-kunnen (eget hold, alle 18): start ${mean(0)} → runde 1 ${mean(1)} → 2 ${mean(2)} → 3 ${mean(3)}`);
