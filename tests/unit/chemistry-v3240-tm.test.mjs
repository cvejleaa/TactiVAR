// v3.24.0 – Test Manager: tests der dræber de mutanter, forfatterens egne tests lod overleve (samspil PR-B). Alt er regnet i hånden
// (ikke afledt af den kode, der testes) og kører på små, kendte fixtures – ingen tilfældig liga uden at data tjekkes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chemScale, bandOf, readPairs, lineupPairs, weakestPair, swapChanges, bestPartner, playerPairs, gamesToSettle, saleChemText,
  slotChem, pairKey, neighbourPairs, CHEM_TOP, CHEM_BASE, STRANGER } from '../../public/engine/chemistry.js';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';
import { playRound } from '../../public/engine/season.js';
import { FORMATIONS } from '../../public/engine/formations.js';

test('skalaen på kanterne: ref på/over loftet (86) giver aldrig bonus og aldrig 0/0; ref 30 deler aldrig med 0; nævnerne er ref − 30 og 86 − ref', () => {
  assert.equal(chemScale(86, 86), 0); assert.equal(chemScale(90, 86), 0, 'ref = loftet: v over ref er 0, ikke Infinity → 1');
  assert.ok(chemScale(85.9, 86) < 0 && chemScale(85.9, 86) > -0.01);
  assert.equal(chemScale(84, 82), 0.5, 'over: (84−82)/(86−82)'); assert.equal(chemScale(86, 85), 1); assert.equal(chemScale(100, 85), 1);
  assert.equal(chemScale(40, 50), -0.5, 'under: (50−40)/(50−30) – ikke /48 (kun rigtigt ved ref 78)');
  assert.equal(chemScale(29, 30), -1, 'ref 30: nævneren klemmes til 1 (ikke 0, ikke 2)');
  assert.equal(chemScale(60, 90), -0.5, 'ref over loftet: kun ned – (90−60)/(90−30)');
});

test('båndgrænserne PRÆCIS på grænsen (ref 80/81 giver eksakte brøker): −0,5 og −0,15 hører til det lavere bånd, 0,4 til det højere', () => {
  assert.equal(bandOf(55, 80), 'fremmede', 'skala −0,5 præcis (25/50)'); assert.equal(bandOf(55.1, 80), 'finder');
  assert.equal(bandOf(72.5, 80), 'finder', 'skala −0,15 præcis (7,5/50)'); assert.equal(bandOf(72.6, 80), 'sammen');
  assert.equal(bandOf(83, 81), 'staerkt', 'skala 0,4 præcis (2/5)'); assert.equal(bandOf(82.9, 81), 'sammen');
  assert.equal(bandOf(80, 80), 'sammen'); assert.equal(bandOf(30, 80), 'fremmede'); assert.equal(bandOf(100, 80), 'staerkt');
});

test('købelinjens kampe regnet i hånden (v = v + 0,14·(100 − v); v −= 0,035·(v − 30), fra 30, til båndet ikke længere er "fremmede"/"finder"): ref 70 → 6, 78 → 8, 84 → 10', () => {
  assert.equal(gamesToSettle(70), 6); assert.equal(gamesToSettle(78), 8); assert.equal(gamesToSettle(84), 10);
});

// slotChem: middel over spillerens nabopar blandt dem på banen nu. 4-4-2: slot 2 (CB) har naboerne 1, 3 og 6.
const starters = (n = 11) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, shirtNumber: i + 1, shortName: `P${i}`, name: `Spiller ${i}`, position: i === 0 ? 'GK' : 'CM' }));
test('slotChem: middel af hans nabopar (kun dem på banen); en tom plads springes over; målmanden og ingen naboer giver null', () => {
  const st = starters(), team = { chemistry: { [pairKey('p1', 'p2')]: [60, 0], [pairKey('p2', 'p3')]: [80, 0], [pairKey('p2', 'p6')]: [100, 0], [pairKey('p3', 'p7')]: [10, 0] } };
  assert.equal(slotChem(team, st, '4-4-2', 2), 80, '(60 + 80 + 100) / 3');
  const gap = st.slice(); gap[6] = null;
  assert.equal(slotChem(team, gap, '4-4-2', 2), 70, 'slot 6 tom: (60 + 80) / 2 – ikke en TypeError, ikke 0 i nævneren');
  const alone = st.slice(); alone[1] = alone[3] = alone[6] = null;
  assert.equal(slotChem(team, alone, '4-4-2', 2), null, 'ingen af hans naboer på banen: null (kampen læser det som 0 – ikke som 0 point/−1)');
  assert.equal(slotChem(team, st, '4-4-2', 0), null, 'målmanden har ingen par');
  assert.equal(slotChem(team, st, '4-4-2', -1), null);
  assert.equal(slotChem({ chemistry: {} }, st, '4-4-2', 2), STRANGER, 'ingen kendte par: fremmede (ikke null)');
  assert.equal(slotChem({}, st, '4-4-2', 2), CHEM_BASE, 'ingen tabel: neutral');
  assert.equal(slotChem(team, st, '4-4-2', 9), STRANGER, 'slot 9: naboerne 6 og 10 står ikke i tabellen → fremmede (30)');
});

