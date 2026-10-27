// v3.23.0 – samspil, data uden virkning (brugerens landstræner: "hvordan spillerne arbejder/tænker sammen"; brugeren valgte
// "i forhold til ligaen"). public/engine/chemistry.js: nabopar, seed, aftagende vækst, træk mod fremmede, forfald ved fravær,
// salg/køb, gemmet og migreringen 8 → 9. Kampene er uændrede (fingerprint.test.mjs) – virkningen kommer i v3.24.0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { neighbourPairs, seedChemistry, chemOf, applyChemistry, decayChemistry, pruneChemistry, cleanChemistry, leagueChemRef, pairKey,
  CHEM_BASE, STRANGER, K_GAIN, LEAK, ABSENT_ROUNDS, DECAY, PAIR_CAP } from '../../public/engine/chemistry.js';
import { FORMATIONS } from '../../public/engine/formations.js';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { playRound, commitRound } from '../../public/engine/season.js';
import { parseSave, serialize, SCHEMA_VERSION } from '../../public/state/storage.js';
import { normalizeLeague } from '../../public/engine/sanitize.js';

test('nabopar: CB-parret, backen og kanten, midtbanen og angriberparret i 4-4-2 – aldrig målmanden; hver markplads har en nabo i alle formationer', () => {
  // 4-4-2: 1 LB, 2-3 CB, 4 RB, 5 LM, 6-7 CM, 8 RM, 9-10 ST
  assert.deepEqual(neighbourPairs('4-4-2'), [[1, 2], [1, 5], [2, 3], [2, 6], [3, 7], [4, 3].sort(), [4, 8], [5, 6], [6, 7], [6, 9], [7, 8], [7, 10], [9, 10]].sort((a, b) => a[0] - b[0] || a[1] - b[1]));
  for (const f of Object.keys(FORMATIONS)) {
    const ps = neighbourPairs(f);
    assert.ok(ps.every(([i, j]) => i >= 1 && j >= 1), `${f}: målmanden har ingen par`);
    for (let s = 1; s <= 10; s++) assert.ok(ps.some((p) => p.includes(s)), `${f}: plads ${s} (${FORMATIONS[f][s].r}) har en nabo`);
  }
  // 4-3-3: den enlige angriber (ST 50,16) har ingen inden for 29 – hans nærmeste er en kant (LW/RW 33)
  assert.ok(neighbourPairs('4-3-3').some((p) => p.includes(9)));
});

test('seed: alle par af markspillere står på BASE (målmanden uden par) – også ethvert par i startopstillingen', () => {
  const L = createLeague(createRng(4));
  for (const t of L.teams) {
    const out = t.squad.filter((p) => p.position !== 'GK').length;
    assert.equal(Object.keys(t.chemistry).length, (out * (out - 1)) / 2);
    assert.ok(Object.values(t.chemistry).every(([v, r]) => v === CHEM_BASE && r === 0));
    const gk = t.squad.find((p) => p.position === 'GK');
    assert.ok(!Object.keys(t.chemistry).some((k) => k.split('|').includes(gk.id)));
    const slots = t.tactics.lineupSlots;
    for (const [i, j] of neighbourPairs(t.tactics.baseFormation)) assert.equal(chemOf(t, slots[i], slots[j]), CHEM_BASE, `${t.name} ${i}-${j}`);
  }
  assert.equal(chemOf({ squad: [] }, 'a', 'b'), CHEM_BASE, 'ingen tabel: neutral');
  assert.equal(chemOf({ chemistry: {} }, 'a', 'b'), STRANGER, 'ukendt par: fremmede');
});

