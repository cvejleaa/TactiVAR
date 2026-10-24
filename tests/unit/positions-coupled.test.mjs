// v3.16 koblede linjer (positions.js coupledPositions; Spilfører: angriberne stod bag modstanderens sidste forsvarer i ≈100 %
// af billederne). Bogstavelige tal for 4-4-2 mod 4-4-2 og 4-3-3 – ikke funktionen mod sig selv.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { coupledPositions, livePositions, RUN_STEP } from '../../public/engine/positions.js';

const T = (f, press = 'MID_BLOCK', runs = 'NORMAL') => ({ baseFormation: f, customCoords: {}, phases: { phase1_buildUp: { offBallRuns: runs }, phase2_defending: { pressingHeight: press } } });
const ys = (list) => list.map((p) => p.y);

// v3.16.1: holdet presses lineært SAMMEN (squeeze) i stedet for at klemmes – de inden for SQUEEZE_SPAN (12) af linjen mappes fra
// [forreste, linje + 1 + 12] til [linje + 1, linje + 1 + 12]; rækkefølgen bevares, og bagkæden står, hvor den stod.
test('holdet med bolden presses sammen på eller bag linjen: ST 14 → 28 mod mellemblok (linje 27), midtbanen 29/32 → 35/36 bag ham; 18 mod lav blok (17), LM 29 → 29; bagkæde og målmand urørte', () => {
  const mid = coupledPositions(T('4-4-2'), T('4-4-2', 'MID_BLOCK'));
  assert.equal(mid.line, 27);
  // [14, 40] til [28, 40]: LM 29 → 34,9 → 35, CM 32 → 36,3 → 36 (klemt: 29/32 – midtbanen stod så på linje med angriberne)
  assert.deepEqual(ys(mid.ball), [90, 50, 59, 59, 50, 35, 36, 36, 35, 28, 28]);   // rå: ST 14 (før: bag linjen)
  assert.deepEqual(ys(livePositions(T('4-4-2'), { attacking: true })).slice(9), [14, 14]);
  const low = coupledPositions(T('4-4-2'), T('4-4-2', 'LOW_BLOCK'));
  assert.equal(low.line, 17);
  assert.deepEqual(ys(low.ball).slice(5), [29, 32, 32, 29, 18, 18]);   // [14, 30] til [18, 30]: LM 29 → 29,3 → 29, CM 32 urørt (≥ 30)
  for (const r of [mid, low]) {
    assert.ok(r.ball.slice(1).every((p) => p.y >= r.line + 1), 'ingen foran linjen');
    const y = ys(r.ball);
    assert.ok(y[9] < y[5] && y[5] < y[6] && y[5] < y[1], `rækkefølgen bevaret: ${y}`);   // angreb foran midtbane foran bagkæde
  }
});

test('løberen, der har vundet sit løb, er sluppet igennem (RUN_STEP fra sin plads, foran linjen)', () => {
  const r = coupledPositions(T('4-4-2'), T('4-4-2'), { runner: 9 });
  assert.equal(r.ball[9].y, 8);   // 14 − RUN_STEP 12 = 2, klemt ved FRONT_LIMIT 8 – foran linjen 27
  assert.equal(RUN_STEP, 12);
  assert.equal(r.ball[10].y, 28);
});

test('holdet uden bold rykker som en blok efter sit pres – lav blok dybt, gegenpres højt; rækkefølgen bevares (QC B3)', () => {
  const opp = (p) => ys(coupledPositions(T('4-4-2'), T('4-3-3', p)).opp);
  // ønsket 100 − 59 + PRESS_GAP: lav blok 61, mellemblok 51, gegenpres 43; de forreste mappes fra [forreste, ønsket + 12] til [ønsket, ønsket + 12]
  // lav blok: [26, 73] → CDM 65 → 71, CM 54 → 68,1 → 68, LW 32 → 62,5 → 63, ST 61
  assert.deepEqual(opp('LOW_BLOCK'), [90, 80, 83, 83, 80, 71, 68, 68, 63, 61, 63]);
  // mellemblok: [16, 63] → CDM 55 → 61, CM 44 → 58,1 → 58, LW 22 → 52,5 → 53, ST 51
  assert.deepEqual(opp('MID_BLOCK'), [90, 70, 73, 73, 70, 61, 58, 58, 53, 51, 53]);
  // gegenpres (front −12, ST rå 4 → FRONT_LIMIT 8): [8, 55] → CDM 43 → 51,9 → 52, CM 32 → 49,1 → 49, LW 10 → 43,5 → 44, ST 43
  assert.deepEqual(opp('HIGH_GEGENPRESS'), [90, 70, 73, 73, 70, 52, 49, 49, 44, 43, 44]);
  // Angriberne foran midtbanen foran forsvaret i alle tre (ikke klemt til samme række)
  for (const p of ['LOW_BLOCK', 'MID_BLOCK', 'HIGH_GEGENPRESS']) { const y = opp(p); assert.ok(y[9] < y[6] && y[6] < y[2], `${p}: ${y}`); }
});

test('kontra (caught): vinderen står i forsvarsform, taberen fanget fremme i sin angrebsform – ikke rykket hjem', () => {
  const r = coupledPositions(T('4-4-2'), T('4-4-2'), { caught: true });
  assert.equal(r.line, 41);
  assert.deepEqual(ys(r.opp), ys(livePositions(T('4-4-2'), { attacking: true })));
  assert.deepEqual(ys(r.ball).slice(9), [42, 42]);
});
