// v3.18.0 (9): livsløbet over 10 sæsoner – node tools/measure-lifecycle.mjs 5 10 passiv. Tallene ved udgivelsen (5 seeds):
// nøgle-evner sæson 10/1 0,97–0,99 · snitalder 24,1–24,7 · 33+ 5–7 % · samlet kasse 0,94–1,46 · hold i minus 0 ·
// transfers 14–23 · ungdom, der når startniveau (nøglesnit ≥ 12) inden 23: 14–28 % · gem 0,90–0,94 MB · dit hold (passivt) aldrig i minus.
// Rødt mod v3.17.0 (ingen aldring, pension, ungdom eller transfers): pensioner, ungdom og transfers er 0 dér.
// Undervejs: pension fra 33/sikker 37 gav snitalder 28,7 og 33+ 29 %; ungdom + 5 gav 35–45 % startere; ungdom som 2★ gav kasse ≈ 0,5.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measureLifecycle } from '../../tools/measure-lifecycle.mjs';

const runs = [1, 2, 3].map((s) => measureLifecycle(s, 10, 'passiv'));
const each = (f) => runs.forEach((r, i) => f(r, i + 1));

test('livsløb: evnerne holder niveau (0,95–1,05), snitalderen 23–26 og højst 8 % er 33+', () => each((r, s) => {
  assert.ok(r.keyRatio >= 0.95 && r.keyRatio <= 1.05, `seed ${s}: ${r.keyRatio}`);
  assert.ok(r.avgAge >= 23 && r.avgAge <= 26, `seed ${s}: ${r.avgAge}`);
  assert.ok(r.old33 < 0.08, `seed ${s}: ${r.old33}`);
}));

test('økonomi: samlet kasse 0,8–1,6 af start, højst 1 hold i minus – og dit hold (passivt) kommer aldrig i minus', () => each((r, s) => {
  assert.ok(r.cashRatio >= 0.8 && r.cashRatio <= 1.6, `seed ${s}: ${r.cashRatio}`);
  assert.ok(r.teamsMinus <= 1, `seed ${s}: ${r.teamsMinus}`);
  assert.equal(r.myMinusRounds, 0, `seed ${s}`);
}));

test('trupper og marked: botterne har 18–25 (snit 19–23), der handles (mindst 5 på 10 sæsoner – v3.17.0: 0)', () => each((r, s) => {
  assert.ok(r.botSquads.every((n) => n >= 18 && n <= 25), `seed ${s}: ${r.botSquads}`);
  const avg = r.botSquads.reduce((a, b) => a + b, 0) / r.botSquads.length;
  assert.ok(avg >= 19 && avg <= 23, `seed ${s}: ${avg}`);
  assert.ok(r.transfers >= 5, `seed ${s}: ${r.transfers}`);
}));

test('ungdom: 10–30 % når startniveau inden 23 år (v3.17.0: ingen ungdom)', () => each((r, s) => {
  assert.ok(r.youthStarter != null && r.youthStarter >= 0.1 && r.youthStarter <= 0.3, `seed ${s}: ${r.youthStarter}`);
}));

test('gemmet: under 1 MB efter 10 sæsoner (gem + 3 backups under 4 MB), og sanitize finder intet', () => each((r, s) => {
  assert.ok(r.saveBytes < 1000000, `seed ${s}: ${r.saveBytes}`);
  assert.deepEqual(r.sanitizeProblems, [], `seed ${s}`);
}));
