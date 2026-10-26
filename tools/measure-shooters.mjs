// Hvem afslutter (v3.18.0, Spilfører v3.17.0: "N. Jakobsen 13 afslutninger" – 5-4-1's eneste angriber fik alt; midtstoppere
// afsluttede cutbacks). Afslutningerne er sporets øjeblikke med skytte (åbent spil og kontra – dødbolde har intet billede).
// - topShare: den mest skydende spillers andel af sit holds afslutninger i kampen (snit over hold-kampe med ≥ 6 afslutninger)
// - maxShots: flest afslutninger af én spiller i én kamp; over8: andel hold-kampe, hvor én spiller har > 8
// - st541: 5-4-1-holdets ST's andel af holdets afslutninger (holdet tvunget i 5-4-1)
// - cbCutback: andel af cutback-afslutningerne (øjeblikket efter "Mod baglinjen"/"… tilbage til …") taget af en CB
// Kør: node tools/measure-shooters.mjs [antal]
import { createRng } from '../public/engine/rng.js';
import { createLeague } from '../public/engine/generator.js';
import { simulateMatch } from '../public/engine/match.js';

const CUT = (e) => e && (e.label === 'Mod baglinjen' || /lægger den (lavt )?(tilbage|tværs) til/.test(e.text ?? ''));
export function measureShooters(N = 400) {
  const out = { teamGames: 0, topShareSum: 0, maxShots: 0, over8: 0, st541: [0, 0], cutbacks: 0, cbCutback: 0 };
  for (let s = 1; s <= N; s++) {
    const L = createLeague(createRng(s));
    const H = L.teams[s % 8], A = L.teams[(s + 3) % 8];
    const force = s % 2 === 0;   // hver anden kamp: hjemmeholdet i 5-4-1
    if (force) { H.tactics.baseFormation = '5-4-1'; H.tactics.customCoords = {}; }
    const m = simulateMatch(H, A, createRng(s * 31));
    const role = new Map([...m.ratings.home, ...m.ratings.away].map((e) => [e.playerId, e.role]));
    for (const side of ['h', 'a']) {
      const by = new Map();
      for (const mo of m.trace.moments) if (mo.side === side && mo.shooter != null) by.set(mo.shooter, (by.get(mo.shooter) ?? 0) + 1);
      const tot = [...by.values()].reduce((a, b) => a + b, 0), top = Math.max(0, ...by.values());
      out.maxShots = Math.max(out.maxShots, top);
      if (top > 8) out.over8++;
      if (tot >= 6) { out.teamGames++; out.topShareSum += top / tot; }
      if (force && side === 'h') for (const [id, n] of by) { out.st541[1] += n; if (role.get(id) === 'ST') out.st541[0] += n; }
    }
    m.trace.moments.forEach((mo) => {
      const before = m.events[mo.ev - 1], at = m.events[mo.ev];
      if (!(CUT(before) || CUT(at)) || mo.shooter == null) return;
      out.cutbacks++; if (role.get(mo.shooter) === 'CB') out.cbCutback++;
    });
  }
  return { topShare: out.topShareSum / Math.max(1, out.teamGames), maxShots: out.maxShots, over8Share: out.over8 / (2 * N), st541: out.st541[0] / Math.max(1, out.st541[1]), cutbacks: out.cutbacks, cbCutback: out.cbCutback / Math.max(1, out.cutbacks) };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = measureShooters(Number(process.argv[2] || 400));
  console.log(JSON.stringify(r, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
}
