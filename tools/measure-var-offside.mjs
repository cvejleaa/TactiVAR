// VAR-offside, der ikke kan være offside (v3.16.7, Spilfører): (a) offsidetjek på et hjørnesparksmål, (b) linjedommerens flag
// efter en cutback (bolden er spillet tilbage), (c) offsidetjek på oplægsgiveren selv. Plus antal VAR-tjek og annullerede mål
// pr. kamp. Samme seeds som tools/fingerprint.mjs. Kør: node tools/measure-var-offside.mjs [antal] [rod]
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export async function measureVarOffside(N = 1500, root = resolve(import.meta.dirname, '..')) {
  const imp = (p) => import(pathToFileURL(resolve(root, p)).href);
  const { createRng } = await imp('public/engine/rng.js');
  const { createLeague } = await imp('public/engine/generator.js');
  const { simulateMatch } = await imp('public/engine/match.js');
  const out = { matches: N, cornerOffside: 0, flagAfterCutback: 0, helperOffside: 0, offsideChecks: 0, goals: 0, disallowed: 0 };
  for (let s = 1; s <= N; s++) {
    const L = createLeague(createRng(s * 97)), me = L.teams.find((t) => !t.isBot), opp = L.teams[(s % 7) + 1];
    const m = s % 2 ? simulateMatch(me, opp, createRng(s * 131)) : simulateMatch(opp, me, createRng(s * 131));
    const tagOf = new Map([...m.ratings.home, ...m.ratings.away].map((e) => [e.playerId, `#${e.shirtNumber} ${e.shortName}`]));
    const ev = m.events;
    out.goals += m.homeGoals + m.awayGoals;
    ev.forEach((e, i) => {
      if (e.type === 'VAR_NO_GOAL') out.disallowed++;
      if (e.type === 'VAR_CHECK' && e.var?.kind === 'OFFSIDE') {
        out.offsideChecks++;
        const next = ev[i + 1];
        if (next && /PÅ HJØRNESPARK/.test(next.text)) out.cornerOffside++;
      }
      if (e.type === 'OFFSIDE_FLAG' && ev.slice(Math.max(0, i - 3), i).some((p) => p.min === e.min && p.text?.startsWith('↩️'))) out.flagAfterCutback++;
    });
    for (const mo of m.trace?.moments ?? []) {
      if (mo.kind !== 'GOAL' || !mo.assist) continue;
      const check = ev.slice(Math.max(0, mo.ev - 2), mo.ev).find((e) => e.type === 'VAR_CHECK' && e.var?.kind === 'OFFSIDE');
      if (check && check.text.includes(`stod ${tagOf.get(mo.assist)} offside?`)) out.helperOffside++;
    }
  }
  return out;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) console.log(await measureVarOffside(Number(process.argv[2] || 1500), process.argv[3] ? resolve(process.argv[3]) : undefined));
