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
  assert.equal(r.roles.CB ?? 0, 0, JSON.stringify(r.roles));
  assert.ok((r.roles.CM ?? 0) + (r.roles.LM ?? 0) + (r.roles.RM ?? 0) > r.lines / 2, JSON.stringify(r.roles));
  assert.equal(r.self, 0);
});
