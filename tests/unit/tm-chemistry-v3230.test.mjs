// Test Manager (v3.23.0 PR-A): huller fundet ved mutation af 884420b – overlevende i chemistry-v3230.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { neighbourPairs, sharedMinutes, decayChemistry, applyChemistry, cleanChemistry, leagueChemRef, pairKey, seedChemistry,
  CHEM_BASE, STRANGER, PAIR_CAP } from '../../public/engine/chemistry.js';
import { FORMATIONS } from '../../public/engine/formations.js';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { playRound, commitRound } from '../../public/engine/season.js';
import { SEASON_ROUNDS } from '../../public/engine/schedule.js';
import { normalizeLeague } from '../../public/engine/sanitize.js';
import { MIGRATIONS } from '../../public/state/storage.js';

test('nabopar: den enlige angriber i 4-3-3 får sin NÆRMESTE markplads som nabo (ikke den fjerneste)', () => {
  const c = FORMATIONS['4-3-3'], d = (i, j) => Math.hypot(c[i].x - c[j].x, c[i].y - c[j].y);
  // ingen inden for 29 – ellers tester vi ikke fallbacken
  for (let j = 1; j < c.length; j++) if (j !== 9) assert.ok(d(9, j) > 29, `slot ${j} ligger inden for 29`);
  const nearest = [1, 2, 3, 4, 5, 6, 7, 8, 10].reduce((b, j) => (d(9, j) < d(9, b) ? j : b));
  const partners = neighbourPairs('4-3-3').filter((p) => p.includes(9)).map((p) => p.find((x) => x !== 9));
  assert.deepEqual(partners, [nearest]);
});

test('sletningstærskel: præcis 30,5 slettes, 30,6 og 30,8 bliver (fremmede + 0,5)', () => {
  // v − 0,035·(v−30) − 5 (fravær ≥ 3 runder): 35,7 → 30,5005 → 30,5 ; 35,8 → 30,597 → 30,6 ; 36,0 → 30,79 → 30,8
  const t = { chemistry: { 'a|b': [35.7, 0], 'a|c': [35.8, 0], 'a|d': [36, 0] } };
  decayChemistry(t, 10);
  assert.equal(t.chemistry['a|b'], undefined, '30,5 slettes');
  assert.deepEqual(t.chemistry['a|c'], [30.6, 0]);
  assert.deepEqual(t.chemistry['a|d'], [30.8, 0]);
});

test('decay uden tabel kaster ikke; applyChemistry på et hold uden tabel seeder det', () => {
  assert.doesNotThrow(() => decayChemistry({ squad: [] }, 3));
  const L = createLeague(createRng(5)), t = L.teams[1];
  delete t.chemistry;
  applyChemistry(t, [], '4-4-2', 4);
  assert.ok(t.chemistry && Object.keys(t.chemistry).length > 100, 'seedet og gemt på holdet');
  assert.ok(Object.values(t.chemistry).every(([v, r]) => v === CHEM_BASE && r === 4));
});

test('sharedMinutes: skiftet i samme minut giver 0 fælles minutter – intet par', () => {
  const e = (playerId, slot, minIn, minOut) => ({ playerId, slot, minIn, minOut });
  assert.deepEqual(sharedMinutes([e('x', 2, 1, 60), e('y', 3, 60, 90)], '4-4-2'), []);
  assert.deepEqual(sharedMinutes([e('x', 2, 1, 60), e('y', 3, 59, 90)], '4-4-2'), [['x', 'y', 1]]);
});

test('gemmet: loftet beholder de HØJESTE 300 (ikke de laveste); negativt, brøk-runde og 3-tuple afvises; ukendt a afvises; PAIR_CAP er 300', () => {
  assert.equal(PAIR_CAP, 300);
  const ids = new Set(), arr = []; for (let n = 0; n < 30; n++) { arr.push(`p${String(n).padStart(2, '0')}`); ids.add(arr[n]); }
  const chem = {}; let v = 0;
  for (let x = 0; x < 30; x++) for (let y = x + 1; y < 30; y++) chem[pairKey(arr[x], arr[y])] = [30 + (v++) * 0.1, 1];   // 435 par, 30,0 … 73,4
  const kept = cleanChemistry(chem, ids), vals = Object.values(kept).map((e) => e[0]).sort((a, b) => a - b);
  assert.equal(vals.length, 300);
  const top = Object.values(chem).map((e) => e[0]).sort((a, b) => b - a).slice(0, 300).sort((a, b) => a - b);
  assert.deepEqual(vals, top, 'de 300 højeste – ellers falder de bedste par ved første indlæsning');
  const one = new Set(['a', 'b']);
  // v3.23.0 (QC): ingen gyldige par = null, så holdet seedes igen (før: {} – hele holdet tavst fremmede)
  assert.deepEqual(cleanChemistry({ 'a|b': [50, 1.5] }, one), null, 'brøk-runde');
  assert.deepEqual(cleanChemistry({ 'a|b': [50, -1] }, one), null, 'negativ runde');
  assert.deepEqual(cleanChemistry({ 'a|b': [-5, 1] }, one), null, 'negativt samspil');
  assert.deepEqual(cleanChemistry({ 'a|b': [50, 1, 9] }, one), null, 'forkert længde');
  assert.deepEqual(cleanChemistry({ '0|b': [50, 1] }, one), null, 'ukendt første spiller (nøglen er rigtigt sorteret)');
  assert.deepEqual(cleanChemistry({ 'a|b': [50, 1] }, one), { 'a|b': [50, 1] });
});

