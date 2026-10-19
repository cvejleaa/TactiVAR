import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { SAVE_KEY, BACKUP_PREFIX, SCHEMA_VERSION, loadGame, saveGame, resetGame, exportGame, importGame, parseSave } from '../../public/state/storage.js';
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
const game = (seed = 1) => ({ league: createLeague(createRng(seed)), notes: { x: 'note' }, ui: { activePresetIndex: 0, opponentIdx: 2 } });
const FIXTURE = fs.readFileSync(new URL('../fixtures/save-schema1.json', import.meta.url), 'utf8');

// ---------- Gem og indlæs ----------
test('tomt lager giver "empty"; gem og indlæs giver præcis samme spil tilbage', () => {
  const s = fakeStorage();
  assert.equal(loadGame(s).status, 'empty');
  const g = game();
  assert.deepEqual(saveGame(s, g, 1000), { ok: true, savedAt: 1000 });
  const r = loadGame(s);
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.state.league, g.league);
  assert.deepEqual(r.state.notes, g.notes);
  assert.equal(r.state.ui.opponentIdx, 2);
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
