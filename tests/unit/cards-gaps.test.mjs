// v3.15 Test Manager: huller fundet ved mutation af røde kort/træthedsskift (se cards.test.mjs, fatigue*.test.mjs).
// En scriptet rng (som fatigue.test.mjs) gør kampen deterministisk: ingen skud, ingen skader – kun det, scriptet beder om.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';
import { runProfile, createSheet, finalizeSheet, motmOrder, RATING_MIN, RATING_MAX } from '../../public/engine/ratings.js';
import { buildGazette } from '../../public/engine/gazette.js';
import { FORMATIONS } from '../../public/engine/formations.js';

function stubRng(script = {}, nextValue = 0.5) {
  const calls = {};
  return { next: () => nextValue, int: (a) => a, pick: (arr) => arr[0],
    chance: (p) => { const n = (calls[p] = (calls[p] ?? -1) + 1); const s = script[p]; return typeof s === 'function' ? s(n) : !!s; } };
}
const SK = (v) => ({ pace: v, stamina: v, strength: v, ballControl: v, passing: v, finishing: v, positioning: v, intercepting: v, goalkeeping: v });
function arena({ homeLimit = 70 } = {}) {
  const L = createLeague(createRng(1));
  const [H, A] = [L.teams[0], L.teams[1]];
  for (const t of [H, A]) {
    for (const p of t.squad) { p.skills = SK(10); p.freshness = 100; p.injuryMatchesLeft = 0; p.counterTactics = { vsPress: 25, vsLowBlock: 25, vsTrapLong: 25 }; }
    t.tactics.baseFormation = '4-4-2'; t.tactics.customCoords = {}; t.tactics.conditionalRules = [];
    t.tactics.lineupSlots = t.squad.slice(0, 11).map((p) => p.id);
    Object.assign(t.tactics.phases.phase1_buildUp, { offBallRuns: 'NORMAL' });
    Object.assign(t.tactics.phases.phase2_defending, { pressingHeight: 'MID_BLOCK' });
    Object.assign(t.tactics.phases.phase3_transition, { onBallLost: 'DROP_BACK' });
  }
  H.subsLimit = homeLimit; A.subsLimit = 0;
  return { L, H, A };
}
const slot = (t, i) => t.squad.find((p) => p.id === t.tactics.lineupSlots[i]);
const bench = (t) => t.squad.filter((p) => !t.tactics.lineupSlots.includes(p.id));
const subs = (m, home = true) => m.events.filter((e) => e.type === 'SUB' && e.isHome === home);
const tag = (p) => `#${p.shirtNumber} ${p.shortName}`;
// Direkte rødt til hjemmeholdets første forsvarer (plads 1) i 3. minut – hjemmeholdet begår frisparket (0.5 falsk).
const RED_AT_3 = { 0.06: (n) => n === 0, 0.4: (n) => n === 0, 0.07: true };

test('en udvist med en trukket position: hans tomme plads indgår ikke i "ude af zone"-vurderingen (ingen nedbrud) – en anden trukket spiller gør', () => {
  const { H, A } = arena({ homeLimit: 0 });
  // Hjemmeholdet beholder bolden med ti mand (midtbane 10,5: 20,16 + 4 > 23,75) og vurderer sine trukne positioner hver gang (0.25)
  for (const p of H.squad) { p.skills.passing = 10.5; p.skills.ballControl = 10.5; }
  H.tactics.customCoords = { 1: { x: 50, y: 5 }, 4: { x: 50, y: 5 } };   // plads 1 (udvises i 3. minut) og plads 4: begge langt fra sin zone
  const m = simulateMatch(H, A, stubRng({ ...RED_AT_3, 0.25: (n) => n > 0 }));
  const red = m.events.find((e) => e.type === 'RED');
  assert.ok(red && red.text.includes(tag(slot(H, 1))), 'data: plads 1 udvist i 3. minut');
  const fails = m.events.filter((e) => e.label === 'Ude af zone');
  const after = fails.filter((e) => e.min > red.min);
  assert.ok(after.length >= 20, `data: ude af zone efter udvisningen (${after.length})`);
  assert.ok(after.every((e) => e.text.includes(tag(slot(H, 4)))), 'kun den spiller, der stadig er på banen');
  assert.ok(!after.some((e) => e.text.includes(tag(slot(H, 1)))), 'ikke den udviste');
});

