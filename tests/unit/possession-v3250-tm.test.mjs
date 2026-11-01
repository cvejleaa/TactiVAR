// v3.25.0 Test Manager (nr. 38): forfatterens bånd (possession-v3250.test.mjs) er statistiske over 30 ligaer – de kan ikke se
// MID_EXTRA pr. antal, ankrets dybde, rødt kort eller loftets kant (en ændring på ±0,1 i et tillæg ligger i støjen). Her bindes
// reglen DETERMINISTISK: to ens hold (alle evner 10, ens modstander-erfaring), scriptet rng uden chancer, og besiddelsen aflæses
// som hPoss efter 30 tick. Tick-regnestykket (match.js): hjemme har bolden ⇔ midDiff + 0,03·hAvg + next₁·8 ≥ 0,03·aAvg + next₂·7,5.
// Med ens hAvg/aAvg, next₁ = 0,5 og next₂ = 0,5 er tærsklen midDiff ≥ −0,25. Udebanens midtbane tunes med PAS (BAL 10), så
// tillægget kan måles på 0,05: PAS = tillæg + 0,2 → bolden hele vejen (90 point), + 0,3 → ingen (0).
import { alignPositions } from './helpers/positions.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';

const SK = (v) => ({ pace: v, stamina: v, strength: v, ballControl: v, passing: v, finishing: v, positioning: v, intercepting: v, goalkeeping: v });
// next skifter mellem to værdier (første kald = hjemme, andet = ude) – alt andet i stubben som tick-frame-gaps
function rngOf({ x = 0.5, y = 0.5, script = {}, pickLast = false } = {}) {
  const calls = {}; let n = 0;
  return { next: () => (n++ % 2 === 0 ? x : y), int: (a) => a, pick: (arr) => (pickLast ? arr[arr.length - 1] : arr[0]),
    chance: (p) => { const c = (calls[p] = (calls[p] ?? -1) + 1); const s = script[p]; return typeof s === 'function' ? s(c) : !!s; } };
}
function arena(fH, fA) {
  const L = createLeague(createRng(1));
  const [H, A] = [L.teams[0], L.teams[1]];
  for (const t of [H, A]) {
    for (const p of t.squad) { p.skills = SK(10); p.aerialPower = 10; p.counterTactics = { vsPress: 25, vsLowBlock: 25, vsTrapLong: 25 }; p.varProfile = { cynicism: 10, theatre: 10, varPulse: 10 }; p.injuryMatchesLeft = 0; p.freshness = 100; }
    t.tactics.customCoords = {}; t.tactics.conditionalRules = []; t.subsLimit = 0;
    t.tactics.lineupSlots = t.squad.slice(0, 11).map((p) => p.id);
    Object.assign(t.tactics.phases.phase1_buildUp, { passingStyle: 'BALANCED', attackFocus: 'CENTRAL', offBallRuns: 'NORMAL' });
    Object.assign(t.tactics.phases.phase2_defending, { pressingHeight: 'MID_BLOCK', offsideTrap: 'OFF', tacklingIntensity: 'NORMAL' });
    Object.assign(t.tactics.phases.phase3_transition, { onBallWon: 'KEEP_POSSESSION', onBallLost: 'DROP_BACK' });
  }
  H.tactics.baseFormation = fH; A.tactics.baseFormation = fA;
  alignPositions(H); alignPositions(A);
  return { H, A };
}
const slot = (t, i) => t.squad.find((p) => p.id === t.tactics.lineupSlots[i]);
const setSk = (t, slots, k, v) => slots.forEach((i) => { slot(t, i).skills[k] = v; });
// hvem har bolden i HELE kampen: 'h' (100-10) / 'a' (10-100) – ellers 'blandet h-a' (statistikken starter på 10-10)
function hPoss({ hF = '4-4-2', aF = '4-4-2', hCoords = {}, aCoords = {}, prep = () => {}, rng = {} }) {
  const a = arena(hF, aF);
  a.H.tactics.customCoords = hCoords; a.A.tactics.customCoords = aCoords;
  prep(a);
  const m = simulateMatch(a.H, a.A, rngOf(rng), { drift: false });
  assert.equal(m.stats.hPoss + m.stats.aPoss, 110, 'data: 30 tick à 3 oven i 10-10 ved afspark');
  return m.stats.aPoss === 10 ? 'h' : m.stats.hPoss === 10 ? 'a' : `blandet ${m.stats.hPoss}-${m.stats.aPoss}`;
}

