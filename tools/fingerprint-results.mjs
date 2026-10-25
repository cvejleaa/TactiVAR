// Kampenes UDFALD (v3.16.7): hash af resultat, hændelsestyper og minutter, statistik og karakterer for de samme 400 seedede kampe
// som tools/fingerprint.mjs – men uden referatets tekst og uden ownReports/duelLog-tal. Beviser, at en ændring af rapporter eller
// tekster (fx offside-fælden talt for sig) ikke rører kampene. Kør: node tools/fingerprint-results.mjs [antal] [rod]
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

export async function fingerprintResults(N = 400, root = resolve(import.meta.dirname, '..')) {
  const imp = (p) => import(pathToFileURL(resolve(root, p)).href);
  const { createRng } = await imp('public/engine/rng.js');
  const { createLeague } = await imp('public/engine/generator.js');
  const { simulateMatch } = await imp('public/engine/match.js');
  const h = createHash('sha256');
  for (let s = 1; s <= N; s++) {
    const L = createLeague(createRng(s * 97)), me = L.teams.find((t) => !t.isBot), opp = L.teams[(s % 7) + 1];
    const m = s % 2 ? simulateMatch(me, opp, createRng(s * 131)) : simulateMatch(opp, me, createRng(s * 131));
    h.update(JSON.stringify([m.homeGoals, m.awayGoals, m.events.map((e) => [e.type, e.min, e.isHome]), m.stats, m.ratings.home.map((e) => e.rating), m.ratings.away.map((e) => e.rating)]));
  }
  return h.digest('hex');
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) console.log(await fingerprintResults(Number(process.argv[2] || 400), process.argv[3] ? resolve(process.argv[3]) : undefined));
