// Oplægsgiver = målscorer (v3.16.6, Spilfører: "#7 fandt #7"): tæller mål, hvis type har en oplægsgiver (ikke langskud,
// dribletur, straffe og direkte frispark), men hvor øjeblikket (sporets moment) ingen anden oplægsgiver har – dvs. hjælperen
// var skytten selv eller manglede. Samme 400 seedede kampe som tools/fingerprint.mjs.
// Kør: node tools/measure-assist.mjs [antal]
import { pathToFileURL } from 'node:url';
import { createRng } from '../public/engine/rng.js';
import { createLeague } from '../public/engine/generator.js';
import { simulateMatch } from '../public/engine/match.js';

const SOLO = new Set(['LONGSHOT', 'DRIBBLE', 'PENALTY', 'FREEKICK', 'SCRAMBLE']);   // SCRAMBLE: halvchancens løse bold (v3.17.0) – intet oplæg
export function measureAssist(N = 400) {
  const out = { goals: 0, withHelper: 0, selfOrNone: 0, byKind: {} };
  for (let s = 1; s <= N; s++) {
    const L = createLeague(createRng(s * 97)), me = L.teams.find((t) => !t.isBot), opp = L.teams[(s % 7) + 1];
    const m = s % 2 ? simulateMatch(me, opp, createRng(s * 131)) : simulateMatch(opp, me, createRng(s * 131));
    // Målhændelserne og goalsPool står i samme rækkefølge; øjeblikket peger på sin hændelse (ev). Dødboldsmål har intet øjeblik.
    const goalEvs = m.events.filter((e) => e.type === 'GOAL' || e.type === 'HEADER_GOAL' || e.type === 'VAR_GOAL');
    if (goalEvs.length !== m.goalsPool.length) throw new Error(`seed ${s}: ${goalEvs.length} målhændelser mod ${m.goalsPool.length} mål`);
    const goals = (m.trace?.moments ?? []).filter((x) => x.kind === 'GOAL');
    goals.forEach((g) => {
      const kind = m.goalsPool[goalEvs.indexOf(m.events[g.ev])]?.kind;
      if (!kind) throw new Error(`seed ${s}: øjeblik uden mål`);
      out.goals++;
      if (SOLO.has(kind)) return;
      out.withHelper++;
      if (!g.assist || g.assist === g.scorer) { out.selfOrNone++; out.byKind[kind] = (out.byKind[kind] ?? 0) + 1; }
    });
  }
  return out;
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) console.log(measureAssist(Number(process.argv[2] || 400)));
