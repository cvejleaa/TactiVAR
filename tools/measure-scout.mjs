// Klummens "Mit bud" (v3.17.0, Spilfører: "omorganiserede sig" i 5 af 12 bud – alle hold havde samme Hvis-Så-regel): spil
// N sæsoner (10 runder) og find for hvert hold fra runde 2 den stil, spejderen ville vælge ud fra de seneste (op til) 3 kampe
// – samme regler og afrunding som column.js scout(). node tools/measure-scout.mjs [N]
import { createRng } from '../public/engine/rng.js';
import { createLeague } from '../public/engine/generator.js';
import { playPairs, fixedPairs, commitRound } from '../public/engine/season.js';
import { STYLE_RULES, publicFacts, PUBLIC_FACT_KEYS } from '../public/engine/column.js';

export function measureScout(N = 20, rounds = 10) {
  const picks = {};
  let n = 0;
  for (let s = 1; s <= N; s++) {
    const rng = createRng(s * 4049), L = createLeague(rng), hist = new Map();
    for (let r = 1; r <= rounds; r++) {
      const res = playPairs(L, fixedPairs(L, ((r - 1) % 7) + 1), rng);
      for (const m of res.matches) {
        const f = publicFacts(m);
        for (const side of [f.home, f.away]) {
          const past = (hist.get(side.id) ?? []).slice(-3);
          if (past.length) {
            const sum = Object.fromEntries(PUBLIC_FACT_KEYS.map((k) => [k, past.reduce((a, x) => a + (x[k] ?? 0), 0) / past.length]));
            const rule = STYLE_RULES.find((q) => q.test({ ...sum, headerGoals: sum.headerGoals >= 0.5 ? 1 : 0, counterGoals: sum.counterGoals >= 0.5 ? 1 : 0, setPieceGoals: sum.setPieceGoals >= 0.5 ? 1 : 0, reorganised: sum.reorganised >= 0.5 ? 1 : 0, goals: sum.goals >= 1 ? 1 : 0 }));
            const key = rule?.key ?? 'ingen'; picks[key] = (picks[key] ?? 0) + 1; n++;
          }
          hist.set(side.id, [...(hist.get(side.id) ?? []), side]);
        }
      }
      commitRound(L, res, rng);
    }
  }
  return { n, share: Object.fromEntries(Object.entries(picks).map(([k, v]) => [k, Math.round((v / n) * 1000) / 1000])) };
}
if (import.meta.url === `file://${process.argv[1]}`) console.log(measureScout(Number(process.argv[2] || 20)));