// Hold med kendte numre/navne: "P{i}" på plads i, trøjenummer i + 1
function team442(chem = {}, formation = '4-4-2') {
  const squad = starters(14);
  return { squad, tactics: { baseFormation: formation, lineupSlots: squad.slice(0, 11).map((p) => p.id) }, chemistry: chem };
}
const all = (v, formation = '4-4-2') => { const t = team442({}, formation), c = {}; for (const [i, j] of neighbourPairs(formation)) c[pairKey(`p${i}`, `p${j}`)] = [v, 0]; t.chemistry = c; return t; };

test('readPairs/lineupPairs kender ikke en ukendt formation (et gammelt gem): de falder tilbage på 4-4-2 i stedet for at kaste', () => {
  assert.deepEqual(readPairs('findes-ikke'), readPairs('4-4-2'));
  assert.equal(lineupPairs(all(CHEM_BASE, 'findes-ikke'), CHEM_BASE).length, 12);
});

test('holdets par i 4-4-2: navnet kun hvor det er entydigt (ellers numrene – "#a og #b" i pladsernes rækkefølge); angriberparret [9,10] er ude', () => {
  const ps = lineupPairs(all(CHEM_BASE), CHEM_BASE);
  assert.deepEqual(ps.map((x) => `${x.i}-${x.j}`), ['1-2', '1-5', '2-3', '2-6', '3-4', '3-7', '4-8', '5-6', '6-7', '6-9', '7-8', '7-10']);
  assert.deepEqual(ps.map((x) => x.label), ['#2 P1 og #3 P2', 'Venstre side', 'Midtstopper-parret', '#3 P2 og #7 P6', '#4 P3 og #5 P4', '#4 P3 og #8 P7', 'Højre side',
    '#6 P5 og #7 P6', 'Den centrale midtbane', '#7 P6 og #10 P9', '#8 P7 og #9 P8', '#8 P7 og #11 P10']);
  assert.ok(ps.every((x) => x.band === 'sammen' && x.v === CHEM_BASE));
});

test('et navn, der ville stå to gange (5-3-2: tre midtstoppere = to CB-CB-par), erstattes af numrene – også for det andet par; en plads uden spiller giver intet par', () => {
  const t = all(CHEM_BASE, '5-3-2'), ps = lineupPairs(t, CHEM_BASE);
  const cb = ps.filter((x) => FORMATIONS['5-3-2'][x.i].r === 'CB' && FORMATIONS['5-3-2'][x.j].r === 'CB');
  assert.equal(cb.length, 2);
  assert.deepEqual(cb.map((x) => x.label), ['#3 P2 og #4 P3', '#4 P3 og #5 P4']);
  const gap = all(CHEM_BASE); gap.tactics.lineupSlots[2] = 'findes-ikke';
  assert.ok(lineupPairs(gap, CHEM_BASE).every((x) => x.i !== 2 && x.j !== 2) && lineupPairs(gap, CHEM_BASE).length === 12 - 3, 'slot 2 har 3 par (1-2, 2-3, 2-6)');
});

