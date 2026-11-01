// Kantpladser (v3.24.6, brugeren: "i en 3-5-2 opstilling har jeg 2 midtbane kanter der får straf for at være uden for position"):
// dit hold skifter til en formation med "Skift formation" (samme 11, fordelt efter position) og spiller mod hver bot, begge baner.
// Udskriver mål for/imod, netto og hvor mange af de 11 der står uden for position – kør på denne checkout og på en worktree af
// forrige version: node tools/measure-wide.mjs [N=150] [rod]
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// v3.25.0 (nr. 38, "flere midtbanefolk skal give mere bold"): også dit holds besiddelse og andelen af kampe med ≥ 80 % bold.
export async function measureWide(N = 150, root = resolve(import.meta.dirname, '..'), formations = null) {
  const imp = (p) => import(pathToFileURL(resolve(root, p)).href);
  const { createRng } = await imp('public/engine/rng.js');
  const { createLeague } = await imp('public/engine/generator.js');
  const { simulateMatch } = await imp('public/engine/match.js');
  const A = await imp('public/state/actions.js');
  const { FORMATION_NAMES } = await imp('public/engine/formations.js');
  const out = {};
  for (const f of formations ?? FORMATION_NAMES) {
    let gf = 0, ga = 0, games = 0, oop = 0, poss = 0, dom = 0;
    for (let s = 1; s <= N; s++) {
      const L = createLeague(createRng(s * 53)), me = L.teams.find((t) => !t.isBot);
      A.setFormation(me, f); oop += A.outOfPositionCount(me);
      for (const opp of L.teams.filter((t) => t.isBot)) for (const home of [true, false]) {
        const m = home ? simulateMatch(me, opp, createRng(s * 7919 + opp.id.length * 31 + (home ? 1 : 2))) : simulateMatch(opp, me, createRng(s * 7919 + opp.id.length * 31 + (home ? 1 : 2)));
        gf += home ? m.homeGoals : m.awayGoals; ga += home ? m.awayGoals : m.homeGoals; games++;
        const p = (home ? m.stats.hPoss : m.stats.aPoss) / (m.stats.hPoss + m.stats.aPoss); poss += p; if (p >= 0.8 || p <= 0.2) dom++;
      }
    }
    const r = (v) => Math.round(v * 1000) / 1000;
    out[f] = { for: r(gf / games), against: r(ga / games), net: r((gf - ga) / games), poss: r(poss / games), extreme: r(dom / games), outOfPos: r(oop / N), games };
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await measureWide(Number(process.argv[2] || 150), process.argv[3] ? resolve(process.argv[3]) : undefined);
  for (const [f, v] of Object.entries(r)) console.log(`${f.padEnd(6)} for ${v.for} · imod ${v.against} · netto ${v.net} · bold ${Math.round(v.poss * 1000) / 10} % · ≥80 % i ${Math.round(v.extreme * 1000) / 10} % · uden for position ${v.outOfPos} af 11 · ${v.games} kampe`);
}
