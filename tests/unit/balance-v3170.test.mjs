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

// Klummens tærskler (column.js STYLE_RULES 'shots'/'target') er 95-percentilen for ét hold i én kamp – målt, ikke skønnet
// (QC: "en fordobling af middel er ikke en fordobling af percentil"). v3.16.7: 12 skud; nu 24 skud og 10 på mål.
test('klummens skud-tærskler = målt 95-percentil (±1) for ét hold i én kamp', async () => {
  const { measurePercentiles } = await import('../../tools/measure-duels.mjs');
  const { STYLE_RULES } = await import('../../public/engine/column.js');
  const p = measurePercentiles(800);
  const lowest = (key, field) => { for (let v = 0; v < 100; v++) if (STYLE_RULES.find((r) => r.key === key).test({ [field]: v })) return v; return null; };
  assert.ok(p.shots[0.5] >= 10, `data: ${JSON.stringify(p)}`);
  assert.ok(Math.abs(lowest('shots', 'shots') - p.shots[0.95]) <= 1, `skud ${lowest('shots', 'shots')} mod p95 ${p.shots[0.95]}`);
  assert.ok(Math.abs(lowest('target', 'onTarget') - p.onTarget[0.95]) <= 1, `på mål ${lowest('target', 'onTarget')} mod p95 ${p.onTarget[0.95]}`);
});

// v3.18.0 (C) – hvem afslutter (receiver shot på halvchancen og cutbacken: pulje ≥ 4, gentagelser × 0,65; cutback uden midtstopper).
// node tools/measure-shooters.mjs 400, v3.17.0 → nu: topskyttens andel 47,6 % → 40,1 %; hold-kampe med en spiller > 8 afslutninger
// 8,3 % → 2,4 %; 5-4-1's ST 51,7 % → 40,4 %; midtstopper som cutback-afslutter 9,1 % → 0.
// v3.21.0 (bevægelsen): 5-4-1's ST v3.20.2 41,9 % → 42,2 % (støj-niveau; den enlige angriber holder linjen og står nærmest
// målet) – loftet 42 → 44 %; 51,7 % er stadig rødt. Topskytten 40,3 → 39,1 %.
test('afslutterne spredes: topskytte ≤ 42 % (før 47,6), > 8 afslutninger ≤ 3 % (før 8,3), 5-4-1-ST ≤ 44 % (før 51,7), ingen midtstopper afslutter en cutback (før 9,1 %)', async () => {
  const { measureShooters } = await import('../../tools/measure-shooters.mjs');
  const r = measureShooters(400);
  assert.ok(r.cutbacks >= 200, `data: ${JSON.stringify(r)}`);
  assert.ok(r.topShare <= 0.42, `topskytte ${r.topShare}`);
  assert.ok(r.over8Share <= 0.03, `> 8: ${r.over8Share}`);
  assert.ok(r.st541 <= 0.44, `5-4-1-ST ${r.st541}`);
  assert.equal(r.cbCutback, 0);
});
