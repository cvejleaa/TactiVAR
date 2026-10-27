// v3.21.2 Test Manager: RØD på 1bb0d97 – opfølgningen efter et nederlag (se test-navnet). Grøn når `held`/`why` i column.js retter sig.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildColumn, pickBy, STYLE_RULES } from '../../public/engine/column.js';

const M = ({ h = 'h1', a = 'a1', hn = 'Hjem', an = 'Ude', hG = 0, aG = 0, stats } = {}) => ({ homeId: h, awayId: a, homeName: hn, awayName: an, homeGoals: hG, awayGoals: aG, stats, events: [], goalsPool: [] });
const inp = (o) => ({ matches: [], gazette: null, history: [], table: [], next: [], viewerTeamId: 'h1', round: 5, ...o });

test('opfølgning på "wait" efter et NEDERLAG: de scorede, men tabte – teksten må ikke påstå "men de havde 40 % af bolden" (40 % er ikke mere bold)', () => {
  const F = (o = {}) => ({ poss: 50, shots: 0, onTarget: 0, corners: 0, aerialWon: 0, counterGoals: 0, setPieceGoals: 0, headerGoals: 0, yellows: 0, reorganised: 0, goals: 0, against: 0, ...o });
  const hist = Array.from({ length: 5 }, (_, i) => ({ round: i + 1, results: [], facts: { a1: F({ poss: 40, goals: 1 }) } }));
  const fu = (hG, aG, played) => buildColumn(inp({ matches: [M({ hG, aG, stats: played })], history: hist, round: 5 })).sections.find((s) => s.id === 'col-next').paras.find((t) => t.startsWith('Før kampen'));
  const pre = `Før kampen skrev jeg, at Ude ${pickBy(STYLE_RULES.find((r) => r.key === 'wait').say, 4, 'wait', 'scout')} – `;
  assert.equal(fu(3, 1, { hPoss: 60, aPoss: 40 }), `${pre}det holdt ikke mod jer.`, 'tabte 1-3 med 40 % af bolden');
  assert.equal(fu(3, 2, { hPoss: 60, aPoss: 40 }), `${pre}det holdt ikke mod jer.`, 'tabte 2-3');
  assert.equal(fu(1, 1, { hPoss: 60, aPoss: 40 }), `${pre}det holdt også mod jer.`, 'uafgjort 1-1 holdt (against = goals; 40 % ≤ 42: reglen holdt af sig selv)');
  assert.equal(fu(0, 1, { hPoss: 60, aPoss: 40 }), `${pre}det holdt også mod jer.`, 'vandt 1-0');
});

