import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';

test('samme seed giver samme talrække, andet seed en anden', () => {
  const a = createRng(42), b = createRng(42), c = createRng(43);
  const ra = Array.from({ length: 5 }, a.next);
  assert.deepEqual(ra, Array.from({ length: 5 }, b.next));
  assert.notDeepEqual(ra, Array.from({ length: 5 }, c.next));
});

test('int dækker begge endepunkter og intet udenfor', () => {
  const r = createRng(7);
  const set = new Set(Array.from({ length: 2000 }, () => r.int(1, 3)));
  assert.deepEqual([...set].sort(), [1, 2, 3]);
});

test('algoritmen er låst: faste værdier for seed 42 (gemte seeds må ikke flytte sig tavst)', () => {
  const r = createRng(42);
  assert.deepEqual([r.next(), r.next(), r.next()], [0.6011037519201636, 0.44829055899754167, 0.8524657934904099]);
});

test('chance og pick', () => {
  const r = createRng(3);
  assert.equal(Array.from({ length: 100 }, () => r.chance(0)).some(Boolean), false);
  assert.equal(Array.from({ length: 100 }, () => r.chance(1)).every(Boolean), true);
  const set = new Set(Array.from({ length: 300 }, () => r.pick(['a', 'b', 'c'])));
  assert.deepEqual([...set].sort(), ['a', 'b', 'c']);
});
