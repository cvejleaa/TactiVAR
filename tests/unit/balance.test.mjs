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

test('løb pr. plads følger dokumentet: CM længst, wingbacks/kanter flest HI, stoppere færrest km og HI; målmænd under 4 % HI', async () => {
  const { measureSeason } = await import('../../tools/measure-duels.mjs');
  const { hi, km } = measureSeason(4, 1);
  for (const k of ['CB', 'FB', 'CM', 'WB/kant', 'CAM/CF', 'ST']) assert.ok(hi[k] >= 4 && hi[k] <= 15, `${k} ${hi[k]}`);
  assert.ok(hi.GK < 4, `GK ${hi.GK}`);
  for (const k of ['FB', 'WB/kant', 'CAM/CF', 'ST', 'CB']) assert.ok(km.CM > km[k], `CM ${km.CM} > ${k} ${km[k]}`);
  for (const k of ['CM', 'CAM/CF', 'ST', 'CB']) assert.ok(hi['WB/kant'] > hi[k], `WB/kant ${hi['WB/kant']} > ${k} ${hi[k]}`);
  for (const k of ['FB', 'WB/kant', 'CM', 'CAM/CF', 'ST']) assert.ok(km.CB < km[k] && hi.CB < hi[k], `CB under ${k}`);
  // Røde mod v3.7.1 (pr. kæde): back og stopper løb ens (forskel 0), og CM − CB var ≈1,4 km (nu ≈2,4).
  assert.ok(hi.FB - hi.CB >= 4, `FB ${hi.FB} − CB ${hi.CB}`);
  assert.ok(km.CM - km.CB >= 2, `CM ${km.CM} − CB ${km.CB}`);
});

// ---------- v3.9: løb uden bold – ingen indstilling vinder over alt ----------
// Målt for et hold med indstillingen mod ligaens egne hold (begge baner, frisk start).
// v3.8 havde ingen forskel (netto ens) – hvert krav nedenfor er rødt uden mekanikken.
test('løb uden bold: Mange er bedst mod Hold på bolden, Få bedst mod Lynkontra; genpres dæmper kontraer', async () => {
  const { measureRuns } = await import('../../tools/measure-duels.mjs');
  const N = 150; // 1200 kampe pr. opsætning (målt N = 300: Hold +0,08/+0,03/+0,02, Lynkontra −0,14/−0,05/−0,01)
  const r = (o) => measureRuns(o, N);
  const nH = r({ oppWon: 'KEEP_POSSESSION' }), mH = r({ runs: 'MANY', oppWon: 'KEEP_POSSESSION' });
  const nL = r({ oppWon: 'FAST_COUNTER' }), mL = r({ runs: 'MANY', oppWon: 'FAST_COUNTER' }), fL = r({ runs: 'FEW', oppWon: 'FAST_COUNTER' });
  assert.ok(mH.net > nH.net, `Mange ${mH.net} > Normal ${nH.net} mod Hold på bolden`);
  assert.ok(mL.net < nL.net, `Mange ${mL.net} < Normal ${nL.net} mod Lynkontra`);
  assert.ok(fL.net >= nL.net, `Få ${fL.net} ≥ Normal ${nL.net} mod Lynkontra`);
  // Mange giver flere mål for OG imod; flere løb kommer fri
  assert.ok(mH.gf - nH.gf >= 0.06 && mL.ga - nL.ga >= 0.1, `for +${(mH.gf - nH.gf).toFixed(2)}, imod +${(mL.ga - nL.ga).toFixed(2)}`);
  assert.ok(mH.runsWon > 1.5 * nH.runsWon, `fri ${mH.runsWon} mod ${nH.runsWon}`);
  // Genpres: færre kontramål imod (mindst 15 %), begge > 0 (ikke en test uden data)
  const drop = r({}), press = r({ lost: 'COUNTER_PRESS_5S' });
  assert.ok(drop.cga > 0 && press.cga > 0 && press.cga <= drop.cga * 0.85, `kontramål imod ${press.cga} mod ${drop.cga}`);
});
test('ligaens målniveau holder v3.8 (1,41 ± 0,06) efter løb og kontraer', async () => {
  const { measure } = await import('../../tools/measure-duels.mjs');
  const g = measure(null, 3, 60).goalsPerMatch;
  assert.ok(g >= 1.35 && g <= 1.5, String(g));
});
test('Rundens mål: bred fordeling – cutback ≥ 8 %, dribletur ≥ 9 %, ingen type over 30 % (v3.8: langskud 37 %, cutback 3 %)', async () => {
  const { measureSeason } = await import('../../tools/measure-duels.mjs');
  const { kinds } = measureSeason(30);
  assert.ok((kinds.CUTBACK ?? 0) >= 0.08, `cutback ${kinds.CUTBACK}`);
  assert.ok((kinds.DRIBBLE ?? 0) >= 0.09, `dribletur ${kinds.DRIBBLE}`);
  for (const [k, v] of Object.entries(kinds)) assert.ok(v <= 0.3, `${k} ${v}`);
});
