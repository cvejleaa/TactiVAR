// v3.16.7 (Spilførerens sæsongennemgang af v3.16.6): klummen siger kun det, kampens tal bærer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildColumn, pickBy, STYLE_RULES } from '../../public/engine/column.js';
import { pl } from '../../public/engine/clues.js';

const M = ({ hG = 0, aG = 0, ev = [], pool = [], stats = { hPoss: 50, aPoss: 50 }, ownReports } = {}) => ({
  homeId: 'h1', awayId: 'a1', homeName: 'Hjem', awayName: 'Ude', homeGoals: hG, awayGoals: aG,
  events: ev.map(([min, type, isHome, eh, ea]) => ({ min, type, isHome, hG: eh, aG: ea, text: 'T', label: 'L' })),
  goalsPool: pool.map(([kind, teamName], i) => ({ kind, min: 10 + i, scorer: `S${i}`, teamName })), stats, ownReports,
});
const col = (o) => buildColumn({ matches: [], gazette: null, history: [], table: [], next: [], viewerTeamId: 'h1', round: 5, ...o });
const mine = (m) => col({ matches: [m] }).sections[0].paras;

test('pl: ental/flertal', () => {
  assert.equal(pl(1, 'gang', 'gange'), '1 gang'); assert.equal(pl(0, 'gang', 'gange'), '0 gange'); assert.equal(pl(2, 'afslutning', 'afslutninger'), '2 afslutninger');
});

test('rødt kort: "til trods" kun når kortet kom FØR det afgørende mål – efter det er det "fik rødt kort undervejs"', () => {
  // 2-1: H 1-0, A 1-1, H 2-1 (afgørende). Kort før alle mål, mellem 1-1 og 2-1 (stadig før det afgørende) og efter 2-1.
  const goals = [[20, 'GOAL', true, 1, 0], [30, 'GOAL', false, 1, 1], [60, 'GOAL', true, 2, 1]];
  const at = (k) => { const ev = goals.slice(); ev.splice(k, 0, [k * 10 + 5, 'RED', true]); return mine(M({ hG: 2, aG: 1, ev, stats: { hPoss: 50, aPoss: 50, hReds: 1, aReds: 0 } })); };
  for (const k of [0, 2]) assert.ok(at(k).includes('Et rødt kort til trods: Hjem vandt med 10 mand.'), `kort som hændelse ${k}: ${at(k).join(' | ')}`);
  assert.ok(at(3).includes('Hjem fik rødt kort undervejs.') && !at(3).some((t) => /til trods|vandt med/.test(t)), `kort efter sejrsmålet: ${at(3).join(' | ')}`);
  // Afgørende mål er IKKE det sidste: 3-1 med 2-1 i 60' og 3-1 i 80' – vinderen førte fra 1-0 (20'), så et kort i 70' er efter
  const g3 = [[20, 'GOAL', true, 1, 0], [30, 'GOAL', true, 2, 0], [50, 'GOAL', false, 2, 1], [80, 'GOAL', true, 3, 1]];
  const late = mine(M({ hG: 3, aG: 1, ev: [...g3.slice(0, 3), [70, 'RED', true], g3[3]], stats: { hPoss: 50, aPoss: 50, hReds: 1, aReds: 0 } }));
  assert.ok(late.includes('Hjem fik rødt kort undervejs.'), `førte fra 1-0 resten af kampen: ${late.join(' | ')}`);
  // Nederlag og uafgjort: samme regel (QC)
  const loss = mine(M({ hG: 0, aG: 1, ev: [[30, 'GOAL', false, 0, 1], [80, 'RED', true]], stats: { hPoss: 50, aPoss: 50, hReds: 1, aReds: 0 } }));
  assert.ok(loss.includes('Hjem fik rødt kort undervejs.') && !loss.some((t) => /kostede|op ad bakke/.test(t)), loss.join(' | '));
  const draw = mine(M({ hG: 1, aG: 1, ev: [[10, 'GOAL', true, 1, 0], [30, 'GOAL', false, 1, 1], [80, 'RED', true]], stats: { hPoss: 50, aPoss: 50, hReds: 1, aReds: 0 } }));
  assert.ok(draw.includes('Hjem fik rødt kort undervejs.') && !draw.some((t) => /holdt point/.test(t)), draw.join(' | '));
  // Uden kortet i referatet (gammelt gem uden RED-hændelse): den neutrale linje – aldrig en påstand
  const old = mine(M({ hG: 2, aG: 1, ev: goals, stats: { hPoss: 50, aPoss: 50, hReds: 1, aReds: 0 } }));
  assert.ok(old.includes('Hjem fik rødt kort undervejs.'), old.join(' | '));
});