test('svageste par: laveste bånd, så laveste værdi; byt-beskeden: største fald først, forbedringer sidst, højst 2, kun par der findes i begge, og båndene i rækkefølgen før → efter', () => {
  const mk = (i, j, band, v) => ({ i, j, band, v, label: `${i}-${j}` });
  const ps = [mk(1, 2, 'finder', 66), mk(2, 3, 'fremmede', 40), mk(3, 4, 'fremmede', 35), mk(4, 5, 'staerkt', 90)];
  assert.equal(weakestPair(ps).label, '3-4', 'laveste bånd (fremmede), derefter laveste værdi (35 < 40)');
  assert.equal(weakestPair([mk(1, 2, 'sammen', 70), mk(2, 3, 'finder', 90)]).label, '2-3', 'bånd før værdi');
  assert.equal(weakestPair([]), null);
  const before = [mk(1, 2, 'staerkt', 90), mk(2, 3, 'sammen', 78), mk(3, 4, 'sammen', 78), mk(4, 5, 'finder', 66), mk(5, 6, 'sammen', 78)];
  const after = [mk(1, 2, 'sammen', 78), mk(2, 3, 'fremmede', 30), mk(3, 4, 'staerkt', 90), mk(4, 5, 'sammen', 78), mk(5, 6, 'sammen', 78), mk(6, 7, 'fremmede', 30)];
  // ændringer: 1-2 −1, 2-3 −2, 3-4 +1, 4-5 +1, 5-6 ingen, 6-7 findes ikke før. Mindste (største fald) først: 2-3, 1-2
  assert.deepEqual(swapChanges(before, after), ['2-3: spillet sammen → fremmede', '1-2: stærkt → spillet sammen']);
  assert.deepEqual(swapChanges(before, after.slice(2)), ['3-4: spillet sammen → stærkt', '4-5: finder hinanden → spillet sammen'], 'kun forbedringer: stabil rækkefølge, to af to');
  assert.deepEqual(swapChanges([mk(1, 2, 'sammen', 78)], [mk(2, 1, 'fremmede', 30)]), [], 'nøglen er i-j i den rækkefølge, pladserne står');
});

test('bedste makker: den STÆRKESTE af hans par med naboerne nu (højeste værdi), og begge retninger af et par (han som a og som b) giver makkeren', () => {
  const t = all(CHEM_BASE);
  t.chemistry[pairKey('p2', 'p3')] = [88, 0]; t.chemistry[pairKey('p2', 'p6')] = [84, 0]; t.chemistry[pairKey('p1', 'p2')] = [86, 0];
  assert.equal(bestPartner(t, CHEM_BASE, 'p2').mate.id, 'p3', '88 > 86 > 84');
  assert.equal(bestPartner(t, CHEM_BASE, 'p3').mate.id, 'p2', 'p3 står som b i parret 2-3');
  assert.deepEqual(playerPairs(t, CHEM_BASE, 'p2').map((x) => x.mate.id), ['p1', 'p3', 'p6']);
  assert.deepEqual(playerPairs(t, CHEM_BASE, 'p3').map((x) => x.mate.id), ['p2', 'p4', 'p7']);
  assert.equal(saleChemText(t, CHEM_BASE, 'p2'), '🤝 Stærkt samspil med #2 P1 og #4 P3 og #7 P6 – et salg bryder parret.', 'alle tre stærke, i pladsernes rækkefølge');
  assert.equal(saleChemText(t, CHEM_BASE, 'p9'), null, 'p9 har kun par på snittet');
});

