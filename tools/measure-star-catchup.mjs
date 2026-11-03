// Hvorfor stiger lønnen S1→S2? Stjernerne bag værdien: tier-stjerner ved start mod kamp-stjerner efter 1. sæson.
// Før v3.30.0 (startstjerner 4/3/2/2): 59 % af ROTATION/TALENT gik +1★ (2→3) – lønnen fordobledes ved genforhandlingen.
// Kør: node tools/measure-star-catchup.mjs [ligaer]
import { createRng } from '../public/engine/rng.js';
import { createLeague } from '../public/engine/generator.js';
import { playRound, commitRound } from '../public/engine/season.js';
import { starsForValue, TIER_STARS } from '../public/engine/career.js';
const leagues = +process.argv[2] || 3, cnt = {}, byTier = {};
for (let seed = 1; seed <= leagues; seed++) {
  const L = createLeague(createRng(seed * 101)), rng = createRng(seed * 7);
  const s0 = new Map(L.teams.flatMap((t) => t.squad.map((p) => [p.id, { st: starsForValue(p), tier: p.roleTier }])));
  for (let r = 0; r < 14; r++) commitRound(L, playRound(L, rng), rng);
  for (const t of L.teams) for (const p of t.squad) { const o = s0.get(p.id); if (!o) continue;
    const d = Math.round((starsForValue(p) - o.st) * 10) / 10;   // v3.30.0: startstjernerne er ikke hele (2,9★) – ændringen i tiendedele cnt[d] = (cnt[d] ?? 0) + 1; (byTier[o.tier] ||= {})[d] = (byTier[o.tier][d] ?? 0) + 1; }
}
console.log('Ændring i værdi-stjerner efter sæson 1 (antal spillere):', cnt);
for (const [t, c] of Object.entries(byTier)) console.log(`  ${t} (start ${TIER_STARS[t]}★):`, c);
