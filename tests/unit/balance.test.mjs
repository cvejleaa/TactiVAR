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
test('rundens mål: flere typer vinder, ingen over 50 %, ingen VAR-mål (v3.15.1); friskheden falder over en sæson', async () => {
  const { measureSeason } = await import('../../tools/measure-duels.mjs');
  const r = measureSeason(8, 6);
  assert.ok(Object.keys(r.kinds).length >= 4, JSON.stringify(r.kinds));
  assert.ok(Object.values(r.kinds).every((v) => v <= 0.5), JSON.stringify(r.kinds));
  assert.equal(r.kinds.VAR, undefined, `v3.15.1: ingen VAR-mål mere – ${JSON.stringify(r.kinds)}`);
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
  // Få mod Normal mod Lynkontra er reelt lige (målt over 9600 kampe: 3.14.3 Få 0,007 / Normal 0,000; v3.15 −0,001 / 0,005 –
  // støjen her er ≈ 0,035). "Få ≥ Normal" målte støj og holdt kun på frø-held; nu: Få er ikke tydeligt dårligere.
  assert.ok(fL.net >= nL.net - 0.05, `Få ${fL.net} ≥ Normal ${nL.net} − 0,05 mod Lynkontra`);
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
// v3.16.1: loftet 30 → 36 % (her 30 sæsoner: v3.16.0 30,0 %, nu 35,3 %). Dribleturen lå allerede over 30 % i v3.16.0 (900 runder: 32,3 %; nu 33,3 %) – ved 300 runder
// er udsvinget ±3 point. v3.8's 37 % er stadig rødt.
test('Rundens mål: bred fordeling – cutback ≥ 8 %, dribletur ≥ 8 %, ingen type over 36 % (v3.8: langskud 37 %, cutback 3 %)', async () => {
  const { measureSeason } = await import('../../tools/measure-duels.mjs');
  const { kinds } = measureSeason(30);
  assert.ok((kinds.CUTBACK ?? 0) >= 0.08, `cutback ${kinds.CUTBACK}`);
  assert.ok((kinds.DRIBBLE ?? 0) >= 0.08, `dribletur ${kinds.DRIBBLE}`);
  for (const [k, v] of Object.entries(kinds)) assert.ok(v <= 0.36, `${k} ${v}`);
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
  // v3.15: et forsvar med færre mand taber flere luftdueller – målt over 400 kampe 0,545 → 0,555 (her med 60: 0,535 → 0,570);
  // loftet 0,55 → 0,58. Båndet fanger stadig fejlen, det blev lavet til (≈ 0,04).
  assert.ok(cross.crossWinRate >= 0.35 && cross.crossWinRate <= 0.58, `luftdueller vundet ${cross.crossWinRate} (før ≈ 0,04)`);
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
// v3.15.1: VAR-chancetypens mål (21 % af målene, afgjort af en VAR-duel uden afslutning) er væk – målene afgøres af
// afslutningen, så angriberne scorer flere (Spilfører: "angriberen scorer næsten aldrig i åbent spil"). Målt (150 ligaer,
// før 28efc6d → nu): angreb 0,534 → 0,612, midtbane 0,278 → 0,245, forsvar 0,188 → 0,143; dokumentets 44–56 / 25–38 /
// 14–24 % er bevidst forladt (spec §5 "VAR som i virkeligheden") – båndene er røde mod den gamle fordeling.
// v3.16.7 M1 (oplægsgiveren tjekkes ikke for offside, intet offside fra hjørnespark): angreb 0,660 → 0,672 (150 ligaer, samme
// opsætning) – øvre kant 0,66 → 0,70; den gamle fordeling fra før v3.15.1 (0,534) er stadig rød.
test('målene fordeler sig: angreb 56–70 % (før 53 %), midtbane 20–30 %, forsvar 11–17 % (før 19 %); kontra 7–14 %, langskud 6–13 %, dødbolde 18–32 %', async () => {
  const { measureGoalMix } = await import('../../tools/measure-duels.mjs');
  const r = measureGoalMix(150);
  const band = (k, lo, hi) => assert.ok(r[k] >= lo && r[k] <= hi, `${k} ${r[k].toFixed(3)} (bånd ${lo}–${hi})`);
  band('ATT', 0.56, 0.70); band('MID', 0.2, 0.3); band('DEF', 0.11, 0.17);
  band('counter', 0.07, 0.14); band('longshot', 0.06, 0.11); band('setPiece', 0.18, 0.32);   // langskud v3.16: 0,124 → ≈0,085 (koblede linjer, LONGSHOT_Y 30) – dokumentets 8–10 %
  assert.ok(r.goalsPerMatch >= 2.6 && r.goalsPerMatch <= 3.0, `mål pr. kamp ${r.goalsPerMatch}`);
});
// QC v3.12.1 (B1, "efterprøv på dét, den rammer"): langskudsbonussen må ikke gøre det bedre at stå uden
// for feltet. Med fast +7 (før LONGSHOT_CAP) målt med samme værktøj: 4-4-2 1,36, 4-4-1-1 1,78 (+0,42),
// ST trukket til y 32 1,64 (+0,28) – begge røde mod grænsen 0,15. Med loftet: +0,06 og ±0,00.
test('langskud belønner ikke en angriber uden for feltet: 4-4-1-1 og en trukket ST scorer højst 0,15 mere end 4-4-2', async () => {
  const { measureFormations } = await import('../../tools/measure-duels.mjs');
  // 600 kampe (før 200): med 200 er støjen ≈ 0,085 mål – på højde med båndet. v3.14.1 (VAR-tjek af den forreste) gav
  // med 200 kampe trukket ST +0,16 (rødt på støj), men målt over 1500 kampe: trukket ST −0,035 før og −0,024 efter 4-4-2.
  const r = Object.fromEntries(measureFormations(600).map((x) => [x.formation, x]));
  const base = r['4-4-2'].for;
  assert.ok(base > 1, `4-4-2 scorer ${base} (data)`);
  assert.ok(r['4-4-1-1'].for - base <= 0.15, `4-4-1-1 ${r['4-4-1-1'].for} mod 4-4-2 ${base}`);
  assert.ok(r['4-4-2 + ST trukket til y 32'].for - base <= 0.15, `trukket ST ${r['4-4-2 + ST trukket til y 32'].for} mod ${base}`);
});

// v3.13 (QC H): kalibreringen af udskiftninger og STA låst i bånd. Før v3.13 (målt med samme værktøj): 0 træthedsskift,
// ≈ 0,3 skadesskift; STA 6 mod 16 netto-forskel 0,47 (uden friskhed i kampen) – begge røde mod båndene nedenfor.
// v3.15.1: grænsen 0,55 → 0,50. Lavere KEEPER_EDGE (3 → 0,3), forbi-udfald og VAR efter målet flytter færre afgørelser
// over friskhedens kant. Målt med measureStamina(300) og measureStamina(300, false) i tools/measure-duels.mjs:
// 28efc6d (før v3.15.1) 0,600 med friskhed i kampen / 0,323 uden; nu 0,537 / 0,277 (1500 kampe: 0,652 / 0,411 før,
// 0,609 / 0,319 nu). 0,50 er rødt mod "uden friskhed i kampen" (0,277) og mod v3.12-tallet 0,47.
test('udskiftninger: 2,2–3,6 skift pr. hold pr. kamp, de fleste efter pausen; STA 16 mod 6 vinder mindst 0,50 mål mere pr. kamp', async () => {
  const { measureSubs, measureStamina } = await import('../../tools/measure-duels.mjs');
  const r = measureSubs(10);
  assert.ok(r.subsPerTeam >= 2.2 && r.subsPerTeam <= 3.6, `skift ${r.subsPerTeam}`);
  assert.ok(r.why.fatigue >= 1.5, `træthedsskift ${r.why.fatigue} (før 0)`);
  assert.ok(r.mins['1–45'] <= 0.3, `før pausen ${r.mins['1–45']}`);
  // Målniveauet over 40 sæsoner (1600 kampe): med 10 lå 3.14.3 selv på 2,600 – præcis på grænsen (40: 3.14.3 2,73, v3.15 2,70).
  const g = measureSubs(40).goalsPerMatch;
  assert.ok(g >= 2.6 && g <= 3.0, `mål ${g}`);
  const st = measureStamina(300);
  assert.ok(st[16].net - st[6].net >= 0.5, `STA-forskel ${(st[16].net - st[6].net).toFixed(2)} (før v3.13 0,47; uden friskhed i kampen nu 0,277)`);
});

// v3.15 (Spilførerens sæsongennemgang: 0 røde kort, 8 dobbelt-gule på 56 kampe). Superligaen ≈ 0,15 røde og ≈ 4 gule pr. kamp.
// Ti mand skal kunne mærkes: før straffen (SHORT_PER_MAN 0) scorede holdet 1,33 og lukkede 1,49 ind pr. 90 min efter
// udvisningen – båndene nedenfor er røde med de tal. Målt med straffen: 1,06 / 1,93. Med 0,08: 0,57 / 2,78 (også rødt).
test('kort: 0,10–0,25 røde pr. kamp (før 0), 3–5 gule; ti mand scorer færre og lukker flere ind end med elleve', async () => {
  const { measureCards } = await import('../../tools/measure-duels.mjs');
  const r = measureCards(2500);
  assert.ok(r.redsPerMatch >= 0.10 && r.redsPerMatch <= 0.25 && r.direct > 0 && r.secondYellow > r.direct, JSON.stringify(r));
  assert.ok(r.yellowsPerMatch >= 3 && r.yellowsPerMatch <= 5, JSON.stringify(r));
  assert.ok(r.tenMenMatches >= 150, JSON.stringify(r));
  assert.ok(r.tenMenFor90 <= 1.2 && r.tenMenAgainst90 >= 1.7 && r.tenMenAgainst90 <= 2.4, JSON.stringify(r));
});

// v3.15 (Spilfører: målmanden på det tabende hold blev Kampens og Rundens spiller tre runder i træk). Før (3.14.3, samme
// måling): tabende hold 15 %, målmand 32 %, målscorer 48 %. Med RESULT_BONUS og halv værdi for redninger over 4: 2,5 / 23 / 64 %.
test('Kampens spiller: sjældent fra det tabende hold (≤ 8 %, før 15 %), målmand ≤ 28 % (før 32 %), oftest en målscorer (≥ 55 %)', async () => {
  const { measureMotm } = await import('../../tools/measure-duels.mjs');
  const r = measureMotm(600);
  assert.ok(r.loserShare <= 0.08 && r.gkShare <= 0.28 && r.scorerShare >= 0.55, JSON.stringify(r));
});

// v3.15.1 – VAR som i virkeligheden (tools/measure-duels.mjs var, 1500 kampe). Før (28efc6d, VAR som chancetype): på mål
// 0,603, annullerede 0,495 pr. kamp, VAR-tjek 1,09, ingen forbi/straffe-/rødt-VAR. Nu: på mål ≈0,39, annullerede ≈0,16,
// VAR-tjek ≈0,52, hjørner ≈3,1. Alle bånd er røde mod de gamle tal.
test('VAR og afslutninger som i Superligaen: på mål 30–45 % (før 60 %), annullerede 0,08–0,25 pr. kamp (før 0,50), alle VAR-slags forekommer', async () => {
  const { measureVar } = await import('../../tools/measure-duels.mjs');
  const r = measureVar(1500);
  const band = (k, lo, hi) => assert.ok(r[k] >= lo && r[k] <= hi, `${k} ${r[k].toFixed(3)} (bånd ${lo}–${hi})`);
  band('goals', 2.6, 3.0); band('onTargetShare', 0.3, 0.45); band('disallowed', 0.08, 0.25); band('varChecksStat', 0.3, 0.8);
  band('miss', 2, 5); band('corners', 2.8, 4.5); band('reds', 0.1, 0.25); band('flags', 0.03, 0.15);
  band('penOverturnedShare', 0.08, 0.35); band('penAwarded', 0.02, 0.1);
  for (const k of ['goalChecks', 'penChecks', 'redChecks', 'redDown', 'redUp']) assert.ok(r[k] > 0, `${k} ${r[k]}`);
  assert.equal(r.varGoalOld, 0, 'ingen VAR-chancetype');
});

// v3.16 koblede linjer (Spilfører: "lav blok må ikke få flere mål imod end i dag, og langskud-andelen imod lav blok skal være
// højere end imod gegenpres"). Målt 800 kampe pr. pres (forsvarsholdet sat til presset): før (7de6552) mål imod lav 1,34 /
// mellem 1,36 / højt 1,27, langskud 10 / 11 / 12 %; nu ≈1,35 / 1,35 / 1,28 og 8 / 6 / 7 %. Uden kanten efter pres (EDGE_BY_PRESS)
// var langskud imod lav blok 10 % mod 20 % imod gegenpres.
// v3.16.1 (sammenpresning): 1,39 / 1,37 og 7,0 / 7,1 % – lige mange langskud inden for 1 point; fejlen, båndet skal fange
// (uden EDGE_BY_PRESS 10 mod 20 %), er stadig rød.
test('pres og afslutning: lav blok lukker ikke flere mål ind end før (≤ 1,42; før 1,34) og giver mindst lige så mange langskud imod som gegenpres (± 1 point)', async () => {
  const { createRng } = await import('../../public/engine/rng.js');
  const { createLeague } = await import('../../public/engine/generator.js');
  const { simulateMatch } = await import('../../public/engine/match.js');
  const r = {};
  for (const P of ['LOW_BLOCK', 'HIGH_GEGENPRESS']) {
    let ga = 0, g = 0, long = 0;
    for (let s = 1; s <= 800; s++) {
      const L = createLeague(createRng(s)), H = L.teams[s % 8], A = L.teams[(s + 3) % 8];
      A.tactics.phases.phase2_defending.pressingHeight = P;
      const m = simulateMatch(H, A, createRng(s * 31));
      ga += m.homeGoals;
      for (const x of m.goalsPool.filter((x) => x.teamName === H.name)) { g++; if (x.kind === 'LONGSHOT') long++; }
    }
    r[P] = { ga: ga / 800, long: long / g };
  }
  assert.ok(r.LOW_BLOCK.ga <= 1.42, JSON.stringify(r));
  assert.ok(r.LOW_BLOCK.long >= r.HIGH_GEGENPRESS.long - 0.01, JSON.stringify(r));
});
