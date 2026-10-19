// Karakterarkets opstilling: pladsen efter navnet og rækkefølgen (public/ui/lineup.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeLabel, lineupSort } from '../../public/ui/lineup.js';

// 4-2-3-1: plads 0 GK, 1 LB, 2 CB, 3 CB, 4 RB, 5 CDM, 6 CDM, 7 LM, 8 CAM, 9 RM, 10 ST.
const E = (o) => ({ role: 'X', line: 'MID', minIn: 1, slot: null, ...o });

test('placeLabel: pladsens rolle, også for målmanden på plads 0', () => {
  assert.equal(placeLabel(E({ slot: 0, line: 'GK', role: 'X' }), '4-2-3-1'), 'GK');
  assert.equal(placeLabel(E({ slot: 8, line: 'MID', role: 'CAM' }), '4-2-3-1'), 'CAM');
});

test('placeLabel: naturlig kæde i parentes, når den afviger fra pladsens', () => {
  assert.equal(placeLabel(E({ slot: 5, line: 'DEF', role: 'CDM' }), '4-2-3-1'), 'CDM (DEF)');
  assert.equal(placeLabel(E({ slot: 5, line: 'MID', role: 'CDM' }), '4-2-3-1'), 'CDM');
});

test('placeLabel: indskifter får pladsen, han kom ind på', () => {
  assert.equal(placeLabel(E({ slot: 7, minIn: 63, role: 'SUB (MID)' }), '4-2-3-1'), 'ind på LM');
});

test('placeLabel: gammel runde uden plads eller formation viser den gemte rolle', () => {
  assert.equal(placeLabel(E({ slot: undefined, role: 'CB' }), '4-2-3-1'), 'CB');
  assert.equal(placeLabel(E({ slot: 2, role: 'CB' }), undefined), 'CB');
});

test('lineupSort: startere efter plads, så indskiftere efter kæde og minut; input ændres ikke', () => {
  const list = [
    E({ id: 'subAtt', slot: 10, minIn: 50, line: 'ATT' }),
    E({ id: 'st', slot: 10, line: 'ATT' }),
    E({ id: 'subMid80', slot: 7, minIn: 80, line: 'MID' }),
    E({ id: 'gk', slot: 0, line: 'GK' }),
    E({ id: 'subMid60', slot: 6, minIn: 60, line: 'MID' }),
    E({ id: 'cb', slot: 2, line: 'DEF' }),
  ];
  const before = list.map((e) => e.id);
  assert.deepEqual(lineupSort(list).map((e) => e.id), ['gk', 'cb', 'st', 'subMid60', 'subMid80', 'subAtt']);
  assert.deepEqual(list.map((e) => e.id), before);
});