const E = (playerId, slot, minIn = 1, minOut = 90) => ({ playerId, slot, minIn, minOut });
test('vækst: aftagende mod 100 efter fælles minutter på nabopladser; en indskifter tæller fra sit minut; ikke-naboer intet', () => {
  const t = { squad: [], chemistry: { [pairKey('a', 'b')]: [CHEM_BASE, 0] } };
  // a (CB, slot 2) og b (CB, slot 3): 90 min → 78 + 0,14 · 22 = 81,08 → 81,1
  applyChemistry(t, [E('a', 2), E('b', 3), E('c', 9)], '4-4-2', 5);
  assert.deepEqual(t.chemistry[pairKey('a', 'b')], [81.1, 5]);
  assert.equal(t.chemistry[pairKey('a', 'c')], undefined, 'CB og ST er ikke naboer');
  // d kommer ind på slot 3 i 61. minut (29 fælles min): fremmed 30 + 0,14 · 70 · 29/90 = 33,16 → 33,2 med a
  applyChemistry(t, [E('a', 2), E('b', 3, 1, 60), E('d', 3, 61, 90)], '4-4-2', 6);
  assert.deepEqual(t.chemistry[pairKey('a', 'd')], [33.2, 6]);
  assert.deepEqual(t.chemistry[pairKey('a', 'b')], [Math.round((81.1 + K_GAIN * 18.9 * 60 / 90) * 10) / 10, 6], 'b gik ud efter 60 min');
  assert.equal(t.chemistry[pairKey('b', 'd')], undefined, 'samme plads, aldrig på banen sammen');
});

test('træk og fravær: hvert par trækkes LEAK mod fremmede pr. runde; efter 3 runder uden fælles minutter desuden −5; ved fremmede slettes det', () => {
  const t = { squad: [], chemistry: { 'a|b': [78, 10], 'a|c': [78, 10 - ABSENT_ROUNDS], 'a|d': [33, 0] } };
  decayChemistry(t, 10);
  assert.deepEqual(t.chemistry['a|b'], [76.3, 10], '78 − 0,035 · 48 = 76,32 – ingen fraværsstraf i runde 0–2');
  assert.deepEqual(t.chemistry['a|c'], [71.3, 7], '76,32 − 5 = 71,32 – 3 runder fraværende');
  assert.equal(t.chemistry['a|d'], undefined, 'ned til fremmede: slettet (et ukendt par ER fremmede)');
  // To runder på bænken koster ikke mere end trækket (Spilfører: aldrig pr. hvilet kamp)
  const u = { squad: [], chemistry: { 'a|b': [78, 8] } }; decayChemistry(u, 10);
  assert.equal(u.chemistry['a|b'][0], 76.3);
});

test('ligevægt: et fast par ender ≈ 86, et par med halvdelen af kampene lavere, et nyt køb når ligaens niveau på ≈ 10 kampe', () => {
  const run = (start, every, n) => { const t = { squad: [], chemistry: { 'a|b': [start, 0] } };
    for (let r = 1; r <= n; r++) { if (r % every === 0) applyChemistry(t, [E('a', 2), E('b', 3)], '4-4-2', r); decayChemistry(t, r); }
    return t.chemistry['a|b']?.[0] ?? STRANGER; };
  const fixed = run(CHEM_BASE, 1, 200), half = run(CHEM_BASE, 2, 200);
  assert.ok(fixed > 84 && fixed < 88, `fast ${fixed}`);
  assert.ok(half < fixed - 5, `halvdelen ${half} mod fast ${fixed}`);
  let k = 0; for (let v = STRANGER; v < CHEM_BASE - 5; k++) v = run(STRANGER, 1, k + 1);
  assert.ok(k >= 7 && k <= 14, `fra fremmed til ligaens niveau (−5) på ${k} kampe`);
});

test('salg/køb: hans par forsvinder i begge klubber – han er fremmed i den nye', async () => {
  const { buyPlayer } = await import('../../public/engine/transfers.js').catch(() => ({}));
  const t = { squad: [{ id: 'a' }, { id: 'b' }], chemistry: { 'a|b': [80, 1], 'a|x': [80, 1] } };
  pruneChemistry(t);
  assert.deepEqual(Object.keys(t.chemistry), ['a|b']);
  // Gennem selve transferkoden (move): et bot-salg midt i en rigtig liga
  const L = createLeague(createRng(8)), rng = createRng(8);
  for (let r = 0; r < 7; r++) commitRound(L, playRound(L, rng), rng);   // vinduet før runde 8 åbner
  const seller = L.teams.find((x) => x.isBot), p = seller.squad.find((x) => x.position !== 'GK');
  const before = Object.keys(seller.chemistry).filter((k) => k.split('|').includes(p.id)).length;
  assert.ok(before > 0, 'data: han havde par');
  const mod = await import('../../public/engine/transfers.js');
  const me = L.teams.find((x) => !x.isBot);
  me.cashBalance = 1e9;
  const res = mod.buyPlayer(L, me, p.id);
  assert.equal(res, null, res);
  assert.equal(Object.keys(seller.chemistry).filter((k) => k.split('|').includes(p.id)).length, 0, 'væk hos sælgeren');
  assert.equal(Object.keys(me.chemistry).filter((k) => k.split('|').includes(p.id)).length, 0, 'fremmed hos køberen');
  assert.equal(chemOf(me, p.id, me.squad.find((x) => x.id !== p.id && x.position !== 'GK').id), STRANGER);
});