// Midtbanepladserne pr. formation (index i formationen) og antallet – BOGSTAVELIGT, ikke udledt af koden. Tælles efter ANKRETS
// dybde (formations.js): en trukket plads ændrer hverken antal eller hvem der tæller (rolesOf bruger FORMATIONS, ikke customCoords).
// Kantpladserne LM/RM/LWB/RWB er midtbane, når ankret ligger over y 57,5: 3-5-2 har 5 (LWB 46, RWB 46), 5-3-2 kun 3.
const MIDS = {
  '4-4-2': [5, 6, 7, 8], '4-3-3': [5, 6, 7], '4-2-3-1': [5, 6, 7, 8, 9], '3-5-2': [4, 5, 6, 7, 8], '3-4-3': [4, 5, 6, 7],
  '5-3-2': [6, 7, 8], '5-4-1': [6, 7, 8, 9], '4-1-4-1': [5, 6, 7, 8, 9], '4-4-1-1': [5, 6, 7, 8], '4-3-1-2': [5, 6, 7, 8],
};
const EXTRA = { 3: -0.9, 4: 0, 5: 0.7 };   // MID_EXTRA for de antal, formationerne kan give (2, 6 og 7 har ingen formation)

test('MID_EXTRA er pinnet bogstaveligt (2, 6 og 7 kan ingen formation nå – kun denne test ser dem), loftet 1,5', async () => {
  const { MID_EXTRA, POSS_DIFF_CAP } = await import('../../public/engine/match.js');
  assert.deepEqual({ ...MID_EXTRA }, { 2: -2, 3: -0.9, 4: 0, 5: 0.7, 6: 1.2, 7: 1.5 });
  assert.equal(POSS_DIFF_CAP, 1.5);
});

test('MID_EXTRA HJEMME for ALLE ti formationer: bolden hele kampen ved udebanens PAS = tillæg + 0,2, aldrig ved + 0,3 (tillæg fjernet/fortegn/±0,1, forkert antal, ankrets dybde i stedet for rolle)', () => {
  for (const [f, mids] of Object.entries(MIDS)) {
    const n = mids.length;
    // hjemme: 20 + EXTRA[n]; ude (4-4-2, tillæg 0): 20 + p, p = PAS − 10 → diff = EXTRA[n] − p ≥ −0,25 ⇔ p ≤ EXTRA[n] + 0,25
    const at = (d) => hPoss({ hF: f, prep: (a) => setSk(a.A, MIDS['4-4-2'], 'passing', 10 + EXTRA[n] + d) });
    assert.equal(at(0.2), 'h', `${f} (${n} på midten): diff −0,2 → hjemme har bolden`);
    assert.equal(at(0.3), 'a', `${f} (${n} på midten): diff −0,3 → ude har bolden`);
  }
});

test('MID_EXTRA UDE for ALLE ti formationer (spejlet: aS bruger udeholdets antal, ikke hjemmets)', () => {
  for (const [f, mids] of Object.entries(MIDS)) {
    const n = mids.length;
    // ude: 20 + p + EXTRA[n]; hjemme (4-4-2) 20 → diff = −(p + EXTRA[n]) ≥ −0,25 ⇔ p ≤ 0,25 − EXTRA[n]
    const at = (d) => hPoss({ aF: f, prep: (a) => setSk(a.A, mids, 'passing', 10 - EXTRA[n] + d) });
    assert.equal(at(0.2), 'h', `${f} ude: diff −0,2 → hjemme har bolden`);
    assert.equal(at(0.3), 'a', `${f} ude: diff −0,3 → ude har bolden`);
  }
});

test('trukne pladser ændrer hverken antal eller hvem der tæller: 4-4-2 med begge kanter trukket ned til y 60 (back-plads) og 4-3-3 med backs trukket op til y 45 giver SAMME besiddelse som uden træk', () => {
  const at = (hF, hCoords, d) => hPoss({ hF, hCoords, prep: (a) => setSk(a.A, MIDS['4-4-2'], 'passing', 10 + EXTRA[MIDS[hF].length] + d) });
  for (const [hF, c] of [['4-4-2', { 5: { x: 15, y: 60 }, 8: { x: 85, y: 60 } }], ['4-3-3', { 1: { x: 15, y: 45 }, 4: { x: 85, y: 45 } }]]) {
    assert.equal(at(hF, c, 0.2), 'h', `${hF} med træk`); assert.equal(at(hF, c, 0.3), 'a', `${hF} med træk`);
  }
});

test('hvem der tæller i snittet: 3-5-2s kantpladser (LWB/RWB, ankrets dybde 46) er med i midtbanens PAS+BAL – (3·20 + 2·40)/5 = 28, ikke 20 for de tre i midten', () => {
  // hjemme 3-5-2: pladserne 4 og 7 (kanterne) får PAS 30 → PAS+BAL 40; ude 4-4-2 med PAS = 28 + 0,7 + d − 10
  const at = (d) => hPoss({ hF: '3-5-2', prep: (a) => { setSk(a.H, [4, 7], 'passing', 30); setSk(a.A, MIDS['4-4-2'], 'passing', 10 + 8 + 0.7 + d); } });   // ude: PAS 18,7 + d, BAL 10 → aS 28,7 + d
  assert.equal(at(0.2), 'h', 'snit 28 (alle fem) – med de tre i midten alene (20) var diff −8,2 og ude fik bolden'); assert.equal(at(0.3), 'a');
});

