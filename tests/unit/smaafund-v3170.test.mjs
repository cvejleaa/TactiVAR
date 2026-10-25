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