test('Hvis-Så-udskiftning af en udvist: beskeden siger "er udvist" (ikke "ikke på banen"), og ingen skiftes ind', () => {
  const { H, A } = arena({ homeLimit: 0 });
  const inP = bench(H).find((p) => p.line === 'DEF');
  H.tactics.conditionalRules = [{ ruleId: 1, minuteTrigger: 6, condition: 'ANY', margin: 1, newFormation: '4-4-2', newPlan: null, slotRemapping: [...Array(11).keys()], action: 'SUB', subOut: slot(H, 1).id, subIn: inP.id }];
  const m = simulateMatch(H, A, stubRng(RED_AT_3));
  assert.equal(subs(m).length, 0, 'ingen indskiftning for den udviste');
  assert.deepEqual(m.events.filter((e) => e.label === 'Hvis-Så-skift ikke udført').map((e) => e.text),
    [`📋 [${H.name} • Hvis-Så] Udskiftningen kunne ikke udføres i 6. minut: ${tag(slot(H, 1))} er udvist.`]);
});

test('pausen ved 45\' har intet loft: fem trætte, der alle rammer grænsen i 45. minut, skiftes ud i ét tick (ellers ville to vente til 48.)', () => {
  const { H, A } = arena();
  const roles = FORMATIONS['4-4-2'].map((c) => c.r);
  // Friskhed så hver spiller først er under 70 % i 45. minut: tab = drain90 · (t − 1)/90 → 41 min er stadig over, 44 min under
  // Bænken har to friske pr. kæde (DEF, MID, ATT); en indskifter skal være af samme kæde som den udskiftede – så to DEF, to MID og én ATT
  const want = { DEF: 2, MID: 2, ATT: 1 }, tired = [];
  for (let i = 1; i <= 10; i++) if (want[slot(H, i).line] > 0) { want[slot(H, i).line]--; tired.push(i); }
  assert.equal(tired.length, 5, 'data: fem trætte med hver sin friske indskifter');
  for (const i of tired) {
    const p = slot(H, i); p.skills.stamina = 1;
    const d = runProfile({ line: p.line, skills: p.skills }, H, createRng(1), roles[i]).drain90;
    p.freshness = 70 + (42.5 * d) / 90;
  }
  for (const b of bench(H)) b.freshness = 100;
  const m = subs(simulateMatch(H, A, stubRng({})));
  assert.deepEqual(m.map((e) => e.min), [45, 45, 45, 45, 45], m.map((e) => `${e.min} ${e.text}`).join(' | '));
});

test('et hold uden forsvarere tilbage: en straffe imod det tager en midtbanespiller som forsyndet (kæden lånes fra nabokæden – ingen nedbrud)', () => {
  const { H, A } = arena({ homeLimit: 0 });
  // Fire direkte røde i 3., 6., 9. og 12. minut rammer de fire forsvarere i rækkefølge (første forsvarer hver gang); i 15. minut straffe til udeholdet
  const m = simulateMatch(H, A, stubRng({ 0.06: (n) => n < 4, 0.4: (n) => n < 4, 0.07: true, 0.011: (n) => n === 4 }));
  const reds = m.events.filter((e) => e.type === 'RED');
  assert.deepEqual(reds.map((e) => e.min), [3, 6, 9, 12]);
  for (let i = 1; i <= 4; i++) assert.ok(reds[i - 1].text.includes(tag(slot(H, i))), reds[i - 1].text);
  const pen = m.events.find((e) => e.label?.includes('Straffe') || /STRAFFESPARK/.test(e.text));
  assert.ok(pen && pen.min === 15, 'data: straffen blev taget i 15. minut');
  const mids = [5, 6, 7, 8].map((i) => tag(slot(H, i)));
  assert.ok(mids.some((t) => pen.text.includes(`fældes i feltet af ${t} (${H.name})`)), pen.text);
  assert.equal(m.endState.home.starters.filter(Boolean).length, 7);
});

test('offeret for en tackling vælges blandt dem, der stadig er på banen: den udviste plads (tom) kan ikke blive skadet – første og sidste plads i rækken', () => {
  const run = (pickInt) => {
    const { H, A } = arena({ homeLimit: 0 });
    const rng = stubRng({ 0.06: (n) => n <= 1, 0.5: (n) => n === 1, 0.4: true, 0.07: (n) => n === 0 });
    rng.int = pickInt;
    const m = simulateMatch(H, A, rng);
    return { H, m, injury: m.events.find((e) => e.type === 'INJURY' && e.isHome), reds: m.events.filter((e) => e.type === 'RED').map((e) => e.min) };
  };
  // 3. min: hjemmeholdet begår frisparket og får plads 1 udvist. 6. min: udeholdet begår det, hjemmeholdet er offer.
  // int → første: første plads på banen = plads 2 (plads 1 er tom); int → sidste: plads 10
  const first = run((a) => a), last = run((a, b) => b);
  assert.deepEqual(first.reds, [3]); assert.deepEqual(last.reds, [3]);
  assert.ok(first.injury && first.injury.text.includes(`${tag(slot(first.H, 2))} bliver skadet`), first.injury?.text);
  assert.ok(last.injury && last.injury.text.includes(`${tag(slot(last.H, 10))} bliver skadet`), last.injury?.text);
});

