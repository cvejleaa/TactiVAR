// v3.16 (Security Reviewer): et spor med forkert form i en gemt fil slettes ved indlæsning – Kamp-fanen viser så "Ingen
// afspilning" i stedet for at vælte. Et rigtigt spor beholdes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../../public/engine/rng.js';
import { createLeague } from '../../public/engine/generator.js';
import { simulateMatch } from '../../public/engine/match.js';
import { isValidTrace } from '../../public/engine/sanitize.js';

const real = () => { const L = createLeague(createRng(2)); return simulateMatch(L.teams[0], L.teams[1], createRng(9)).trace; };
test('isValidTrace: et rigtigt spor består; forkerte former, tal uden for banen, NaN, for mange spillere og objekt-id\'er afvises', () => {
  const t = real();
  assert.ok(isValidTrace(t));
  const bad = [
    null, { ...t, v: 2 }, { ...t, frames: 'x' }, { ...t, frames: [...t.frames, ...t.frames] },
    { ...t, frames: t.frames.map((f, i) => (i === 3 ? { ...f, h: [[1, 150, 50], ...f.h.slice(1)] } : f)) },
    { ...t, frames: t.frames.map((f, i) => (i === 3 ? { ...f, a: [[1, NaN, 50], ...f.a.slice(1)] } : f)) },
    { ...t, frames: t.frames.map((f, i) => (i === 3 ? { ...f, h: [...f.h, ...f.h] } : f)) },
    { ...t, frames: t.frames.map((f, i) => (i === 3 ? { ...f, h: [[{ toString: 1 }, 5, 5], ...f.h.slice(1)] } : f)) },
    { ...t, moments: t.moments.map((m, i) => (i === 0 ? { ...m, side: 'x' } : m)) },
    { ...t, frames: t.frames.map((f, i) => (i === 3 ? { ...f, ball: [50] } : f)) },
  ];
  for (const [i, b] of bad.entries()) assert.equal(isValidTrace(b), false, `variant ${i}`);
});

test('normalizeLeague sletter et ødelagt spor og beholder et rigtigt', async () => {
  const { normalizeLeague } = await import('../../public/engine/sanitize.js');
  const L = createLeague(createRng(3)), t = real();
  L.lastRound = { round: 1, matches: [{ trace: { ...t, frames: 'x' } }, { trace: t }], gazette: null };
  normalizeLeague(L);
  assert.equal(L.lastRound.matches[0].trace, undefined);
  assert.equal(L.lastRound.matches[1].trace, t);
});
