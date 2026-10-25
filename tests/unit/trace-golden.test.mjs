// v3.16 trin 1 (Arkitekt, QC B5): et fingeraftryk af 20 seedede kampe FØR kampens spor blev optaget – optagelsen må ikke
// ændre én eneste kamp (intet rng-træk, ingen skrivning i seen/seenX). Hashen dækker hele resultatet uden sporet: referat
// (også 📍-billederne), kamptal, karakterer, Rundens mål-pulje, skader, observationer og slutopstilling. Kampene har dit hold
// (📍 findes kun dér), og udvalget skal rumme røde kort, Hvis-Så-skift og udskiftninger (vagt nedenfor).
// Ændres motoren BEVIDST, opdateres GOLDEN med den nye værdi – og commit-teksten siger hvorfor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';

const GOLDEN = 'fef44917968cab9125b0f6d8d1550e6104e58c70a1d9059f1b3fb278ed9d6b77';   // v3.17.0: opbygningen styrer chancen (BUILD_LIFT_P/OPEN_DAMP_P) (før 671ad09d…) · v3.17.0: egen Hvis-Så pr. bot-profil, intet skift til samme formation (før b1737957…) · v3.17.0: løbs-cutbacken møder backen på sin kant (flankBack) (før 419204b5…) · v3.17.0: dødboldens indlæg slås af kant/midtbane (crossTaker) (før e6b72932…) · v3.17.0: listerne bygges igen efter skadesskiftet (den udskiftede nævnes ikke resten af minuttet) (før 5f1344de…) · v3.16.7 QC/Spilfører: kun tekst (aldrig "0 af 0 gange", "på offside", kolon i opfølgningen) – noprose uændret (før 7279acb6…) · v3.16.7 M4: det røde kort før skadesskiftet (register trækker rng – forskudt); målets variant bruges ikke op af dit holds indledning (før fbdb9567…) · v3.16.7 M3: cutbackens kant og back vælges efter plads (rækkevidden først) – rng-forskydning (før 5b74ba08…) · v3.16.7 M1: VAR-offside kun hvor der kan være offside (ikke fra hjørnespark, ikke oplægsgiveren, intet flag efter cutback) – rng forskudt (før 10d8e05f…) · v3.16.7 M2: offside-fælden tælles for sig (trapWon/oppTrapWon i ownReports) – intet rng, kampene er de samme (før 13290d19…) · v3.16.7 T3/T4: kun tekst (varianter, oplæg i hovedstødslinjen, forbi-tekster uden gentagelse, skifte-pause) – noprose uændret (før 1624bf9e…) · v3.16.7 T2: kun tekst (ental/flertal, straffespark, holdmærke) – noprose uændret (før 998458ff…) · v3.16.6: kun tekst (redning efter dit opspil, kolon i frisparksmålet) – noprose uændret (før 25bbe918…) · v3.16.6 M4: modstanderens løbs-cutback står i referatet (nye hændelser) (før b3bbaca0…) · v3.16.6 M5: frisparket = tick'ets forseelse (motor; før e1ab251c…) · v3.16.5: kun tekst – noprose uændret (før b91c88f5…) · v3.16.4: kun ur (clock/stoppage) – noprose uændret (før d46c1314…) · v3.16.3: kun tekst – noprose uændret (tools/fingerprint.mjs; før 7648f4ef… – vary, målets linje, fuldtidsanalysen – og før det 072a48cf… fra v3.16.2) · v3.16.1 sammenpresning i stedet for klemning (bevidst ændret motor: modtagervalget læser positionerne – før d67fad2a… fra v3.16) · v3.16 koblede linjer + SHOT_REACH (bevidst ændret motor: modtagervalg, langskud, kontra, kant efter pres – før 9ae07870… fra v3.15.1)
export function goldenMatches() {
  const out = [];
  for (let s = 1; s <= 20; s++) {
    const L = createLeague(createRng(s * 97));
    const me = L.teams.find((t) => !t.isBot), opp = L.teams[(s % 7) + 1];
    out.push(s % 2 ? simulateMatch(me, opp, createRng(s * 131)) : simulateMatch(opp, me, createRng(s * 131)));
  }
  return out;
}
const strip = (m) => { const { trace, ...rest } = m; return rest; };

test('fingeraftryk: 20 seedede kampe er uændrede af optagelsen (hash af hele resultatet uden sporet)', () => {
  const ms = goldenMatches();
  const types = new Set(ms.flatMap((m) => m.events.map((e) => e.type)));
  for (const t of ['RED', 'SUB', 'TRIGGER', 'GOAL', 'VAR_CHECK']) assert.ok(types.has(t), `data: udvalget rummer ${t}`);
  assert.ok(ms.some((m) => m.events.some((e) => e.snapshot)), 'data: 📍-billeder');
  const h = createHash('sha256').update(JSON.stringify(ms.map(strip))).digest('hex');
  assert.equal(h, GOLDEN);
});
