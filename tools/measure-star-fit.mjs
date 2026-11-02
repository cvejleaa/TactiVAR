// Startstjernerne (TIER_STARS, career.js): hvilke kampstjerner får en spiller i snit efter sæson 1 – pr. tier og pr. nøgle-evnesnit
// ved start? Kun spillere med mindst 3 kampe (dem, hvis værdi følger kampstjernerne). v3.30.0 satte TIER_STARS til snittene herfra
// (8 ligaer, målt på koden før: STAR 3,40 · STARTER 3,16 · ROTATION 2,89 · TALENT 2,83; på v3.30.0 selv 3,37 · 3,14 · 2,86 · 2,80 –
// stabilt); før 4/3/2/2. Linjerne: snit og fordeling 1★/2★/3★/4★/5★.
// Kør: node tools/measure-star-fit.mjs [ligaer]
import { createRng } from '../public/engine/rng.js';
import { createLeague } from '../public/engine/generator.js';
import { playRound, commitRound } from '../public/engine/season.js';
import { starsForValue, keyAvg } from '../public/engine/career.js';
const rows = [];
const leagues = +process.argv[2] || 8;
for (let seed = 1; seed <= leagues; seed++) {
  const L = createLeague(createRng(seed * 101)), rng = createRng(seed * 7);
  const s0 = new Map(L.teams.flatMap((t) => t.squad.map((p) => [p.id, { k: keyAvg(p), tier: p.roleTier, line: p.line }])));
  for (let r = 0; r < 14; r++) commitRound(L, playRound(L, rng), rng);
  for (const t of L.teams) for (const p of t.squad) { const o = s0.get(p.id); if (o && (p.careerGames ?? 0) >= 3) rows.push({ ...o, st: starsForValue(p) }); }
}
const by = {};
for (const r of rows) { const b = Math.floor(r.k); (by[b] ||= []).push(r.st); }
for (const b of Object.keys(by).sort((a, c) => a - c)) { const a = by[b], m = a.reduce((x, y) => x + y, 0) / a.length; console.log(`keyAvg ${b}–${+b + 1}: n=${a.length} snit ${m.toFixed(2)}★  fordeling`, [1,2,3,4,5].map((s) => a.filter((x) => x === s).length).join('/')); }
const byT = {}; for (const r of rows) (byT[r.tier] ||= []).push(r.st);
for (const [t, a] of Object.entries(byT)) console.log(t, (a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), [1,2,3,4,5].map((s) => a.filter((x) => x === s).length).join('/'));
