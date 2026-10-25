// Hvem slår hjørne- og frisparksindlæg (v3.17.0, Spilfører: midtstopperne slog hjørnerne): tageren står kun i målets linje
// ("X slår hjørnesparket ind, og Y header …"), så der tælles på dødboldsmål – rollen fra kampens karakterliste.
// node tools/measure-setpiece-takers.mjs [N]
import { createRng } from '../public/engine/rng.js';
import { createLeague } from '../public/engine/generator.js';
import { simulateMatch } from '../public/engine/match.js';

export function measureSetPieceTakers(N = 3000) {
  let lines = 0, cb = 0, self = 0;
  const roles = {};
  for (let s = 1; s <= N; s++) {
    const L = createLeague(createRng(s));
    const m = simulateMatch(L.teams[s % 8], L.teams[(s + 3) % 8], createRng(s * 31));
    const role = new Map([...m.ratings.home, ...m.ratings.away].map((e) => [`#${e.shirtNumber} ${e.shortName}`, e.role]));
    for (const e of m.events) {
      const mm = (e.text ?? '').match(/(#\d+ \S+ \S+) slår (?:hjørnespark|frispark)et ind, og (#\d+ \S+ \S+) /);
      if (mm && mm[1] === mm[2]) self++;   // headerTarget udelukker tageren
      const r = mm && role.get(mm[1]); if (!r) continue;
      lines++; roles[r] = (roles[r] ?? 0) + 1; if (r === 'CB') cb++;
    }
  }
  return { lines, self, cbShare: cb / Math.max(1, lines), roles };
}
if (import.meta.url === `file://${process.argv[1]}`) console.log(measureSetPieceTakers(Number(process.argv[2] || 3000)));
