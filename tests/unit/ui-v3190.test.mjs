// v3.19.0: spillerlistens rækkefølge og sorteringsvagt, træningsestimatet med tal, viewTeam uden aliaser
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { listRows } from '../../public/ui/lineup-list.js';
import { trainingEstimate, matchBenchOf, PLAYED_RELIEF, FOCUS } from '../../public/engine/career.js';
import { nextText, priceText } from '../../public/ui/card.js';
import { viewTeam } from '../../public/engine/visibility.js';

const bigTeam = (L, i) => { const t = L.teams[i]; t.squad.push(...[1, 2, 3].map((k) => ({ ...structuredClone(t.squad.find((p) => p.line === 'DEF' && !t.tactics.lineupSlots.includes(p.id))), id: `x${i}_${k}`, shortName: `X. X${k}`, shirtNumber: 50 + k }))); return t; };

test('listen: sortering på en evne virker for dit hold (faldende, så stigende) – Start-11 står i pladsernes orden', () => {
  const L = createLeague(createRng(5)), t = bigTeam(L, 0);
  t.squad.forEach((p, i) => { p.skills.positioning = (i * 7) % 19 + 1; });
  const ui = { listLine: 'DEF', listSort: 'positioning', listSortAsc: false };
  const r = listRows({ team: t, isOwn: true, ui });
  const vals = [...r.bench, ...r.reserves].map((p) => p.skills.positioning);
  assert.ok(r.sortCol && r.sortCol.key === 'positioning');
  assert.deepEqual(r.bench.map((p) => p.skills.positioning), r.bench.map((p) => p.skills.positioning).slice().sort((a, b) => b - a));
  assert.ok(vals.length >= 2);
  const asc = listRows({ team: t, isOwn: true, ui: { ...ui, listSortAsc: true } });
  assert.deepEqual(asc.reserves.map((p) => p.skills.positioning), asc.reserves.map((p) => p.skills.positioning).slice().sort((a, b) => a - b));
  assert.deepEqual(r.starters.map((p) => p.id), t.tactics.lineupSlots.map((id) => t.squad.find((p) => p.id === id)).filter((p) => p.line === 'DEF').map((p) => p.id));
});

test('listen: en sortering valgt på dit hold følger IKKE med til et modstanderhold – rækkefølgen røber ikke den skjulte evne', () => {
  const L = createLeague(createRng(5)), opp = bigTeam(L, 2);
  // Skjulte værdier i omvendt rækkefølge af truppen – en sortering ville vende rækkerne
  const res = opp.squad.filter((p) => p.line === 'DEF' && !opp.tactics.lineupSlots.includes(p.id));
  res.forEach((p, i) => { p.skills.positioning = 1 + i * 3; });
  const r = listRows({ team: opp, isOwn: false, ui: { listLine: 'DEF', listSort: 'positioning', listSortAsc: false } });
  assert.equal(r.sortCol, null);
  assert.deepEqual([...r.bench, ...r.reserves].map((p) => p.id), [...matchBenchOf(opp), ...opp.squad.filter((p) => !opp.tactics.lineupSlots.includes(p.id) && !matchBenchOf(opp).includes(p))].filter((p) => p.line === 'DEF').map((p) => p.id));
  // Friskhed er offentlig og må gerne sortere
  assert.equal(listRows({ team: opp, isOwn: false, ui: { listSort: 'fresh' } }).sortCol.key, 'fresh');
});

test('trainingEstimate med tal: 19-årig Afslutning 0,12 · 1,5 = 0,18 pr. runde → næste +1 om 6; som starter + kamp-xp 0,02 → 5', () => {
  const L = createLeague(createRng(5)), p = L.teams[0].squad.find((x) => x.line === 'ATT');
  p.age = 19; p.potential = 20; p.dev = {}; p.trainingFocus = 'FINISH'; p.skills.finishing = 10;
  const e = trainingEstimate(p);
  assert.equal(e.key, 'FINISH'); assert.equal(e.lines[0].skill, 'finishing'); assert.equal(e.lines[0].n, 6);   // ceil(1/0,18) = 6
  assert.equal(trainingEstimate(p, true).lines[0].n, 5);   // ceil(1/0,20) = 5
  assert.equal(e.next, 6);
  p.dev = { finishing: 0.4 }; assert.equal(trainingEstimate(p).lines[0].n, 4); p.dev = {};   // 0,6/0,18 = 3,33 → op til 4 (afrundet ville give 3)
  assert.equal(e.fresh, FOCUS.FINISH.fresh); assert.equal(e.playedFresh, Math.min(0, FOCUS.FINISH.fresh + PLAYED_RELIEF));
  p.skills.finishing = 20;
  const top = trainingEstimate(p);
  assert.equal(top.lines[0].top, true); assert.equal(top.lines[0].n, null); assert.equal(top.next, Infinity);
  p.trainingFocus = 'REST';
  const rest = trainingEstimate(p);
  assert.equal(rest.fresh, 4); assert.equal(rest.playedFresh, 4); assert.deepEqual(rest.lines, []);
  p.trainingFocus = 'FINISH'; p.skills.finishing = 10; p.potential = 0; assert.equal(trainingEstimate(p).why, 'han er tæt på sit loft');
  p.potential = 20; p.age = 31; assert.equal(trainingEstimate(p).why, 'alderen');
  p.age = 24; assert.equal(trainingEstimate(p).why, 'fokus og alder');
});

test('nextText og priceText: ental/flertal, grænsen 14 runder, pris for spillet og hvile', () => {
  assert.equal(nextText(1, 'x'), 'næste +1 om ca. 1 runde');
  assert.equal(nextText(14, 'x'), 'næste +1 om ca. 14 runder');
  assert.equal(nextText(15, 'alderen'), 'går langsomt (mere end en sæson: alderen)');
  assert.equal(nextText(Infinity, 'x'), '');
  assert.match(priceText({ fresh: -3, playedFresh: -1 }), /^-3 friskhed pr. runde \(-1 når han har spillet/);
  assert.equal(priceText({ fresh: 4, playedFresh: 4 }), '+4 friskhed pr. runde');
});

test('viewTeam: visningen deler ingen lister med holdet – den kan ikke ændre opstilling eller bænk (Test Manager U3)', () => {
  const t = createLeague(createRng(5)).teams[3], v = viewTeam(t, false);
  assert.notEqual(v.matchBench, t.matchBench); assert.notEqual(v.tactics.lineupSlots, t.tactics.lineupSlots); assert.notEqual(v.tactics.customCoords, t.tactics.customCoords);
  v.matchBench.length = 0; v.tactics.lineupSlots[0] = 'x';
  assert.equal(t.matchBench.length, 7); assert.notEqual(t.tactics.lineupSlots[0], 'x');
});
