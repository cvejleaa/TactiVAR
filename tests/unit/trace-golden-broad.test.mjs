// v3.16 Test Manager: to fingeraftryk, der lukker det, trace-golden.test.mjs (20 kampe) ikke kan se.
//
// 1) BREDT: 20 kampe er for få til en optager, der kun ændrer én kamp ud af ~300. Mutationen "optageren skriver seen[holdet] i
//    baseFrame" (skriver i den tilstand øjebliksbilledet læser) ændrede KUN resultatet i 1 af 300 kampe (seed 260 her: et
//    øjebliksbillede hænges på det forkerte referat-event) og overlevede derfor den lille hash. Her: 400 kampe, hash af hele
//    resultatet UDEN sporet. Værdien var først regnet på main (2bc2d4f, v3.15.1), FØR sporet fandtes. Den motor findes ikke
//    mere: v3.16 ændrede kampene BEVIDST (koblede linjer – coupledPositions, SHOT_REACH 28, LONGSHOT_Y 30, EDGE_BY_PRESS,
//    COUNTER_RUN, MISS_BLOCK_SHARE 0,66; spec §5 "Koblede linjer"). Værdien er derfor regnet igen på v3.16-motoren – og
//    efterprøvet uden optageren: med baseFrame og momentAt gjort tomme (return først) giver de 400 kampe præcis samme hash.
//    Formålet er det samme: optageren må ikke flytte én eneste kamp (mutationerne "optageren skriver i seen" og "optageren
//    trækker på rng" gør den rød). Ændres motoren bevidst igen, regnes værdien om – og efterprøves igen uden optageren
//    (her og i trace-golden – commit-teksten siger hvorfor).
// 2) SPORET SELV: hash af de 20 kampes spor. Sporet er fuldt bestemt af motoren og seedet; en ændring af koordinatsystem,
//    spejling, afrunding, hvilket billede et øjeblik tegnes med, skytter, tidspunkter og hvilke afslutninger der får et billede
//    skal være BEVIDST. Hashen forklarer ikke HVORFOR den fejler – det gør trace-oracle.test.mjs, som bindes mod
//    coupledPositions, øjebliksbilledet og referatet; hashen er sikkerhedsnettet mod det, orakel-testene ikke tænker på.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';

const GOLDEN_RESULTS_400 = 'de7a6f31158522f0e7392783be257f82ff93c81671e46031ec90150991048316';   // v3.16.6 M4: modstanderens løbs-cutback står i referatet (nye hændelser) (før 24d23b22…) · v3.16.6 M5: frisparket = tick'ets forseelse (motor; før 77f641cb…) · v3.16.5: kun tekst (redning efter opspil, VAR-rødt står, med ti mand) – noprose uændret (før 13cd6c87…) · v3.16.4: kun ur (clock/stoppage) – noprose uændret (tools/fingerprint.mjs: full = denne; før 53c152af…) · v3.16.3: kun tekst – noprose uændret (tools/fingerprint.mjs: full = denne, noprose e45a5498…; før 046ccd24… – vary, målets linje, fuldtidsanalysen – og før det f0961615… fra v3.16.2) · v3.16.1 (sammenpresning; før 73852862… fra v3.16; f09616… efter TM-fundet: kun 📍-billederne ændret – kampene uden snapshot er identiske med 652cdcf8…) – = hashen uden optageren (kickoffFrame, tickFrame og momentAt tomme)
const GOLDEN_TRACES_20 = 'ad91d26402769bbf36424f41c8b96ec6e97547a6d1b0d3309d2a01075bb1e335';     // v3.16.6 M4: modstanderens løbs-cutback står i referatet (nye hændelser) (før d44fb913…) · v3.16.6 M5: kampene ændret (før c59e0b2c…) · v3.16.1: sammenpresning, afsparket i blok, grundbilledet efter duellen (før 2e238fd9…) · v3.16: koblede linjer, bolden ved skytten, skytten i feltet
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

test('bredt fingeraftryk: 400 seedede kampe er uændrede af optagelsen (hash af hele resultatet uden sporet = værdien uden optageren, v3.16-motoren)', () => {
  assert.equal(FP.results, GOLDEN_RESULTS_400);
});
test('sporets fingeraftryk: de 20 første kampes spor er uændrede (bevidst ændring af sporet? opdatér GOLDEN_TRACES_20 og sig hvorfor)', () => {
  assert.equal(FP.traces, GOLDEN_TRACES_20);
});
