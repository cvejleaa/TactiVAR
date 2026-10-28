// Målmandens karakter mod hans arbejde (brugeren 2026-10-28: "mærkeligt, at modstanders målmand får 3 stjerner i denne
// kamp, hvor jeg har 36 afslutninger, heraf 11 på mål og det med 9 redninger til følge"). Hele sæsoner i N ligaer; alle
// startende målmænd grupperet efter redninger (🧤, inkl. lette): snitkarakter, stjerner, og hvor ofte en målmand bliver
// kampens spiller (v3.15: en målmand på det tabende hold må ikke blive det runde efter runde).
// Kør: node tools/measure-gk.mjs [ligaer=12]
import { createRng } from '../public/engine/rng.js';
import { createLeague } from '../public/engine/generator.js';
import { playRound, commitRound } from '../public/engine/season.js';

const GROUPS = [['0-2', 0, 2], ['3-5', 3, 5], ['6-8', 6, 8], ['9+', 9, 99]];
export function measureGk(leagues = 12) {
  const rows = [];
  for (let s = 1; s <= leagues; s++) {
    const L = createLeague(createRng(s)), rng = createRng(s * 3);
    for (let r = 0; r < 14; r++) {
      const res = playRound(L, rng);
      for (const m of res.matches) for (const side of ['home', 'away']) {
        const gk = m.ratings[side].find((x) => x.slot === 0);
        if (!gk) continue;
        const conceded = side === 'home' ? m.awayGoals : m.homeGoals, scored = side === 'home' ? m.homeGoals : m.awayGoals;
        rows.push({ saves: gk.saves ?? 0, rating: gk.rating, stars: gk.stars, conceded, lost: scored < conceded, motm: !!gk.isMotM });
      }
      commitRound(L, res, rng);
    }
  }
  const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
  const groups = Object.fromEntries(GROUPS.map(([k, lo, hi]) => {
    const a = rows.filter((x) => x.saves >= lo && x.saves <= hi);
    return [k, { n: a.length, rating: mean(a.map((x) => x.rating)), top: a.filter((x) => x.stars >= 4).length / Math.max(1, a.length), three: a.filter((x) => x.stars <= 3).length / Math.max(1, a.length) }];
  }));
  // Brugerens kamp: 9+ redninger, højst 2 mål imod, tabte
  const busyLost = rows.filter((x) => x.saves >= 9 && x.conceded <= 2 && x.lost);
  return { groups, busyLost: { n: busyLost.length, rating: mean(busyLost.map((x) => x.rating)), top: busyLost.filter((x) => x.stars >= 4).length / Math.max(1, busyLost.length) },
    motmGk: rows.filter((x) => x.motm).length / Math.max(1, rows.length / 2), motmGkLost: rows.filter((x) => x.motm && x.lost).length / Math.max(1, rows.length / 2) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = measureGk(Number(process.argv[2] || 12)), f = (v) => Math.round(v * 100) / 100;
  for (const [k, g] of Object.entries(r.groups)) console.log(`${k.padEnd(4)} redninger: n ${g.n} · snit ${f(g.rating)} · 4–5★ ${f(g.top * 100)} % · ≤3★ ${f(g.three * 100)} %`);
  console.log(`9+ redninger, ≤2 imod, tabt: n ${r.busyLost.n} · snit ${f(r.busyLost.rating)} · 4–5★ ${f(r.busyLost.top * 100)} %`);
  console.log(`målmand kampens spiller: ${f(r.motmGk * 100)} % af kampene (heraf på tabende hold ${f(r.motmGkLost * 100)} %)`);
}
