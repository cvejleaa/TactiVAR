// Levende positioner (v3.12.1, brugeren: "Det her er ikke godt nok 'Spillerne står på deres plads, de
// bevæger sig ikke under kampen.' Vi måler hvor langt de løber … løbe uden bold").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { livePositions, ADVANCE, RUNS_PUSH, SHAPE, BALL_PULL, FRONT_LIMIT, RUN_STEP } from '../../public/engine/positions.js';
import { FORMATIONS } from '../../public/engine/formations.js';

const tac = (o = {}) => ({ baseFormation: '4-4-2', customCoords: {}, phases: { phase1_buildUp: { offBallRuns: 'NORMAL' }, phase2_defending: { pressingHeight: 'MID_BLOCK' } }, ...o });
const F = FORMATIONS['4-4-2'];   // 0 GK, 1 LB, 2–3 CB, 4 RB, 5 LM, 6–7 CM, 8 RM, 9–10 ST

test('med bolden rykker hver rolle sit stykke frem (CB 14, back 20, midtbane 16, angreb 6); målmanden bliver', () => {
  const p = livePositions(tac(), { attacking: true });
  assert.deepEqual(p[0], { x: F[0].x, y: F[0].y });
  assert.equal(p[2].y, F[2].y - ADVANCE.CB); assert.equal(p[1].y, F[1].y - ADVANCE.FB);
  assert.equal(p[6].y, F[6].y - ADVANCE.MID); assert.equal(p[5].y, F[5].y - ADVANCE.MID);
  assert.equal(p[9].y, F[9].y - ADVANCE.ATT);
  assert.deepEqual([ADVANCE.CB, ADVANCE.FB, ADVANCE.MID, ADVANCE.ATT], [14, 20, 16, 6]);
});
test('uden bolden ligger holdet efter sit pres: lav blok alle 10 tilbage, højt gegenpres midtbane og angreb 12 frem, mellemblok på pladsen', () => {
  const at = (press) => livePositions(tac({ phases: { phase1_buildUp: { offBallRuns: 'NORMAL' }, phase2_defending: { pressingHeight: press } } }), { attacking: false });
  assert.deepEqual([at('LOW_BLOCK')[2].y, at('LOW_BLOCK')[9].y], [F[2].y + 10, F[9].y + 10]);
  assert.deepEqual([at('HIGH_GEGENPRESS')[2].y, at('HIGH_GEGENPRESS')[6].y, at('HIGH_GEGENPRESS')[9].y], [F[2].y, F[6].y - 12, F[9].y - 12]);
  assert.deepEqual(at('MID_BLOCK').map((q) => q.y), F.map((c) => c.y));
  assert.deepEqual(SHAPE.LOW_BLOCK, { all: 10, front: 0 }); assert.deepEqual(SHAPE.HIGH_GEGENPRESS, { all: 0, front: -12 });
});
test('løb uden bold skubber de samme roller, som løber flere km (backs, CM/CDM, ST) – ikke kanterne eller stopperne', () => {
  const at = (runs) => livePositions(tac({ phases: { phase1_buildUp: { offBallRuns: runs }, phase2_defending: { pressingHeight: 'MID_BLOCK' } } }), { attacking: true });
  const many = at('MANY'), few = at('FEW'), normal = at('NORMAL');
  for (const i of [1, 4, 6, 7, 9, 10]) { assert.equal(many[i].y, normal[i].y - RUNS_PUSH.MANY, `plads ${i}`); assert.equal(few[i].y, normal[i].y - RUNS_PUSH.FEW, `plads ${i}`); }
  for (const i of [2, 3, 5, 8]) assert.equal(many[i].y, normal[i].y, `plads ${i} (CB/kant) rykker ikke ekstra`);
  assert.deepEqual([RUNS_PUSH.FEW, RUNS_PUSH.MANY], [-2, 6]);
});
test('løberen står RUN_STEP længere fremme end sin levende position – aldrig baglæns (QC), og ingen kommer forbi FRONT_LIMIT', () => {
  const many = tac({ phases: { phase1_buildUp: { offBallRuns: 'MANY' }, phase2_defending: { pressingHeight: 'MID_BLOCK' } } });
  const base = livePositions(many, { attacking: true }), run = livePositions(many, { attacking: true, runner: 1 });
  assert.equal(run[1].y, base[1].y - RUN_STEP); assert.ok(run[1].y < base[1].y);
  assert.deepEqual(run.filter((_, i) => i !== 1), base.filter((_, i) => i !== 1));
  const st = livePositions(many, { attacking: true, runner: 9 });
  assert.equal(st[9].y, FRONT_LIMIT, 'angriberen klemmes ved målfeltet');
});
test('holdet forskydes mod boldsiden (x + (bold − 50)·0,3) og klemmes inden for banen', () => {
  const right = livePositions(tac(), { attacking: true, ballX: 88 }), mid = livePositions(tac(), { attacking: true, ballX: 50 });
  assert.equal(right[6].x - mid[6].x, Math.round(38 * BALL_PULL));
  assert.equal(right[8].x, Math.min(97, Math.round(F[8].x + 38 * BALL_PULL)));
  assert.equal(livePositions(tac(), { attacking: true, ballX: 0 })[1].x, 3);
});
test('trukne pladser er udgangspunktet: en trukket CM rykker frem fra den trukne plads', () => {
  const p = livePositions(tac({ customCoords: { 6: { x: 50, y: 30 } } }), { attacking: true });
  assert.deepEqual(p[6], { x: 50, y: 30 - ADVANCE.MID });
});
