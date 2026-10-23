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
  assert.ok(r.freshMe < 90, String(r.freshMe));
});
// v3.10.1 (brugeren efter 17 runder: "næsten alle mine spillere er langt nede i friskhed" – valgt ≈80 %
// for en fast starter): restitution 41 % af det manglende (før 35 %).
test('friskhed: en CM der spiller hver kamp ender omkring 80 % (v3.10: ≈75 %); startelleven i snit ≈85 % (v3.10: ≈81 %)', async () => {
  const { afterMatchFreshness, matchCost } = await import('../../public/engine/freshness.js');
  let f = 100;
  for (let i = 0; i < 40; i++) f = afterMatchFreshness(f, 11.8, 11);   // CM: 11,8 km, STA 11 → pris ≈ 13,8
  assert.equal(matchCost(11.8, 11), 14);
  assert.ok(f >= 78 && f <= 82, `CM-ligevægt ${f} (0,35 gav 74)`);
  const { measureSeason } = await import('../../tools/measure-duels.mjs');
  const r = measureSeason(30);
  assert.ok(r.freshMe >= 83 && r.freshMe <= 88, `startelleven ${r.freshMe} (v3.10: 80,9)`);
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
  const N = 300; // 2400 kampe pr. opsætning – samme som målingen i spec §5 (v3.10: Hold +0,10/−0,06/−0,12, Lynkontra −0,31/−0,16/−0,09)
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
test('målniveau som Superligaen (v3.10: 2,6–3,0 mål pr. kamp; v3.9 gav 1,44) med realistiske dødbolde', async () => {
  const { measure } = await import('../../tools/measure-duels.mjs');
  const r = measure(null, 3, 60);
  assert.ok(r.goalsPerMatch >= 2.6 && r.goalsPerMatch <= 3.0, `mål pr. kamp ${r.goalsPerMatch}`);
  assert.ok(r.setPieceShare >= 0.18 && r.setPieceShare <= 0.35, `dødboldmål ${r.setPieceShare}`);       // Superligaen ≈ 25–30 %
  assert.ok(r.penaltiesPerMatch >= 0.15 && r.penaltiesPerMatch <= 0.45, `straffe ${r.penaltiesPerMatch}`); // ≈ 0,3
  assert.ok(r.penaltyRate >= 0.7 && r.penaltyRate <= 0.85, `straffe scoret ${r.penaltyRate}`);            // ≈ 75–78 %
  assert.ok(r.foulsPerMatch >= 15 && r.foulsPerMatch <= 30, `frispark ${r.foulsPerMatch}`);               // ≈ 20–25
  assert.ok(r.cornersPerMatch >= 3, `hjørnespark ${r.cornersPerMatch}`);
});
// v3.13: dribletur 8,7 % (v3.12.1: 13 %) – trætte spillere sidst i kampen og flere langskud (KEEPER_EDGE 3);
// båndet sænket fra 9 til 8 %. Formålet – ingen type dominerer (v3.8: langskud 37 %) – står uændret.
test('Rundens mål: bred fordeling – cutback ≥ 8 %, dribletur ≥ 8 %, ingen type over 30 % (v3.8: langskud 37 %, cutback 3 %)', async () => {
  const { measureSeason } = await import('../../tools/measure-duels.mjs');
  const { kinds } = measureSeason(30);
  assert.ok((kinds.CUTBACK ?? 0) >= 0.08, `cutback ${kinds.CUTBACK}`);
  assert.ok((kinds.DRIBBLE ?? 0) >= 0.08, `dribletur ${kinds.DRIBBLE}`);
  for (const [k, v] of Object.entries(kinds)) assert.ok(v <= 0.3, `${k} ${v}`);
});
// v3.12 (brugeren: "ikke en eneste reference til cutbacks … min modstander vinder 11 luftdueller").
// Før (v3.11, målt med samme værktøj): cutback-hændelser 0, åbne luftdueller vundet af angriberen ≈ 4 %,
// hovedstødsmål (åbent spil) 0,07 pr. kamp ved DIRECT_LONG – hvert bånd nedenfor er rødt mod det.
// (Hovedstødsandelen af alle mål var 16 % også før – den domineredes af dødbolde – og bevises ikke her.)
test('angrebsfokus mærkes: cutbacks ≥ 1 pr. kamp, angriberen vinder 35–55 % af de åbne luftdueller, intet fokus dominerer (netto inden for 0,3), og modgiften virker', async () => {
  const { measureFocus } = await import('../../tools/measure-duels.mjs');
  const N = 60;
  const cut = measureFocus({ focus: 'LOW_CUTBACKS' }, N), cross = measureFocus({ focus: 'HIGH_CROSSES' }, N), central = measureFocus({ focus: 'CENTRAL' }, N);
  assert.ok(cut.cutbacks >= 1, `cutbacks ${cut.cutbacks} (før 0)`);
  assert.ok(cross.crossWinRate >= 0.35 && cross.crossWinRate <= 0.55, `luftdueller vundet ${cross.crossWinRate} (før ≈ 0,04)`);
  assert.ok(cross.headerGoals >= 0.15, `hovedstødsmål ${cross.headerGoals} (før ≈ 0,07)`);
  const nets = [cut.net, cross.net, central.net];
  assert.ok(Math.max(...nets) - Math.min(...nets) <= 0.3, `netto ${nets.map((x) => x.toFixed(2)).join(' / ')}`);
  // Modgift: højt gegenpres lukker flere kanter end lav blok; lav blok vinder flere luftdueller
  const cHigh = measureFocus({ focus: 'LOW_CUTBACKS', oppPress: 'HIGH_GEGENPRESS' }, N), cLow = measureFocus({ focus: 'LOW_CUTBACKS', oppPress: 'LOW_BLOCK' }, N);
  assert.ok(cHigh.cutbacksBlocked / cHigh.cutbacks > 1.8 * (cLow.cutbacksBlocked / cLow.cutbacks), `lukket ${cHigh.cutbacksBlocked} mod ${cLow.cutbacksBlocked}`);
  const xLow = measureFocus({ focus: 'HIGH_CROSSES', oppPress: 'LOW_BLOCK' }, N), xMid = measureFocus({ focus: 'HIGH_CROSSES', oppPress: 'MID_BLOCK' }, N);
  assert.ok(xLow.crossWinRate < xMid.crossWinRate - 0.08, `luftdueller ${xLow.crossWinRate} mod ${xMid.crossWinRate}`);
});
// v3.12.1 (brugeren: dokumentet "Spillerhøjde i Superligaen" har nu statistik for "hvem og hvordan mål
// bliver scoret"): angreb 45–50 %, midtbane 30–35 %, forsvar 15–20 %; åbent spil 60–65 %, dødbolde
// 25–30 %, kontra 8–12 %, langskud 8–10 %. Båndene har lidt luft om dokumentets tal; v3.12.0 målt med
// samme opsætning: angreb 75 %, midtbane 15 %, forsvar 10 %, kontra 19 %, langskud 4 % – rødt overalt.
test('målene fordeler sig som i Superligaen: angreb 44–56 %, midtbane 25–38 %, forsvar 14–24 %; kontra 7–14 %, langskud 6–12 %, dødbolde 20–32 %', async () => {
  const { measureGoalMix } = await import('../../tools/measure-duels.mjs');
  const r = measureGoalMix(150);
  const band = (k, lo, hi) => assert.ok(r[k] >= lo && r[k] <= hi, `${k} ${r[k].toFixed(3)} (bånd ${lo}–${hi})`);
  band('ATT', 0.44, 0.56); band('MID', 0.25, 0.38); band('DEF', 0.14, 0.24);
  band('counter', 0.07, 0.14); band('longshot', 0.06, 0.12); band('setPiece', 0.2, 0.32);
  assert.ok(r.goalsPerMatch >= 2.6 && r.goalsPerMatch <= 3.0, `mål pr. kamp ${r.goalsPerMatch}`);
});
// QC v3.12.1 (B1, "efterprøv på dét, den rammer"): langskudsbonussen må ikke gøre det bedre at stå uden
// for feltet. Med fast +7 (før LONGSHOT_CAP) målt med samme værktøj: 4-4-2 1,36, 4-4-1-1 1,78 (+0,42),
// ST trukket til y 32 1,64 (+0,28) – begge røde mod grænsen 0,15. Med loftet: +0,06 og ±0,00.
test('langskud belønner ikke en angriber uden for feltet: 4-4-1-1 og en trukket ST scorer højst 0,15 mere end 4-4-2', async () => {
  const { measureFormations } = await import('../../tools/measure-duels.mjs');
  const r = Object.fromEntries(measureFormations(200).map((x) => [x.formation, x]));
  const base = r['4-4-2'].for;
  assert.ok(base > 1, `4-4-2 scorer ${base} (data)`);
  assert.ok(r['4-4-1-1'].for - base <= 0.15, `4-4-1-1 ${r['4-4-1-1'].for} mod 4-4-2 ${base}`);
  assert.ok(r['4-4-2 + ST trukket til y 32'].for - base <= 0.15, `trukket ST ${r['4-4-2 + ST trukket til y 32'].for} mod ${base}`);
});
