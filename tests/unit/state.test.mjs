import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { SAVE_KEY, BACKUP_PREFIX, SCHEMA_VERSION, loadGame, saveGame, resetGame, exportGame, importGame, parseSave, serialize } from '../../public/state/storage.js';
import * as act from '../../public/state/actions.js';

function fakeStorage(initial = {}, { failWrite = false } = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (failWrite) throw new Error('QuotaExceededError'); m.set(k, String(v)); },
    keys: () => [...m.keys()],
    map: m,
  };
}
const game = (seed = 1) => ({ league: createLeague(createRng(seed)), notes: { x: 'note' }, ui: { activePresetIndex: 2 } });
const FIXTURE = fs.readFileSync(new URL('../fixtures/save-schema1.json', import.meta.url), 'utf8');

// ---------- Gem og indlæs ----------
test('tomt lager giver "empty"; gem og indlæs giver præcis samme spil tilbage', () => {
  const s = fakeStorage();
  assert.equal(loadGame(s).status, 'empty');
  const g = game();
  assert.deepEqual(saveGame(s, g, 1000), { ok: true, savedAt: 1000 });
  const r = loadGame(s);
  assert.equal(r.status, 'ok');
  assert.equal(r.backupKey, null, 'ingen backup når intet migreres');
  assert.deepEqual(r.state.league, g.league);
  assert.deepEqual(r.state.notes, g.notes);
  assert.equal(r.state.ui.activePresetIndex, 2);
  assert.equal(r.state.savedAt, 1000);
  assert.equal(JSON.parse(s.getItem(SAVE_KEY)).schemaVersion, SCHEMA_VERSION);
});

test('fixture fra skema 1 indlæses med 8 hold × 18 spillere, taktik, noter og runde intakt', () => {
  const r = loadGame(fakeStorage({ [SAVE_KEY]: FIXTURE }));
  assert.equal(r.status, 'ok', r.error);
  const L = r.state.league;
  assert.equal(L.teams.length, 8);
  assert.ok(L.teams.every((t) => t.squad.length === 18));
  assert.equal(L.leagueMetadata.round, 1);
  assert.deepEqual(L.teams[0].tactics.customCoords, { 5: { x: 60, y: 30 } });
  assert.equal(r.state.notes[L.teams[1].squad[8].id], 'Farlig i luften');
  assert.equal(r.state.ui.activePresetIndex, 1);
});

test('ulæselige data slettes ALDRIG: de rå data lægges i backup, og fejlen meldes', () => {
  for (const bad of ['{ikke json', JSON.stringify({ schemaVersion: 1, league: { teams: [] } }), JSON.stringify({ league: {} }), '"tekst"']) {
    const s = fakeStorage({ [SAVE_KEY]: bad });
    const r = loadGame(s);
    assert.equal(r.status, 'error', bad);
    assert.ok(r.error.length > 10);
    assert.ok(r.backupKey.startsWith(BACKUP_PREFIX));
    assert.equal(s.getItem(r.backupKey), bad, 'backup er de rå data');
    assert.equal(s.getItem(SAVE_KEY), bad, 'originalen står urørt');
  }
});

test('en fil fra en nyere version afvises med besked (ikke overskrevet)', () => {
  const s = fakeStorage({ [SAVE_KEY]: JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, league: {} }) });
  const r = loadGame(s);
  assert.equal(r.status, 'error');
  assert.match(r.error, /nyere version/);
});

test('migreringskæden: en manglende migrering melder fejl i stedet for at gætte', () => {
  const r = parseSave(JSON.stringify({ schemaVersion: 0 }));
  assert.equal(r.ok, false);
});

test('ny liga tager backup af det gamle spil først', () => {
  const s = fakeStorage({ [SAVE_KEY]: FIXTURE });
  const r = resetGame(s, game(9), 5000);
  assert.equal(r.ok, true);
  assert.equal(s.getItem(r.backupKey), FIXTURE);
  assert.notEqual(s.getItem(SAVE_KEY), FIXTURE);
});

test('fejl ved skrivning meldes (ikke tavs)', () => {
  const r = saveGame(fakeStorage({}, { failWrite: true }), game());
  assert.equal(r.ok, false); assert.match(r.error, /kunne ikke gemmes/);
});

test('eksport → import giver samme spil', () => {
  const g = game(4);
  const r = importGame(exportGame(g));
  assert.equal(r.ok, true);
  assert.deepEqual(r.state.league, g.league);
  assert.equal(importGame('nej').ok, false);
});

// ---------- Handlinger ----------
test('byt: to startere bytter plads; starter ⇄ bænk; to bænkspillere gør intet', () => {
  const t = createLeague(createRng(3)).teams[0];
  const s = t.tactics.lineupSlots;
  const [a, b] = [s[1], s[2]];
  const benchA = t.squad[12].id, benchB = t.squad[13].id;
  assert.equal(act.swapPlayers(t, a, b), true); assert.deepEqual([s[1], s[2]], [b, a]);
  assert.equal(act.swapPlayers(t, benchA, s[3]), true); assert.equal(s[3], benchA);
  const before = s.slice();
  assert.equal(act.swapPlayers(t, t.squad[14].id, t.squad[15].id), false); assert.deepEqual(s, before);
  assert.equal(act.swapPlayers(t, s[4], benchB), true); assert.equal(s[4], benchB);
  assert.equal(new Set(s).size, 11);
});

test('formation: skift nulstiller trukne positioner; ukendt formation afvises', () => {
  const t = createLeague(createRng(3)).teams[0];
  t.tactics.customCoords = { 3: { x: 1, y: 1 } };
  assert.equal(act.setFormation(t, '3-5-2'), true);
  assert.deepEqual(t.tactics.customCoords, {});
  assert.equal(act.setFormation(t, '9-9-9'), false); assert.equal(t.tactics.baseFormation, '3-5-2');
});

test('træk: målmanden kan ikke trækkes, positioner klemmes til banen', () => {
  const t = createLeague(createRng(3)).teams[0];
  assert.equal(act.moveSlot(t, 0, { x: 50, y: 50 }), false);
  assert.equal(act.moveSlot(t, 4, { x: 120, y: -5 }), true);
  assert.deepEqual(t.tactics.customCoords[4], { x: 92, y: 8 });
});

