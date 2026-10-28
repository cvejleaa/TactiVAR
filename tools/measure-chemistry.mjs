// Samspil (v3.23.0): hvor ligger botternes samspil i ligevægt (CHEM_BASE), og hvor meget fylder tabellen i gemmet?
// node tools/measure-chemistry.mjs base [seeds=4] [sæsoner=4]  – ligaen spilles (dit hold passivt); pr. bot og runde i sidste sæson:
//   middel samspil af de nabopar, motoren ville læse ved kickoff (startopstillingen i den formation, holdet stiller op i), og
//   andelen af par ≥ 95. Afviger middelværdien > 5 fra CHEM_BASE, flyttes konstanten og målingen gentages (seedet konvergerer).
// node tools/measure-chemistry.mjs bytes – JSON-størrelsen af ligaen før seed, efter seed og efter 1 og 3 sæsoner.
import { createRng } from '../public/engine/rng.js';
import { createLeague } from '../public/engine/generator.js';
import { playRound, commitRound } from '../public/engine/season.js';
import { neighbourPairs, chemOf, CHEM_BASE } from '../public/engine/chemistry.js';

const ROUNDS = 14;
const kickoffPairs = (t) => {
  const slots = t.tactics.lineupSlots;
  return neighbourPairs(t.tactics.baseFormation).map(([i, j]) => chemOf(t, slots[i], slots[j]));
};

export function measureBase(seeds = 4, seasons = 4) {
  const vals = [], perSeason = [];
  for (let s = 1; s <= seeds; s++) {
    const rng = createRng(s * 9001), L = createLeague(rng);
    for (let season = 1; season <= seasons; season++) {
      const sv = [];
      for (let r = 0; r < ROUNDS; r++) {
        for (const t of L.teams.filter((x) => x.isBot)) for (const v of kickoffPairs(t)) { sv.push(v); if (season === seasons) vals.push(v); }
        commitRound(L, playRound(L, rng), rng);
      }
      (perSeason[season - 1] ||= []).push(...sv);
    }
  }
  const mean = (a) => a.reduce((x, y) => x + y, 0) / Math.max(1, a.length), sd = (a) => { const m = mean(a); return Math.sqrt(mean(a.map((v) => (v - m) ** 2))); };
  return { sd: Math.round(sd(vals) * 10) / 10, base: Math.round(mean(vals) * 10) / 10, high: Math.round((vals.filter((v) => v >= 95).length / vals.length) * 1000) / 1000, low: Math.round((vals.filter((v) => v < CHEM_BASE - 15).length / vals.length) * 1000) / 1000,
    bySeason: perSeason.map((a) => Math.round(mean(a) * 10) / 10), n: vals.length, seeded: CHEM_BASE };
}

export function measureBytes() {
  const rng = createRng(19), L = createLeague(rng), size = () => JSON.stringify(L).length;
  const chemBytes = () => L.teams.reduce((n, t) => n + JSON.stringify(t.chemistry ?? {}).length, 0);
  const out = { seeded: { league: size(), chemistry: chemBytes(), pairs: L.teams.reduce((n, t) => n + Object.keys(t.chemistry).length, 0) } };
  for (let season = 1; season <= 3; season++) {
    for (let r = 0; r < ROUNDS; r++) commitRound(L, playRound(L, rng), rng);
    if (season === 1 || season === 3) out[`season${season}`] = { league: size(), chemistry: chemBytes(), pairs: L.teams.reduce((n, t) => n + Object.keys(t.chemistry).length, 0) };
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [mode = 'base', a, b] = process.argv.slice(2);
  console.log(JSON.stringify(mode === 'bytes' ? measureBytes() : mode === 'effect' ? await measureEffect(Number(a || 600)) : measureBase(Number(a || 4), Number(b || 4))));
}

// node tools/measure-chemistry.mjs effect [N=600] – virkningen i kampene (v3.24.0): hold A med alle par tvunget til fremmede (30),
// ligaens niveau (ref = CHEM_BASE) og et fast par i ligevægt (CHEM_TOP) mod hold B på ref, begge baner, N kampe pr. linje; hver
// kobling for sig (build/run) og samlet. net = mål for − mål imod pr. kamp for A.
export async function measureEffect(N = 600) {
  const { simulateMatch, CHEM_EFFECT } = await import('../public/engine/match.js');
  const { CHEM_TOP, STRANGER, pairKey } = await import('../public/engine/chemistry.js');
  const saved = { ...CHEM_EFFECT }, out = {};
  const force = (t, v) => { const ids = t.squad.map((p) => p.id), c = {}; for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) c[pairKey(ids[i], ids[j])] = [v, 0]; t.chemistry = c; };
  for (const [name, w] of [['build', { build: saved.build, run: 0 }], ['run', { build: 0, run: saved.run }], ['both', saved]]) {
    Object.assign(CHEM_EFFECT, w);
    const line = {};
    for (const [lab, v] of [['fremmede', STRANGER], ['ref', CHEM_BASE], ['fast', CHEM_TOP]]) {
      let net = 0, n = 0;
      for (let s = 1; n < N; s++) {
        const L = createLeague(createRng(s * 13)), A = L.teams[s % 8], B = L.teams[(s + 3) % 8];
        force(A, v); force(B, CHEM_BASE);
        for (const home of [true, false]) {
          const m = simulateMatch(home ? A : B, home ? B : A, createRng(s * 101 + (home ? 1 : 2)), { chemRef: CHEM_BASE });
          net += home ? m.homeGoals - m.awayGoals : m.awayGoals - m.homeGoals; n++;
        }
      }
      line[lab] = Math.round((net / n) * 1000) / 1000;
    }
    out[name] = line;
  }
  Object.assign(CHEM_EFFECT, saved);
  return out;
}
