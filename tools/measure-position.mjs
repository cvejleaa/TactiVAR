// Uden for position (v3.20.0): koster det, og skrider balancen?
// node tools/measure-position.mjs [N=200] [rod=denne checkout]  – rod kan være en worktree af forrige version (båndet skal være rødt dér).
// 1) Ombyttet: dit hold (4-4-2) mod hver bot, begge baner, frisk start – én gang som stillet op og én gang med LB↔CB, CB↔RB,
//    LM↔CM og CM↔RM byttet (samme 11, samme kæder, 8 mand på naboplads). Netto mål pr. kamp for dit hold, og forskellen.
// 2) Ligaen: en sæson (14 runder) med standardopstillingerne – mål pr. kamp og dit holds andel af ligaens point.
// 3) Opstilling: andel af botternes startere uden for position i en ny liga (ingen kampe).
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function measurePosition(N = 200, root = resolve(import.meta.dirname, '..')) {
  const imp = (p) => import(pathToFileURL(resolve(root, p)).href);
  const { createRng } = await imp('public/engine/rng.js');
  const { createLeague } = await imp('public/engine/generator.js');
  const { simulateMatch } = await imp('public/engine/match.js');
  const { playRound, commitRound } = await imp('public/engine/season.js');
  const F = await imp('public/engine/formations.js');
  const fitOf = F.fitOf ?? null;
  const SWAPS = [[1, 2], [3, 4], [5, 6], [7, 8]];
  let normal = 0, swapped = 0, games = 0;
  for (let s = 1; s <= N; s++) {
    for (const variant of ['normal', 'swapped']) {
      const rng = createRng(s * 7919), L = createLeague(rng), me = L.teams[0];
      if (variant === 'swapped') { const slots = me.tactics.lineupSlots; for (const [a, b] of SWAPS) [slots[a], slots[b]] = [slots[b], slots[a]]; }
      me.tactics.conditionalRules = [];   // skiftet i 65' ville fordele de 11 igen
      for (let i = 1; i < 8; i++) for (const home of [true, false]) {
        const m = home ? simulateMatch(me, L.teams[i], rng) : simulateMatch(L.teams[i], me, rng);
        const net = home ? m.homeGoals - m.awayGoals : m.awayGoals - m.homeGoals;
        if (variant === 'normal') { normal += net; games++; } else swapped += net;
      }
    }
  }
  let goals = 0, matches = 0, myPts = 0, allPts = 0;
  const seasons = Math.max(3, Math.round(N / 20));
  for (let s = 1; s <= seasons; s++) {
    const L = createLeague(createRng(s * 104723)), rng = createRng(s * 31);
    for (let r = 0; r < 13; r++) { /* 13: efter runde 14 nulstilles tabellen */ const res = playRound(L, rng); for (const m of res.matches ?? []) { goals += m.homeGoals + m.awayGoals; matches++; } commitRound(L, res, rng); }
    const st = L.leagueMetadata.standings; myPts += st.find((x) => x.teamId === L.teams[0].id).points; allPts += st.reduce((a, x) => a + x.points, 0);
  }
  const L0 = createLeague(createRng(3)), bots = L0.teams.filter((t) => t.isBot);
  const starters = bots.flatMap((t) => t.tactics.lineupSlots.map((id, i) => [t.squad.find((p) => p.id === id), (F.FORMATIONS[t.tactics.baseFormation] || F.FORMATIONS['4-4-2'])[i].r]));
  const outOfPos = fitOf ? starters.filter(([p, r]) => fitOf(p.position, r) < 1).length / starters.length : null;
  return { normalNet: normal / games, swappedNet: swapped / games, delta: (swapped - normal) / games, games, goalsPerMatch: goals / Math.max(1, matches), myPointShare: myPts / Math.max(1, allPts), botOutOfPos: outOfPos };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await measurePosition(Number(process.argv[2] || 200), process.argv[3] ? resolve(process.argv[3]) : undefined);
  console.log(JSON.stringify(r, (k, v) => (typeof v === 'number' ? Math.round(v * 1000) / 1000 : v)));
}