test('et rødt kort koster −1,0 i karakter (oven i −0,35 for tacklingen): den udviste står med mindre end en spiller, der blot begik frisparket', () => {
  const { H, A } = arena({ homeLimit: 0 });
  const rated = (m, i) => m.ratings.home.find((e) => e.playerId === slot(H, i).id);
  const m = simulateMatch(H, A, stubRng(RED_AT_3));
  // Plads 1 (back): 6,5 − 0,35 − 1,0 = 5,15 + 0,5 (clean sheet, 0-0) = 5,65 → afrundet 5,7 (uden −1,0: 6,65 → 6,7). Plads 2 (ikke involveret, stopper): 6,5 + 0,5 = 7,0
  assert.equal(rated(m, 1).red, 'DIRECT');
  assert.equal(rated(m, 1).rating, 5.7); assert.equal(rated(m, 2).rating, 7.0);
});

test('"Udskiftninger"-linjen (sparet friskhed) tæller kun skiftede spillere – en udvist er ikke en udskiftet', () => {
  const sav = (m) => m.events.filter((e) => e.label === 'Udskiftninger').map((e) => e.text);
  // Kun en udvisning, ingen skift: ingen linje (ellers "Din udskiftede spiller sparede ca. N point")
  { const { H, A } = arena({ homeLimit: 0 }); assert.deepEqual(sav(simulateMatch(H, A, stubRng(RED_AT_3))), []); }
  // Én udvist og én træt, der skiftes: linjen taler om ÉN udskiftet
  const { H, A } = arena();
  const cm = slot(H, 6); cm.freshness = 75; cm.skills.stamina = 1;
  const m = simulateMatch(H, A, stubRng(RED_AT_3));
  assert.equal(subs(m).length, 1, 'data: ét træthedsskift');
  assert.equal(m.events.filter((e) => e.type === 'RED').length, 1, 'data: én udvisning');
  assert.match(sav(m).join('|'), new RegExp(`^🔋 \\[${H.name}\\] Din udskiftede spiller sparede ca\\. \\d+ point friskhed til næste runde\\.$`));
});

test('vundne taktiske dueller giver DUEL_BONUS (0,2) i karakter – opbygningen (playmaker) og trukket-ude-af-zone-straffen (presseren) hver for sig', () => {
  const rating = (m, side, t, i) => m.ratings[side].find((e) => e.playerId === slot(t, i).id).rating;
  // Opbygning: hjemmets playmaker (plads 5) vinder 2 gange: (passing + boldkontrol) 24 mod pres 22 → 6,5 + 2·0,2 = 6,9 (0,35 ville give 7,2)
  { const { H, A } = arena({ homeLimit: 0 }); slot(H, 5).skills.passing = 12; slot(H, 5).skills.ballControl = 12;
    const m = simulateMatch(H, A, stubRng({ 0.48: (n) => n < 2 }));
    assert.equal(m.stats.hTacticSuccess, 2, 'data: to vundne opbygninger'); assert.equal(rating(m, 'home', H, 5), 6.9); }
  // Ude af zone: udeholdets presser (plads 5) udnytter hullet 2 gange → 6,5 + 2·0,2 = 6,9 (0,35 ville give 7,2); den trukne spiller får −0,45 hver
  { const { H, A } = arena({ homeLimit: 0 }); H.tactics.customCoords = { 5: { x: 50, y: 82 } };
    const m = simulateMatch(H, A, stubRng({ 0.25: (n) => n < 2 }));
    assert.equal(m.events.filter((e) => e.label === 'Ude af zone').length, 2, 'data: to straffe');
    assert.equal(rating(m, 'away', A, 5), 6.9); assert.equal(rating(m, 'home', H, 5), 5.6); }
});

