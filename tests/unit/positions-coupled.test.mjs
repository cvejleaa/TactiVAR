// v3.16 koblede linjer (positions.js coupledPositions; Spilfører: angriberne stod bag modstanderens sidste forsvarer i ≈100 %
// af billederne). Bogstavelige tal for 4-4-2 mod 4-4-2 og 4-3-3 – ikke funktionen mod sig selv.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coupledPositions, livePositions, RUN_STEP } from '../../public/engine/positions.js';

const T = (f, press = 'MID_BLOCK', runs = 'NORMAL') => ({ baseFormation: f, customCoords: {}, phases: { phase1_buildUp: { offBallRuns: runs }, phase2_defending: { pressingHeight: press } } });
const ys = (list) => list.map((p) => p.y);

test('holdet med bolden står på eller bag linjen: ST 14 → 28 mod mellemblok (linje 27), 18 mod lav blok (17); stoppere og målmand urørte', () => {
  const mid = coupledPositions(T('4-4-2'), T('4-4-2', 'MID_BLOCK'));
  assert.equal(mid.line, 27);
  assert.deepEqual(ys(mid.ball), [90, 50, 59, 59, 50, 29, 32, 32, 29, 28, 28]);   // rå: ST 14 (før: bag linjen)
  assert.deepEqual(ys(livePositions(T('4-4-2'), { attacking: true })).slice(9), [14, 14]);
  const low = coupledPositions(T('4-4-2'), T('4-4-2', 'LOW_BLOCK'));
  assert.equal(low.line, 17);
  assert.deepEqual(ys(low.ball).slice(9), [18, 18]);
  for (const r of [mid, low]) assert.ok(r.ball.slice(1).every((p) => p.y >= r.line + 1), 'ingen foran linjen');
});

test('løberen, der har vundet sit løb, er sluppet igennem (RUN_STEP fra sin plads, foran linjen)', () => {
  const r = coupledPositions(T('4-4-2'), T('4-4-2'), { runner: 9 });
  assert.equal(r.ball[9].y, 8);   // 14 − RUN_STEP 12 = 2, klemt ved FRONT_LIMIT 8 – foran linjen 27
  assert.equal(RUN_STEP, 12);
  assert.equal(r.ball[10].y, 28);
});

test('holdet uden bold rykker som en blok efter sit pres – lav blok dybt, gegenpres højt; rækkefølgen bevares (QC B3)', () => {
  const opp = (p) => ys(coupledPositions(T('4-4-2'), T('4-3-3', p)).opp);
  assert.deepEqual(opp('LOW_BLOCK'), [90, 80, 83, 83, 80, 83, 72, 72, 67, 61, 67]);
  assert.deepEqual(opp('MID_BLOCK'), [90, 70, 73, 73, 70, 73, 62, 62, 57, 51, 57]);
  assert.deepEqual(opp('HIGH_GEGENPRESS'), [90, 70, 73, 73, 70, 61, 50, 50, 45, 43, 45]);
  // Angriberne foran midtbanen foran forsvaret i alle tre (ikke klemt til samme række)
  for (const p of ['LOW_BLOCK', 'MID_BLOCK', 'HIGH_GEGENPRESS']) { const y = opp(p); assert.ok(y[9] < y[6] && y[6] < y[2], `${p}: ${y}`); }
});

test('kontra (caught): vinderen står i forsvarsform, taberen fanget fremme i sin angrebsform – ikke rykket hjem', () => {
  const r = coupledPositions(T('4-4-2'), T('4-4-2'), { caught: true });
  assert.equal(r.line, 41);
  assert.deepEqual(ys(r.opp), ys(livePositions(T('4-4-2'), { attacking: true })));
  assert.deepEqual(ys(r.ball).slice(9), [42, 42]);
});
