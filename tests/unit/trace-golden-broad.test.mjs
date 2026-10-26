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

const GOLDEN_RESULTS_400 = '5757ee62087c1b7b56feb9b3c16525aba8bc9de9f498d23de44ff8223c04798f';   // v3.18.0: unikke kortnavne i hele ligaen (kun prosa – kampene uændrede, fingerprint-results 7a5b5f15…) (før 9312086a…) · v3.17.0: Spilførerens tekstfund (før 99da4160…) · v3.17.0: QC-fund – halvchancens tekster (før dd52eb66…) · v3.17.0: holdmærket på redningen efter dit løb (før 719901d9…) · v3.17.0: halvchancen (≈ 25 skud, 27 % konvertering), opbygningens løft pr. løbe-indstilling (før 15ed26ba…) · v3.17.0: halvchancen (≈ 25 skud), KEEPER_EDGE 1,9, løft pr. løbe-indstilling (før 445b30c8…) · v3.17.0: opbygningen styrer chancen (BUILD_LIFT_P/OPEN_DAMP_P) (før 70f5184c…) · v3.17.0: egen Hvis-Så pr. bot-profil, intet skift til samme formation (før b33a562b…) · v3.17.0: løbs-cutbacken møder backen på sin kant (flankBack) (før 6d17517c…) · v3.17.0: dødboldens indlæg slås af kant/midtbane (crossTaker), SETPIECE_DEF_EDGE 4,1 (før 20aaeb8d…) · v3.17.0: dødboldens indlæg slås af kant/midtbane (crossTaker) (før 8f909487…) · v3.17.0: listerne bygges igen efter skadesskiftet (den udskiftede nævnes ikke resten af minuttet) (før 76d6af4c…) · v3.16.7 QC/Spilfører: kun tekst (aldrig "0 af 0 gange", "på offside", kolon i opfølgningen) – noprose uændret (før 4d032ba0…) · v3.16.7 M4: det røde kort før skadesskiftet (register trækker rng – forskudt); målets variant bruges ikke op af dit holds indledning (før fc49b291…) · v3.16.7 M3: cutbackens kant og back vælges efter plads (rækkevidden først) – rng-forskydning (før 898ce4e4…) · v3.16.7 M1: VAR-offside kun hvor der kan være offside (ikke fra hjørnespark, ikke oplægsgiveren, intet flag efter cutback) – rng forskudt (før 04fd125c…) · v3.16.7 M2: offside-fælden tælles for sig (trapWon/oppTrapWon i ownReports) – intet rng, kampene er de samme (før c2c05d36…) · v3.16.7 T3/T4: kun tekst (varianter, oplæg i hovedstødslinjen, forbi-tekster uden gentagelse, skifte-pause) – noprose uændret (før 641506e2…) · v3.16.7 T2: kun tekst (ental/flertal, straffespark, holdmærke) – noprose uændret (før 5b3b0b09…) · v3.16.6: kun tekst (redning efter dit opspil, kolon i frisparksmålet) – noprose uændret (før 35ff11c1…) · v3.16.6 M2: den haltende spiller (LIMP) og pauseskift for ham (før de7a6f31…) · v3.16.6 M4: modstanderens løbs-cutback står i referatet (nye hændelser) (før 24d23b22…) · v3.16.6 M5: frisparket = tick'ets forseelse (motor; før 77f641cb…) · v3.16.5: kun tekst (redning efter opspil, VAR-rødt står, med ti mand) – noprose uændret (før 13cd6c87…) · v3.16.4: kun ur (clock/stoppage) – noprose uændret (tools/fingerprint.mjs: full = denne; før 53c152af…) · v3.16.3: kun tekst – noprose uændret (tools/fingerprint.mjs: full = denne, noprose e45a5498…; før 046ccd24… – vary, målets linje, fuldtidsanalysen – og før det f0961615… fra v3.16.2) · v3.16.1 (sammenpresning; før 73852862… fra v3.16; f09616… efter TM-fundet: kun 📍-billederne ændret – kampene uden snapshot er identiske med 652cdcf8…) – = hashen uden optageren (kickoffFrame, tickFrame og momentAt tomme)
const GOLDEN_TRACES_20 = '9972709e83a40d14042bc4289c87abeb944324bc202ab9f57427edb7bfb12d32';     // v3.17.0: halvchancen (≈ 25 skud, 27 % konvertering), opbygningens løft pr. løbe-indstilling (før 1a32b9fd…) · v3.17.0: halvchancen (≈ 25 skud), KEEPER_EDGE 1,9, løft pr. løbe-indstilling (før b7ea3aca…) · v3.17.0: opbygningen styrer chancen (BUILD_LIFT_P/OPEN_DAMP_P) (før c4e39cf8…) · v3.17.0: egen Hvis-Så pr. bot-profil, intet skift til samme formation (før e63674ea…) · v3.17.0: løbs-cutbacken møder backen på sin kant (flankBack) (før 03b66db1…) · v3.17.0: dødboldens indlæg slås af kant/midtbane (crossTaker) (før 6cebf8f0…) · v3.17.0: listerne bygges igen efter skadesskiftet (den udskiftede nævnes ikke resten af minuttet) (før c65e718b…) · v3.16.7 M4: det røde kort før skadesskiftet (register trækker rng – forskudt); målets variant bruges ikke op af dit holds indledning (før c9b937a1…) · v3.16.7 M3: cutbackens kant og back vælges efter plads (rækkevidden først) – rng-forskydning (før 1290325f…) · v3.16.7 M1: VAR-offside kun hvor der kan være offside (ikke fra hjørnespark, ikke oplægsgiveren, intet flag efter cutback) – rng forskudt (før ad91d264…) · v3.16.6 M4: modstanderens løbs-cutback står i referatet (nye hændelser) (før d44fb913…) · v3.16.6 M5: kampene ændret (før c59e0b2c…) · v3.16.1: sammenpresning, afsparket i blok, grundbilledet efter duellen (før 2e238fd9…) · v3.16: koblede linjer, bolden ved skytten, skytten i feltet
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