test('Plan A/B/C: den aktive gemmes, den valgte hentes, opstillingen følger holdet', () => {
  const t = createLeague(createRng(3)).teams[0];
  t.tactics.phases.phase2_defending.pressingHeight = 'HIGH_GEGENPRESS';
  const lineup = t.tactics.lineupSlots.slice();
  act.switchPreset(t, 0, 1);
  assert.equal(t.tactics.baseFormation, '4-3-3');
  assert.deepEqual(t.tactics.lineupSlots, lineup);
  assert.equal(t.tacticPresets[0].phases.phase2_defending.pressingHeight, 'HIGH_GEGENPRESS');
  act.switchPreset(t, 1, 0);
  assert.equal(t.tactics.phases.phase2_defending.pressingHeight, 'HIGH_GEGENPRESS');
  assert.equal(act.switchPreset(t, 0, 0), false);
});

test('Hvis-Så: højst 5 regler; ny regel har gyldig remap', () => {
  const t = createLeague(createRng(3)).teams[0];
  while (act.addRule(t));
  assert.equal(t.tactics.conditionalRules.length, act.MAX_RULES);
  assert.equal(act.MAX_RULES, 5);
  const r = t.tactics.conditionalRules.at(-1);
  assert.deepEqual(r.slotRemapping, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(new Set(t.tactics.conditionalRules.map((x) => x.ruleId)).size, 5);
  act.removeRule(t, 0); assert.equal(t.tactics.conditionalRules.length, 4);
});

// ---------- Test Managers fund ----------
test('ny liga/import afbrydes, hvis backuppen mislykkes – det gamle spil overskrives aldrig', () => {
  const s = fakeStorage({ [SAVE_KEY]: FIXTURE });
  const realSet = s.setItem;
  s.setItem = (k, v) => { if (k.startsWith(BACKUP_PREFIX)) throw new Error('QuotaExceededError'); realSet(k, v); };
  const r = resetGame(s, game(9), 5000);
  assert.equal(r.ok, false); assert.match(r.error, /sikkerhedskopieres/);
  assert.equal(s.getItem(SAVE_KEY), FIXTURE);
});

test('backup-nøgler er unikke pr. tidspunkt; to nulstillinger giver to backups', () => {
  const s = fakeStorage({ [SAVE_KEY]: FIXTURE });
  const a = resetGame(s, game(1), 1000).backupKey, b = resetGame(s, game(2), 2000).backupKey;
  assert.notEqual(a, b);
  assert.equal(s.getItem(a), FIXTURE);
  assert.notEqual(s.getItem(b), FIXTURE);
});

test('skema-version kræves; ui og noter får standardværdier; migratedFrom er null på nyeste skema', () => {
  const ok = JSON.parse(FIXTURE);
  assert.equal(parseSave(JSON.stringify({ ...ok, schemaVersion: undefined })).ok, false);
  assert.equal(parseSave(JSON.stringify({ ...ok, schemaVersion: '1' })).ok, true);
  const r = parseSave(JSON.stringify({ ...ok, ui: undefined, notes: 'x' }));
  assert.deepEqual(r.state.ui, { activePresetIndex: 0 }); // opponentIdx forsvandt med kampprogrammet (v3.11)
  assert.deepEqual(r.state.notes, {});
  assert.equal(r.migratedFrom, 1, 'fixture fra skema 1 migreres');
  assert.equal(parseSave(serialize(r.state)).migratedFrom, null, 'nyeste skema migreres ikke');
});

test('migreringer køres i rækkefølge fra det gemte skema', async () => {
  const mod = await import('../../public/state/storage.js');
  const data = JSON.parse(FIXTURE);
  // Et skema-0-fixture, som en (test-)migrering løfter til skema 1.
  mod.MIGRATIONS[0] = (d) => ({ ...d, schemaVersion: 1, notes: { ...d.notes, migreret: 'ja' } });
  try {
    const r = mod.parseSave(JSON.stringify({ ...data, schemaVersion: 0 }));
    assert.equal(r.ok, true); assert.equal(r.migratedFrom, 0); assert.equal(r.state.notes.migreret, 'ja');
  } finally { delete mod.MIGRATIONS[0]; }
});

test('browser der nægter læsning giver en fejl, ikke en tom liga', () => {
  const r = loadGame({ getItem: () => { throw new Error('SecurityError'); }, setItem: () => {} });
  assert.equal(r.status, 'error'); assert.match(r.error, /tillader ikke/);
});

test('handlinger: plan-skift bevarer den aktuelle opstilling; updateRule, removeRule(i), resetDrag, moveSlot > 10', () => {
  const t = createLeague(createRng(3)).teams[0];
  act.swapPlayers(t, t.tactics.lineupSlots[1], t.squad[12].id);
  const lineup = t.tactics.lineupSlots.slice();
  act.switchPreset(t, 0, 2);
  assert.deepEqual(t.tactics.lineupSlots, lineup, 'opstillingen følger holdet, ikke planen');
  act.addRule(t); act.addRule(t);
  const ids = t.tactics.conditionalRules.map((r) => r.ruleId);
  act.updateRule(t, 1, { minuteTrigger: 80, condition: 'DRAW' });
  assert.equal(t.tactics.conditionalRules[1].minuteTrigger, 80); assert.equal(t.tactics.conditionalRules[1].condition, 'DRAW');
  act.removeRule(t, 1);
  assert.deepEqual(t.tactics.conditionalRules.map((r) => r.ruleId), [ids[0], ids[2]]);
  const r = t.tactics.conditionalRules.at(-1); r.slotRemapping[0] = 5;
  act.addRule(t);
  assert.equal(t.tactics.conditionalRules.at(-1).slotRemapping[0], 0, 'nye regler deler ikke remap-array');
  t.tactics.customCoords = { 3: { x: 1, y: 1 } }; act.resetDrag(t); assert.deepEqual(t.tactics.customCoords, {});
  assert.equal(act.moveSlot(t, 11, { x: 50, y: 50 }), false);
});

test('referatfiltre: "Kun taktik" medtager Hvis-Så-skift; spilletid vises som 90\' for hele kampen', async () => {
  const { filterEvents, minutes } = await import('../../public/ui/matchcenter.js');
  const ev = [{ category: 'TACTIC', type: 'TACTIC_WIN' }, { category: 'HIGHLIGHT', type: 'TRIGGER' }, { category: 'PLAY', type: 'SAVE' }, { category: 'HIGHLIGHT', type: 'GOAL' }];
  assert.deepEqual(filterEvents(ev, 'tactic').map((e) => e.type), ['TACTIC_WIN', 'TRIGGER']);
  assert.deepEqual(filterEvents(ev, 'key').map((e) => e.type), ['TRIGGER', 'GOAL']);
  assert.equal(filterEvents(ev, 'all').length, 4);
  assert.equal(minutes({ minIn: 1, minOut: 90 }), "90'");
  assert.equal(minutes({ minIn: 1, minOut: 63 }), "0'–63'");
  assert.equal(minutes({ minIn: 63, minOut: 90 }), "63'–90'");
});

// ---------- Skema 2: Hvis-Så med antal mål og planer ----------
test('migrering 1 → 2: gamle regler får antal mål; "Foran med 1" bliver "Foran med mindst 1"', () => {
  const old = JSON.parse(FIXTURE);
  assert.equal(old.schemaVersion, 1);
  const t0 = old.league.teams[0];
  t0.tactics.conditionalRules = [
    { ruleId: 1, minuteTrigger: 65, condition: 'TRAILING', newFormation: '3-4-3', slotRemapping: [0, 1, 2, 3, 5, 6, 7, 4, 8, 9, 10] },
    { ruleId: 2, minuteTrigger: 75, condition: 'LEADING_BY_1', newFormation: '5-4-1', slotRemapping: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  ];
  t0.tacticPresets[1].conditionalRules = [{ ruleId: 1, minuteTrigger: 80, condition: 'LEADING_BY_1', newFormation: '5-4-1' }];
  const store = fakeStorage({ [SAVE_KEY]: JSON.stringify(old) });
  const r = loadGame(store);
  assert.equal(r.status, 'ok', r.error); assert.equal(r.migratedFrom, 1);
  assert.equal(store.getItem(r.backupKey), JSON.stringify(old), 'de rå skema 1-data er gemt i backup før migreringen');
  const rules = r.state.league.teams[0].tactics.conditionalRules;
  assert.deepEqual(rules.map((x) => [x.condition, x.margin, x.newFormation, x.newPlan, x.minuteTrigger]), [['TRAILING', 1, '3-4-3', null, 65], ['LEADING', 1, '5-4-1', null, 75]]);
  assert.equal(r.state.league.teams[0].tacticPresets[1].conditionalRules[0].condition, 'LEADING');
  assert.equal(r.state.league.leagueMetadata.round, 1, 'ligaen følger med uændret');
});

test('handling: den aktive plan holdes lig med live-taktikken', () => {
  const t = createLeague(createRng(3)).teams[0];
  act.setFormation(t, '3-5-2'); act.syncActivePreset(t, 0);
  assert.equal(t.tacticPresets[0].baseFormation, '3-5-2');
  t.tactics.phases.phase1_buildUp.passingStyle = 'SHORT';
  assert.equal(t.tacticPresets[0].phases.phase1_buildUp.passingStyle, 'BALANCED', 'en kopi, ikke samme objekt');
});

test('normalizeRule: antal mål klemmes til 1–5, ukendt betingelse bliver "bagud", ukendt plan fjernes', async () => {
  const { normalizeRule } = await import('../../public/engine/sanitize.js');
  assert.equal(normalizeRule({ condition: 'LEADING', margin: 0 }).margin, 1);
  assert.equal(normalizeRule({ condition: 'LEADING', margin: 9 }).margin, 5);
  assert.equal(normalizeRule({ condition: 'LEADING', margin: 'abc' }).margin, 1);
  assert.equal(normalizeRule({ condition: 'abc' }).condition, 'TRAILING');
  assert.equal(normalizeRule({ condition: 'DRAW', newPlan: 3 }).newPlan, null);
  assert.equal(normalizeRule({ condition: 'DRAW', newPlan: 2 }).newPlan, 2);
});

test('migrering 1 → 2 alene (uden reparation bagefter) løfter skema og regler', async () => {
  const { MIGRATIONS } = await import('../../public/state/storage.js');
  const d = JSON.parse(FIXTURE);
  d.league.teams[0].tactics.conditionalRules = [{ ruleId: 1, minuteTrigger: 70, condition: 'LEADING_BY_1', newFormation: '5-4-1' }];
  const out = MIGRATIONS[1](d);
  assert.equal(out.schemaVersion, 2);
  assert.deepEqual([out.league.teams[0].tactics.conditionalRules[0].condition, out.league.teams[0].tactics.conditionalRules[0].margin], ['LEADING', 1]);
});

// ---------- Skema 3 (v3.6): mod-kunnen-pulje og lavere spillere ----------
const FIXTURE2 = fs.readFileSync(new URL('../fixtures/save-schema2.json', import.meta.url), 'utf8');
test('migrering 2 → 4: mod-kunnen ×0,55 inden for puljen, højder lagt om efter rang, scouting følger med – med backup', async () => {
  const { COUNTER_POOL, counterFloor } = await import('../../public/engine/counter.js');
  const old = JSON.parse(FIXTURE2);
  assert.equal(old.schemaVersion, 2);
  const oldPlayers = new Map(old.league.teams.flatMap((t) => t.squad.map((p) => [p.id, p])));
  // Et scouting-indtryk med højden i teksten
  const tall = [...oldPlayers.values()].find((p) => p.heightCm >= 190);
  const viewer = old.league.teams.find((t) => !t.isBot).id;
  old.league.scouting[viewer][tall.id] = [`[Forsæson] I træningskampen steg ${tall.shortName} (${tall.heightCm} cm) en hel etage over alle andre.`];
  const store = fakeStorage({ [SAVE_KEY]: JSON.stringify(old) });
  const r = loadGame(store);
  assert.equal(r.status, 'ok', r.error); assert.equal(r.migratedFrom, 2);
  assert.equal(store.getItem(r.backupKey), JSON.stringify(old), 'de rå skema 2-data er gemt i backup før migreringen');
  const L = r.state.league;
  let checked = 0;
  for (const t of L.teams) for (const p of t.squad) {
    const o = oldPlayers.get(p.id);
    const v = Object.values(p.counterTactics), sum = v.reduce((a, b) => a + b);
    assert.ok(sum <= COUNTER_POOL && v.every((x) => x >= counterFloor(p.age)), JSON.stringify(p.counterTactics));
    // Uden puljeklip: præcis round(gammel·0,55) (eller bunden)
    const scaled = Object.fromEntries(Object.entries(o.counterTactics).map(([k, x]) => [k, Math.max(counterFloor(p.age), Math.round(x * 0.55))]));
    if (Object.values(scaled).reduce((a, b) => a + b) <= COUNTER_POOL) { assert.deepEqual(p.counterTactics, scaled); checked++; }
  }
  assert.ok(checked > 100, String(checked));
  const meanAfter = L.teams.flatMap((t) => t.squad).reduce((a, p) => a + p.heightCm, 0) / oldPlayers.size;
  const newTall = L.teams.flatMap((t) => t.squad).find((p) => p.id === tall.id).heightCm;
  assert.ok(meanAfter >= 183.5 && meanAfter <= 185, String(meanAfter)); // Superligaen ≈184 (v3.6 gav ≈181)
  assert.deepEqual(L.scouting[viewer][tall.id], [`[Forsæson] I træningskampen steg ${tall.shortName} (${newTall} cm) en hel etage over alle andre.`]);
  assert.equal(L.leagueMetadata.round, old.league.leagueMetadata.round, 'ligaen følger med uændret');
  // Gemt i det nye format: en ny indlæsning migrerer ikke igen (ingen dobbelt nedskalering)
  saveGame(store, r.state);
  const again = loadGame(store);
  assert.equal(again.migratedFrom, null);
  assert.equal(again.state.league.teams[0].squad[0].heightCm, L.teams[0].squad[0].heightCm);
});

test('skema 1-fixturet løftes hele vejen til 4', () => {
  const r = parseSave(FIXTURE);
  assert.ok(r.ok, r.error); assert.equal(r.migratedFrom, 1);
  const p = r.state.league.teams[0].squad[0], o = JSON.parse(FIXTURE).league.teams[0].squad[0];
  assert.ok(Number.isFinite(p.heightCm) && p.heightCm >= 168 && p.heightCm <= 201 && o.heightCm > 0);
});

test('migrering 2 → 3 alene: værdier over puljen skaleres forholdsmæssigt (rækkefølgen bevares), manglende felter får standard', async () => {
  const { MIGRATIONS } = await import('../../public/state/storage.js');
  const d = JSON.parse(FIXTURE2);
  const [a, b, c] = d.league.teams[0].squad;
  a.age = 30; a.counterTactics = { vsPress: 90, vsLowBlock: 80, vsTrapLong: 70 };
  b.age = 22; b.counterTactics = { vsPress: 40 };
  delete c.age; c.counterTactics = { vsPress: 20, vsLowBlock: 20, vsTrapLong: 20 };
  const out = MIGRATIONS[2](d);
  assert.equal(out.schemaVersion, 3);
  // ×0,55: 50, 44, 39 (sum 133) → ·100/133: 38, 33, 29 = 100
  assert.deepEqual(out.league.teams[0].squad[0].counterTactics, { vsPress: 38, vsLowBlock: 33, vsTrapLong: 29 });
  // manglende nøgler regnes som 15 → ·0,55 = 8
  assert.deepEqual(out.league.teams[0].squad[1].counterTactics, { vsPress: 22, vsLowBlock: 8, vsTrapLong: 8 });
  // uden alder: bund 5 (som en 20-årig) – 20·0,55 = 11
  assert.deepEqual(out.league.teams[0].squad[2].counterTactics, { vsPress: 11, vsLowBlock: 11, vsTrapLong: 11 });
});

// ---------- Skema 4 (v3.7): højder som i Superligaen ----------
const FIXTURE3 = fs.readFileSync(new URL('../fixtures/save-schema3.json', import.meta.url), 'utf8');
test('migrering 3 → 4: rang i hver kæde bevares, ligaen får Superligaens snit og spænd, tekster følger med', async () => {
  const { MIGRATIONS } = await import('../../public/state/storage.js');
  const d = JSON.parse(FIXTURE3);
  assert.equal(d.schemaVersion, 3);
  const before = new Map(d.league.teams.flatMap((t) => t.squad.map((p) => [p.id, { h: p.heightCm, line: p.line, tag: `#${p.shirtNumber} ${p.shortName}` }])));
  const hsBefore = [...before.values()].map((x) => x.h);
  assert.ok(Math.max(...hsBefore) <= 193, 'fixturet er en v3.6-liga (højeste 193)');
  // En referattekst med højden (som luftduellen skriver den)
  const someone = d.league.teams[0].squad[3];
  d.league.lastRound.matches[0].events.push({ text: `✈️ Stærk luftduel: #${someone.shirtNumber} ${someone.shortName} (${someone.heightCm} cm) stiger højest.` });
  const out = MIGRATIONS[3](d);
  assert.equal(out.schemaVersion, 4);
  const players = out.league.teams.flatMap((t) => t.squad);
  const hs = players.map((p) => p.heightCm), mean = hs.reduce((a, b) => a + b) / hs.length;
  assert.ok(mean >= 183.5 && mean <= 185, String(mean));            // v3.6: ≈181,5
  assert.ok(Math.max(...hs) >= 197 && Math.max(...hs) <= 201, String(Math.max(...hs))); // v3.6: 193
  assert.ok(Math.min(...hs) >= 168, String(Math.min(...hs)));
  // Rang i kæden bevares: højere før → mindst lige så høj efter
  for (const line of ['GK', 'DEF', 'MID', 'ATT']) {
    const ps = players.filter((p) => p.line === line);
    for (const a of ps) for (const b of ps) if (before.get(a.id).h > before.get(b.id).h) assert.ok(a.heightCm >= b.heightCm, `${line}: ${a.shortName} vs ${b.shortName}`);
  }
  const ev = out.league.lastRound.matches[0].events.at(-1).text;
  assert.ok(ev.includes(`(${players.find((p) => p.id === someone.id).heightCm} cm)`), ev);
});

test('migrering 3 → 4: en spiller, hvis højde ændres, får rettet ALLE forekomster i scouting og referat; ugyldig højde røres ikke', async () => {
  const { MIGRATIONS, HEIGHT_V37 } = await import('../../public/state/storage.js');
  const { heightAtQuantile: hq } = await import('../../public/engine/generator.js');
  const heightAtQuantile = (line, q) => hq(line, q, HEIGHT_V37); // 3 → 4 bruger v3.7's frosne tabel
  const d = JSON.parse(FIXTURE3);
  const all = d.league.teams.flatMap((t) => t.squad);
  const defs = all.filter((p) => p.line === 'DEF').sort((a, b) => a.heightCm - b.heightCm || String(a.id).localeCompare(String(b.id)));
  const tallest = defs.at(-1), shortest = defs[0];
  const wantTall = heightAtQuantile('DEF', (defs.length - 0.5) / defs.length), wantShort = heightAtQuantile('DEF', 0.5 / defs.length);
  assert.notEqual(tallest.heightCm, wantTall, 'testdata: højden ændres');
  const viewer = d.league.teams.find((t) => !t.isBot).id;
  const tag = `#${tallest.shirtNumber} ${tallest.shortName}`;
  d.league.scouting[viewer][tallest.id] = [`${tallest.shortName} (${tallest.heightCm} cm) … igen ${tallest.shortName} (${tallest.heightCm} cm).`];
  d.league.lastRound.matches[0].events.push({ text: `${tag} (${tallest.heightCm} cm) vandt, og ${tag} (${tallest.heightCm} cm) vandt igen.` });
  const broken = all.find((p) => p.line === 'MID'); broken.heightCm = 'x';
  const out = MIGRATIONS[3](d);
  const p = out.league.teams.flatMap((t) => t.squad).find((x) => x.id === tallest.id);
  assert.equal(p.heightCm, wantTall);
  assert.equal(out.league.teams.flatMap((t) => t.squad).find((x) => x.id === shortest.id).heightCm, wantShort); // fraktil (i + 0,5)/n
  assert.equal(out.league.scouting[viewer][tallest.id][0], `${tallest.shortName} (${wantTall} cm) … igen ${tallest.shortName} (${wantTall} cm).`);
  assert.equal(out.league.lastRound.matches[0].events.at(-1).text, `${tag} (${wantTall} cm) vandt, og ${tag} (${wantTall} cm) vandt igen.`);
  assert.equal(out.league.teams.flatMap((t) => t.squad).find((x) => x.id === broken.id).heightCm, 'x');
});

test('migrering 2 → 3 retter også højden i teksterne (−5 cm)', async () => {
  const { MIGRATIONS } = await import('../../public/state/storage.js');
  const d = JSON.parse(FIXTURE2);
  const p = d.league.teams[0].squad[0], viewer = d.league.teams.find((t) => !t.isBot).id;
  d.league.scouting[viewer][p.id] = [`${p.shortName} (${p.heightCm} cm)`];
  const out = MIGRATIONS[2](d);
  assert.equal(out.league.scouting[viewer][p.id][0], `${p.shortName} (${p.heightCm} cm)`); // p er muteret: ny højde
  assert.equal(out.league.teams[0].squad[0].heightCm, JSON.parse(FIXTURE2).league.teams[0].squad[0].heightCm - 5);
});

// ---------- Skema 5 (v3.8): naturlig position og højde pr. position ----------
const FIXTURE4 = fs.readFileSync(new URL('../fixtures/save-schema4.json', import.meta.url), 'utf8');
test('migrering 4 → 5: alle får en naturlig position; højde efter dokumentets tabel; rang i positionen bevares; tekster følger med', async () => {
  const { MIGRATIONS } = await import('../../public/state/storage.js');
  const { HEIGHT_BY_POS } = await import('../../public/engine/generator.js');
  const d = JSON.parse(FIXTURE4);
  assert.equal(d.schemaVersion, 4);
  assert.ok(d.league.teams.every((t) => t.squad.every((p) => p.position === undefined)), 'fixturet er en v3.7-liga uden positioner');
  const before = new Map(d.league.teams.flatMap((t) => t.squad.map((p) => [p.id, p.heightCm])));
  // En spiller i dit hold, hvis højde ændres (findes på en kopi)
  const probe = MIGRATIONS[4](JSON.parse(FIXTURE4)).league.teams[0].squad;
  const someone = d.league.teams[0].squad.find((p, i) => probe[i].heightCm !== p.heightCm);
  const tag = `#${someone.shirtNumber} ${someone.shortName}`, old = someone.heightCm;
  d.league.lastRound.matches[0].events.push({ text: `✈️ Stærk luftduel: ${tag} (${someone.heightCm} cm) stiger højest.` });
  const viewer = d.league.teams.find((t) => !t.isBot).id;
  (d.league.scouting[viewer] ||= {})[someone.id] = [`${someone.shortName} (${someone.heightCm} cm) ruver.`];
  const out = MIGRATIONS[4](d);
  assert.equal(out.schemaVersion, 5);
  for (const t of out.league.teams) {
    const c = (line, pos) => t.squad.filter((p) => p.line === line && p.position === pos).length;
    assert.deepEqual([c('GK', 'GK'), c('DEF', 'CB'), c('DEF', 'FB'), c('MID', 'CM'), c('MID', 'AM'), c('MID', 'WM'), c('ATT', 'ST'), c('ATT', 'WM')], [2, 3, 3, 3, 1, 2, 3, 1], t.name);
    // Pr. hold og kæde: enhver stopper var mindst lige så høj som enhver back før migreringen.
    for (const [line, hi, lo] of [['DEF', 'CB', 'FB'], ['ATT', 'ST', 'WM']]) {
      const H = t.squad.filter((p) => p.line === line && p.position === hi), L = t.squad.filter((p) => p.line === line && p.position === lo);
      for (const a of H) for (const b of L) assert.ok(before.get(a.id) >= before.get(b.id), `${t.name} ${line}`);
    }
  }
  const players = out.league.teams.flatMap((t) => t.squad);
  for (const pos of Object.keys(HEIGHT_BY_POS)) {
    const ps = players.filter((p) => p.position === pos);
    if (!ps.length) continue;
    const t = HEIGHT_BY_POS[pos], mean = ps.reduce((a, p) => a + p.heightCm, 0) / ps.length;
    assert.ok(ps.every((p) => p.heightCm >= t.min && p.heightCm <= t.max), pos);
    assert.ok(Math.abs(mean - (t.mid + 0.75)) <= 1.5, `${pos} snit ${mean}`);
    // Rang i positionen (over hele ligaen) bevares
    for (const a of ps) for (const b of ps) if (before.get(a.id) > before.get(b.id)) assert.ok(a.heightCm >= b.heightCm, `${pos}: ${a.shortName} vs ${b.shortName}`);
  }
  const cbMean = players.filter((p) => p.position === 'CB').reduce((a, p) => a + p.heightCm, 0) / 24;
  const fbMean = players.filter((p) => p.position === 'FB').reduce((a, p) => a + p.heightCm, 0) / 24;
  assert.ok(cbMean - fbMean >= 12, `CB ${cbMean} vs FB ${fbMean} (v3.7: samme kæde-fordeling, forskel ≈5)`);
  const now = players.find((p) => p.id === someone.id).heightCm;
  assert.notEqual(now, old, 'testdata: højden ændres');
  assert.equal(out.league.lastRound.matches[0].events.at(-1).text, `✈️ Stærk luftduel: ${tag} (${now} cm) stiger højest.`);
  assert.equal(out.league.scouting[viewer][someone.id][0], `${someone.shortName} (${now} cm) ruver.`);
});
test('fixture skema 4 indlæses (parseSave) – positioner sat, intet tabt, migreret fra 4', () => {
  const r = parseSave(FIXTURE4);
  assert.ok(r.ok, r.error);
  assert.equal(r.migratedFrom, 4);
  const d = JSON.parse(FIXTURE4);
  assert.equal(r.state.league.teams.length, 8);
  assert.equal(r.state.league.leagueMetadata.round, d.league.leagueMetadata.round);
  assert.ok(r.state.league.teams.every((t) => t.squad.length === 18 && t.squad.every((p) => ['GK', 'CB', 'FB', 'CM', 'WM', 'AM', 'ST'].includes(p.position))));
  assert.equal(JSON.stringify(r.state.league.teams[0].tactics.lineupSlots), JSON.stringify(d.league.teams[0].tactics.lineupSlots));
});

// ---------- v3.8 Test Manager: rang-fraktilen, lige høje og ugyldig højde i 4 → 5 ----------
test('migrering 4 → 5: ny højde = fraktil (rang+½)/n i positionen over hele ligaen – hver spiller, ikke kun bånd', async () => {
  const { MIGRATIONS } = await import('../../public/state/storage.js');
  const { heightAtQuantile } = await import('../../public/engine/generator.js');
  const d = JSON.parse(FIXTURE4);
  const before = new Map(d.league.teams.flatMap((t) => t.squad.map((p) => [p.id, p.heightCm])));
  const out = MIGRATIONS[4](JSON.parse(FIXTURE4));
  const players = out.league.teams.flatMap((t) => t.squad);
  for (const pos of ['GK', 'CB', 'FB', 'CM', 'AM', 'WM', 'ST']) {
    const ps = players.filter((p) => p.position === pos).sort((a, b) => before.get(a.id) - before.get(b.id) || String(a.id).localeCompare(String(b.id)));
    ps.forEach((p, i) => assert.equal(p.heightCm, heightAtQuantile(pos, (i + 0.5) / ps.length), `${pos} nr. ${i} (${p.id})`));
  }
});
test('migrering 4 → 5: lige høje i samme position får højder efter id (ikke efter trup-rækkefølge)', async () => {
  const { MIGRATIONS } = await import('../../public/state/storage.js');
  const { heightAtQuantile } = await import('../../public/engine/generator.js');
  const d = JSON.parse(FIXTURE4);
  const sq = d.league.teams[0].squad;
  // plr_t0_13 står EFTER plr_t0_2 i truppen, men er mindre som tekst. Begge er ligaens højeste stoppere og lige høje.
  for (const id of ['plr_t0_2', 'plr_t0_13']) sq.find((p) => p.id === id).heightCm = 201;
  const out = MIGRATIONS[4](d);
  const cbs = out.league.teams.flatMap((t) => t.squad).filter((p) => p.position === 'CB');
  assert.equal(cbs.length, 24);
  const h = (id) => out.league.teams[0].squad.find((p) => p.id === id).heightCm;
  const lo = heightAtQuantile('CB', 22.5 / 24), hi = heightAtQuantile('CB', 23.5 / 24);
  assert.ok(lo < hi, `testdata: de to øverste rang skal give forskellig højde (${lo} / ${hi})`);
  assert.deepEqual([h('plr_t0_13'), h('plr_t0_2')], [lo, hi]);
});
test('migrering 4 → 5: en spiller med ugyldig højde røres ikke – men får stadig en position, og de andre får tal', async () => {
  const { MIGRATIONS } = await import('../../public/state/storage.js');
  const d = JSON.parse(FIXTURE4);
  const bad = d.league.teams[1].squad.find((p) => p.id === 'plr_t1_5'); // en back
  bad.heightCm = null;
  const out = MIGRATIONS[4](d);
  const o = out.league.teams[1].squad.find((p) => p.id === 'plr_t1_5');
  assert.equal(o.heightCm, null);
  assert.ok(['CB', 'FB'].includes(o.position), o.position);
  for (const p of out.league.teams.flatMap((t) => t.squad)) if (p.id !== 'plr_t1_5') assert.ok(Number.isInteger(p.heightCm), `${p.id} ${p.heightCm}`);
});

test('HEIGHT_V37 er v3.7\'s fordeling, frosset (bogstavelig) – migreringen 3 → 4 må aldrig følge senere tabelrettelser', async () => {
  const { HEIGHT_V37 } = await import('../../public/state/storage.js');
  const { heightAtQuantile } = await import('../../public/engine/generator.js');
  assert.deepEqual(HEIGHT_V37, {
    GK: { mid: 192, dice: 4, min: 168, max: 201 }, DEF: { mid: 186, dice: 6, min: 168, max: 201 },
    MID: { mid: 179.5, dice: 6, min: 168, max: 201 }, ATT: { mid: 181, dice: 6, min: 168, max: 201 },
  });
  // fraktiler uden for midten (terningernes antal sider afgør): GK d=4, øvrige d=6
  assert.deepEqual([0.1, 0.9].map((q) => heightAtQuantile('GK', q, HEIGHT_V37)), [187, 199]);
  assert.deepEqual([0.1, 0.9].map((q) => heightAtQuantile('MID', q, HEIGHT_V37)), [171, 189]);
});

// ---------- v3.9: løb uden bold (intet skemabump – fixTactics spreder feltet ind) ----------
const FIXTURE5 = fs.readFileSync(new URL('../fixtures/save-schema5.json', import.meta.url), 'utf8');
test('gem fra v3.8 (skema 5, uden offBallRuns): dit hold og dine planer får NORMAL, bots profilens værdi; intet andet ændres', async () => {
  const { BOT_PROFILES } = await import('../../public/engine/generator.js');
  const raw = JSON.parse(FIXTURE5);
  assert.equal(raw.schemaVersion, 5);
  assert.ok(!FIXTURE5.includes('offBallRuns'), 'fixturet er gemt før v3.9');
  const r = parseSave(FIXTURE5);
  assert.ok(r.ok, r.error);
  assert.equal(r.migratedFrom, 5, 'skema 5 → 6 (kampprogram, v3.11)');
  const teams = r.state.league.teams;
  const me = teams.find((t) => !t.isBot);
  for (const tac of [me.tactics, ...me.tacticPresets]) assert.equal(tac.phases.phase1_buildUp.offBallRuns, 'NORMAL');
  teams.forEach((t, i) => { if (t.isBot) assert.equal(t.tactics.phases.phase1_buildUp.offBallRuns, BOT_PROFILES[i].runs, t.name); });
  // Bots er ikke alle ens: mindst én af hver
  assert.deepEqual([...new Set(teams.filter((t) => t.isBot).map((t) => t.tactics.phases.phase1_buildUp.offBallRuns))].sort(), ['FEW', 'MANY', 'NORMAL']);
  // Det gemte er urørt: pasningsstil, runde, noter
  assert.equal(me.tactics.phases.phase1_buildUp.passingStyle, raw.league.teams.find((t) => !t.isBot).tactics.phases.phase1_buildUp.passingStyle);
  assert.equal(r.state.league.leagueMetadata.round, 2);
  assert.deepEqual(r.state.notes, raw.notes);
});
// Test Manager v3.9: fixtureholdets værdier var lig standardværdierne, så "gemt værdi vinder over standard" var ubevist
test('gem fra v3.9: dit valg af løb uden bold (og pasningsstil) overlever indlæsning – også i planerne og hos en bot', () => {
  const raw = JSON.parse(FIXTURE5);
  const me = raw.league.teams.find((t) => !t.isBot), bot = raw.league.teams.find((t) => t.isBot);
  for (const tac of [me.tactics, ...me.tacticPresets, bot.tactics]) Object.assign(tac.phases.phase1_buildUp, { offBallRuns: 'MANY', passingStyle: 'DIRECT_LONG' });
  const r = parseSave(JSON.stringify(raw));
  assert.ok(r.ok, r.error);
  const m2 = r.state.league.teams.find((t) => !t.isBot), b2 = r.state.league.teams.find((t) => t.id === bot.id);
  for (const tac of [m2.tactics, ...m2.tacticPresets, b2.tactics]) {
    assert.equal(tac.phases.phase1_buildUp.offBallRuns, 'MANY'); assert.equal(tac.phases.phase1_buildUp.passingStyle, 'DIRECT_LONG');
  }
});

// ---------- v3.10 (Test Manager): gemt statistik overlever indlæsning ----------
test('statistik, der allerede er talt, overlever gem og indlæs (indlæsning udfylder kun manglende felter, nulstiller ikke og flytter ikke "fra runde")', () => {
  const g = game(5);
  const L = g.league;
  L.leagueMetadata.round = 6; L.statsFromRound = 3;
  L.history = [{ round: 3, matches: 4, goals: 9, setPiece: 2, kinds: { PENALTY: 1, LONGSHOT: 8 }, biggest: null, most: { goals: 4, label: 'A 2-2 B' } }];
  Object.assign(L.leagueMetadata.standings[0], { sMatches: 4, shots: 17, onTarget: 9, xg: 3.5, possSum: 210, fouls: 31, cleanSheets: 2, headerGoals: 3, counterGoalsAgainst: 1 });
  Object.assign(L.teams[0].squad[0], { sGames: 4, sMinutes: 360, sGoals: 4, sMotm: 2, sSetPieceGoals: 1, freeRunsSum: 7, freeRunsWonSum: 3 });
  const s = fakeStorage();
  assert.ok(saveGame(s, g, 1).ok);
  const r = loadGame(s);
  assert.equal(r.status, 'ok');
  assert.equal(r.state.league.statsFromRound, 3);
  assert.deepEqual(r.state.league.history, L.history);
  assert.deepEqual(r.state.league.leagueMetadata.standings, L.leagueMetadata.standings);
  assert.deepEqual(r.state.league.teams[0].squad[0], L.teams[0].squad[0]);
  // Et gem uden felterne får nuller (og "fra" næste runde), men et delvist gem beholder det, der findes
  const raw = JSON.parse(s.getItem(SAVE_KEY));
  delete raw.league.leagueMetadata.standings[0].fouls; delete raw.league.teams[0].squad[0].sMinutes;
  const r2 = parseSave(JSON.stringify(raw));
  assert.equal(r2.state.league.leagueMetadata.standings[0].fouls, 0); assert.equal(r2.state.league.leagueMetadata.standings[0].shots, 17);
  assert.equal(r2.state.league.teams[0].squad[0].sMinutes, 0); assert.equal(r2.state.league.teams[0].squad[0].sGoals, 4);
});

// ---------- v3.10: statistik i et gem fra v3.9 ----------
const FIXTURE_V39 = fs.readFileSync(new URL('../fixtures/save-v3.9.json', import.meta.url), 'utf8');
test('gem fra v3.9: indlæses uden migrering; statistikken starter tom fra næste runde, intet andet ændres', () => {
  const raw = JSON.parse(FIXTURE_V39);
  assert.ok(!FIXTURE_V39.includes('statsFromRound') && !FIXTURE_V39.includes('sGoals'), 'fixturet er gemt før v3.10');
  const r = parseSave(FIXTURE_V39);
  assert.ok(r.ok, r.error); assert.equal(r.migratedFrom, 5);
  const L = r.state.league;
  assert.equal(L.statsFromRound, raw.league.leagueMetadata.round + 1); assert.deepEqual(L.history, []);
  assert.ok(L.teams.every((t) => t.squad.every((p) => p.sGoals === 0 && p.sGames === 0 && p.freeRunsSum === 0)));
  for (const s of L.leagueMetadata.standings) { assert.equal(s.shots, 0); assert.equal(s.cleanSheets, 0); }
  // Tabellen er arkiveret uændret som sæson 1 (v3.11)
  const sorted = (rows) => rows.map((s) => [s.teamId, s.points, s.goalsFor]).sort((a, b) => a[0].localeCompare(b[0]));
  assert.deepEqual(sorted(L.seasons[0].table), sorted(raw.league.leagueMetadata.standings));
});

// ---------- v3.11: kampprogram og sæsonslut – gem fra den live v3.10.1 ----------
const FIXTURE_V3101 = fs.readFileSync(new URL('../fixtures/save-v3.10.1.json', import.meta.url), 'utf8');
test('gem fra v3.10.1 (skema 5): tabellen arkiveres som sæson 1 uden program, sæson 2 starter med program og nulstillet sæsonstatistik; spillere, friskhed og forløb er uændrede', async () => {
  const { buildSchedule, isValidSchedule } = await import('../../public/engine/schedule.js');
  const { pairRound, playRound, commitRound } = await import('../../public/engine/season.js');
  const raw = JSON.parse(FIXTURE_V3101);
  assert.equal(raw.schemaVersion, 5); assert.ok(!FIXTURE_V3101.includes('"schedule"'), 'gemt før v3.11');
  const round = raw.league.leagueMetadata.round;
  assert.ok(round >= 6);
  // Fixturet har forsvarere med clean sheets (den gamle regel) – det er dem, brugeren klagede over
  const rawPlayers = raw.league.teams.flatMap((t) => t.squad);
  assert.ok(rawPlayers.some((p) => p.line !== 'GK' && p.sCleanSheets > 0));
  const r = parseSave(FIXTURE_V3101);
  assert.ok(r.ok, r.error); assert.equal(r.migratedFrom, 5);
  const L = r.state.league, md = L.leagueMetadata;
  // Arkivet: sæson 1, runde 1–6, den gamle tabel sorteret
  assert.equal(L.seasons.length, 1);
  const [s1] = L.seasons;
  assert.deepEqual([s1.seasonNumber, s1.fromRound, s1.toRound, s1.programmed], [1, 1, round, false]);
  assert.equal(s1.statsFrom, raw.league.statsFromRound, 'spillertallene gælder fra statistikkens start');
  const want = raw.league.leagueMetadata.standings.slice().sort((a, b) => b.points - a.points || (b.goalsFor - b.goalsAgainst) - (a.goalsFor - a.goalsAgainst) || b.goalsFor - a.goalsFor);
  assert.deepEqual(s1.table.map((x) => [x.teamId, x.points, x.played]), want.map((x) => [x.teamId, x.points, x.played]));
  const topGoals = Math.max(...rawPlayers.map((p) => p.sGoals));
  assert.equal(s1.topScorer.goals, topGoals);
  // Ny sæson
  assert.equal(md.seasonNumber, 2); assert.equal(L.seasonStartRound, round + 1); assert.equal(L.statsFromRound, round + 1); assert.equal(md.round, round);
  assert.ok(md.standings.every((s) => s.played === 0 && s.points === 0 && s.cleanSheets === 0));
  assert.ok(L.teams.every((t) => t.squad.every((p) => p.sGames === 0 && p.sCleanSheets === 0)));
  // Programmet: gyldigt, deterministisk (holdenes rækkefølge), og to indlæsninger giver det samme
  assert.ok(isValidSchedule(L.schedule, L.teams));
  assert.deepEqual(L.schedule, buildSchedule(L.teams.map((t) => t.id)));
  assert.deepEqual(parseSave(FIXTURE_V3101).state.league.schedule, L.schedule);
  // Uændret: friskhed, karaktersnit, forløbet og noter
  const players = L.teams.flatMap((t) => t.squad);
  assert.deepEqual(players.map((p) => [p.id, p.freshness, p.ratingSum, p.heightCm]), rawPlayers.map((p) => [p.id, p.freshness, p.ratingSum, p.heightCm]));
  assert.deepEqual(L.history, raw.league.history);
  assert.deepEqual(r.state.notes, raw.notes);
  assert.ok(!('opponentIdx' in r.state.ui));
  // Næste runde er programmets runde 1, og der kan spilles videre: kun målmænd får clean sheets
  const idx = new Map(L.teams.map((t, i) => [t.id, i]));
  assert.deepEqual(pairRound(L).slice().sort(), L.schedule[0].map(([h, a]) => [idx.get(h), idx.get(a)]).sort());
  const rng = createRng(3);
  for (let i = 0; i < 6; i++) commitRound(L, playRound(L, rng), rng);
  const cs = (pred) => L.teams.flatMap((t) => t.squad).filter(pred).reduce((a, p) => a + p.sCleanSheets, 0);
  assert.ok(cs((p) => p.line === 'GK') > 0, 'målmænd får clean sheets');
  assert.equal(cs((p) => p.line !== 'GK'), 0, 'ingen andre');
});
