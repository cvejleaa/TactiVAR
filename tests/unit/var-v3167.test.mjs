// v3.16.7 M1 (Spilfører): VAR tjekker ikke offside, hvor der ikke kan være offside – direkte fra hjørnespark, på oplægsgiveren
// selv, og linjedommeren vinker ikke efter en cutback (bolden spillet tilbage). Målt i tools/measure-var-offside.mjs:
// 1500 kampe før 16 / 10 / 4, efter 0 / 0 / 0 (offsidetjek 326 → 311, mål 4156 → 4194 – rng-forskydningen).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureVarOffside } from '../../tools/measure-var-offside.mjs';

test('VAR-offside: ingen tjek på hjørnesparksmål, ingen flag efter cutback, aldrig oplægsgiveren selv (1500 kampe)', async () => {
  const r = await measureVarOffside(1500);
  assert.ok(r.offsideChecks >= 200 && r.goals >= 3000, `data: ${JSON.stringify(r)}`);
  assert.equal(r.cornerOffside, 0); assert.equal(r.flagAfterCutback, 0); assert.equal(r.helperOffside, 0);
});
