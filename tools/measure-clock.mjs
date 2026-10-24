// Målinger af uret (v3.16.4, CLAUDE.md "Et tal uden kode er en påstand"): tillægstid pr. halvleg, andel minutter delelige med 3
// og faldende minutter i en halvleg. Kør: node tools/measure-clock.mjs [antal kampe]
import { createRng } from '../public/engine/rng.js';
import { createLeague } from '../public/engine/generator.js';
import { simulateMatch } from '../public/engine/match.js';

export function measureClock(N = 300) {
  const S = [[], []], V = [0, 0];
  let div3 = 0, n = 0, falling = 0;
  const perMin = Array(91).fill(0);
  for (let s = 1; s <= N; s++) {
    const L = createLeague(createRng(s));
    const m = simulateMatch(L.teams[s % 8], L.teams[(s + 3) % 8], createRng(s * 31));
    m.stoppage.forEach((x, i) => { S[i].push(x.S); V[i] += x.var; });
    let prev = [0, 0];
    for (const e of m.events) {
      if (e.type === 'HALFTIME') { prev = [0, 0]; continue; }
      const c = [e.clock.m, e.clock.plus ?? 0];
      if (c[0] < prev[0] || (c[0] === prev[0] && c[1] < prev[1])) falling++;
      prev = c;
      if (!e.clock.plus && e.type !== 'TACTIC_NOTE') { n++; perMin[e.clock.m]++; if (e.clock.m % 3 === 0) div3++; }
    }
  }
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  // Jævnhed: hændelser pr. minut 1–90 – andel med hver rest mod 3, og de tyndeste/tykkeste minutter (uden 45 og 90, hvor halvlegen
  // slutter, og 1/46, hvor den starter)
  const mods = [0, 1, 2].map((r) => perMin.reduce((a, c, i) => a + (i >= 1 && i % 3 === r ? c : 0), 0) / n);
  const inner = perMin.map((c, i) => [i, c]).filter(([i]) => i >= 2 && i <= 89 && i !== 45 && i !== 46).map(([, c]) => c);
  return { mods, thin: Math.min(...inner), thick: Math.max(...inner), perMin, stoppage: [avg(S[0]), avg(S[1])], min: Math.min(...S.flat()), max: Math.max(...S.flat()), varPerMatch: [V[0] / N, V[1] / N], div3: div3 / n, falling };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = measureClock(Number(process.argv[2] || 300));
  console.log(`Tillægstid: 1. halvleg ${r.stoppage[0].toFixed(2)}, 2. halvleg ${r.stoppage[1].toFixed(2)} (min ${r.min}, max ${r.max}); VAR-minutter pr. kamp ${r.varPerMatch.map((x) => x.toFixed(2)).join(' / ')}`);
  console.log(`Minutter delelige med 3: ${(r.div3 * 100).toFixed(0)} % (før uret: 100 %). Faldende minutter i en halvleg: ${r.falling}.`);
  console.log(`Rest mod 3 (0/1/2): ${r.mods.map((x) => (x * 100).toFixed(0) + ' %').join(' / ')}; tyndeste/tykkeste minut: ${r.thin}/${r.thick} hændelser.`);
}