// ---------- Karakterer: clean sheet-bonus og rangering ----------
function sheetOf(spec) {   // spec: [{ i, role, slot?, raw (karakter før afslutningen), goals?, assists? }] – alle på hjemmeholdet
  const L = createLeague(createRng(2)), T = L.teams[0], rng = createRng(1), sheet = createSheet();
  for (const s of spec) {
    const p = T.squad[s.i];
    sheet.register(p, T, true, s.role, 1, rng, 0, s.slot ?? null);
    sheet.entries[p.id].rating = s.raw;                       // præcis start (arket tilføjer ellers ± 0,15 støj)
    for (let k = 0; k < (s.goals ?? 0); k++) sheet.bump(p.id, 'goals');
    for (let k = 0; k < (s.assists ?? 0); k++) sheet.bump(p.id, 'assists');
  }
  return { T, sheet, ids: spec.map((s) => T.squad[s.i].id) };
}

test('clean sheet-bonussen lægges til FØR klemmen: en målmand på 9,8 ender på 10,0 (ikke 10,3), en forsvarer på 3,0 på 3,5 (ikke 4,0); uden clean sheet intet', () => {
  const run = (conceded) => {
    const { sheet, ids } = sheetOf([{ i: 0, role: 'GK', slot: 0, raw: 9.8 }, { i: 1, role: 'CB', slot: 2, raw: 3.0 }, { i: 6, role: 'CM', slot: 6, raw: 3.0 }, { i: 7, role: 'CM', slot: 7, raw: 9.8 }]);
    finalizeSheet(sheet, 1, conceded, createRng(1), () => 0);
    return ids.map((id) => sheet.entries[id].rating);
  };
  assert.deepEqual(run(0), [RATING_MAX, RATING_MIN, RATING_MIN, 9.8], 'GK 9,8 + 0,5 → 10; CB 3,0 + 0,5 = 3,5 (ikke 3,5 + 0,5); midtbane får ingen bonus og klemmes til 3,5');
  assert.deepEqual(run(1), [9.8, RATING_MIN, RATING_MIN, 9.8], 'med et mål imod ingen bonus (CB 3,0 klemmes til 3,5)');
  assert.deepEqual([RATING_MIN, RATING_MAX], [3.5, 10]);
});

test('Kampens spiller ved lige karakter: flest mål·2 + oplæg vinder – uanset rækkefølgen på arket (2 mål slår 3 oplæg; mål + oplæg slår mål alene)', () => {
  const win = (spec) => { const { sheet, ids } = sheetOf(spec.map((s, n) => ({ i: n + 1, role: 'CM', slot: n + 1, raw: 12, ...s }))); const r = finalizeSheet(sheet, 3, 0, createRng(1), () => 0); return ids.indexOf(r.motm.playerId); };
  // alle klemmes til 10,0 – kun tie-breaket afgør
  assert.equal(win([{ assists: 3 }, { goals: 2 }]), 1, '2 mål (4) slår 3 oplæg (3)');
  assert.equal(win([{ goals: 2 }, { assists: 3 }]), 0);
  assert.equal(win([{ goals: 1 }, { goals: 1, assists: 1 }]), 1, 'mål + oplæg (3) slår mål alene (2)');
  assert.equal(win([{}, { assists: 1 }]), 1, 'ét oplæg slår intet');
  assert.equal(win([{ goals: 1, assists: 1 }, { goals: 1 }]), 0);
  // helt lige: den første på arket (ingen byttes rundt uden grund)
  assert.equal(win([{ goals: 1 }, { goals: 1 }]), 0);
  assert.ok(motmOrder({ rating: 7, goals: 1 }, { rating: 7.1 }) > 0 && motmOrder({ rating: 7 }, { rating: 7 }) === 0, 'manglende mål/oplæg tæller som 0 (ikke NaN)');
});

test('Rundens spiller ved lige karakter: samme rangering som Kampens spiller – den med flest mål·2 + oplæg, også når han står sidst', () => {
  const { T, sheet, ids } = sheetOf([{ i: 1, role: 'CM', slot: 1, raw: 12, assists: 3 }, { i: 2, role: 'CM', slot: 2, raw: 12, goals: 2 }]);
  const r = finalizeSheet(sheet, 2, 0, createRng(1), () => 0);
  const match = (home) => ({ homeGoals: 2, awayGoals: 0, homeName: T.name, awayName: 'X', stats: { hVarChecks: 0, aVarChecks: 0 }, goalsPool: [], ratings: { home, away: [] }, events: [] });
  assert.equal(buildGazette([match(r.home)]).playerOfTheRound.playerId, ids[1]);
  assert.equal(buildGazette([match([...r.home].reverse())]).playerOfTheRound.playerId, ids[1], 'uafhængig af rækkefølgen');
});
