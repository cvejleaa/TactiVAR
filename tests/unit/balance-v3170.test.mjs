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

// A – "fuldt realistisk" (brugerens valg): ≈ 25 afslutninger og ≈ 30 % af skuddene på mål går ind. node tools/measure-duels.mjs 400 skud:
// skud 12,1 → 25,6; konvertering (mål pr. skud på mål) 0,61 → 0,29; xG/mål 0,78 → 0,99; Højdepunkter 13,4 → 14,4 trin (halvchancen
// vises kun som mål); målmand 6 mod 16: 2,48 → 2,47 flere mål imod (bevaret, ikke forstærket – den betød allerede meget).
test('afslutningerne: 22–28 skud (før 12,1), konvertering 0,25–0,38 (før 0,61), xG/mål 0,85–1,15 (før 0,78), Højdepunkter ≤ 16 trin, målmanden betyder ≥ 1,5 mål', async () => {
  const { measureShots, measureKeeper } = await import('../../tools/measure-duels.mjs');
  const r = measureShots(400);
  assert.ok(r.games === 400 && r.goals > 2, `data: ${JSON.stringify(r)}`);
  assert.ok(r.shots >= 22 && r.shots <= 28, `skud ${r.shots}`);
  assert.ok(r.conversion >= 0.25 && r.conversion <= 0.38, `konvertering ${r.conversion}`);
  assert.ok(r.xgPerGoal >= 0.85 && r.xgPerGoal <= 1.15, `xG/mål ${r.xgPerGoal}`);
  assert.ok(r.highlightSteps <= 16, `Højdepunkter ${r.highlightSteps} trin`);
  const kp = measureKeeper(200);
  assert.ok(kp.diff >= 1.5, `målmand 6 mod 16: ${JSON.stringify(kp)}`);
});
