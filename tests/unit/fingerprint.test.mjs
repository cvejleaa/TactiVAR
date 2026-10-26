// v3.16.3: "samme kampe" som påstand med kode (CLAUDE.md "Et tal uden kode er en påstand"). tools/fingerprint.mjs hasher de
// 400 seedede kampe UDEN prosa og visningsfelter (noprose): tal, id'er, typer og minutter. En udgivelse, der kun ændrer tekst
// eller visning (som v3.16.3), lader denne værdi stå; trace-golden(-broad) skifter derimod ved hver tekstændring.
// Værdien ændres KUN bevidst ved en motorændring (og commit-teksten siger hvorfor) – aldrig for at få en tekstændring grøn.
// e45a5498… er v3.16.2-motoren (målt på 887851e og på v3.16.3 med `node tools/fingerprint.mjs 400`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fingerprint } from '../../tools/fingerprint.mjs';

// v3.16.6 M5 (motor, bevidst): frisparket i samme tick som kortet/skaden er den forseelse – ét rng-træk færre (før e45a5498…)
// v3.16.6 M4: modstanderens løbs-cutback står i referatet (nye hændelser) (før 3bd4687d…)
// v3.16.6 M2: den haltende spiller (LIMP) og pauseskift for ham (før fc304e5d…)
// v3.16.7 M2: offside-fælden tælles for sig (trapWon/oppTrapWon i ownReports) – intet rng, kampene er de samme (før 56ee202f…)
// v3.16.7 M1: VAR-offside kun hvor der kan være offside (ikke fra hjørnespark, ikke oplægsgiveren, intet flag efter cutback) – rng forskudt (før 59774fd1…)
// v3.16.7 M3: cutbackens kant og back vælges efter plads (rækkevidden først) – rng-forskydning (før f2dc7fae…)
// v3.16.7 M4: det røde kort før skadesskiftet (register trækker rng – forskudt); målets variant bruges ikke op af dit holds indledning (før d53d2d23…)
// v3.17.0: listerne bygges igen efter skadesskiftet (den udskiftede nævnes ikke resten af minuttet) (før 728d3f6e…)
// v3.17.0: dødboldens indlæg slås af kant/midtbane (crossTaker) (før ae16c682…)
// v3.17.0: dødboldens indlæg slås af kant/midtbane (crossTaker), SETPIECE_DEF_EDGE 4,1 (før 3c768989…)
// v3.17.0: løbs-cutbacken møder backen på sin kant (flankBack) (før 043be8b7…)
// v3.17.0: egen Hvis-Så pr. bot-profil, intet skift til samme formation (før dd970075…)
// v3.17.0: opbygningen styrer chancen (BUILD_LIFT_P/OPEN_DAMP_P) (før e2b30f35…)
// v3.17.0: halvchancen (≈ 25 skud), KEEPER_EDGE 1,9, løft pr. løbe-indstilling (før df778b60…)
// v3.17.0: halvchancen (≈ 25 skud, 27 % konvertering), opbygningens løft pr. løbe-indstilling (før 5aab5417…)
// v3.18.0: afslutterne spredes (pulje ≥ 4, gentagelser × 0,65), cutback uden midtstopper (før 47d94e7a…)
const NOPROSE_400 = 'b976d3f2190d202c50d2bf116277f20611b18180a9443c3e8269228c96ea25bd';   // v3.20.0: uden for position (fit i ff), opstilling og indskiftere efter position, botternes trupper bygget til formationen, formationsskift fordeler efter position (før 498ff725…)

test('fingeraftryk uden prosa: de 400 seedede kampe er de samme som ved sidste bevidste motorændring (v3.16.6 M5)', async () => {
  const r = await fingerprint(400);
  assert.equal(r.noprose, NOPROSE_400);
  assert.notEqual(r.full, r.noprose, 'data: prosaen er faktisk fjernet i noprose');
});
