// v3.17.0 – balance-gennemgangen. Hvert bånd er rødt mod v3.16.7 (gamle tal i parentes; node tools/measure-duels.mjs N skud|opbygning).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureBuild } from '../../tools/measure-duels.mjs';

// B – opbygningen styrer chancen (BUILD_LIFT_P/OPEN_DAMP_P): 1000 kampe, holdet med bolden pr. tick. Kvaliteten, ikke kun antallet (QC):
// xG pr. tick efter vundet opbygning / uden duel 1,02 → 3,1; hovedchancer (xG-spring ≥ 0,13) 1,03 → 3,7; korrelation mellem
// forskellen i vundne opbygninger og måldifferencen 0,45 → 0,55.
test('opbygningen styrer chancen: xG-løft ≥ 2,5 (før 1,02), hovedchance-løft ≥ 2,5 (før 1,03), korrelation ≥ 0,5 (før 0,45)', () => {
  const r = measureBuild(1000);
  assert.ok(r.xgNone > 0.02 && r.bigRun > 0.2, `data: ${JSON.stringify(r)}`);
  assert.ok(r.xgLift >= 2.5, `xG-løft ${r.xgLift}`);
  assert.ok(r.bigLift >= 2.5, `hovedchance-løft ${r.bigLift}`);
  assert.ok(r.corr >= 0.5, `korrelation ${r.corr}`);
});
