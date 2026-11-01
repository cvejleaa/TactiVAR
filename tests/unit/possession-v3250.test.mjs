// v3.25.0 (nr. 38, brugerens valg 2026-11-01 – Hattrick: "midtbanen afgør chancemængden"): flere på midten giver mere bold,
// med aftagende udbytte og et loft. Før (v3.24.6, tools/measure-wide.mjs 60 = 840 kampe pr. formation): 4-3-3 53,7 %,
// 5-3-2 55,6 %, 4-1-4-1 48,3 %, 4-2-3-1 47,3 % bold – en ekstra midtbanespiller KOSTEDE bold; ≥ 80 % bold i 2–6,3 % af
// kampene; netto pr. formation fra −0,413 (4-2-3-1) til +0,258 (5-3-2). Båndene er røde på de tal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureWide } from '../../tools/measure-wide.mjs';
import { MID_EXTRA, POSS_DIFF_CAP } from '../../public/engine/match.js';
import { midCountOf } from '../../public/ui/tactics.js';

test('tillægget aftager og 4 på midten er som før; loftet ligger på 1,5 (≈ 70 % pr. tick)', () => {
  assert.equal(MID_EXTRA[4], 0, '4 på midten = gennemsnittet som før v3.25');
  assert.ok(MID_EXTRA[3] < 0 && MID_EXTRA[5] > 0);
  const step = [2, 3, 4, 5, 6, 7].map((n) => MID_EXTRA[n]);
  for (let i = 1; i < step.length; i++) assert.ok(step[i] > step[i - 1], `stigende ${step}`);
  const gains = step.slice(2).map((v, i, a) => (i ? v - a[i - 1] : null)).filter((x) => x != null);   // 4→5, 5→6, 6→7
  for (let i = 1; i < gains.length; i++) assert.ok(gains[i] < gains[i - 1], `aftagende ${gains}`);
  assert.equal(POSS_DIFF_CAP, 1.5);
  assert.deepEqual(['4-3-3', '4-4-2', '4-1-4-1', '3-5-2', '5-3-2'].map(midCountOf), [3, 4, 5, 5, 3], 'formationens midtbanepladser (ankrets dybde)');
});

test('målt: 5 på midten har mere bold end 3 (3–10 point), ingen kamp-ekstremer, formationerne tættere i netto', async () => {
  const r = await measureWide(30, undefined, ['4-3-3', '4-4-2', '4-1-4-1', '4-2-3-1', '5-3-2', '3-5-2']);
  const p = (f) => r[f].poss;
  assert.ok(p('4-3-3') <= 0.51, `4-3-3 ${p('4-3-3')} (før 0,537)`);
  assert.ok(p('4-1-4-1') >= 0.51, `4-1-4-1 ${p('4-1-4-1')} (før 0,483)`);
  assert.ok(p('5-3-2') <= 0.51, `5-3-2 ${p('5-3-2')} (før 0,556)`);
  const gap = p('4-1-4-1') - p('4-3-3');
  assert.ok(gap >= 0.03 && gap <= 0.10, `4-1-4-1 − 4-3-3 = ${gap.toFixed(3)} (før −0,054)`);
  for (const f of Object.keys(r)) assert.ok(r[f].extreme <= 0.02, `${f}: ≥ 80 % bold i ${r[f].extreme} af kampene (før op til 0,063)`);
  const nets = Object.values(r).map((x) => x.net);
  assert.ok(Math.max(...nets) - Math.min(...nets) <= 0.45, `netto-spænd ${nets.join(' / ')} (før 0,67)`);
  assert.ok(r['4-1-4-1'].net >= -0.3 && r['4-2-3-1'].net >= -0.3, `5 på midten må ikke falde: ${r['4-1-4-1'].net} / ${r['4-2-3-1'].net} (før −0,40 / −0,41)`);
});