// --- loftet: forskellen mellem midtbanerne klemmes til ±1,5 ---
// Tick-tærsklen med next₁ = 0,5 (4,0) og next₂ = y: hjemme har bolden ⇔ diff + 4 ≥ 7,5·y. Midtbanerne er langt fra hinanden
// (PAS 40 mod 10: rå diff ±30), så diff er loftet. Tærsklen lægges 0,05 på hver side af 1,5: 7,5·y = 5,45 / 5,55 (positivt) og
// 2,45 / 2,55 (negativt). Loft 99 → bolden skifter på begge sider; loft 1,4 eller 1,6 → ét af fire udsagn vælter.
const strong = (team) => (a) => setSk(a[team], MIDS['4-4-2'], 'passing', 40);
test('loftet ligger på 1,5 – hjemmets store forspring: bolden ved tærskel 1,45, ikke ved 1,55 (loft 99/1,6 giver bolden begge steder, 0,5/1,4 ingen)', () => {
  assert.equal(hPoss({ prep: strong('H'), rng: { y: 5.45 / 7.5 } }), 'h');
  assert.equal(hPoss({ prep: strong('H'), rng: { y: 5.55 / 7.5 } }), 'a');
});
test('loftet gælder også den anden vej – udebanens store forspring: bolden ved tærskel −1,55 mangler, ved −1,45 er der (klemmes kun opad: begge udsagn vælter)', () => {
  assert.equal(hPoss({ prep: strong('A'), rng: { y: 2.45 / 7.5 } }), 'h');
  assert.equal(hPoss({ prep: strong('A'), rng: { y: 2.55 / 7.5 } }), 'a');
});

// --- rødt kort: ti mand koster EN gang (shortF), ikke også et midtbanetillæg; og prisen ligger UDEN FOR loftet ---
// Kortet: tick 0, hjemme/ude begår skade-frisparket (0,06 → 0,4 → 0,07 = direkte rødt), forbryderen er den SIDSTE af
// forsvar+midtbane = højre midtbane (plads 8). Antallet på midten er formationens (4), de tilstedeværende er 3.
const RED = (homeFouls) => ({ 0.06: (n) => n === 0, 0.4: true, 0.07: true, 0.5: !homeFouls });   // 0,5: sand → hjemme er offer
test('rødt kort på en midtbanespiller (hjemme): ti mand koster shortF (0,04·20 = 0,8) – og IKKE også tillægget for 3 på midten (−0,9): bolden holdes ved tærskel −1,25, tabes ved −0,6', () => {
  const at = (T) => hPoss({ rng: { y: (4 + T) / 7.5, script: RED(true), pickLast: true } });
  // diff efter kortet: 0 (ens midte) − 0,8 = −0,8. Dobbelt regnet (antal fra de tilstedeværende): −0,8 − 0,9 − … ≈ −1,66
  assert.equal(at(-1.25), 'h', 'tick 1-29: −0,8 ≥ −1,25 (dobbelt straf −1,66 ville tabe bolden)');
  assert.equal(at(-0.6), 'blandet 13-97', 'tick 0 hjemme (13), derefter ude: −0,8 < −0,6 – ti mand mærkes (shortF fjernet/halveret → hjemme hele vejen)');
});
test('rødt kort på en midtbanespiller (ude): hjemme tjener 0,8 – bolden til hjemme ved tærskel +0,6 (ikke ved +1,25: ude regnes ikke for 3 på midten)', () => {
  const at = (T) => hPoss({ rng: { y: (4 + T) / 7.5, script: RED(false), pickLast: true } });
  assert.equal(at(0.6), 'blandet 97-13', 'tick 0 ude (13); derefter hjemme: +0,8 ≥ +0,6 (udebanens pris fjernet/vendt → ude hele vejen)');
  assert.equal(at(1.25), 'a', 'tick 1-29: +0,8 < +1,25 (dobbelt straf på ude: +1,7 ville give hjemme bolden)');
});
test('ti-mands-prisen ligger UDEN FOR loftet: hjemmets forspring (rå +30, loftet 1,5) minus 0,04·50 = 2,0 → −0,5 efter kortet; ligger prisen inden for loftet, bliver diff 1,5 og kortet koster intet', () => {
  const m = (T) => hPoss({ prep: strong('H'), rng: { y: (4 + T) / 7.5, script: RED(true), pickLast: true } });
  assert.equal(m(0.5), 'blandet 13-97', 'tick 0: 1,5 ≥ 0,5; derefter −0,5 < 0,5 (shortF inden for loftet: 1,5 hele vejen)');
  assert.equal(m(-0.8), 'h', '−0,5 ≥ −0,8: prisen er 2,0 og ikke mere (data: kortet er givet)');
});
test('rødt kort på en FORSVARER ændrer ikke tillægget (antal på midten uændret) – 4-4-2 og 3 tilstedeværende forsvarere: samme −0,8', () => {
  const at = (T) => hPoss({ rng: { y: (4 + T) / 7.5, script: RED(true), pickLast: false } });   // pick = første = venstre back
  assert.equal(at(-0.6), 'blandet 13-97'); assert.equal(at(-1.25), 'h');
});