test('"Det kostede:" kun med årsag – ellers "Ét af målene imod kom på kontra."; "fandt ingen vej" kun ved 0 gennembrud', () => {
  const R = (o) => ({ build: 0, buildWon: 0, press: 0, pressWon: 0, crosses: 0, crossesWon: 0, cutbacks: 0, cutbacksBlocked: 0, cutbackGoals: 0, runGoals: 0, counterGoalsAgainst: 0,
    start: { formation: '4-4-2', phases: { phase1_buildUp: { passingStyle: 'SHORT' } } }, end: { formation: '4-4-2', phases: { phase1_buildUp: { passingStyle: 'SHORT', offBallRuns: 'NORMAL' } } }, ...o });
  const v = (r, round = 5) => buildColumn({ matches: [M({ ownReports: { h1: r } })], viewerTeamId: 'h1', round }).sections[0].paras.slice(1);
  assert.deepEqual(v(R({ counterGoalsAgainst: 1 })), ['Ét af målene imod kom på kontra.']);
  assert.ok(v(R({ counterGoalsAgainst: 1 })).every((t) => !t.includes('Det kostede')));
  // "fandt ingen vej": variant 2 (pickBy) – find runden, der vælger den, og sammenlign 0 og 3 gennembrud af 8
  const variant2 = [...Array(40).keys()].find((rd) => v(R({ build: 8, buildWon: 3 }), rd)[0]?.startsWith('Kun 3 af 8'));
  assert.ok(variant2 != null, 'data: variant 2 forekommer');
  assert.equal(v(R({ build: 8, buildWon: 3 }), variant2)[0], 'Kun 3 af 8 opbygninger kom forbi presset; de korte pasninger sad fast.');
  assert.equal(v(R({ build: 8, buildWon: 0 }), variant2)[0], 'Kun 0 af 8 opbygninger kom forbi presset; de korte pasninger fandt ingen vej.');
});

test('opfølgning på "air": hovedstød efter dødbolde tæller med – "det holdt også mod jer – begge/deres eneste mål …"', () => {
  const H = (rows) => rows.map((f, i) => ({ round: i + 1, facts: { a1: { poss: 50, shots: 5, onTarget: 2, corners: 8, aerialWon: 3, counterGoals: 0, setPieceGoals: 0, headerGoals: 0, yellows: 0, reds: 0, reorganised: 0, goals: 1, against: 1, ...f } } }));
  const air = STYLE_RULES.find((r) => r.key === 'air');
  const hist = H([{}, {}, {}, {}]);
  const fu = (pool, aG) => (buildColumn({ matches: [M({ aG, pool, stats: { hPoss: 50, aPoss: 50, aCorners: 2 } })], history: hist, viewerTeamId: 'h1', round: 5 }).sections.find((s) => s.id === 'col-next')?.paras ?? []).find((t) => t.startsWith('Før kampen'));
  const pre = `Før kampen skrev jeg, at Ude ${pickBy(air.say, 4, 'air', 'scout')}`;
  assert.equal(fu([['CORNER', 'Ude'], ['SETPIECE', 'Ude']], 2), `${pre} – det holdt også mod jer – begge deres mål kom på hovedstød efter dødbolde.`);
  assert.equal(fu([['CORNER', 'Ude']], 1), `${pre} – det holdt også mod jer – deres eneste mål kom på hovedstød efter dødbolde.`);
  assert.equal(fu([['CORNER', 'Ude'], ['COMBINATION', 'Ude']], 2), `${pre} – det holdt også mod jer – 1 af deres mål kom på hovedstød efter dødbolde.`, 'halvdelen af målene');
  assert.equal(fu([['CORNER', 'Ude'], ['COMBINATION', 'Ude'], ['LONGSHOT', 'Ude']], 3), `${pre} – det gjorde de ikke mod jer.`, '1 af 3 er ikke luft-holdet (QC F3)');
  assert.equal(fu([], 0), `${pre} – det gjorde de ikke mod jer.`);
});
