// Frispark begået og mål pr. kamp (v3.16.6 M5: frisparket i samme tick som kortet er den forseelse – talt én gang).
// Samme seeds som tools/fingerprint.mjs. Kør: node tools/measure-fouls.mjs [antal] [rod]  (rod = en anden checkout)
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
export async function measureFouls(N = 1000, root = resolve(import.meta.dirname, '..')) {
  const imp = (p) => import(pathToFileURL(resolve(root, p)).href);
  const { createRng } = await imp('public/engine/rng.js');
  const { createLeague } = await imp('public/engine/generator.js');
  const { simulateMatch } = await imp('public/engine/match.js');
  let fouls = 0, goals = 0;
  for (let s = 1; s <= N; s++) {
    const L = createLeague(createRng(s * 97)), me = L.teams.find((t) => !t.isBot), opp = L.teams[(s % 7) + 1];
    const m = s % 2 ? simulateMatch(me, opp, createRng(s * 131)) : simulateMatch(opp, me, createRng(s * 131));
    fouls += m.stats.hFouls + m.stats.aFouls; goals += m.homeGoals + m.awayGoals;
  }
  return { foulsPerMatch: fouls / N, goalsPerMatch: goals / N };
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await measureFouls(Number(process.argv[2] || 1000), process.argv[3] ? resolve(process.argv[3]) : undefined);
  console.log(`frispark begået pr. kamp ${r.foulsPerMatch.toFixed(2)} · mål pr. kamp ${r.goalsPerMatch.toFixed(3)}`);
}
