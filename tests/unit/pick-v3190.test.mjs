// v3.19.0: ét byt-sted (actions.js swapKind/pickForSwap) – før tre kopier i app.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { swapKind, pickForSwap } from '../../public/state/actions.js';
import { matchBenchOf, reservesOf } from '../../public/engine/career.js';

function team() {
  const L = createLeague(createRng(3)), t = L.teams[0];
  t.squad.push(...[1, 2].map((i) => ({ ...structuredClone(t.squad[17]), id: `r${i}`, shortName: `R. R${i}`, shirtNumber: 40 + i })));
  return t;
}

test('swapKind: samme = fravælg, intet valgt = vælg, en starter med = byt, bænk ⇄ reserve = kamptrup, bænk → bænk = nyt valg', () => {
  const t = team(), s = t.tactics.lineupSlots, [b1, b2] = matchBenchOf(t).map((p) => p.id), [r1, r2] = reservesOf(t).map((p) => p.id);
  assert.equal(swapKind(t, s[3], s[3]), 'deselect');
  assert.equal(swapKind(t, null, s[3]), 'select');
  assert.equal(swapKind(t, s[3], s[4]), 'swap');
  assert.equal(swapKind(t, b1, s[4]), 'swap');
  assert.equal(swapKind(t, s[4], r1), 'swap');
  assert.equal(swapKind(t, b1, r1), 'bench');
  assert.equal(swapKind(t, r1, b1), 'bench');
  assert.equal(swapKind(t, b1, b2), 'select');
  assert.equal(swapKind(t, r1, r2), 'select');
});

test('pickForSwap udfører: bænk → brik skifter ind (den udskiftede går på bænken); reserve → bænk bytter kamptruppen', () => {
  const t = team(), s = t.tactics.lineupSlots, out = s[4], [b1] = matchBenchOf(t).map((p) => p.id);
  assert.equal(pickForSwap(t, b1, out), 'swap');
  assert.equal(t.tactics.lineupSlots[4], b1); assert.ok(t.matchBench.includes(out));
  const [r1] = reservesOf(t).map((p) => p.id), b2 = matchBenchOf(t)[0].id;
  assert.equal(pickForSwap(t, r1, b2), 'bench');
  assert.ok(t.matchBench.includes(r1)); assert.ok(!t.matchBench.includes(b2));
  assert.equal(t.matchBenchAuto, false, 'din udtagelse slår automatikken fra');
  const before = structuredClone([t.tactics.lineupSlots, t.matchBench]), [x, y] = reservesOf(t).map((p) => p.id);
  assert.equal(pickForSwap(t, x, y), 'select');
  assert.deepEqual([t.tactics.lineupSlots, t.matchBench], before, 'reserve → reserve ændrer intet');
});

test('pickForSwap: bænkspiller først og så en reserve – reserven kommer i kamptruppen, bænkspilleren ud (Test Manager U2)', () => {
  const t = team(), [b1] = matchBenchOf(t).map((p) => p.id), [r1] = reservesOf(t).map((p) => p.id);
  assert.equal(pickForSwap(t, b1, r1), 'bench');
  assert.ok(t.matchBench.includes(r1)); assert.ok(!t.matchBench.includes(b1));
});
