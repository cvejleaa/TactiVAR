// Størrelsen af en kamp og dens gengivelsespakke (v3.24.3, kamp-id): et Firestore-dokument må højst være 1 MiB.
// Kør: node tools/measure-match-size.mjs [ligaer=5]
import { createRng } from '../public/engine/rng.js';
import { createLeague } from '../public/engine/generator.js';
import { playRound, commitRound } from '../public/engine/season.js';

const n = Number(process.argv[2] || 5), sizes = { match: [], pack: [], noStats: [] };
for (let s = 1; s <= n; s++) {
  const L = createLeague(createRng(s)), rng = createRng(s * 3);
  for (let r = 0; r < 14; r++) {
    const res = playRound(L, rng, { replay: true });
    const m = res.matches[0], p = res.replay.packs[0];
    sizes.match.push(JSON.stringify(m).length); sizes.pack.push(JSON.stringify(p).length);
    sizes.noStats.push(JSON.stringify({ ...m, events: m.events.map(({ stats, ...e }) => e) }).length);
    commitRound(L, res, rng);
  }
}
const kb = (xs) => `snit ${Math.round(xs.reduce((a, b) => a + b, 0) / xs.length / 1024)} KB · max ${Math.round(Math.max(...xs) / 1024)} KB`;
console.log(`kamp: ${kb(sizes.match)} · uden events[].stats: ${kb(sizes.noStats)} · pakke (2 hold): ${kb(sizes.pack)}`);
