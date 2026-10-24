// Fingeraftryk af kampene (v3.16.3, CLAUDE.md "Et tal uden kode er en påstand"): beviser at en udgivelse kun ændrer TEKST
// eller VISNING – ikke kampene. Samme 400 seedede kampe som tests/unit/trace-golden-broad.test.mjs (sporet udeladt).
//  - full:    hele resultatet
//  - noprose: uden prosa (enhver tekststreng med mellemrum, fx referatets text/label og observationer) og uden visnings-
//             felter (clock, stoppage, snapshot) – tal, id'er, typer og minutter står tilbage. To versioner med samme noprose-hash
//             spiller præcis de samme kampe.
// Kør: node tools/fingerprint.mjs [antal] [rod]   (rod = en anden checkout, fx en worktree af main)
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const VIEW_KEYS = new Set(['clock', 'snapshot', 'trace', 'stoppage']);   // stoppage: tillægstiden (visning, v3.16.4)
const strip = (v) => {
  if (typeof v === 'string') return / /.test(v) ? '' : v;
  if (Array.isArray(v)) return v.map(strip);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => !VIEW_KEYS.has(k)).map(([k, x]) => [k, strip(x)]));
  return v;
};

export async function fingerprint(N = 400, root = resolve(import.meta.dirname, '..')) {
  const imp = (p) => import(pathToFileURL(resolve(root, p)).href);
  const { createRng } = await imp('public/engine/rng.js');
  const { createLeague } = await imp('public/engine/generator.js');
  const { simulateMatch } = await imp('public/engine/match.js');
  const full = createHash('sha256'), noprose = createHash('sha256');
  for (let s = 1; s <= N; s++) {
    const L = createLeague(createRng(s * 97)), me = L.teams.find((t) => !t.isBot), opp = L.teams[(s % 7) + 1];
    const { trace, ...rest } = s % 2 ? simulateMatch(me, opp, createRng(s * 131)) : simulateMatch(opp, me, createRng(s * 131));
    full.update(JSON.stringify(rest)); noprose.update(JSON.stringify(strip(rest)));
  }
  return { full: full.digest('hex'), noprose: noprose.digest('hex') };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await fingerprint(Number(process.argv[2] || 400), process.argv[3] ? resolve(process.argv[3]) : undefined);
  console.log(`full    ${r.full}\nnoprose ${r.noprose}`);
}