// ---- Fuldtids-analysen (match.js): hvilken midtbane, hvilken side, hvilket bånd, hvilken ligasnit
const FT = /🤝 Samspil: din midtbane har/;
function game({ me: mv, opp: ov, formation = '4-4-2', chemRef, away = false, tweak } = {}) {
  const L = createLeague(createRng(9)), me = L.teams.find((x) => !x.isBot), opp = L.teams.find((x) => x.isBot);
  me.tactics.baseFormation = formation;
  const setAll = (t, v) => { const s = t.tactics.lineupSlots; for (const k of Object.keys(t.chemistry)) t.chemistry[k] = [v, 0]; for (const [i, j] of neighbourPairs(t.tactics.baseFormation)) t.chemistry[pairKey(s[i], s[j])] = [v, 0]; };
  setAll(me, mv); setAll(opp, ov ?? CHEM_BASE); tweak?.(me);
  const opts = chemRef == null ? {} : { chemRef };
  const m = away ? simulateMatch(opp, me, createRng(9), opts) : simulateMatch(me, opp, createRng(9), opts);
  return m.events.find((e) => e.type === 'FULLTIME')?.text ?? '';
}
test('fuldtidssætningen: fremmede og "finder hinanden" siger det samme om årsagen men med hvert sit ord; "spillet sammen" siger intet; stærkt har sin egen sætning', () => {
  assert.match(game({ me: 30 }), /din midtbane har ikke spillet sig sammen endnu \(fremmede\) – det gør opbygningen lidt sværere\./);
  assert.match(game({ me: 65 }), /din midtbane har ikke spillet sig sammen endnu \(finder hinanden\) – det gør opbygningen lidt sværere\./, '65 er "finder hinanden" ved snit 78');
  assert.doesNotMatch(game({ me: 72 }), FT, '72 er "spillet sammen" (skala −0,125)');
  assert.doesNotMatch(game({ me: 80 }), FT, '80 er "spillet sammen" (skala 0,25)');
  assert.match(game({ me: 84 }), /🤝 Samspil: din midtbane har spillet sig sammen \(stærkt\) – det hjælper opbygningen lidt\./);
});
test('fuldtidssætningen handler om DIT hold – ikke modstanderens – uanset hjemme/ude', () => {
  assert.doesNotMatch(game({ me: CHEM_BASE, opp: 30 }), FT, 'modstanderen er fremmede, du er på snittet: ingen sætning');
  assert.doesNotMatch(game({ me: CHEM_BASE, opp: 30, away: true }), FT);
  assert.doesNotMatch(game({ me: CHEM_BASE, opp: 90 }), FT);
  assert.match(game({ me: 30, opp: CHEM_BASE, away: true }), /\(fremmede\)/, 'du som udehold');
  assert.match(game({ me: 30, opp: 90, away: true }), /\(fremmede\)/, 'modstanderen stærk, du fremmede: din sætning, ikke hans');
});
test('fuldtidssætningen læser MIDTBANEN: stærke par omkring midtbanen (84) og svage par i bagkæden (30) → "stærkt"; omvendt → "fremmede"', () => {
  const c = FORMATIONS['4-4-2'], isMid = (i) => ['LM', 'CM', 'RM'].includes(c[i].r);
  const set = (strongMid) => (me) => { const s = me.tactics.lineupSlots; for (const [i, j] of neighbourPairs('4-4-2')) me.chemistry[pairKey(s[i], s[j])] = [(isMid(i) || isMid(j)) === strongMid ? 84 : 30, 0]; };
  assert.match(game({ me: 78, tweak: set(true) }), /\(stærkt\)/, 'hvert par, der rører en midtbanemand: 84; pure forsvarspar: 30');
  assert.match(game({ me: 78, tweak: set(false) }), /\(fremmede\)/, 'omvendt: midtbanen har 30 overalt');
});
test('fuldtidssætningen tager MIDDEL over midtbanens pladser (ikke den første, den bedste eller den dårligste): LM 30 · CM 66 · CM 78 · RM 78 → 63 → "finder hinanden"', () => {
  // kun [1,5] og [5,6] er 30 (LM's to par); resten 78. Pladsernes middel (slotChem): 5 → 30, 6 → (78+30+78+78)/4 = 66, 7 → 78, 8 → 78; middel 63 → skala −0,31
  const tweak = (me) => { const s = me.tactics.lineupSlots; for (const [i, j] of neighbourPairs('4-4-2')) me.chemistry[pairKey(s[i], s[j])] = [(i === 5 || j === 5) ? 30 : 78, 0]; };
  assert.match(game({ me: 78, tweak }), /\(finder hinanden\)/, 'første plads (30) ville give "fremmede", bedste (78) ingen sætning, dårligste (30) "fremmede"');
});
test('fuldtidssætningen kræver et samspilsdata-grundlag: et hold uden tabel (håndbygget) får ingen sætning – heller ikke når ligaens snit (70) ville gøre det "neutrale" 78 til "stærkt"', () => {
  assert.doesNotMatch(game({ me: 78, chemRef: 70, tweak: (me) => { delete me.chemistry; } }), FT);
  assert.match(game({ me: 78, chemRef: 70 }), /\(stærkt\)/, 'data: SAMME hold MED tabel (78 ved snit 70) giver sætningen');
});
test('ligaens snit styrer sætningen: uden chemRef = 78 (80 er "spillet sammen"), med chemRef 70 er 80 "stærkt"; og playRound sender ligaens snit med', () => {
  assert.doesNotMatch(game({ me: 80 }), FT, 'ingen chemRef: 78, 80 → skala 0,25');
  assert.match(game({ me: 80, chemRef: 70 }), /\(stærkt\)/, 'chemRef 70: (80−70)/(86−70) = 0,625');
  assert.doesNotMatch(game({ me: 80, chemRef: 84 }), FT, 'chemRef 84: 80 er under snittet (−0,07) – "spillet sammen"');
  assert.match(game({ me: 70, chemRef: 84 }), /\(finder hinanden\)/, '70 ved snit 84: (84−70)/54 = −0,26');
  const round = (ref) => {
    const L = createLeague(createRng(11)), me = L.teams.find((x) => !x.isBot);
    for (const k of Object.keys(me.chemistry)) me.chemistry[k] = [80, 0];
    L.leagueMetadata.chemRef = ref;
    const res = playRound(L, createRng(11)), m = res.matches.find((x) => x.homeId === me.id || x.awayId === me.id);
    return m.events.find((e) => e.type === 'FULLTIME')?.text ?? '';
  };
  assert.match(round(70), /\(stærkt\)/, 'ligaens snit 70 når kampen: 80 er stærkt'); assert.doesNotMatch(round(78), FT);
});
