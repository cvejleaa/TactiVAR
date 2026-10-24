// v3.16 Test Manager: to fingeraftryk, der lukker det, trace-golden.test.mjs (20 kampe) ikke kan se.
//
// 1) BREDT: 20 kampe er for få til en optager, der kun ændrer én kamp ud af ~300. Mutationen "optageren skriver seen[holdet] i
//    baseFrame" (skriver i den tilstand øjebliksbilledet læser) ændrede KUN resultatet i 1 af 300 kampe (seed 260 her: et
//    øjebliksbillede hænges på det forkerte referat-event) og overlevede derfor den lille hash. Her: 400 kampe, hash af hele
//    resultatet UDEN sporet. Værdien er regnet på main (2bc2d4f), FØR sporet fandtes – altså beviset for, at optagelsen ikke
//    flytter én eneste kamp. (Ændres motoren bevidst, opdateres værdien her og i trace-golden – commit-teksten siger hvorfor.)
// 2) SPORET SELV: hash af de 20 kampes spor. Sporet er fuldt bestemt af motoren og seedet; en ændring af koordinatsystem,
//    spejling, afrunding, hvilket billede et øjeblik tegnes med, skytter, tidspunkter og hvilke afslutninger der får et billede
//    skal være BEVIDST. Hashen forklarer ikke HVORFOR den fejler – det gør trace-oracle.test.mjs, som bindes mod
//    livePositions, øjebliksbilledet og referatet; hashen er sikkerhedsnettet mod det, orakel-testene ikke tænker på.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';

const GOLDEN_RESULTS_400 = '4377384b0998169a542f6a2c32e77f6407263e7b4448c87be868c21c8aecb6c3';   // v3.15.1 (main 2bc2d4f) – regnet uden sporet
const GOLDEN_TRACES_20 = '9735f95a428bdaf145cece822d5002e33865468e913c0514194678cfcbc08664';     // v3.16.0
function matchN(s) {
  const L = createLeague(createRng(s * 97)), me = L.teams.find((t) => !t.isBot), opp = L.teams[(s % 7) + 1];
  return s % 2 ? simulateMatch(me, opp, createRng(s * 131)) : simulateMatch(opp, me, createRng(s * 131));
}

const FP = (() => {
  const h = createHash('sha256'), h20 = createHash('sha256');
  for (let s = 1; s <= 400; s++) {
    const { trace, ...rest } = matchN(s);
    h.update(JSON.stringify(rest));
    if (s <= 20) h20.update(JSON.stringify(trace));
  }
  return { results: h.digest('hex'), traces: h20.digest('hex') };
})();

test('bredt fingeraftryk: 400 seedede kampe er uændrede af optagelsen (hash af hele resultatet uden sporet = værdien fra før v3.16)', () => {
  assert.equal(FP.results, GOLDEN_RESULTS_400);
});
test('sporets fingeraftryk: de 20 første kampes spor er uændrede (bevidst ændring af sporet? opdatér GOLDEN_TRACES_20 og sig hvorfor)', () => {
  assert.equal(FP.traces, GOLDEN_TRACES_20);
});