test('runden: commitRound giver startopstillingens nabopar vækst og ligaens snit (chemRef); kampene er de samme som uden samspil', () => {
  const L = createLeague(createRng(11)), rng = createRng(11);
  const t = L.teams[0], slots = t.tactics.lineupSlots, [i, j] = neighbourPairs(t.tactics.baseFormation).find(([a, b]) => FORMATIONS[t.tactics.baseFormation][a].r === 'CB' && FORMATIONS[t.tactics.baseFormation][b].r === 'CB');
  const res = playRound(L, rng);
  const m = res.matches.find((x) => x.homeId === t.id || x.awayId === t.id), list = m.homeId === t.id ? m.ratings.home : m.ratings.away;
  const both90 = [slots[i], slots[j]].every((id) => list.some((e) => e.playerId === id && (e.minIn ?? 1) <= 1 && (e.minOut ?? 90) >= 90));
  assert.ok(both90, 'data: CB-parret spillede hele kampen (seed 11)');
  commitRound(L, res, rng);
  assert.deepEqual(t.chemistry[pairKey(slots[i], slots[j])], [79.3, 1], 'CB-parret: 81,1 efter kampen, − 0,035 · 51,1 = 79,31 efter runden');
  assert.equal(L.leagueMetadata.chemRef, leagueChemRef(L));
});

test('gemmet: ukendte spillere, forkert form og over loftet ryddes; mangler tabellen, seedes holdet', () => {
  const ids = new Set(['a', 'b', 'c']);
  assert.deepEqual(cleanChemistry({ 'a|b': [80, 3], 'b|a': [80, 3], 'a|z': [80, 3], 'a|a': [80, 3], 'a|c': [150, 3], 'b|c': ['x', 3], 'a|c|b': [1, 1] }, ids), { 'a|b': [80, 3] });
  assert.equal(cleanChemistry(null, ids), null); assert.equal(cleanChemistry([], ids), null);
  const many = {}, big = new Set(); for (let n = 0; n < 30; n++) big.add(`p${String(n).padStart(2, '0')}`);
  const arr = [...big]; let v = 0; for (let x = 0; x < 30; x++) for (let y = x + 1; y < 30; y++) many[pairKey(arr[x], arr[y])] = [(v++ % 100), 1];
  const kept = cleanChemistry(many, big);
  assert.equal(Object.keys(kept).length, PAIR_CAP); assert.ok(Math.min(...Object.values(kept).map((x) => x[0])) >= Math.min(...Object.values(many).map((x) => x[0])));
  const L = createLeague(createRng(2)); delete L.teams[3].chemistry; L.teams[2].chemistry = { 'nope|x': [50, 1] };
  normalizeLeague(L);
  assert.ok(Object.keys(L.teams[3].chemistry).length > 50, 'manglede: seedet');
  assert.ok(Object.values(L.teams[2].chemistry).length > 50 && Object.values(L.teams[2].chemistry).every(([v]) => v === CHEM_BASE), 'kun ugyldige par: seedet igen (QC – ellers tavst fremmede)');
});

