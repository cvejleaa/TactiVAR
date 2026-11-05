// Spring kan trænes (v3.32.0, backlog 0c – brugeren 3/11: "Tobias kan blive luftens konge, men det kræver jumpingpower på 14").
// Bygget på measure-lifecycle's løkke. Profil "fysik": alle på dit hold til og med 25 år træner Fysik (resten Alsidig); botterne
// træner Alsidig som altid. Målt efter 0, 1, 3 og 5 sæsoner:
// - Spring-fordelingen på dit hold (min/median/maks og snit) og for dem, der træner Fysik
// - aerialPower: dit holds snit ÷ botternes snit (myVsBots kan ikke se Spring og bruges IKKE)
// - hovedstødsmål pr. kamp for dit hold
// - antal spillere på dit hold med Luftens Konge / Fyrtårn låst op
// - runder til første Spring +1 for de 17–23-årige og for 24–27-årige tæt på loftet (roomOf ≤ 0,15) – "efterprøv på Tobias' profil"
// Kør: node tools/measure-jump.mjs [seeds] [sæsoner]   (standard 8 seeds, 5 sæsoner)
import { createRng } from '../public/engine/rng.js';
import { createLeague } from '../public/engine/generator.js';
import { playRound, commitRound } from '../public/engine/season.js';
import { roomOf } from '../public/engine/career.js';

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length);
const median = (xs) => { const s = xs.slice().sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const CHECK = [0, 1, 3, 5];

function snapshot(L, trainedIds, heads, games) {
  const me = L.teams.find((t) => !t.isBot), bots = L.teams.filter((t) => t.isBot);
  const jumps = me.squad.map((p) => p.jumpingPower), tj = me.squad.filter((p) => trainedIds.has(p.id)).map((p) => p.jumpingPower);
  const unl = (id) => me.squad.filter((p) => p.archetype?.id === id && p.archetype.isUnlocked).length;
  return {
    jumpMed: median(jumps), jumpAvg: mean(jumps), jumpMax: Math.max(...jumps), trainedJumpAvg: tj.length ? mean(tj) : null,
    aerialMeVsBots: mean(me.squad.map((p) => p.aerialPower)) / mean(bots.flatMap((t) => t.squad).map((p) => p.aerialPower)),
    headersPerMatch: games ? heads / games : null,
    kingUnlocked: unl('AERIAL_TOWER'), towerUnlocked: unl('TARGET_MAN'),
    kingTotal: me.squad.filter((p) => p.archetype?.id === 'AERIAL_TOWER').length, towerTotal: me.squad.filter((p) => p.archetype?.id === 'TARGET_MAN').length,
  };
}

export function measureJump(seed, seasons = 5) {
  const L = createLeague(createRng(seed)), rng = createRng(seed * 7);
  const me = L.teams.find((t) => !t.isBot);
  const trainedIds = new Set();
  // Første Spring +1 pr. spiller (startede som hhv. 17–23 og 24–27 tæt på loftet)
  const watch = new Map(me.squad.filter((p) => p.age <= 27).map((p) => [p.id, { j0: p.jumpingPower, young: p.age <= 23, nearCap: p.age >= 24 && roomOf(p) <= 0.15, at: null }]));
  const out = { 0: snapshot(L, trainedIds, 0, 0) };
  let heads = 0, games = 0;
  for (let r = 1; r <= seasons * 14; r++) {
    for (const p of me.squad) { p.trainingFocus = p.age <= 25 ? 'PHYSICAL' : 'GENERAL'; if (p.age <= 25) trainedIds.add(p.id); }
    const res = playRound(L, rng);
    for (const m of res.matches) {
      if (m.homeId !== me.id && m.awayId !== me.id) continue;
      games++; heads += m.events.filter((e) => e.type === 'HEADER_GOAL' && (e.isHome ? m.homeId : m.awayId) === me.id).length;
    }
    commitRound(L, res, rng);
    for (const p of me.squad) { const w = watch.get(p.id); if (w && w.at == null && p.jumpingPower > w.j0) w.at = r; }
    if (r % 14 === 0 && CHECK.includes(r / 14)) out[r / 14] = snapshot(L, trainedIds, heads, games);
  }
  const rounds = (pick) => [...watch.values()].filter(pick).map((w) => w.at ?? Infinity);
  return { snaps: out, young: rounds((w) => w.young), nearCap: rounds((w) => w.nearCap) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const seeds = Number(process.argv[2] || 8), seasons = Number(process.argv[3] || 5);
  const runs = Array.from({ length: seeds }, (_, i) => measureJump(i + 1, seasons));
  const f = (v, d = 3) => (v == null ? '–' : Math.round(v * 10 ** d) / 10 ** d);
  console.log(`measure-jump: ${seeds} seeds, ${seasons} sæsoner, profil: dit hold ≤ 25 år træner Fysik`);
  console.log('sæson | Spring median | Spring snit | Spring maks | trænede snit | aerial mig/botter | hovedstødsmål/kamp | Luftens Konge låst op | Fyrtårn låst op');
  for (const s of CHECK) {
    const xs = runs.map((r) => r.snaps[s]).filter(Boolean);
    if (!xs.length) continue;
    const sum = (k) => xs.reduce((a, x) => a + x[k], 0);
    console.log([s, f(mean(xs.map((x) => x.jumpMed)), 2), f(mean(xs.map((x) => x.jumpAvg)), 2), f(mean(xs.map((x) => x.jumpMax)), 2),
      f(xs.some((x) => x.trainedJumpAvg != null) ? mean(xs.filter((x) => x.trainedJumpAvg != null).map((x) => x.trainedJumpAvg)) : null, 2), f(mean(xs.map((x) => x.aerialMeVsBots))),
      f(xs.some((x) => x.headersPerMatch != null) ? mean(xs.filter((x) => x.headersPerMatch != null).map((x) => x.headersPerMatch)) : null), `${sum('kingUnlocked')}/${sum('kingTotal')}`, `${sum('towerUnlocked')}/${sum('towerTotal')}`].join(' | '));
  }
  for (const [label, key] of [['17–23 år', 'young'], ['24–27 år tæt på loftet', 'nearCap']]) {
    const all = runs.flatMap((r) => r[key]), fin = all.filter((n) => n < Infinity);
    console.log(`Første Spring +1, ${label}: n=${all.length}, median ${median(all) === Infinity ? '> målt' : median(all)} runder, inden for 1 sæson ${f(all.filter((n) => n <= 14).length / Math.max(1, all.length), 2)}, inden for 2 sæsoner ${f(all.filter((n) => n <= 28).length / Math.max(1, all.length), 2)}, aldrig ${all.length - fin.length}`);
  }
}
