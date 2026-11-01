// Kantpladser (v3.24.6, brugeren: "i en 3-5-2 opstilling har jeg 2 midtbane kanter der får straf for at være uden for position"):
// dit hold skifter til en formation med "Skift formation" (samme 11, fordelt efter position) og spiller mod hver bot, begge baner.
// Udskriver mål for/imod, netto og hvor mange af de 11 der står uden for position – kør på denne checkout og på en worktree af
// forrige version: node tools/measure-wide.mjs [N=150] [rod]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function measureWide(N = 150, root = resolve(import.meta.dirname, '..'), formations = ['3-5-2', '5-3-2', '4-4-2']) {
  const imp = (p) => import(pathToFileURL(resolve(root, p)).href);
  const { createRng } = await imp('public/engine/rng.js');
  const { createLeague } = await imp('public/engine/generator.js');
  const { simulateMatch } = await imp('public/engine/match.js');
  const A = await imp('public/state/actions.js');
  const out = {};
  for (const f of formations) {
    let gf = 0, ga = 0, games = 0, oop = 0;
    for (let s = 1; s <= N; s++) {
      const L = createLeague(createRng(s * 53)), me = L.teams.find((t) => !t.isBot);
      A.setFormation(me, f); oop += A.outOfPositionCount(me);
      for (const opp of L.teams.filter((t) => t.isBot)) for (const home of [true, false]) {
        const m = home ? simulateMatch(me, opp, createRng(s * 7919 + opp.id.length * 31 + (home ? 1 : 2))) : simulateMatch(opp, me, createRng(s * 7919 + opp.id.length * 31 + (home ? 1 : 2)));
        gf += home ? m.homeGoals : m.awayGoals; ga += home ? m.awayGoals : m.homeGoals; games++;
      }
    }
    const r = (v) => Math.round(v * 1000) / 1000;
    out[f] = { for: r(gf / games), against: r(ga / games), net: r((gf - ga) / games), outOfPos: r(oop / N), games };
  }
  return out;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await measureWide(Number(process.argv[2] || 150), process.argv[3] ? resolve(process.argv[3]) : undefined);
  for (const [f, v] of Object.entries(r)) console.log(`${f.padEnd(6)} for ${v.for} · imod ${v.against} · netto ${v.net} · uden for position ${v.outOfPos} af 11 · ${v.games} kampe`);
}
