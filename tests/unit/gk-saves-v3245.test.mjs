// v3.24.5 (brugeren 2026-10-28: "mærkeligt, at modstanders målmand får 3 stjerne … 9 redninger"): 🧤 lagde svære og lette
// redninger sammen. Nu gemmes de svære for sig (bigSaves) – karakteren er uændret (fingeraftrykket i fingerprint.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSheet, finalizeSheet } from '../../public/engine/ratings.js';
import { savesText, savesSplit } from '../../public/engine/column.js';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { playRound } from '../../public/engine/season.js';

const gkSheet = (big, easy) => {
  const L = createLeague(createRng(1)), team = L.teams[0], p = team.squad[0], sh = createSheet(), rng = createRng(2);
  sh.register(p, team, true, 'GK', 0, rng, 0, 0);
  if (big) sh.bump(p.id, 'saves', big);
  if (easy) sh.bump(p.id, 'easySaves', easy);
  finalizeSheet(sh, 0, 2, createRng(3), () => 0);
  return sh.entries[p.id];
};

test('finalizeSheet: 🧤 = alle redninger, bigSaves = kun de svære – og kun når der var lette', () => {
  const e = gkSheet(2, 7);
  assert.equal(e.saves, 9); assert.equal(e.bigSaves, 2); assert.ok(!('easySaves' in e));
  assert.ok(!('bigSaves' in gkSheet(3, 0)), 'uden lette: intet felt (ser ud som før)');
  assert.equal(gkSheet(0, 4).bigSaves, 0, 'kun lette: 0 svære');
});

test('teksten: "9 redninger (2 svære)", "(alle lette)", og uden opdeling når alle var svære eller feltet mangler (gammel kamp)', () => {
  assert.equal(savesText({ saves: 9, bigSaves: 2 }), '9 redninger (2 svære)');
  assert.equal(savesText({ saves: 4, bigSaves: 0 }), '4 redninger (alle lette)');
  assert.equal(savesText({ saves: 3 }), '3 redninger');
  assert.equal(savesText({ saves: 3, bigSaves: 3 }), '3 redninger');
  assert.equal(savesSplit({ saves: 3 }), null);
  assert.equal(savesText({ saves: 5, bigSaves: 1 }), '5 redninger (1 svær)');
});

test('i rigtige kampe: bigSaves ≤ saves, og mange målmænd har lette redninger (data, ikke et tomt fixture)', () => {
  const L = createLeague(createRng(5)), res = playRound(L, createRng(6));
  const gks = res.matches.flatMap((m) => [...m.ratings.home, ...m.ratings.away]).filter((e) => e.slot === 0);
  assert.ok(gks.some((e) => e.bigSaves != null && e.bigSaves < e.saves), 'data: mindst én målmand med lette redninger');
  for (const e of gks) if (e.bigSaves != null) assert.ok(e.bigSaves <= e.saves);
});
