// Hvem slår hjørne- og frisparksindlæg (v3.17.0, Spilfører: midtstopperne slog hjørnerne): tageren står kun i målets linje
// ("X slår hjørnesparket ind, og Y header …"), så der tælles på dødboldsmål – rollen fra kampens karakterliste.
// v3.21.2: linjen har tre skabeloner (match.js 'sphead') – tageren læses i alle tre, i genitiv slås navnet op via gen().
// node tools/measure-setpiece-takers.mjs [N]
import { createRng } from '../public/engine/rng.js';
import { createLeague } from '../public/engine/generator.js';
import { simulateMatch } from '../public/engine/match.js';
import { gen } from '../public/engine/clues.js';

const SP = '(?:hjørnespark|frispark)';
const LINES = [   // [mønster, tagerens gruppe, skytten]
  [new RegExp(`(#\\d+ \\S+ \\S+) slår ${SP}et ind, og (#\\d+ \\S+ \\S+) `), 1, 2],
  [new RegExp(`(#\\d+ \\S+ \\S+) \\(\\d+ cm\\) kommer højest på (#\\d+ \\S+ \\S+) ${SP} `), 2, 1],
  [new RegExp(`(#\\d+ \\S+ \\S+) ${SP} finder (#\\d+ \\S+ \\S+) \\(`), 1, 2],
];
export const takerOf = (text) => { for (const [re, t, h] of LINES) { const mm = text.match(re); if (mm) return [mm[t], mm[h]]; } return null; };

// role: navn (nominativ og genitiv) → [rolle, nominativ] fra karakterlisten. Returnerer null for en linje uden tager, ellers
// { role (undefined hvis tageren ikke findes), self (tager = skytte – headerTarget udelukker det) } (eksporteret til test: self er 0 i motoren)
export function classifyLine(text, role) {
  const th = takerOf(text ?? ''); if (!th) return null;
  const [r, taker] = role.get(th[0]) ?? [], shooter = role.get(th[1])?.[1] ?? th[1];
  return { role: r, self: !!taker && taker === shooter };
}
export const roleMapOf = (ratings) => new Map(ratings.flatMap((e) => { const n = `#${e.shirtNumber} ${e.shortName}`; return [[n, [e.role, n]], [gen(n), [e.role, n]]]; }));

export function measureSetPieceTakers(N = 3000) {
  let lines = 0, cb = 0, self = 0;
  const roles = {};
  for (let s = 1; s <= N; s++) {
    const L = createLeague(createRng(s));
    const m = simulateMatch(L.teams[s % 8], L.teams[(s + 3) % 8], createRng(s * 31));
    const role = roleMapOf([...m.ratings.home, ...m.ratings.away]);
    for (const e of m.events) {
      const c = classifyLine(e.text, role); if (!c) continue;
      const r = c.role;
      if (c.self) self++;   // headerTarget udelukker tageren
      if (!r) continue;
      lines++; roles[r] = (roles[r] ?? 0) + 1; if (r === 'CB') cb++;
    }
  }
  return { lines, self, cbShare: cb / Math.max(1, lines), roles };
}
if (import.meta.url === `file://${process.argv[1]}`) console.log(measureSetPieceTakers(Number(process.argv[2] || 3000)));