// Gemmet fra forrige version (CLAUDE.md §9): tests/fixtures/save-v3.22.1.json er lavet med v3.22.1-koden (main cbb5c30): ny liga
// (seed 19) + 6 runder + serialize. Migreringen 8 → 9 seeder alle hold på BASE ved runde 6 – intet andet ændres.
test('migrering 8 → 9 (gem fra v3.22.1): hvert hold får alle par af markspillere på BASE; trup, opstilling og sporet er urørte', () => {
  const RAW = fs.readFileSync(new URL('../fixtures/save-v3.22.1.json', import.meta.url), 'utf8'), raw = JSON.parse(RAW);
  assert.equal(raw.schemaVersion, 8); assert.equal(SCHEMA_VERSION, 9);
  assert.ok(raw.league.teams.every((t) => t.chemistry === undefined), 'data: ingen samspil før');
  const r = parseSave(RAW);
  assert.ok(r.ok, r.error); assert.equal(r.migratedFrom, 8);
  const L = r.state.league;
  L.teams.forEach((t, i) => {
    const o = raw.league.teams[i], out = t.squad.filter((p) => p.position !== 'GK').length;
    assert.deepEqual(t.squad.map((p) => p.id), o.squad.map((p) => p.id)); assert.deepEqual(t.tactics.lineupSlots, o.tactics.lineupSlots);
    assert.equal(Object.keys(t.chemistry).length, (out * (out - 1)) / 2);
    assert.ok(Object.values(t.chemistry).every(([v, rd]) => v === CHEM_BASE && rd === 6));
    const slots = t.tactics.lineupSlots;
    for (const [a, b] of neighbourPairs(t.tactics.baseFormation)) assert.equal(chemOf(t, slots[a], slots[b]), CHEM_BASE);
  });
  assert.deepEqual(L.lastRound.matches.map((m) => m.trace), raw.league.lastRound.matches.map((m) => m.trace));
  const back = parseSave(serialize(r.state));
  assert.equal(back.migratedFrom, null); assert.deepEqual(back.state.league.teams.map((t) => t.chemistry), L.teams.map((t) => t.chemistry));
});

// tools/measure-chemistry.mjs base: botternes nabopar i ligevægt. Uden LEAK (lineær vækst, planens første udgave) 97,6 – alle par
// mættede, og samspil kunne kun straffe (QC/Spilfører). Med K 0,14 og LEAK 0,035: ≈ 79,6, og seedet (CHEM_BASE 78) ligger inden
// for 5, så en ny eller migreret liga ikke drifter. Båndet [72; 86] er rødt på 97,6.
test('målt: botternes samspil i ligevægt ligger under loftet (72–86; uden træk 97,6) og tæt på seedet (±5), med spredning', async () => {
  const { measureBase } = await import('../../tools/measure-chemistry.mjs');
  const r = measureBase(2, 2);
  assert.ok(r.base >= 72 && r.base <= 86, `ligevægt ${r.base}`);
  assert.ok(Math.abs(r.base - CHEM_BASE) <= 5, `seed ${CHEM_BASE} mod ${r.base}`);
  assert.ok(r.high < 0.05 && r.sd >= 2, `andel ≥ 95: ${r.high}, spredning ${r.sd}`);
});

test('ligaens snit (chemRef): middel af nabopar i opstillingerne – kendt værdi på en håndbygget liga; uden gemt værdi regnes det nu', async () => {
  const { chemRefOf } = await import('../../public/engine/chemistry.js');
  const L = createLeague(createRng(5));
  for (const t of L.teams) { const slots = t.tactics.lineupSlots; t.chemistry = {}; for (const [a, b] of neighbourPairs(t.tactics.baseFormation)) t.chemistry[pairKey(slots[a], slots[b])] = [t === L.teams[0] ? 90 : 70, 0]; }
  const per = L.teams.map((t) => neighbourPairs(t.tactics.baseFormation).length), want = Math.round(((per[0] * 90 + per.slice(1).reduce((x, y) => x + y, 0) * 70) / per.reduce((x, y) => x + y, 0)) * 10) / 10;
  assert.equal(leagueChemRef(L), want, `(${per[0]}·90 + resten·70)/alle`);
  delete L.leagueMetadata.chemRef; assert.equal(chemRefOf(L), want, 'ingen gemt værdi: regnet nu');
  L.leagueMetadata.chemRef = 500; assert.equal(chemRefOf(L), 100, 'klemt'); L.leagueMetadata.chemRef = 75; assert.equal(chemRefOf(L), 75);
});