test('leagueChemRef: middel af holdenes nabopar i deres egen formation, afrundet til 1 decimal; tom liga = BASE', () => {
  const mk = (form, val, ids) => ({ tactics: { baseFormation: form, lineupSlots: ids }, chemistry: Object.fromEntries(neighbourPairs(form).flatMap(([i, j]) => [[pairKey(ids[i], ids[j]), [val, 0]]])) });
  const ids = (p) => Array.from({ length: 11 }, (_, i) => `${p}${i}`);
  const a = mk('4-4-2', 60, ids('a')), b = mk('4-3-3', 71, ids('b'));
  const na = neighbourPairs('4-4-2').length, nb = neighbourPairs('4-3-3').length;
  assert.notEqual(na, nb, 'data: forskellig pardantal, så formationen betyder noget');
  assert.equal(leagueChemRef({ teams: [a, b] }), Math.round(((60 * na + 71 * nb) / (na + nb)) * 10) / 10);
  assert.equal(leagueChemRef({ teams: [{ tactics: {} }] }), CHEM_BASE, 'ingen opstilling: BASE');
  const c = mk('4-4-2', 60.07, ids('c'));
  assert.equal(leagueChemRef({ teams: [c] }), 60.1, 'rundet til én decimal');
});

test('sanitize: manglende tabel i et gem midt i sæsonen seedes med den aktuelle runde (ikke 0) – ellers −5 pr. runde for alle par', () => {
  const L = createLeague(createRng(2)); L.leagueMetadata.round = 20;
  delete L.teams[0].chemistry; normalizeLeague(L);
  assert.ok(Object.values(L.teams[0].chemistry).every(([v, r]) => v === CHEM_BASE && r === 20));
});

test('MIGRATIONS[8] alene (uden sanitize som sikkerhedsnet) seeder hvert hold på BASE med gemmets runde', () => {
  const raw = JSON.parse(fs.readFileSync(new URL('../fixtures/save-v3.22.1.json', import.meta.url), 'utf8'));
  const round = raw.league.leagueMetadata.round;
  assert.ok(Number.isInteger(round) && round > 0, 'data: gem midt i sæsonen');
  const out = MIGRATIONS[8](raw);
  assert.equal(out.schemaVersion, 9);
  for (const t of out.league.teams) assert.ok(Object.keys(t.chemistry).length > 100 && Object.values(t.chemistry).every(([v, r]) => v === CHEM_BASE && r === round));
});

test('sæsonskifte: en spiller, der går på pension, har ingen par tilbage hos holdet (prune efter seasonTurnover)', () => {
  const rng = createRng(7), L = createLeague(rng), t = L.teams.find((x) => x.isBot);
  for (let r = 0; r < SEASON_ROUNDS - 1; r++) commitRound(L, playRound(L, rng), rng);
  const vet = t.squad.find((p) => p.id === t.tactics.lineupSlots[5]);
  vet.age = 50;
  const res = playRound(L, rng);
  assert.ok(Object.keys(t.chemistry).some((k) => k.split('|').includes(vet.id)), 'data: han har par før sæsonskiftet');
  commitRound(L, res, rng);
  assert.ok(!t.squad.some((p) => p.id === vet.id), 'data: han er gået på pension');
  assert.deepEqual(Object.keys(t.chemistry).filter((k) => k.split('|').includes(vet.id)), []);
  const ids = new Set(t.squad.map((p) => p.id));
  assert.ok(Object.keys(t.chemistry).every((k) => k.split('|').every((i) => ids.has(i))));
});

test('runden: samspillet læser kampens STARTformation (result.startFormations), ikke holdets nuværende', () => {
  const rng = createRng(11), L = createLeague(rng), t = L.teams[0];
  const res = playRound(L, rng), m = res.matches.find((x) => x.homeId === t.id || x.awayId === t.id), side = m.homeId === t.id ? 'home' : 'away';
  const list = m.ratings[side], start = m.startFormations[side];
  const other = start === '4-3-3' ? '3-5-2' : '4-3-3';
  assert.notDeepEqual(neighbourPairs(other), neighbourPairs(start));
  const expected = structuredClone(t.chemistry); applyChemistry({ chemistry: expected }, list, start, res.round); decayChemistry({ chemistry: expected }, res.round);
  t.tactics.baseFormation = other;   // brugeren skifter opstilling, før runden bogføres
  commitRound(L, res, rng);
  assert.deepEqual(t.chemistry, expected);
});
