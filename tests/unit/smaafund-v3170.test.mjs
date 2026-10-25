// v3.17.0 – småfund fra Spilførerens gennemgang af v3.16.7 (motoren)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureStaleSub } from '../../tools/measure-stale-sub.mjs';

// Listerne (hR/aR) bygges igen efter skadesskiftet: tools/measure-stale-sub.mjs, 1500 kampe – linjer i skade-tick'et efter
// skiftet, der nævner den udskiftede (gult kort i det stille frispark, afslutning, VAR): 17 → 0 af ≈1110 skadesskift.
test('skadesskift: den udskiftede nævnes ikke i resten af minuttet (1500 kampe; før 17 gange)', () => {
  const r = measureStaleSub(1500);
  assert.ok(r.subs >= 800, `data: ${r.subs} skadesskift`);
  assert.equal(r.stale, 0, r.examples.join('\n'));
});

// Indlæggets tager (crossTaker): kant (WIDE_ROLES) eller midtbane – tools/measure-setpiece-takers.mjs, 3000 kampe, dødboldsmål:
// midtstopper som tager 212 af 1066 (19,9 %) → 0 af 1169. Tageren header aldrig selv sit eget indlæg (headerTarget).
test('dødboldtageren: aldrig en midtstopper, når kant/midtbane findes (3000 kampe; før 19,9 %) – og aldrig sin egen header', async () => {
  const { measureSetPieceTakers } = await import('../../tools/measure-setpiece-takers.mjs');
  const r = measureSetPieceTakers(3000);
  assert.ok(r.lines >= 800, `data: ${r.lines} dødboldsmål`);
  // Rollen er STARTrollen: en femmerkædes stopper, der efter Hvis-Så (5-3-2/5-4-1 → 4-4-2) er rykket op på midtbanen, må gerne
  assert.ok((r.roles.CB ?? 0) / r.lines <= 0.01, JSON.stringify(r.roles));
  assert.ok((r.roles.CM ?? 0) + (r.roles.LM ?? 0) + (r.roles.RM ?? 0) > r.lines / 2, JSON.stringify(r.roles));
  assert.equal(r.self, 0);
});

// "Mit bud" (Spilfører v3.16.7: "omorganiserede sig" i 5 af 12): hver bot-profil har sin egen Hvis-Så (eller ingen), og et
// skift til den formation, holdet allerede spiller, sker ikke. tools/measure-scout.mjs, 20 sæsoner à 10 runder:
// 'switch' 24,4 % → 11,9 % af buddene.
test('"Mit bud": \'switch\' højst 18 % af spejderens bud (20 sæsoner; før 24,4 %)', async () => {
  const { measureScout } = await import('../../tools/measure-scout.mjs');
  const r = measureScout(20);
  assert.ok(r.n >= 1000, `data: ${r.n} bud`);
  assert.ok(r.share.switch <= 0.18 && r.share.switch >= 0.05, JSON.stringify(r.share));
});

test('Hvis-Så til samme formation (bot): intet skift, ingen linje og ingen ombytning – samme regel fra en anden formation skifter', async () => {
  const { createRng } = await import('../../public/engine/rng.js');
  const { createLeague } = await import('../../public/engine/generator.js');
  const { simulateMatch } = await import('../../public/engine/match.js');
  const old = (to) => [{ ruleId: 1, minuteTrigger: 65, condition: 'TRAILING', margin: 1, newFormation: to, newPlan: null, slotRemapping: [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10], action: 'SHIFT', subOut: null, subIn: null }];
  let same = 0, other = 0, fired = 0;
  for (let s = 1; s <= 200; s++) {
    const L = createLeague(createRng(s)), T = L.teams[7], O = L.teams[(s % 6) + 1];   // 3-4-3-bot
    assert.equal(T.tactics.baseFormation, '3-4-3');
    T.tactics.conditionalRules = old('3-4-3');
    const m = simulateMatch(T, O, createRng(s * 31));
    const trailing = m.events.some((e) => e.min >= 65 && e.hG < e.aG);
    if (trailing) same += m.events.filter((e) => e.type === 'TRIGGER' && e.isHome).length;
    const L2 = createLeague(createRng(s)), T2 = L2.teams[7];
    T2.tactics.conditionalRules = old('4-4-2');
    const m2 = simulateMatch(T2, L2.teams[(s % 6) + 1], createRng(s * 31));
    if (m2.events.some((e) => e.type === 'TRIGGER' && e.isHome)) { other++; fired++; }
  }
  assert.ok(fired >= 20, `data: ${fired} skift fra 3-4-3 til 4-4-2`);
  assert.equal(same, 0);
});
