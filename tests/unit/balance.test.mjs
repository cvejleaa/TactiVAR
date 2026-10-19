// Balancen i fase-duellen målt på rigtige, seedede ligaer (tools/measure-duels.mjs).
// Før v3.6 vandt opbygningen 96,8 % – båndene herunder er røde mod det.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measure } from '../../tools/measure-duels.mjs';

const phases = (pass, focus, height) => (t) => {
  Object.assign(t.tactics.phases.phase1_buildUp, { passingStyle: pass, attackFocus: focus });
  Object.assign(t.tactics.phases.phase2_defending, { pressingHeight: height, offsideTrap: 'OFF' });
};

test('fase-duellen: opbygning vinder 45–68 % med ligaens taktikker (før 96,8 %)', () => {
  const r = measure(null, 3, 5);
  assert.ok(r.rate > 0.45 && r.rate < 0.68, String(r.rate));
});

test('fase-duellen: den rigtige mod-stil mærkes (≥ 65 %), neutralt er tæt på lige (40–62 %)', () => {
  const neutral = measure(phases('BALANCED', 'LOW_CUTBACKS', 'MID_BLOCK'), 2, 5).rate;
  const pressRight = 1 - measure(phases('SHORT', 'LOW_CUTBACKS', 'HIGH_GEGENPRESS'), 2, 5).rate;
  const buildRight = measure(phases('DIRECT_LONG', 'LOW_CUTBACKS', 'HIGH_GEGENPRESS'), 2, 5).rate;
  assert.ok(neutral > 0.4 && neutral < 0.62, `neutral ${neutral}`);
  assert.ok(pressRight >= 0.65, `pres med mod-stil ${pressRight}`);
  assert.ok(buildRight >= 0.65 && buildRight < 0.9, `opbygning med mod-stil ${buildRight}`);
});

test('mod-kunnen: startelleverens bedste værdi stiger højst 3 pr. runde i snit (før ≈ 8)', () => {
  const s = measure(null, 3, 5).series;
  const gain = s.reduce((a, x) => a + (x[3] - x[0]), 0) / s.length / 3;
  assert.ok(gain > 0 && gain <= 3, String(gain));
});

// v3.7 (brugeren: "rundens mål er altid VAR-dramatik"): før vandt VAR-mål hver gang.
test('rundens mål: flere typer vinder, ingen over 50 %, VAR under 40 %; friskheden falder over en sæson', async () => {
  const { measureSeason } = await import('../../tools/measure-duels.mjs');
  const r = measureSeason(8, 6);
  assert.ok(Object.keys(r.kinds).length >= 4, JSON.stringify(r.kinds));
  assert.ok(Object.values(r.kinds).every((v) => v <= 0.5), JSON.stringify(r.kinds));
  assert.ok((r.kinds.VAR ?? 0) < 0.4, JSON.stringify(r.kinds));
  // Før v3.7 lå startelleverne på ≈95–100 % efter flere runder; nu mærkes trætheden
  assert.ok(r.freshMe < 85, String(r.freshMe));
});

test('andel højintenst løb: markspillere 6–13 % i snit (topdivisioner ≈7–12 %), målmænd under 4 %', async () => {
  const { measureSeason } = await import('../../tools/measure-duels.mjs');
  const { hi } = measureSeason(4, 1);
  for (const k of ['DEF', 'MID', 'ATT']) assert.ok(hi[k] >= 6 && hi[k] <= 13, `${k} ${hi[k]}`);
  assert.ok(hi.GK < 4, `GK ${hi.GK}`);
});
