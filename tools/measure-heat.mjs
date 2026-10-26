// Heat map (v3.20.2): hvor mange felter tænder en midtbanespillers kort – før (6 × 9, kun billederne) og nu (12 × 18, vejen imellem,
// udglattet, tegnet over HEAT_MIN)? node tools/measure-heat.mjs [N=20] [rod=denne checkout]
// Før-tallet regnes her med den gamle metode (tracePoints → 6 × 9, tændt = > 0), så det kan regnes på samme kampe.
// v3.20.2 (20 kampe): før 7 af 54 felter (13 % af banen), nu 34 af 216 (16 %) – kortet er finere og sammenhængende, men dækker
// næsten det samme: motoren holder spilleren nær sin taktiske plads i billederne (km-tallet kommer fra rollen, ratings.js).
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function measureHeat(N = 20, root = resolve(import.meta.dirname, '..')) {
  const imp = (p) => import(pathToFileURL(resolve(root, p)).href);
  const { createRng } = await imp('public/engine/rng.js');
  const { createLeague } = await imp('public/engine/generator.js');
  const { simulateMatch } = await imp('public/engine/match.js');
  const H = await imp('public/engine/heatmap.js');
  const HEAT_MIN = 0.04;   // public/ui/matchcenter.js
  const old = (trace, id) => {
    const g = Array.from({ length: 9 }, () => Array(6).fill(0));
    for (const [, x, y] of H.tracePoints(trace, 'h', id)) g[Math.min(8, Math.floor(y / (100 / 9)))][Math.min(5, Math.floor(x / (100 / 6)))]++;
    return g.flat().filter((v) => v > 0).length;
  };
  const before = [], after = [], share = [], oldShare = [];
  for (let s = 1; s <= N; s++) {
    const rng = createRng(s * 4243), L = createLeague(rng), me = L.teams[0];
    const id = me.tactics.lineupSlots[6];   // 4-4-2: den ene CM
    const m = simulateMatch(me, L.teams[1], rng);
    if (!m.trace.frames.some((f) => f.h.some((q) => q[0] === id))) continue;
    before.push(old(m.trace, id)); oldShare.push(before.at(-1) / 54);
    const g = H.heatGrid(m.trace, 'h', id), lit = g.flat().filter((v) => v > HEAT_MIN).length;
    after.push(lit); share.push(lit / (H.COLS * H.ROWS));
  }
  const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
  return { games: before.length, beforeMedian: med(before), afterMedian: med(after), beforeShareMedian: med(oldShare), afterShareMedian: med(share), beforeCells: 54, afterCells: H.COLS * H.ROWS };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await measureHeat(Number(process.argv[2] || 20), process.argv[3] ? resolve(process.argv[3]) : undefined);
  console.log(JSON.stringify(r, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
}
